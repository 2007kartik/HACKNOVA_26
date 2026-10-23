"""
GitHub Issues integration — STRETCH GOAL.

Stub implementing TaskSink via the GitHub REST API.
Not wired into the push endpoint by default.
Enable by passing target=github to POST /meetings/{id}/push.

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
settings = get_settings()

_GITHUB_API = "https://api.github.com"


class GitHubClient:
    """
    STRETCH GOAL — GitHub Issues task sink.
    Creates GitHub issues for approved items.
    """

    def __init__(
        self,
        token: Optional[str] = None,
        repo: Optional[str] = None,   # e.g. "owner/repo"
    ):
        self._token = token or getattr(settings, "GITHUB_TOKEN", "")
        self._repo  = repo  or getattr(settings, "GITHUB_REPO", "")

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def create_task(self, item, meeting) -> ExternalRef:
        """Create a GitHub issue for an APPROVED item."""
        if item.status != ItemStatus.APPROVED.value:
            raise GateError(
                f"GitHubClient.create_task called for non-APPROVED item '{item.id}'.",
                details={"item_id": item.id, "status": item.status},
            )

        if not self._token or not self._repo:
            raise IntegrationError(
                "GitHub integration not configured. Set GITHUB_TOKEN and GITHUB_REPO."
            )

        body = (
            f"{item.description or ''}\n\n"
            f"---\n**Evidence:**\n> {item.evidence_quote}\n\n"
            f"*Meeting: {meeting.title}*"
        )

        labels = [item.type.lower().replace("_", "-")]
        payload: dict = {
            "title":  item.title,
            "body":   body,
            "labels": labels,
        }
        if item.owner:
            payload["assignees"] = [item.owner]

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
                f"GitHub API returned HTTP {exc.response.status_code}",
                details={"item_id": item.id},
            ) from exc
        except httpx.RequestError as exc:
            raise IntegrationError(f"GitHub request failed: {exc}") from exc

        logger.info("GitHub: created issue #%s for item %s", issue["number"], item.id)
        return ExternalRef(
            external_id=str(issue["number"]),
            external_url=issue["html_url"],
            system="github",
        )

    def get_task_list_name(self, external_id: str) -> Optional[str]:
        """Return issue state ('open' or 'closed')."""
        if not self._token or not self._repo:
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
            logger.warning("GitHub: could not get issue state for #%s: %s", external_id, exc)
            return None

    def is_done_list(self, list_name: Optional[str]) -> bool:
        return list_name == "closed"
