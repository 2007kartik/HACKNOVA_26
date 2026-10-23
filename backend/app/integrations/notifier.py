"""
Slack notifier.

GATE RULE (enforced here, not just by the caller):
  send() raises GateError for any item whose status is not APPROVED or SYNCED.
  This is the last line of defense — even if calling code has a bug,
  notifications cannot leak for non-approved items.
"""
import logging
from typing import Optional

import httpx

from ..config import get_settings
from ..schemas import ItemStatus
from ..errors import GateError, IntegrationError

logger = logging.getLogger(__name__)
settings = get_settings()

# Statuses that are allowed to trigger notifications
_ALLOWED_NOTIFY_STATUSES = {ItemStatus.APPROVED.value, ItemStatus.SYNCED.value}


class SlackNotifier:
    """
    Sends Slack messages via an incoming webhook.
    Is a no-op if SLACK_WEBHOOK_URL is not configured.
    """

    def __init__(self, webhook_url: Optional[str] = None):
        self._url = webhook_url or settings.SLACK_WEBHOOK_URL

    @property
    def is_configured(self) -> bool:
        return bool(self._url)

    def send(self, item, message: str) -> bool:
        """
        Send a Slack notification about an item.

        Args:
            item:    ORM Item — status MUST be APPROVED or SYNCED
            message: Slack message text

        Returns:
            True if sent, False if Slack is not configured (no-op).

        Raises:
            GateError:        if item status is not APPROVED or SYNCED
            IntegrationError: if the Slack API call fails
        """
        # ── GATE CHECK ────────────────────────────────────────────────────────
        if item.status not in _ALLOWED_NOTIFY_STATUSES:
            raise GateError(
                f"Notifier refused to send for item '{item.id}' "
                f"with status '{item.status}'. "
                f"Only APPROVED or SYNCED items may trigger notifications.",
                details={"item_id": item.id, "status": item.status},
            )

        # ── No-op if not configured ───────────────────────────────────────────
        if not self.is_configured:
            logger.debug("Slack not configured — skipping notification for item %s", item.id)
            return False

        # ── Send ──────────────────────────────────────────────────────────────
        payload = {
            "text": message,
            "blocks": [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": message},
                }
            ],
        }

        try:
            response = httpx.post(self._url, json=payload, timeout=10.0)
            response.raise_for_status()
            logger.info("Slack notification sent for item %s", item.id)
            return True
        except httpx.HTTPStatusError as exc:
            raise IntegrationError(
                f"Slack webhook returned HTTP {exc.response.status_code}",
                details={"status_code": exc.response.status_code},
            ) from exc
        except httpx.RequestError as exc:
            raise IntegrationError(
                f"Slack webhook request failed: {exc}",
            ) from exc

    def send_overdue_reminder(self, item, meeting_title: str) -> bool:
        """Convenience wrapper for overdue item reminders."""
        owner = item.owner or "Unassigned"
        deadline = str(item.deadline) if item.deadline else "No deadline"
        message = (
            f":warning: *Overdue Task Reminder*\n"
            f"*Task:* {item.title}\n"
            f"*Owner:* {owner}\n"
            f"*Deadline:* {deadline}\n"
            f"*Meeting:* {meeting_title}\n"
            f"*Status:* {item.status}"
        )
        return self.send(item, message)


# ── Dependency-injectable singleton ──────────────────────────────────────────
_default_notifier: Optional[SlackNotifier] = None


def get_notifier() -> SlackNotifier:
    """FastAPI dependency — returns the default notifier (injectable in tests)."""
    global _default_notifier
    if _default_notifier is None:
        _default_notifier = SlackNotifier()
    return _default_notifier
