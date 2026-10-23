"""
Trello REST API client.

Implements the TaskSink protocol.
Injectable via FastAPI Depends() so tests can swap in a fake.

Trello API docs: https://developer.atlassian.com/cloud/trello/rest/
"""
import logging
from functools import lru_cache
from typing import Optional

import httpx

from ..config import get_settings
from ..errors import GateError, IntegrationError
from ..schemas import ItemStatus
from .base import ExternalRef, TaskSink

logger = logging.getLogger(__name__)
settings = get_settings()

_TRELLO_BASE = "https://api.trello.com/1"

# List names we look for on the board (case-insensitive)
_TODO_NAMES  = {"to do", "todo", "backlog"}
_DONE_NAMES  = {"done", "complete", "completed", "finished"}


class TrelloClient:
    """
    Trello integration.

    On first use, resolves list IDs from the board and caches them.
    create_task() maps item owner → Trello member ID via the Member table.
    """

    def __init__(
        self,
        key: Optional[str] = None,
        token: Optional[str] = None,
        board_id: Optional[str] = None,
    ):
        self._key      = key      or settings.TRELLO_KEY
        self._token    = token    or settings.TRELLO_TOKEN
        self._board_id = board_id or settings.TRELLO_BOARD_ID

        # Cached list IDs — populated lazily
        self._todo_list_id: Optional[str] = None
        self._done_list_id: Optional[str] = None
        self._list_id_to_name: dict[str, str] = {}

    @property
    def _auth(self) -> dict:
        return {"key": self._key, "token": self._token}

    def _is_configured(self) -> bool:
        return bool(self._key and self._token and self._board_id)

    # ── List resolution ───────────────────────────────────────────────────────

    def _resolve_lists(self) -> None:
        """Fetch board lists and cache IDs by name."""
        if self._todo_list_id is not None:
            return  # already resolved

        if not self._is_configured():
            raise IntegrationError(
                "Trello is not configured. Set TRELLO_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID."
            )

        try:
            resp = httpx.get(
                f"{_TRELLO_BASE}/boards/{self._board_id}/lists",
                params={**self._auth, "filter": "open"},
                timeout=10.0,
            )
            resp.raise_for_status()
            lists = resp.json()
        except httpx.HTTPStatusError as exc:
            raise IntegrationError(
                f"Failed to fetch Trello lists: HTTP {exc.response.status_code}",
                details={"board_id": self._board_id},
            ) from exc
        except httpx.RequestError as exc:
            raise IntegrationError(f"Trello request failed: {exc}") from exc

        for lst in lists:
            lid  = lst["id"]
            name = lst["name"]
            self._list_id_to_name[lid] = name
            name_lower = name.strip().lower()
            if name_lower in _TODO_NAMES and not self._todo_list_id:
                self._todo_list_id = lid
                logger.info("Trello: resolved 'To Do' list → %s (%s)", name, lid)
            if name_lower in _DONE_NAMES and not self._done_list_id:
                self._done_list_id = lid
                logger.info("Trello: resolved 'Done' list → %s (%s)", name, lid)

        if not self._todo_list_id:
            # Fall back to the first list if no "To Do" name matched
            if lists:
                self._todo_list_id = lists[0]["id"]
                logger.warning(
                    "Trello: no 'To Do' list found by name — using first list '%s'",
                    lists[0]["name"],
                )
            else:
                raise IntegrationError("Trello board has no open lists.")

    # ── TaskSink implementation ───────────────────────────────────────────────

    def create_task(self, item, meeting) -> ExternalRef:
        """
        Create a Trello card for an APPROVED item.

        GATE: raises GateError if item.status != APPROVED.
        """
        if item.status != ItemStatus.APPROVED.value:
            raise GateError(
                f"TrelloClient.create_task called for item '{item.id}' "
                f"with status '{item.status}'. Only APPROVED items may be pushed.",
                details={"item_id": item.id, "status": item.status},
            )

        self._resolve_lists()

        # Build card description
        desc_parts = []
        if item.description:
            desc_parts.append(item.description)
        if item.evidence_quote:
            desc_parts.append(f"\n---\n**Evidence from meeting:**\n> {item.evidence_quote}")
        desc_parts.append(f"\n---\n*Meeting: {meeting.title}*")
        if not (item.owner or "").strip():
            desc_parts.append(f"*Owner: {item.owner}*")
        description = "\n".join(desc_parts)

        # Resolve Trello member ID from Member table
        member_ids = self._resolve_member_id(item.owner, meeting)

        card_params: dict = {
            **self._auth,
            "idList": self._todo_list_id,
            "name":   item.title,
            "desc":   description,
        }
        if item.deadline:
            card_params["due"] = item.deadline.isoformat() + "T23:59:59.000Z"
        if member_ids:
            card_params["idMembers"] = ",".join(member_ids)

        try:
            resp = httpx.post(
                f"{_TRELLO_BASE}/cards",
                params=card_params,
                timeout=15.0,
            )
            resp.raise_for_status()
            card = resp.json()
        except httpx.HTTPStatusError as exc:
            raise IntegrationError(
                f"Failed to create Trello card: HTTP {exc.response.status_code}",
                details={"item_id": item.id, "response": exc.response.text[:200]},
            ) from exc
        except httpx.RequestError as exc:
            raise IntegrationError(
                f"Trello request failed: {exc}",
                details={"item_id": item.id},
            ) from exc

        logger.info(
            "Trello: created card '%s' (id=%s) for item %s",
            item.title, card["id"], item.id,
        )
        return ExternalRef(
            external_id=card["id"],
            external_url=card.get("shortUrl", card.get("url", "")),
            system="trello",
        )

    def get_task_list_name(self, external_id: str) -> Optional[str]:
        """Return the list name a card currently sits in, or None if not found."""
        if not self._is_configured():
            return None
        try:
            resp = httpx.get(
                f"{_TRELLO_BASE}/cards/{external_id}",
                params={**self._auth, "fields": "idList"},
                timeout=10.0,
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            card = resp.json()
            list_id = card.get("idList")
            if not list_id:
                return None
            # Resolve list name (may need a separate call if not cached)
            if list_id in self._list_id_to_name:
                return self._list_id_to_name[list_id]
            # Fetch list name
            list_resp = httpx.get(
                f"{_TRELLO_BASE}/lists/{list_id}",
                params={**self._auth, "fields": "name"},
                timeout=10.0,
            )
            list_resp.raise_for_status()
            name = list_resp.json().get("name", "")
            self._list_id_to_name[list_id] = name
            return name
        except Exception as exc:
            logger.warning("Trello: could not get list name for card %s: %s", external_id, exc)
            return None

    def is_done_list(self, list_name: Optional[str]) -> bool:
        """Return True if the list name matches a known 'Done' list."""
        if not list_name:
            return False
        return list_name.strip().lower() in _DONE_NAMES

    # ── Member resolution ─────────────────────────────────────────────────────

    def _resolve_member_id(self, owner: Optional[str], meeting) -> list[str]:
        """
        Look up owner name in the Member table → Trello member ID.
        Returns empty list if no mapping found (card is still created).
        """
        if not owner:
            return []
        try:
            # Import here to avoid circular imports
            from ..db import SessionLocal
            from ..models import Member
            db = SessionLocal()
            try:
                member = db.query(Member).filter(Member.name == owner).first()
                if member and member.trello_member_id:
                    return [member.trello_member_id]
            finally:
                db.close()
        except Exception as exc:
            logger.warning("Trello: could not resolve member '%s': %s", owner, exc)
        return []


# ── Dependency injection ──────────────────────────────────────────────────────

_default_client: Optional[TrelloClient] = None


def get_trello_client() -> TrelloClient:
    """FastAPI dependency — returns the default client (injectable in tests)."""
    global _default_client
    if _default_client is None:
        _default_client = TrelloClient()
    return _default_client
