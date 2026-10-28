from __future__ import annotations

import asyncio
import uuid
from datetime import date
from types import SimpleNamespace

import pytest

from app.services.fund_page import peers

TODAY = date(2026, 10, 23)

# (public fn, uncached name, extra args)
CASES = [
    ("rolling_returns", "_rolling_returns_uncached", (3,)),
    ("period_returns", "_period_returns_uncached", ("1Y",)),
    ("calendar_year_returns", "_calendar_year_returns_uncached", ()),
    ("risk_return_scatter", "_risk_return_scatter_uncached", ()),
    ("category_series", "_category_series_uncached", ("All",)),
    # since_inception column starts at the scheme's own first NAV date
    ("category_returns", "_category_returns_uncached", ()),
]


def _scheme():
    return SimpleNamespace(id=uuid.uuid4(), sebi_category="Large Cap", plan_type="DIRECT")


@pytest.mark.parametrize("public,private,extra", CASES)
def test_fund_specific_payloads_are_not_shared_across_schemes(monkeypatch, public, private, extra):
    peers.peer_cache.clear()
    calls = []

    async def fake(db, scheme, *args):
        calls.append(scheme.id)
        return f"payload-{scheme.id}"

    monkeypatch.setattr(peers, private, fake)
    a, b = _scheme(), _scheme()
    fn = getattr(peers, public)

    async def call(scheme):
        if public in ("rolling_returns", "period_returns", "category_series"):
            return await fn(None, scheme, extra[0], TODAY)
        return await fn(None, scheme, TODAY)

    ra = asyncio.run(call(a))
    rb = asyncio.run(call(b))
    ra2 = asyncio.run(call(a))
    assert ra == f"payload-{a.id}"
    assert rb == f"payload-{b.id}"
    assert ra2 == ra
    assert calls == [a.id, b.id]  # same scheme still hits the cache
    peers.peer_cache.clear()


def test_fixed_window_series_stays_shared_across_schemes(monkeypatch):
    peers.peer_cache.clear()
    calls = []

    async def fake(db, scheme, period, today):
        calls.append(scheme.id)
        return "shared"

    monkeypatch.setattr(peers, "_category_series_uncached", fake)
    a, b = _scheme(), _scheme()
    asyncio.run(peers.category_series(None, a, "1Y", TODAY))
    asyncio.run(peers.category_series(None, b, "1Y", TODAY))
    assert calls == [a.id]
    peers.peer_cache.clear()
