"""
AI Pipeline entry point.

Rules:
- This module takes plain Pydantic inputs and returns a Pydantic output.
- It NEVER imports the database or ORM models.
- When USE_MOCK_AI=true  → delegates to mock.py
- When USE_MOCK_AI=false → delegates to gemini.py with two-key fallback

Key fallback: if GEMINI_API_KEY_1 fails (rate limit / API error),
retry with GEMINI_API_KEY_2 automatically.
"""
import logging

from ...config import get_settings
from ...schemas import MeetingIn, ExistingTask, PipelineResult
from ...errors import PipelineError
from .mock import run_mock_pipeline

logger = logging.getLogger(__name__)


def run_pipeline(
    meeting: MeetingIn,
    existing_tasks: list[ExistingTask],
) -> PipelineResult:
    """
    Main entry point called by extraction_job.py.

    Args:
        meeting:        The meeting whose transcript will be analysed.
        existing_tasks: Items from previous meetings for dedup context.

    Returns:
        PipelineResult with extracted items and duplicate links.

    Raises:
        PipelineError: if extraction fails (both Gemini keys exhausted,
                       or mock file missing).
    """
    settings = get_settings()

    if settings.USE_MOCK_AI:
        logger.info(
            "Pipeline: USE_MOCK_AI=true, using mock pipeline for meeting '%s'",
            meeting.title,
        )
        try:
            return run_mock_pipeline(meeting, existing_tasks)
        except Exception as exc:
            raise PipelineError(f"Mock pipeline failed: {exc}") from exc

    # ── Real Gemini path ──────────────────────────────────────────────────────
    logger.info(
        "Pipeline: USE_MOCK_AI=false, calling Gemini for meeting '%s'",
        meeting.title,
    )
    return _run_gemini_with_fallback(meeting, existing_tasks, settings)


def _run_gemini_with_fallback(
    meeting: MeetingIn,
    existing_tasks: list[ExistingTask],
    settings,
) -> PipelineResult:
    """
    Try primary Gemini key; on rate-limit or API error retry with fallback key.
    Raises PipelineError if all keys are exhausted.
    """
    from .gemini import call_gemini
    from google.api_core.exceptions import GoogleAPIError

    keys = [
        k for k in [settings.GEMINI_API_KEY_1, settings.GEMINI_API_KEY_2]
        if k and k.strip()
    ]

    if not keys:
        raise PipelineError(
            "No Gemini API keys configured. Set GEMINI_API_KEY_1 (and optionally "
            "GEMINI_API_KEY_2) in your .env, or set USE_MOCK_AI=true.",
        )

    last_error: Exception | None = None

    for i, key in enumerate(keys, start=1):
        try:
            logger.info("Pipeline: attempting Gemini call with key #%d", i)
            result = call_gemini(key, meeting, existing_tasks)
            logger.info(
                "Pipeline: Gemini key #%d succeeded — %d items, %d links",
                i, len(result.items), len(result.links),
            )
            return result

        except GoogleAPIError as exc:
            logger.warning(
                "Pipeline: Gemini key #%d failed with API error: %s (%s)",
                i, type(exc).__name__, exc,
            )
            last_error = exc
            # Try next key

        except PipelineError:
            # PipelineError from gemini.py (bad JSON, etc.) — don't retry
            raise

        except Exception as exc:
            logger.warning(
                "Pipeline: Gemini key #%d failed unexpectedly: %s",
                i, exc,
            )
            last_error = exc
            # Try next key

    raise PipelineError(
        f"All {len(keys)} Gemini key(s) exhausted. "
        f"Last error: {type(last_error).__name__}: {last_error}",
        details={"keys_tried": len(keys)},
    ) from last_error
