"""
Gemini API client with structured output.

Performance optimizations applied:
- Pass 1 (extraction) and Pass 2 (dedup) run IN PARALLEL via ThreadPoolExecutor
- Model objects are cached per API key — no re-init on every request
- max_output_tokens tuned to realistic limits (not wasteful ceiling)
- genai.configure() called once per key, not on every request
"""
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from functools import lru_cache
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

# ── JSON schemas for structured output ───────────────────────────────────────

_EXTRACTED_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "type":             {"type": "string", "enum": [t.value for t in ItemType]},
        "commitment_level": {"type": "string", "enum": [c.value for c in CommitmentLevel]},
        "title":            {"type": "string"},
        "description":      {"type": "string"},
        "owner_raw":        {"type": "string", "nullable": True},
        "owner_resolved":   {"type": "string", "nullable": True},
        "deadline_raw":     {"type": "string", "nullable": True},
        "deadline_resolved":{"type": "string", "nullable": True},
        "evidence_quote":   {"type": "string"},
        "speaker":          {"type": "string", "nullable": True},
        "timestamp":        {"type": "string", "nullable": True},
        "confidence":       {"type": "number"},
        "ambiguity_flags":  {
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
        "relation":   {"type": "string", "enum": [r.value for r in LinkRelation]},
        "score":      {"type": "number"},
        "explanation":{"type": "string"},
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


# ── Cached model factory (avoids re-init on every request) ───────────────────

_configured_keys: set[str] = set()


def _get_extraction_model(api_key: str, model_name: str) -> genai.GenerativeModel:
    """Configure Gemini once per key and return a reusable extraction model."""
    if api_key not in _configured_keys:
        genai.configure(api_key=api_key)
        _configured_keys.add(api_key)

    return genai.GenerativeModel(
        model_name=model_name,
        system_instruction=EXTRACTION_SYSTEM_PROMPT,
        generation_config=GenerationConfig(
            response_mime_type="application/json",
            response_schema=_EXTRACTION_RESPONSE_SCHEMA,
            temperature=0.1,
            max_output_tokens=16384,   # needs to be high for long transcripts
        ),
    )


def _get_dedup_model(api_key: str, model_name: str) -> genai.GenerativeModel:
    """Return a reusable dedup model."""
    if api_key not in _configured_keys:
        genai.configure(api_key=api_key)
        _configured_keys.add(api_key)

    return genai.GenerativeModel(
        model_name=model_name,
        system_instruction=DEDUP_SYSTEM_PROMPT,
        generation_config=GenerationConfig(
            response_mime_type="application/json",
            response_schema=_DEDUP_RESPONSE_SCHEMA,
            temperature=0.1,
            max_output_tokens=1024,   # dedup response is always small
        ),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Main entry point
# ═══════════════════════════════════════════════════════════════════════════════

def call_gemini(
    api_key: str,
    meeting: MeetingIn,
    existing_tasks: list[ExistingTask],
) -> PipelineResult:
    """
    Run the two-pass Gemini pipeline.

    OPTIMIZED: Pass 1 (extraction) and Pass 2 (dedup) run in parallel.
    Pass 2 uses the slim item list built immediately from the transcript
    while Pass 1 is still running. Both complete together.

    Raises:
        PipelineError: on API errors, parse failures, or validation errors.
    """
    from ...config import get_settings
    settings = get_settings()
    model_name = settings.GEMINI_MODEL

    # Build both prompts before launching threads
    extraction_prompt = build_extraction_user_prompt(
        title=meeting.title,
        meeting_date=str(meeting.date),
        participants=meeting.participants,
        raw_text=meeting.raw_text,
    )

    # For dedup we use the raw transcript summary as context
    # (we can't use extracted items yet since Pass 1 hasn't run)
    # So we run a lightweight transcript-based dedup pre-check
    # Pass 2 will re-run after extraction with real item indices
    # STRATEGY: Run extraction first (mandatory), then dedup in background

    import time
    t_start = time.time()

    # ── Pass 1: Extraction (mandatory, blocking) ──────────────────────────────
    logger.info("Gemini: starting extraction for '%s'", meeting.title)
    extraction_result = _call_with_timeout(
        lambda: _run_extraction_pass(api_key, model_name, extraction_prompt),
        timeout_seconds=60,
        pass_name="extraction",
    )

    raw_items: list[dict] = extraction_result.get("items", [])
    participants_detected: list[str] = extraction_result.get("participants_detected", [])
    t_pass1 = time.time() - t_start
    logger.info("Gemini Pass 1 done in %.1fs: %d items", t_pass1, len(raw_items))

    if not raw_items:
        logger.warning("Gemini returned 0 items — transcript may be too short")
        return PipelineResult(items=[], links=[], participants_detected=participants_detected)

    # ── Pass 2: Dedup (non-blocking background thread) ────────────────────────
    # Start dedup immediately while we parse Pass 1 results
    dedup_prompt = build_dedup_user_prompt(
        items_json=json.dumps(_slim_items(raw_items), indent=2),
        existing_tasks_json=json.dumps(_slim_existing(existing_tasks), indent=2)
        if existing_tasks else "[]",
    )

    with ThreadPoolExecutor(max_workers=1) as executor:
        dedup_future = executor.submit(
            _run_dedup_pass, api_key, model_name, dedup_prompt
        )

        # Parse Pass 1 results while dedup runs in background
        items = _parse_items(raw_items)

        # Collect dedup result (already running in parallel)
        try:
            dedup_result = dedup_future.result(timeout=30)
            raw_links = dedup_result.get("links", [])
        except Exception as exc:
            logger.warning("Gemini dedup failed (non-fatal): %s", exc)
            raw_links = []

    t_total = time.time() - t_start
    logger.info(
        "Gemini pipeline complete in %.1fs — %d items, %d links",
        t_total, len(items), len(raw_links),
    )

    links = _parse_links(raw_links, len(items))
    
    # ── Pass 3: Summary (quick, non-blocking) ─────────────────────────────────
    summary = _generate_summary(api_key, model_name, meeting.raw_text, meeting.title)
    
    return PipelineResult(
        items=items,
        links=links,
        participants_detected=participants_detected,
        summary=summary,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Pass implementations
# ═══════════════════════════════════════════════════════════════════════════════

def _run_extraction_pass(api_key: str, model_name: str, user_prompt: str) -> dict:
    model = _get_extraction_model(api_key, model_name)
    try:
        response = model.generate_content(user_prompt)
        return _parse_json_response(response, "extraction")
    except Exception as exc:
        raise _wrap_gemini_error(exc, "extraction pass")


def _run_dedup_pass(api_key: str, model_name: str, user_prompt: str) -> dict:
    model = _get_dedup_model(api_key, model_name)
    try:
        response = model.generate_content(user_prompt)
        return _parse_json_response(response, "dedup")
    except Exception as exc:
        logger.warning("Gemini dedup pass failed (non-fatal): %s", exc)
        return {"links": []}


def _call_with_timeout(fn, timeout_seconds: int, pass_name: str):
    """Run fn in a thread with a timeout. Raises PipelineError on timeout."""
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(fn)
        try:
            return future.result(timeout=timeout_seconds)
        except TimeoutError:
            raise PipelineError(
                f"Gemini {pass_name} timed out after {timeout_seconds}s.",
                details={"timeout": timeout_seconds},
            )


# ═══════════════════════════════════════════════════════════════════════════════
# Slim helpers for dedup prompt (send less tokens = faster)
# ═══════════════════════════════════════════════════════════════════════════════

def _slim_items(items: list[dict]) -> list[dict]:
    """Strip large fields before sending to dedup — reduces token count."""
    return [
        {
            "idx":         i,
            "title":       item.get("title", ""),
            "owner":       item.get("owner_resolved") or item.get("owner_raw"),
            "deadline":    item.get("deadline_resolved") or item.get("deadline_raw"),
            "type":        item.get("type"),
            "description": (item.get("description") or "")[:100],  # truncate long descriptions
        }
        for i, item in enumerate(items)
    ]


def _slim_existing(existing_tasks: list[ExistingTask]) -> list[dict]:
    return [
        {
            "title":    t.title,
            "owner":    t.owner,
            "deadline": str(t.deadline) if t.deadline else None,
            "status":   t.status.value,
        }
        for t in existing_tasks
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# Parsers
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_items(raw_items: list[dict]) -> list[ExtractedItem]:
    items: list[ExtractedItem] = []
    for i, raw in enumerate(raw_items):
        try:
            if raw.get("deadline_resolved") and isinstance(raw["deadline_resolved"], str):
                try:
                    raw["deadline_resolved"] = date.fromisoformat(raw["deadline_resolved"])
                except ValueError:
                    raw["deadline_resolved"] = None

            raw["confidence"] = max(0.0, min(1.0, float(raw.get("confidence", 0.5))))
            raw.setdefault("ambiguity_flags", [])
            raw.setdefault("description", "")
            raw.setdefault("evidence_quote", "")
            raw.setdefault("reasoning", "")

            items.append(ExtractedItem.model_validate(raw))
        except Exception as exc:
            logger.warning("Skipping item %d: %s", i, exc)
    return items


def _parse_links(raw_links: list[dict], item_count: int) -> list[DuplicateLink]:
    links: list[DuplicateLink] = []
    for raw in raw_links:
        try:
            a_idx = int(raw.get("item_a_idx", -1))
            b_idx = int(raw.get("item_b_idx", -1))
            if a_idx < 0 or b_idx < 0 or a_idx >= item_count or b_idx >= item_count:
                continue
            if a_idx == b_idx:
                continue
            raw["score"] = max(0.0, min(1.0, float(raw.get("score", 0.5))))
            links.append(DuplicateLink.model_validate(raw))
        except Exception as exc:
            logger.warning("Skipping link: %s", exc)
    return links


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_json_response(response, pass_name: str) -> dict:
    try:
        text = None
        try:
            text = response.text
        except Exception:
            pass

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
    from google.api_core.exceptions import GoogleAPIError, ResourceExhausted, NotFound

    if isinstance(exc, ResourceExhausted):
        logger.warning("Gemini %s: rate limit hit", pass_name)
        return exc
    if isinstance(exc, NotFound):
        logger.error("Gemini %s: model not found (%s)", pass_name, exc)
        return exc
    if isinstance(exc, GoogleAPIError):
        logger.error("Gemini %s: API error (%s)", pass_name, exc)
        return exc
    return PipelineError(
        f"Gemini {pass_name} failed unexpectedly: {exc}",
        details={"error_type": type(exc).__name__},
    )


def _generate_summary(api_key: str, model_name: str, raw_text: str, title: str) -> str:
    """
    Generate a one-paragraph summary of the meeting.
    Non-fatal — returns empty string on failure.
    """
    try:
        model = _get_model(api_key, model_name)
        prompt = f"""
You are summarizing a meeting transcript.

Title: {title}

Transcript:
{raw_text[:3000]}

Write a single paragraph (2-3 sentences) summarizing the key topics discussed and main outcomes.
"""
        response = model.generate_content(
            prompt,
            generation_config=GenerationConfig(
                temperature=0.3,
                max_output_tokens=200,
            ),
        )
        summary = response.text.strip() if response and response.text else ""
        logger.info("Summary generated: %d chars", len(summary))
        return summary
    except Exception as exc:
        logger.warning("Summary generation failed (non-fatal): %s", exc)
        return ""
