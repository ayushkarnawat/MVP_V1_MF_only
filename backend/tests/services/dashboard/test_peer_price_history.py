import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from email.utils import format_datetime
from unittest.mock import AsyncMock

import httpx
import pytest

from app.models.reference import NavHistory, Scheme
from app.services.analytics.scheme_universe import CategoryPeers, UniverseRow
from app.services.dashboard import nav
from app.services.dashboard.held_nav_refresh import HeldNavResult, today_ist
from scripts.jobs import refresh_nav_daily as job


def _scheme(db, code):
    scheme = Scheme(
        amfi_code=code, name=f"Example Fund {code}", amc_name="Example AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.flush()
    return scheme


def _prices(db, scheme):
    rows = db.query(NavHistory).filter_by(scheme_id=scheme.id).order_by(NavHistory.date).all()
    return [(row.date, row.nav) for row in rows]


def _throttled(retry_after=None):
    request = httpx.Request("GET", "https://example.invalid/history")
    headers = {} if retry_after is None else {"Retry-After": retry_after}
    response = httpx.Response(429, request=request, headers=headers)
    return httpx.HTTPStatusError("Too many requests", request=request, response=response)


@pytest.fixture
def peer_run(db_session, monkeypatch):
    held = _scheme(db_session, "900001")
    peer = _scheme(db_session, "900002")
    monkeypatch.setattr(job, "load_held_schemes", lambda db: [held])
    monkeypatch.setattr(job, "get_category_peers", AsyncMock(return_value=CategoryPeers([peer], 1, {})))
    monkeypatch.setattr(job, "refresh_held_navs", AsyncMock(return_value=HeldNavResult(1, 0, 0, 0, 0)))

    def run(stored_date, amfi_date, amfi_nav):
        db_session.add(NavHistory(scheme_id=peer.id, date=stored_date, nav=Decimal("10")))
        db_session.commit()
        row = UniverseRow(peer.amfi_code, None, peer.name, peer.amc_name, peer.sebi_category,
                          nav=amfi_nav, nav_date=amfi_date)
        monkeypatch.setattr(job, "fetch_amfi_rows", AsyncMock(return_value=[row]))
        return job.main_async(db_session)

    return peer, run


def test_peer_gets_amfis_latest_price_even_when_the_history_fetch_is_refused(
    db_session, monkeypatch, capsys, peer_run,
):
    peer, run = peer_run
    today = today_ist()
    old_date = today - timedelta(days=15)
    yesterday = today - timedelta(days=1)
    amfi_price = Decimal("42.1234")
    prices_during_fetch = []

    async def refuse(code):
        prices_during_fetch.append(_prices(db_session, peer)[-1])
        raise _throttled()

    monkeypatch.setattr(nav, "_fetch_nav_history", refuse)
    monkeypatch.setattr(nav.asyncio, "sleep", AsyncMock())

    asyncio.run(run(old_date, yesterday, amfi_price))

    assert _prices(db_session, peer) == [(old_date, Decimal("10")), (yesterday, amfi_price)]
    assert prices_during_fetch == [(yesterday, amfi_price), (yesterday, amfi_price)]
    assert "PEER_HISTORY failed=1 of 1" in capsys.readouterr().out.splitlines()


def test_a_peer_already_current_gets_no_extra_row(db_session, monkeypatch, capsys, peer_run):
    peer, run = peer_run
    today = date.today()
    fetch = AsyncMock(side_effect=AssertionError("History is already fresh"))
    monkeypatch.setattr(nav, "_fetch_nav_history", fetch)

    asyncio.run(run(today, today, Decimal("42")))

    assert _prices(db_session, peer) == [(today, Decimal("10"))]
    fetch.assert_not_awaited()
    assert "PEER_HISTORY failed=0 of 0" in capsys.readouterr().out.splitlines()


@pytest.mark.parametrize(("day_offset", "amfi_nav"), [
    (-16, Decimal("42")), (-1, Decimal("0")), (-1, Decimal("-1")),
    (1, Decimal("42")), (-1, None), (None, Decimal("42")),
])
def test_amfi_row_that_is_older_or_unusable_is_ignored(
    db_session, monkeypatch, peer_run, day_offset, amfi_nav,
):
    peer, run = peer_run
    today = today_ist()
    stored_date = today - timedelta(days=15)
    amfi_date = today + timedelta(days=day_offset) if day_offset is not None else None
    fetch = AsyncMock(return_value=[])
    monkeypatch.setattr(nav, "_fetch_nav_history", fetch)

    asyncio.run(run(stored_date, amfi_date, amfi_nav))

    assert _prices(db_session, peer) == [(stored_date, Decimal("10"))]
    fetch.assert_awaited_once_with(peer.amfi_code)


@pytest.mark.parametrize("retry_after, delay, fails", [
    (None, 1, True), ("4", 4, True), ("invalid", 1, True), ("4", 4, False),
])
def test_429_is_retried_once_then_counted(db_session, monkeypatch, retry_after, delay, fails):
    scheme = _scheme(db_session, "900003")
    db_session.commit()
    history = [(date.today(), Decimal("23.45"))]
    fetch = AsyncMock(side_effect=[_throttled(retry_after), _throttled() if fails else history])
    sleep = AsyncMock()
    monkeypatch.setattr(nav, "_fetch_nav_history", fetch)
    monkeypatch.setattr(nav.asyncio, "sleep", sleep)

    counts = asyncio.run(nav.warm_nav_history(db_session, [scheme]))

    assert fetch.await_count == 2
    sleep.assert_awaited_once_with(delay)
    assert counts == (1, int(fails))
    assert _prices(db_session, scheme) == ([] if fails else history)


def test_429_honors_an_http_date_retry_after(db_session, monkeypatch):
    scheme = _scheme(db_session, "900004")
    db_session.commit()
    now = datetime(2026, 11, 20, 6, tzinfo=timezone.utc)
    retry_after = format_datetime(now + timedelta(seconds=5), usegmt=True)
    fetch = AsyncMock(side_effect=[_throttled(retry_after), [(date.today(), Decimal("10"))]])
    sleep = AsyncMock()
    monkeypatch.setattr(nav, "datetime", AsyncMock(wraps=datetime))
    monkeypatch.setattr(nav.datetime, "now", lambda tz: now)
    monkeypatch.setattr(nav, "_fetch_nav_history", fetch)
    monkeypatch.setattr(nav.asyncio, "sleep", sleep)

    assert asyncio.run(nav.warm_nav_history(db_session, [scheme])) == (1, 0)
    sleep.assert_awaited_once_with(5)


def test_concurrency_is_limited(db_session, monkeypatch):
    limit = getattr(nav, "_NAV_HISTORY_CONCURRENCY", 8)
    schemes = [_scheme(db_session, str(910000 + index)) for index in range(limit + 2)]
    db_session.commit()
    active = peak = 0

    async def fetch(code):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0)
        active -= 1
        return [(date.today(), Decimal("10"))]

    monkeypatch.setattr(nav, "_fetch_nav_history", fetch)

    counts = asyncio.run(nav.warm_nav_history(db_session, schemes))

    assert 1 < peak <= limit
    assert counts == (len(schemes), 0)
    assert db_session.query(NavHistory).count() == len(schemes)
