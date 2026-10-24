from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./meeting_agent.db"

    # ── AI / Gemini ───────────────────────────────────────────────────────────
    USE_MOCK_AI: bool = True
    GEMINI_API_KEY_1: str = ""
    GEMINI_API_KEY_2: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # ── Trello ────────────────────────────────────────────────────────────────
    TRELLO_KEY: str = ""
    TRELLO_TOKEN: str = ""
    TRELLO_BOARD_ID: str = ""

    # ── Slack ─────────────────────────────────────────────────────────────────
    SLACK_WEBHOOK_URL: str = ""

    # ── GitHub ────────────────────────────────────────────────────────────────
    GITHUB_TOKEN: str = ""
    GITHUB_REPO: str = ""   # format: "owner/repo" e.g. "2007kartik/HACKNOVA_26"

    # ── CORS ──────────────────────────────────────────────────────────────────
    FRONTEND_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.FRONTEND_ORIGINS.split(",") if o.strip()]

    # ── Scheduler ─────────────────────────────────────────────────────────────
    ENABLE_SCHEDULER: bool = False
    SYNC_INTERVAL_MINUTES: int = 5

    # ── App meta ──────────────────────────────────────────────────────────────
    APP_VERSION: str = "1.0.0"
    APP_TITLE: str = "Meeting-to-Execution Automation Agent"
    APP_DESCRIPTION: str = (
        "Converts meeting transcripts into structured tasks, routes them "
        "through a human approval workflow, and pushes approved tasks to Trello."
    )


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton — override in tests via dependency injection."""
    return Settings()
