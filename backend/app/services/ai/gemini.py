"""
Gemini API client with structured output.

Strategy:
- Uses google-generativeai SDK with response_mime_type="application/json"
  and a response_schema to force Gemini to return exactly our Pydantic shape.
- Two-pass pipeline:
    Pass 1 → extraction (items + participants)
    Pass 2 → duplicate detection (links)
- Two-key fallback handled in pipeline.py (not here).
  This module takes a single key and raises on failure.
"""
import json
import logging
from datetime import date
from typing import Any

import google.generativeai as genai
from google.generativeai.types import GenerationConfig

from ...schemas import (
    MeetingIn, ExistingTask, PipelineResult,
    ExtractedItem, DuplicateLink,
    ItemType, CommitmentLevel, AmbiguityFlag, LinkRelation,
)
from ...errors import PipelineError
from .prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    DEDUP_SYSTEM_PROMPT,
    build_extraction_user_prompt,
    build_dedup_user_prompt,
)

logger = logging.getLogger(__name__)

# ── JSON schema definitions for structured output ─────────────────────────────
# These mirror our Pydantic models exactly so Gemini is constrained to output
# the right shape every time.

_EXTRACTED_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": [t.value for t in ItemType]},
        "commitment_level": {"type": "string", "enum": [c.value for c in CommitmentLevel]},
        "title": {"type": "string"},
        "description": {"type": "string"},
        "owner_raw": {"type": "string", "nullable": True},
        "owner_resolved": {"type": "string", "nullable": True},
        "deadline_raw": {"type": "string", "nullable": True},
        "deadline_resolved": {"type": "string", "nullable": True},
        "evidence_quote": {"type": "string"},
        "speaker": {"type": "string", "nullable": True},
        "timestamp": {"type": "string", "nullable": True},
        "confidence": {"type": "number"},
        "ambiguity_flags": {
            "type": "array",
            "items": {"type": "string", "enum": [f.value for f in AmbiguityFlag]},
        },
        "reasoning": {"type": "string"},
    },
    "required": ["type", "commitment_level", "title", "confidence", "ambiguity_flags"],
}

_EXTRACTION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {"type": "array", "items": _EXTRACTED_ITEM_SCHEMA},
        "participants_detected": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["items", "participants_detected"],
}

_LINK_SCHEMA = {
    "type": "object",
    "properties": {
        "item_a_idx": {"type": "integer"},
        "item_b_idx": {"type": "integer"},
        "relation": {"type": "string", "enum": [r.value for r in LinkRelation]},
        "score": {"type": "number"},
        "explanation": {"type": "string"},
    },
    "required": ["item_a_idx", "item_b_idx", "relation", "score", "explanation"],
}

_DEDUP_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "links": {"type": "array", "items": _LINK_SCHEMA},
    },
    "required": ["links"],
}


# ═══════════════════════════════════════════════════════════════════════════════
# Main entry point
# ═══════════════════════════════════════════════════════════════════════════════

def call_gemini(
    api_key: str,
    meeting: MeetingIn,
    existing_tasks: list[ExistingTask],
) -> PipelineResult:
    """
    Run the two-pass Gemini pipeline for a single API key.

    Raises:
        PipelineError: on API errors, parse failures, or validation errors.
        Any google.api_core exception will propagate to pipeline.py for fallback.
    """
    genai.configure(api_key=api_key)

    # ── Pass 1: Extract items ─────────────────────────────────────────────────
    logger.info("Gemini Pass 1: extracting items from '%s'", meeting.title)
    extraction_result = _run_extraction_pass(meeting)

    raw_items: list[dict] = extraction_result.get("items", [])
    participants_detected: list[str] = extraction_result.get("participants_detected", [])

    logger.info("Gemini Pass 1 complete: %d items extracted", len(raw_items))

    if not raw_items:
        logger.warning("Gemini returned 0 items — transcript may be too short or unclear")
        return PipelineResult(items=[], links=[], participants_detected=participants_detected)

    # ── Pass 2: Detect duplicates ─────────────────────────────────────────────
    logger.info("Gemini Pass 2: duplicate detection over %d items", len(raw_items))
    dedup_result = _run_dedup_pass(raw_items, existing_tasks)
    raw_links: list[dict] = dedup_result.get("links", [])
    logger.info("Gemini Pass 2 complete: %d links found", len(raw_links))

    # ── Parse + validate ──────────────────────────────────────────────────────
    items = _parse_items(raw_items)
    links = _parse_links(raw_links, len(items))

    return PipelineResult(
        items=items,
        links=links,
        participants_detected=participants_detected,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Pass implementations
# ═══════════════════════════════════════════════════════════════════════════════

def _run_extraction_pass(meeting: MeetingIn) -> dict:
    """Call Gemini for item extraction and return raw dict."""
    from ...config import get_settings
    settings = get_settings()

    model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        system_instruction=EXTRACTION_SYSTEM_PROMPT,
        generation_config=GenerationConfig(
            response_mime_type="application/json",
            response_schema=_EXTRACTION_RESPONSE_SCHEMA,
            temperature=0.1,      # low temperature = more consistent structured output
            max_output_tokens=16384,
        ),
    )

    user_prompt = build_extraction_user_prompt(
        title=meeting.title,
        meeting_date=str(meeting.date),
        participants=meeting.participants,
        raw_text=meeting.raw_text,
    )

    try:
        response = model.generate_content(user_prompt)
        return _parse_json_response(response, "extraction")
    except Exception as exc:
        raise _wrap_gemini_error(exc, "extraction pass")


def _run_dedup_pass(items: list[dict], existing_tasks: list[ExistingTask]) -> dict:
    """Call Gemini for duplicate detection and return raw dict."""
    from ...config import get_settings
    settings = get_settings()

    # Slim down items for the dedup prompt — only title + description + owner
    slim_items = [
        {
            "idx": i,
            "title": item.get("title", ""),
            "description": item.get("description", ""),
            "owner": item.get("owner_resolved") or item.get("owner_raw"),
            "deadline": item.get("deadline_resolved") or item.get("deadline_raw"),
            "type": item.get("type"),
        }
        for i, item in enumerate(items)
    ]

    existing_slim = [
        {
            "title": t.title,
            "owner": t.owner,
            "deadline": str(t.deadline) if t.deadline else None,
            "status": t.status.value,
        }
        for t in existing_tasks
    ] if existing_tasks else []

    model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        system_instruction=DEDUP_SYSTEM_PROMPT,
        generation_config=GenerationConfig(
            response_mime_type="application/json",
            response_schema=_DEDUP_RESPONSE_SCHEMA,
            temperature=0.1,
            max_output_tokens=2048,
        ),
    )

    user_prompt = build_dedup_user_prompt(
        items_json=json.dumps(slim_items, indent=2),
        existing_tasks_json=json.dumps(existing_slim, indent=2) if existing_slim else "[]",
    )

    try:
        response = model.generate_content(user_prompt)
        return _parse_json_response(response, "dedup")
    except Exception as exc:
        # Dedup is best-effort — log and return empty rather than failing the whole pipeline
        logger.warning("Gemini dedup pass failed (non-fatal): %s", exc)
        return {"links": []}


# ═══════════════════════════════════════════════════════════════════════════════
# Parsers
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_items(raw_items: list[dict]) -> list[ExtractedItem]:
    """Convert raw dicts to validated ExtractedItem objects."""
    items: list[ExtractedItem] = []
    for i, raw in enumerate(raw_items):
        try:
            # Coerce deadline_resolved to date if it's a string
            if raw.get("deadline_resolved") and isinstance(raw["deadline_resolved"], str):
                try:
                    raw["deadline_resolved"] = date.fromisoformat(raw["deadline_resolved"])
                except ValueError:
                    raw["deadline_resolved"] = None

            # Ensure confidence is in range
            raw["confidence"] = max(0.0, min(1.0, float(raw.get("confidence", 0.5))))

            # Default empty lists/strings
            raw.setdefault("ambiguity_flags", [])
            raw.setdefault("description", "")
            raw.setdefault("evidence_quote", "")
            raw.setdefault("reasoning", "")

            item = ExtractedItem.model_validate(raw)
            items.append(item)
        except Exception as exc:
            logger.warning("Skipping item %d due to parse error: %s | raw=%s", i, exc, raw)
    return items


def _parse_links(raw_links: list[dict], item_count: int) -> list[DuplicateLink]:
    """Convert raw dicts to validated DuplicateLink objects, dropping invalid ones."""
    links: list[DuplicateLink] = []
    for raw in raw_links:
        try:
            a_idx = int(raw.get("item_a_idx", -1))
            b_idx = int(raw.get("item_b_idx", -1))

            # Validate indices are in range and not equal
            if a_idx < 0 or b_idx < 0 or a_idx >= item_count or b_idx >= item_count:
                logger.warning("Dropping link with out-of-range indices: %s", raw)
                continue
            if a_idx == b_idx:
                logger.warning("Dropping self-referencing link: %s", raw)
                continue

            raw["score"] = max(0.0, min(1.0, float(raw.get("score", 0.5))))
            link = DuplicateLink.model_validate(raw)
            links.append(link)
        except Exception as exc:
            logger.warning("Skipping link due to parse error: %s | raw=%s", exc, raw)
    return links


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_json_response(response, pass_name: str) -> dict:
    """Extract and parse JSON from a Gemini response."""
    try:
        # Try response.text first (works for most cases)
        text = None
        try:
            text = response.text
        except Exception:
            pass

        # Fallback: reconstruct from parts
        if not text and response.candidates:
            parts = response.candidates[0].content.parts
            text = "".join(p.text for p in parts if hasattr(p, "text"))

        if not text:
            raise PipelineError(f"Gemini {pass_name}: empty response")

        data = json.loads(text)
        if not isinstance(data, dict):
            raise PipelineError(f"Gemini {pass_name}: expected dict, got {type(data)}")
        return data
    except json.JSONDecodeError as exc:
        preview = (text or "")[:300]
        raise PipelineError(
            f"Gemini {pass_name}: invalid JSON in response",
            details={"error": str(exc), "response_preview": preview},
        ) from exc


def _wrap_gemini_error(exc: Exception, pass_name: str) -> Exception:
    """Wrap Gemini API errors into PipelineError, preserving the original for fallback."""
    from google.api_core.exceptions import GoogleAPIError, ResourceExhausted, NotFound

    if isinstance(exc, ResourceExhausted):
        # Rate limit — pipeline.py will retry with fallback key
        logger.warning("Gemini %s: rate limit hit (%s)", pass_name, exc)
        return exc  # re-raise as-is so fallback logic triggers

    if isinstance(exc, NotFound):
        logger.error("Gemini %s: model not found (%s)", pass_name, exc)
        return exc

    if isinstance(exc, GoogleAPIError):
        logger.error("Gemini %s: API error (%s)", pass_name, exc)
        return exc

    # Unexpected error — wrap it
    return PipelineError(
        f"Gemini {pass_name} failed unexpectedly: {exc}",
        details={"error_type": type(exc).__name__},
    )
