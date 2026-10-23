"""
Mock AI pipeline — reads data/mock_pipeline_result.json.
Used when USE_MOCK_AI=true (the default).
Returns the same PipelineResult shape as the real Gemini pipeline.
"""
import json
import logging
from pathlib import Path

from ...schemas import PipelineResult, MeetingIn, ExistingTask

logger = logging.getLogger(__name__)

# Resolve path relative to this file so it works regardless of cwd
_MOCK_FILE = Path(__file__).resolve().parents[4] / "data" / "mock_pipeline_result.json"


def run_mock_pipeline(
    meeting: MeetingIn,
    existing_tasks: list[ExistingTask],
) -> PipelineResult:
    """
    Load mock_pipeline_result.json and return a validated PipelineResult.
    The meeting content is ignored — the mock always returns the same sample data.
    This lets the full workflow be demonstrated without real Gemini calls.
    """
    if not _MOCK_FILE.exists():
        raise FileNotFoundError(
            f"Mock pipeline data file not found at {_MOCK_FILE}. "
            "Make sure data/mock_pipeline_result.json exists."
        )

    logger.info("Mock AI pipeline: loading from %s", _MOCK_FILE)
    raw = json.loads(_MOCK_FILE.read_text(encoding="utf-8"))
    result = PipelineResult.model_validate(raw)
    logger.info(
        "Mock AI pipeline: loaded %d items, %d links",
        len(result.items),
        len(result.links),
    )
    return result
