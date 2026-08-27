import asyncio
import time

from sqlalchemy import text

from app.db.session import SessionLocal, commit_off_loop, engine


def test_engine_connects_and_executes():
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        assert result.scalar() == 1


def test_get_db_yields_working_session():
    from app.db.session import get_db

    gen = get_db()
    db = next(gen)
    try:
        assert db.execute(text("SELECT 1")).scalar() == 1
    finally:
        gen.close()


class _SlowCommitDB:
    def commit(self):
        time.sleep(0.3)


def test_commit_off_loop_does_not_block_event_loop():
    """A slow db.commit() must not freeze other coroutines on the same loop
    (session.md Still-open item 7: WSL DrvFs fsync stalls froze every
    in-flight request, not just the slow one)."""

    async def _run():
        ticks = 0

        async def _tick_counter():
            nonlocal ticks
            while True:
                await asyncio.sleep(0.01)
                ticks += 1

        counter_task = asyncio.create_task(_tick_counter())
        await commit_off_loop(_SlowCommitDB())
        counter_task.cancel()
        return ticks

    ticks = asyncio.run(_run())
    # If commit_off_loop blocked the loop, the counter task would never get
    # scheduled during the 0.3s sleep and ticks would stay at 0.
    assert ticks > 0
