"""
Shared pytest fixtures for all test modules.

Key design:
- Each test gets a fresh in-memory SQLite database (no leftover state).
- The FastAPI TestClient is wired to use that same in-memory DB.
- Fake Trello client and fake Notifier are provided for gate tests.
- USE_MOCK_AI is always forced to True so tests never call real Gemini.
"""
import json
import os
import pytest
from datetime import date, datetime, timezone
from typing import Optional
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

# Force mock AI for ALL tests — must be set before app modules are imported
os.environ["USE_MOCK_AI"] = "true"
os.environ["ENABLE_SCHEDULER"] = "false"
from app.main import app
from app.db import Base, get_db
from app.models import Meeting, Item, AuditLog
from app.schemas import (
    ItemType, CommitmentLevel, ItemStatus, MeetingStatus,
)
from app.integrations.base import ExternalRef
from app.integrations.trello import get_trello_client
from app.integrations.notifier import get_notifier


@pytest.fixture(autouse=True, scope="session")
def _force_mock_ai():
    """Ensure settings cache is cleared so USE_MOCK_AI=true is active."""
    from app.config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# ═══════════════════════════════════════════════════════════════════════════════
# In-memory DB per test — shared engine approach
# We create ONE in-memory engine per test and route BOTH the session
# AND the lifespan create_all to it.
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture()
def db() -> Session:
    """
    Fresh in-memory SQLite DB for each test.
    Uses a file-URI shared-cache database so all connections (test session,
    app lifespan create_all, router handlers) see the same data.
    """
    import uuid as _uuid
    # Unique name per test so tests don't bleed into each other
    db_name = f"test_{_uuid.uuid4().hex}"
    db_url = f"sqlite:///file:{db_name}?mode=memory&cache=shared&uri=true"

    test_engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(test_engine, "connect")
    def set_pragmas(conn, _):
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    # Create all tables on the shared in-memory engine
    Base.metadata.create_all(test_engine)

    TestingSession = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)
    session = TestingSession()

    # Patch the module-level engine so lifespan create_all hits the same DB
    import app.db as app_db
    import app.main as app_main
    original_db_engine = app_db.engine
    original_main_engine = getattr(app_main, 'engine', None)

    app_db.engine = test_engine
    # main.py imports engine directly, patch it there too
    try:
        import importlib
        import app.main
        app.main.engine = test_engine  # type: ignore
    except Exception:
        pass

    try:
        yield session
    finally:
        session.close()
        app_db.engine = original_db_engine
        try:
            import app.main
            app.main.engine = original_db_engine  # type: ignore
        except Exception:
            pass
        Base.metadata.drop_all(test_engine)
        test_engine.dispose()


@pytest.fixture()
def client(db: Session) -> TestClient:
    """FastAPI TestClient wired to the in-memory DB."""
    # Patch SessionLocal so the app creates new sessions on the test engine
    import app.db as app_db
    from sqlalchemy.orm import sessionmaker as _sm
    TestingSessionLocal = _sm(bind=db.get_bind(), autocommit=False, autoflush=False)
    original_session_local = app_db.SessionLocal
    app_db.SessionLocal = TestingSessionLocal  # type: ignore

    def _override_get_db():
        s = TestingSessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()
    app_db.SessionLocal = original_session_local  # type: ignore


# ═══════════════════════════════════════════════════════════════════════════════
# Fake integrations (for gate tests)
# ═══════════════════════════════════════════════════════════════════════════════

class FakeTrelloClient:
    """Records every create_task call so tests can assert on them."""

    def __init__(self):
        self.calls: list[dict] = []       # recorded create_task calls
        self.fail_item_ids: set[str] = set()  # items that should raise

    def create_task(self, item, meeting) -> ExternalRef:
        from app.errors import GateError
        from app.schemas import ItemStatus as IS

        # Enforce the gate — same as real client
        if item.status != IS.APPROVED.value:
            raise GateError(
                f"FakeTrelloClient: item {item.id} has status {item.status}, not APPROVED",
                details={"item_id": item.id, "status": item.status},
            )

        if item.id in self.fail_item_ids:
            from app.errors import IntegrationError
            raise IntegrationError(f"Simulated Trello failure for item {item.id}")

        self.calls.append({"item_id": item.id, "title": item.title, "status": item.status})
        return ExternalRef(
            external_id=f"fake-card-{item.id[:8]}",
            external_url=f"https://trello.com/c/fake/{item.id[:8]}",
            system="trello",
        )

    def get_task_list_name(self, external_id: str) -> Optional[str]:
        return "To Do"

    def is_done_list(self, list_name) -> bool:
        return list_name == "Done"

    @property
    def call_count(self) -> int:
        return len(self.calls)


class FakeNotifier:
    """Records every send call and enforces the gate."""

    def __init__(self):
        self.calls: list[dict] = []

    @property
    def is_configured(self) -> bool:
        return True

    def send(self, item, message: str) -> bool:
        from app.errors import GateError
        from app.schemas import ItemStatus as IS

        allowed = {IS.APPROVED.value, IS.SYNCED.value}
        if item.status not in allowed:
            raise GateError(
                f"FakeNotifier: item {item.id} has status {item.status}",
                details={"item_id": item.id, "status": item.status},
            )

        self.calls.append({"item_id": item.id, "message": message, "status": item.status})
        return True

    def send_overdue_reminder(self, item, meeting_title: str) -> bool:
        return self.send(item, f"Overdue: {item.title}")

    @property
    def call_count(self) -> int:
        return len(self.calls)


@pytest.fixture()
def fake_trello() -> FakeTrelloClient:
    return FakeTrelloClient()


@pytest.fixture()
def fake_notifier() -> FakeNotifier:
    return FakeNotifier()


@pytest.fixture()
def client_with_fakes(db: Session, fake_trello: FakeTrelloClient, fake_notifier: FakeNotifier):
    """TestClient with fake Trello + fake Notifier injected."""
    import app.db as app_db
    from sqlalchemy.orm import sessionmaker as _sm
    TestingSessionLocal = _sm(bind=db.get_bind(), autocommit=False, autoflush=False)
    original_session_local = app_db.SessionLocal
    app_db.SessionLocal = TestingSessionLocal  # type: ignore

    def _override_get_db():
        s = TestingSessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_trello_client] = lambda: fake_trello
    app.dependency_overrides[get_notifier] = lambda: fake_notifier

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()
    app_db.SessionLocal = original_session_local  # type: ignore


# ═══════════════════════════════════════════════════════════════════════════════
# Item factory helpers
# ═══════════════════════════════════════════════════════════════════════════════

def make_meeting(db: Session, title: str = "Test Meeting") -> Meeting:
    m = Meeting(
        title=title,
        date=date(2026, 10, 23),
        raw_text="Test transcript",
        participants_json=json.dumps(["Alice", "Bob"]),
        status=MeetingStatus.EXTRACTED.value,
    )
    db.add(m)
    db.flush()
    return m


def make_item(
    db: Session,
    meeting: Meeting,
    *,
    item_type: ItemType = ItemType.ACTION_ITEM,
    commitment: CommitmentLevel = CommitmentLevel.CONFIRMED,
    status: ItemStatus = ItemStatus.READY_FOR_REVIEW,
    owner: str | None = "Alice",
    deadline: date | None = date(2026, 11, 7),
    flags: list[str] | None = None,
    title: str = "Test action item",
) -> Item:
    item = Item(
        meeting_id=meeting.id,
        type=item_type.value,
        commitment_level=commitment.value,
        title=title,
        description="Test description",
        owner=owner,
        deadline=deadline,
        evidence_quote="Someone said this.",
        confidence=0.9,
        flags_json=json.dumps(flags or []),
        status=status.value,
        reasoning="Test reasoning",
    )
    db.add(item)
    db.flush()
    return item
