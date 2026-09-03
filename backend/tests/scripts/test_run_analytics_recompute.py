import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.analytics import AnalyticsRecomputeStatus
from app.models.enums import Relationship
from app.models.user import HouseholdMember, User
from app.services.analytics.recompute import try_claim_recompute


def _session_factory():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)


def _user(session_factory) -> uuid.UUID:
    db = session_factory()
    user_id = uuid.uuid4()
    user = User(id=user_id, phone_number=f"+9199{uuid.uuid4().hex[:8]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.commit()
    db.close()
    return user_id


def test_run_one_calls_recompute_with_the_given_user_id():
    from scripts.run_analytics_recompute import _run_one

    user_id = uuid.uuid4()
    # MagicMock, not a bare object(): _run_one's finally block calls
    # db.close(), which a bare object() has no attribute for.
    fake_db = MagicMock()

    with patch("scripts.run_analytics_recompute.SessionLocal", return_value=fake_db), \
         patch("scripts.run_analytics_recompute.try_claim_recompute") as mock_claim, \
         patch("scripts.run_analytics_recompute.recompute_household_analytics", new=AsyncMock()) as mock_recompute:
        import asyncio
        asyncio.run(_run_one(user_id))

    # _run_one must NOT claim -- its only caller (--household mode) is an
    # ECS task launched by a dispatch site that already claimed this slot;
    # re-claiming here would race that already-successful claim on the
    # same fresh row and always lose (round-2 review's Critical finding).
    mock_claim.assert_not_called()
    mock_recompute.assert_awaited_once_with(fake_db, user_id)


def test_run_one_actually_runs_recompute_when_the_caller_already_claimed():
    """Real cross-process handoff, not a mocked try_claim_recompute return
    value: seeds a genuine claim the way a dispatch site (analytics.py
    GET/retry, imports.py CAS-confirm) would, then calls _run_one exactly
    as the resulting ECS task would -- and asserts the recompute actually
    runs despite the slot already being freshly claimed. This is the exact
    scenario round 1's mocked-claim tests failed to catch."""
    from scripts.run_analytics_recompute import _run_one

    session_factory = _session_factory()
    user_id = _user(session_factory)

    claim_db = session_factory()
    assert try_claim_recompute(claim_db, user_id) is True
    claim_db.close()

    worker_db = session_factory()
    with patch("scripts.run_analytics_recompute.SessionLocal", return_value=worker_db), \
         patch("scripts.run_analytics_recompute.recompute_household_analytics", new=AsyncMock()) as mock_recompute:
        import asyncio
        asyncio.run(_run_one(user_id))

    mock_recompute.assert_awaited_once_with(worker_db, user_id)


def test_run_all_recomputes_every_user_and_keeps_going_after_one_failure():
    from scripts.run_analytics_recompute import _run_all

    session_factory = _session_factory()
    user_a = _user(session_factory)
    user_b = _user(session_factory)

    recompute_calls = []

    async def _fake_run_one(user_id):
        recompute_calls.append(user_id)
        if user_id == user_a:
            raise RuntimeError("boom")

    with patch("scripts.run_analytics_recompute.SessionLocal", side_effect=session_factory), \
         patch("scripts.run_analytics_recompute._run_one", new=_fake_run_one):
        import asyncio
        asyncio.run(_run_all())

    # Row order for a plain SELECT with no ORDER BY isn't guaranteed --
    # SQLite may return primary-key-index order (sorted by UUID value) --
    # so assert membership/count, not sequence.
    assert set(recompute_calls) == {user_a, user_b}


def test_run_all_skips_a_user_whose_recompute_is_already_freshly_claimed():
    """The daily backstop's own claim (added to close Finding #3, an
    in-flight-guard for _run_all specifically -- distinct from _run_one's
    now-removed claim) must still skip a user an event-triggered task is
    already mid-recompute for."""
    from scripts.run_analytics_recompute import _run_all

    session_factory = _session_factory()
    claimed_user = _user(session_factory)
    unclaimed_user = _user(session_factory)

    pre_claim_db = session_factory()
    assert try_claim_recompute(pre_claim_db, claimed_user) is True
    pre_claim_db.close()

    recompute_calls = []

    async def _fake_run_one(user_id):
        recompute_calls.append(user_id)

    with patch("scripts.run_analytics_recompute.SessionLocal", side_effect=session_factory), \
         patch("scripts.run_analytics_recompute._run_one", new=_fake_run_one):
        import asyncio
        asyncio.run(_run_all())

    assert recompute_calls == [unclaimed_user]
