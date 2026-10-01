"""0018 on real Postgres (F2/F13): enum types created and dropped, the
trigger function re-runnable, and the never-relock trigger enforced by the
server. Skipped without TEST_DATABASE_URL, same as the other postgres tests."""

import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

pytestmark = pytest.mark.postgres


@pytest.fixture()
def postgres_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set — no local Postgres to test against")
    return url


def _alembic(*args):
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )


def test_0018_round_trip_and_0023_drops_never_relock_trigger_on_postgres(postgres_url, monkeypatch):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from app.models.enums import Relationship
    from app.models.user import HouseholdMember, User

    monkeypatch.setenv("DATABASE_URL", postgres_url)
    _alembic("downgrade", "base")
    up = _alembic("upgrade", "head")
    assert up.returncode == 0, up.stderr

    engine = create_engine(postgres_url)
    try:
        with engine.connect() as conn:
            types = set(conn.execute(text("SELECT typname FROM pg_type")).scalars())
            assert {"memberorigin", "membernamesource", "memberpansource",
                    "memberpanconflict", "namechangereason"}.issubset(types)
            # 0023 removed the lock: its enum type and trigger are gone.
            assert "memberlockreason" not in types
            trg = conn.execute(text(
                "SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_member_never_relock'"
            )).scalar()
            assert trg == 0

        now = datetime.now(timezone.utc)
        db = sessionmaker(bind=engine)()
        user = User(id=uuid.uuid4(), phone_number="+919800018018", created_at=now)
        db.add(user)
        db.flush()
        member = HouseholdMember(user_id=user.id, name="Asha Rao",
                                 relationship=Relationship.SPOUSE, created_at=now)
        db.add(member)
        db.commit()
        # No lock any more: an ordinary edit (relationship to NULL) is allowed.
        member.relationship = None
        db.commit()
        # Pre-0018 relationship is NOT NULL, so 0018's downgrade can't run while a
        # NULL-relationship row exists. Remove the test rows before going below it.
        db.delete(member)
        db.delete(user)
        db.commit()
        db.close()
    finally:
        engine.dispose()

    down = _alembic("downgrade", "0017")
    assert down.returncode == 0, down.stderr
    with engine.connect() as conn:
        types = set(conn.execute(text("SELECT typname FROM pg_type")).scalars())
        assert "memberorigin" not in types and "namechangereason" not in types
        fn = conn.execute(text("SELECT count(*) FROM pg_proc WHERE proname = 'member_never_relock'")).scalar()
        assert fn == 0
    engine.dispose()

    # Re-upgrade proves the downgrade left nothing behind that would collide.
    again = _alembic("upgrade", "head")
    assert again.returncode == 0, again.stderr
    _alembic("downgrade", "base")


def test_0018_backfills_preexisting_members_on_postgres(postgres_url, monkeypatch):
    """Staging runs 0018 against existing members. The backfill's enum writes
    must be valid Postgres (no text-to-enum assignment) and leave every row
    passing the lock CHECKs."""
    from sqlalchemy import create_engine, text

    monkeypatch.setenv("DATABASE_URL", postgres_url)
    _alembic("downgrade", "base")
    up = _alembic("upgrade", "0017")
    assert up.returncode == 0, up.stderr

    engine = create_engine(postgres_url)
    try:
        with engine.begin() as conn:
            user_id = uuid.uuid4()
            conn.execute(
                text("INSERT INTO users (id, phone_number, created_at) VALUES (:id, '+919800018019', now())"),
                {"id": user_id},
            )
            conn.execute(
                text(
                    "INSERT INTO household_members"
                    " (id, user_id, name, relationship, created_at, pan_encrypted, pan_lookup_hash)"
                    " VALUES (:a, :u, 'Asha Rao', 'self', now(), 'enc', 'hash'),"
                    "        (:b, :u, 'Ravi Rao', 'spouse', now(), NULL, NULL)"
                ),
                {"a": uuid.uuid4(), "b": uuid.uuid4(), "u": user_id},
            )

        head = _alembic("upgrade", "head")
        assert head.returncode == 0, head.stderr

        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT relationship::text, origin::text, pan_conflict::text,"
                    " pan_source::text FROM household_members ORDER BY name"
                )
            ).all()
        assert [tuple(r) for r in rows] == [
            ("self", "onboarding", None, "cas"),
            ("spouse", "manual", None, None),
        ]
    finally:
        engine.dispose()
        _alembic("downgrade", "base")


def test_0019_primary_goals_check_constraint_on_postgres(postgres_url, monkeypatch):
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import IntegrityError

    monkeypatch.setenv("DATABASE_URL", postgres_url)
    _alembic("downgrade", "base")
    assert _alembic("upgrade", "head").returncode == 0
    engine = create_engine(postgres_url)
    # pending_deletion has a server default (0013), so no extra NOT NULL columns.
    insert = (
        "INSERT INTO users (id, phone_number, created_at, primary_goals) "
        "VALUES (gen_random_uuid(), :phone, now(), CAST(:goals AS jsonb))"
    )
    try:
        with engine.begin() as conn:
            conn.execute(text(insert), {"phone": "+919800001901", "goals": '["family_management"]'})
        for i, bad in enumerate(('["foo"]', "[]", '"family_management"')):
            with pytest.raises(IntegrityError):
                with engine.begin() as conn:
                    conn.execute(text(insert), {"phone": f"+91980000191{i}", "goals": bad})
    finally:
        engine.dispose()
