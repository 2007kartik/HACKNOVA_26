"""
GitHub Issues integration.

Implements TaskSink via the GitHub REST API.
Enable by passing target=github to POST /meetings/{id}/push.

Requires:
  GITHUB_TOKEN — a Personal Access Token with repo scope
  GITHUB_REPO  — "owner/repo" e.g. "2007kartik/HACKNOVA_26"

GitHub REST API docs: https://docs.github.com/en/rest/issues
"""
import logging
from typing import Optional

import httpx

from ..config import get_settings
from ..errors import GateError, IntegrationError
from ..schemas import ItemStatus
from .base import ExternalRef

logger = logging.getLogger(__name__)

_GITHUB_API = "https://api.github.com"

# Map item types to GitHub label names
_TYPE_LABELS = {
    "ACTION_ITEM":   "action-item",
    "DECISION":      "decision",
    "SUGGESTION":    "suggestion",
    "OPEN_QUESTION": "open-question",
    "FOLLOW_UP":     "follow-up",
}

# Map commitment levels to GitHub label names
_COMMITMENT_LABELS = {
    "CONFIRMED":  "confirmed",
    "PROPOSED":   "proposed",
    "UNRESOLVED": "unresolved",
}


class GitHubClient:
    """
    GitHub Issues task sink.
    Creates GitHub issues for APPROVED items with labels, assignees, and due date in body.
    """

    def __init__(
        self,
        token: Optional[str] = None,
        repo: Optional[str] = None,
    ):
        settings = get_settings()
        self._token = token or settings.GITHUB_TOKEN
        self._repo  = repo  or settings.GITHUB_REPO
        self._ensured_labels: set[str] = set()

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def _is_configured(self) -> bool:
        return bool(self._token and self._repo)

    # ── Label management ──────────────────────────────────────────────────────

    def _ensure_label(self, label: str, color: str = "0075ca") -> None:
        """Create a label on the repo if it doesn't exist yet. Silent on conflict."""
        if label in self._ensured_labels:
            return
        try:
            httpx.post(
                f"{_GITHUB_API}/repos/{self._repo}/labels",
                headers=self._headers(),
                json={"name": label, "color": color},
                timeout=10.0,
            )
            self._ensured_labels.add(label)
        except Exception:
            # Label may already exist — that's fine
            self._ensured_labels.add(label)

    # ── TaskSink implementation ───────────────────────────────────────────────

    def create_task(self, item, meeting) -> ExternalRef:
        """
        Create a GitHub issue for an APPROVED item.

        - Title: item title
        - Body: description + evidence quote + meeting name + deadline
        - Labels: item type + commitment level
        - Assignees: item.owner (must match a GitHub username in the repo)
        """
        # Gate check
        if item.status != ItemStatus.APPROVED.value:
            raise GateError(
                f"GitHubClient.create_task called for non-APPROVED item '{item.id}'.",
                details={"item_id": item.id, "status": item.status},
            )

        if not self._is_configured():
            raise IntegrationError(
                "GitHub integration not configured. "
                "Set GITHUB_TOKEN and GITHUB_REPO in your .env file."
            )

        # Build issue body
        deadline_line = f"\n**Deadline:** {item.deadline}" if item.deadline else ""
        owner_line    = f"\n**Owner:** {item.owner}" if item.owner else ""
        body = (
            f"{item.description or ''}\n\n"
            f"---\n"
            f"**Evidence from meeting:**\n"
            f"> {item.evidence_quote}\n\n"
            f"**Meeting:** {meeting.title}{deadline_line}{owner_line}\n\n"
            f"*Extracted by MeetingFlow AI · Confidence: {round(item.confidence * 100)}%*"
        )

        # Build labels
        type_label       = _TYPE_LABELS.get(item.type, "action-item")
        commitment_label = _COMMITMENT_LABELS.get(item.commitment_level, "confirmed")
        labels = [type_label, commitment_label, "meeting-flow"]

        # Ensure labels exist on the repo
        label_colors = {
            "action-item":   "e11d48",  # red
            "decision":      "7c3aed",  # purple
            "suggestion":    "0284c7",  # blue
            "open-question": "d97706",  # amber
            "follow-up":     "059669",  # green
            "confirmed":     "16a34a",  # green
            "proposed":      "ca8a04",  # yellow
            "unresolved":    "9ca3af",  # gray
            "meeting-flow":  "6366f1",  # indigo
        }
        for label in labels:
            self._ensure_label(label, label_colors.get(label, "0075ca"))

        # Build payload
        payload: dict = {
            "title":  item.title,
            "body":   body,
            "labels": labels,
        }

        # Add assignee if owner matches a GitHub username
        # Note: GitHub assignees must be collaborators on the repo
        # We try to add the owner — if it fails GitHub silently ignores unknown assignees
        if item.owner:
            payload["assignees"] = [item.owner.replace(" ", "").lower()]

        try:
            resp = httpx.post(
                f"{_GITHUB_API}/repos/{self._repo}/issues",
                headers=self._headers(),
                json=payload,
                timeout=15.0,
            )
            resp.raise_for_status()
            issue = resp.json()
        except httpx.HTTPStatusError as exc:
            raise IntegrationError(
                f"GitHub API returned HTTP {exc.response.status_code}: {exc.response.text[:200]}",
                details={"item_id": item.id, "repo": self._repo},
            ) from exc
        except httpx.RequestError as exc:
            raise IntegrationError(
                f"GitHub request failed: {exc}",
                details={"item_id": item.id},
            ) from exc

        logger.info(
            "GitHub: created issue #%s '%s' in %s",
            issue["number"], item.title, self._repo,
        )
        return ExternalRef(
            external_id=str(issue["number"]),
            external_url=issue["html_url"],
            system="github",
        )

    def get_task_list_name(self, external_id: str) -> Optional[str]:
        """Return issue state: 'open' or 'closed'."""
        if not self._is_configured():
            return None
        try:
            resp = httpx.get(
                f"{_GITHUB_API}/repos/{self._repo}/issues/{external_id}",
                headers=self._headers(),
                timeout=10.0,
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json().get("state")
        except Exception as exc:
            logger.warning(
                "GitHub: could not get issue state for #%s: %s", external_id, exc
            )
            return None

    def is_done_list(self, list_name: Optional[str]) -> bool:
        """GitHub 'closed' state = Done."""
        return list_name == "closed"


# ── Dependency injection ──────────────────────────────────────────────────────

_default_github_client: Optional[GitHubClient] = None


def get_github_client() -> GitHubClient:
    """FastAPI dependency — returns the default GitHub client."""
    global _default_github_client
    if _default_github_client is None:
        _default_github_client = GitHubClient()
    return _default_github_client
