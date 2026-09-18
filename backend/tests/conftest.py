import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def pytest_collection_modifyitems(config, items):
    for item in items:
        if "functional_postgres" in str(item.fspath):
            item.add_marker("postgres")


def _enforce_sqlite_foreign_keys(engine):
    """SQLite ignores FK constraints unless each connection turns them on --
    without this, a test can pass with a delete order that would violate FK
    constraints on the real Postgres target."""

    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_connection, _):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")


@pytest.fixture(autouse=True)
def _default_stub_delivery_mode(monkeypatch):
    """Forces OTP_DELIVERY_MODE and EMAIL_DELIVERY_MODE back to "stub" before
    every test, regardless of what a developer's local backend/.env has set
    -- e.g. EMAIL_DELIVERY_MODE=postmark, left on permanently so the live
    app sends real email. Without this, any test exercising the email or
    phone channel without its own explicit monkeypatch would silently pick
    up the real value and fire a real outbound call. A test that needs a
    non-stub value still monkeypatches it explicitly in its own body --
    that call runs after this fixture and simply overrides it for that one
    test; pytest's monkeypatch teardown still restores the true original
    value once the test ends."""
    from app.config import settings

    monkeypatch.setattr(settings, "otp_delivery_mode", "stub")
    monkeypatch.setattr(settings, "email_delivery_mode", "stub")


# Fixed, valid base64-encoded 32-byte test values for PAN_ENCRYPTION_KEY /
# PAN_LOOKUP_PEPPER -- generated once via os.urandom(32); not secrets, just
# stand-ins that satisfy crypto.py's _decode_key length check so tests never
# depend on a developer's or CI's shell environment happening to have real
# values set. Two distinct values so a bug that swapped the two constants
# would still be caught (using the same value for both would mask that).
_TEST_PAN_ENCRYPTION_KEY = "7UMJtaHR2bypSVyQCiYW6jUd1ZEjneoe23nh7kDG3Sc="
_TEST_PAN_LOOKUP_PEPPER = "FJrdkXb4DItLemwtT7lzt611BmNBmLY3ZVvEuk5POc4="


@pytest.fixture(autouse=True)
def _default_test_pan_keys(monkeypatch):
    """Forces PAN_ENCRYPTION_KEY/PAN_LOOKUP_PEPPER to fixed valid test values
    before every test, regardless of the shell environment -- both default to
    "" in app.config.Settings, and crypto.py's _decode_key raises RuntimeError
    on an empty/invalid value. Without this, a fresh clone or a CI run with no
    .env gets RuntimeError on every test that touches PAN encryption/matching
    (see Fix 2 of the 2026-09-18 whole-branch review). Same autouse pattern as
    _default_stub_delivery_mode above; a test needing different keys still
    monkeypatches over this in its own body."""
    from app.config import settings

    monkeypatch.setattr(settings, "pan_encryption_key", _TEST_PAN_ENCRYPTION_KEY)
    monkeypatch.setattr(settings, "pan_lookup_pepper", _TEST_PAN_LOOKUP_PEPPER)


@pytest.fixture()
def db_session():
    """An isolated in-memory DB session for unit tests."""
    from app.db.base import Base

    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    _enforce_sqlite_foreign_keys(engine)
    Base.metadata.create_all(engine)
    TestSessionLocal = sessionmaker(autoflush=False, bind=engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    """A TestClient backed by an isolated in-memory DB — StaticPool so every
    request in a test shares the same connection/data, autoflush=False to
    match production's real session config (see Global Constraints)."""
    from app.db.base import Base
    from app.db.session import get_db
    from app.main import app
    from fastapi.testclient import TestClient

    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    _enforce_sqlite_foreign_keys(engine)
    Base.metadata.create_all(engine)
    TestSessionLocal = sessionmaker(autoflush=False, bind=engine)

    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)

