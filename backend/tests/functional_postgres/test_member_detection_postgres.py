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


_GOAL_INSERT = (
    "INSERT INTO users (id, phone_number, created_at, primary_goals) "
    "VALUES (gen_random_uuid(), :phone, now(), CAST(:goals AS jsonb))"
)


def _upgraded_engine(postgres_url, monkeypatch):
    from sqlalchemy import create_engine

    monkeypatch.setenv("DATABASE_URL", postgres_url)
    _alembic("downgrade", "base")
    assert _alembic("upgrade", "head").returncode == 0
    return create_engine(postgres_url)


def test_primary_goals_check_allows_one_to_six_new_codes(postgres_url, monkeypatch):
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    engine = _upgraded_engine(postgres_url, monkeypatch)
    six = '["wealth_creation","retirement","childrens_education","buy_home","financial_freedom","tax_planning"]'
    try:
        with engine.begin() as conn:
            conn.execute(text(_GOAL_INSERT), {"phone": "+919800005301", "goals": '["buy_home"]'})
            conn.execute(text(_GOAL_INSERT), {"phone": "+919800005302", "goals": six})
        bad = (
            '["foo"]', "[]", '"retirement"',
            '["family_management"]',  # old code
            '["wealth_creation","retirement","childrens_education","buy_home","financial_freedom","tax_planning","foo"]',  # seven
        )
        for i, value in enumerate(bad):
            with pytest.raises(IntegrityError):
                with engine.begin() as conn:
                    conn.execute(text(_GOAL_INSERT), {"phone": f"+91980000531{i}", "goals": value})
    finally:
        engine.dispose()


def test_primarygoal_enum_type_is_gone(postgres_url, monkeypatch):
    from sqlalchemy import text

    engine = _upgraded_engine(postgres_url, monkeypatch)
    try:
        with engine.connect() as conn:
            n = conn.execute(text("SELECT count(*) FROM pg_type WHERE typname = 'primarygoal'")).scalar()
        assert n == 0
    finally:
        engine.dispose()


def test_users_table_has_no_primary_goal_column(postgres_url, monkeypatch):
    from sqlalchemy import text

    engine = _upgraded_engine(postgres_url, monkeypatch)
    try:
        with engine.connect() as conn:
            cols = {r[0] for r in conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"))}
        assert "primary_goal" not in cols
        assert "primary_goals" in cols
    finally:
        engine.dispose()


def test_0053_postgres_up_down_up_restores_old_shape_and_clears_goals(postgres_url, monkeypatch):
    from sqlalchemy import text

    engine = _upgraded_engine(postgres_url, monkeypatch)
    try:
        with engine.begin() as conn:
            conn.execute(text(_GOAL_INSERT), {"phone": "+919800005391", "goals": '["retirement"]'})
        assert _alembic("downgrade", "-1").returncode == 0
        with engine.connect() as conn:
            cols = {r[0] for r in conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"))}
            types = conn.execute(text("SELECT count(*) FROM pg_type WHERE typname = 'primarygoal'")).scalar()
            goals = conn.execute(text("SELECT primary_goals FROM users WHERE phone_number = '+919800005391'")).scalar()
        assert "primary_goal" in cols and types == 1
        assert goals is None  # new codes cannot be represented in the old shape
        # old CHECK is back: an old code is accepted, a new one refused
        from sqlalchemy.exc import IntegrityError
        with engine.begin() as conn:
            conn.execute(text(_GOAL_INSERT), {"phone": "+919800005392", "goals": '["family_management"]'})
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(text(_GOAL_INSERT), {"phone": "+919800005393", "goals": '["retirement"]'})
        with engine.begin() as conn:
            conn.execute(text("UPDATE users SET primary_goals = NULL"))
        assert _alembic("upgrade", "head").returncode == 0
    finally:
        engine.dispose()
