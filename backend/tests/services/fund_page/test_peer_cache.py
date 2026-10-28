from __future__ import annotations

import asyncio
from datetime import date

import pytest


def test_single_flight_computes_once_for_concurrent_callers():
    from app.services.fund_page.peer_cache import PeerCache

    calls = 0

    async def compute():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0)
        return "ready"

    cache = PeerCache(day=lambda: date(2026, 10, 23))
    async def exercise():
        return await asyncio.gather(*[
            cache.get_or_compute(("category",), compute) for _ in range(5)
        ])

    results = asyncio.run(exercise())

    assert results == ["ready"] * 5
    assert calls == 1


def test_key_is_day_bound_midnight_misses():
    from app.services.fund_page.peer_cache import PeerCache

    current = [date(2026, 10, 23)]
    calls = 0

    async def compute():
        nonlocal calls
        calls += 1
        return calls

    cache = PeerCache(day=lambda: current[0])

    async def exercise():
        assert await cache.get_or_compute(("category",), compute) == 1
        current[0] = date(2026, 10, 24)
        assert await cache.get_or_compute(("category",), compute) == 2

    asyncio.run(exercise())
    assert calls == 2


def test_entry_expires_after_ttl():
    from app.services.fund_page.peer_cache import PeerCache

    now = [100.0]
    calls = 0

    async def compute():
        nonlocal calls
        calls += 1
        return calls

    cache = PeerCache(clock=lambda: now[0], day=lambda: date(2026, 10, 23))

    async def exercise():
        assert await cache.get_or_compute(("category",), compute) == 1
        now[0] += 21601
        assert await cache.get_or_compute(("category",), compute) == 2

    asyncio.run(exercise())
    assert calls == 2


def test_failed_compute_is_not_cached_and_releases_the_lock():
    from app.services.fund_page.peer_cache import PeerCache

    calls = 0

    async def compute():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("first pass fails")
        return "recovered"

    cache = PeerCache(day=lambda: date(2026, 10, 23))

    async def exercise():
        with pytest.raises(RuntimeError, match="first pass fails"):
            await cache.get_or_compute(("category",), compute)
        return await cache.get_or_compute(("category",), compute)

    assert asyncio.run(exercise()) == "recovered"
    assert calls == 2
