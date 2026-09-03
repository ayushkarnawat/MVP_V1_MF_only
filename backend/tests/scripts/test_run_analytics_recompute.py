import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def test_run_one_calls_recompute_with_the_given_user_id():
    from scripts.run_analytics_recompute import _run_one

    user_id = uuid.uuid4()
    # MagicMock, not a bare object(): _run_one's finally block calls
    # db.close(), which a bare object() has no attribute for.
    fake_db = MagicMock()

    with patch("scripts.run_analytics_recompute.SessionLocal", return_value=fake_db), \
         patch("scripts.run_analytics_recompute.recompute_household_analytics", new=AsyncMock()) as mock_recompute:
        import asyncio
        asyncio.run(_run_one(user_id))

    mock_recompute.assert_awaited_once_with(fake_db, user_id)


def test_run_all_recomputes_every_user_and_keeps_going_after_one_failure():
    from scripts.run_analytics_recompute import _run_all

    user_a, user_b = uuid.uuid4(), uuid.uuid4()

    class _FakeQuery:
        def all(self):
            return [(user_a,), (user_b,)]

    class _FakeDb:
        def query(self, *_args):
            return _FakeQuery()

        def close(self):
            pass

    recompute_calls = []

    async def _fake_run_one(user_id):
        recompute_calls.append(user_id)
        if user_id == user_a:
            raise RuntimeError("boom")

    with patch("scripts.run_analytics_recompute.SessionLocal", return_value=_FakeDb()), \
         patch("scripts.run_analytics_recompute._run_one", new=_fake_run_one):
        import asyncio
        asyncio.run(_run_all())

    assert recompute_calls == [user_a, user_b]
