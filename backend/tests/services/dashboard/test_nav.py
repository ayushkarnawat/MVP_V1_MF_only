import contextlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import Scheme
from app.services.dashboard import nav as nav_module
from app.services.dashboard.nav import (
    _upsert_nav_history,
    get_nav_on_or_before,
    get_navs_on_or_before,
    get_previous_nav_from_cache,
    warm_nav_history,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _scheme(db, amfi_code="125497"):
    scheme = Scheme(
        id=uuid.uuid4(), amfi_code=amfi_code, isin="INF123", name="HDFC Flexi Cap Fund",
        amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.commit()
    return scheme


def _mfapi_payload(entries: list[tuple[str, str]]) -> dict:
    return {"meta": {}, "data": [{"date": d, "nav": n} for d, n in entries]}


def test_fetch_nav_history_deduplicates_concurrent_calls_for_same_amfi_code():
    import asyncio

    fetch_started = asyncio.Event()
    release_fetch = asyncio.Event()

    async def fetch(amfi_code: str):
        fetch_started.set()
        await asyncio.wait_for(release_fetch.wait(), timeout=1)
        return [(date(2024, 1, 15), Decimal("50.1234"))]

    async def run_calls():
        first = asyncio.create_task(nav_module._fetch_nav_history("125497"))
        await asyncio.wait_for(fetch_started.wait(), timeout=1)
        second = asyncio.create_task(nav_module._fetch_nav_history("125497"))
        await asyncio.sleep(0)
        release_fetch.set()
        return await asyncio.gather(first, second)

    with patch.object(nav_module, "_fetch_nav_history_uncached", new=AsyncMock(side_effect=fetch)) as uncached:
        results = asyncio.run(run_calls())

    assert results == [[(date(2024, 1, 15), Decimal("50.1234"))]] * 2
    uncached.assert_awaited_once_with("125497")


def test_fetch_nav_history_fetches_different_amfi_codes_concurrently():
    import asyncio

    both_fetches_started = asyncio.Event()
    started: set[str] = set()

    async def fetch(amfi_code: str):
        started.add(amfi_code)
        if len(started) == 2:
            both_fetches_started.set()
        await asyncio.wait_for(both_fetches_started.wait(), timeout=1)
        return [(date(2024, 1, 15), Decimal(amfi_code))]

    async def run_calls():
        return await asyncio.gather(
            nav_module._fetch_nav_history("111111"),
            nav_module._fetch_nav_history("222222"),
        )

    with patch.object(nav_module, "_fetch_nav_history_uncached", new=AsyncMock(side_effect=fetch)) as uncached:
        results = asyncio.run(run_calls())

    assert results == [
        [(date(2024, 1, 15), Decimal("111111"))],
        [(date(2024, 1, 15), Decimal("222222"))],
    ]
    assert uncached.await_count == 2


def test_fetch_nav_history_cleans_up_completed_single_flight():
    import asyncio

    fetch_started = asyncio.Event()
    release_fetch = asyncio.Event()

    async def fetch(amfi_code: str):
        fetch_started.set()
        await asyncio.wait_for(release_fetch.wait(), timeout=1)
        return [(date(2024, 1, 15), Decimal("50.1234"))]

    async def run_calls():
        first = asyncio.create_task(nav_module._fetch_nav_history("125497"))
        await asyncio.wait_for(fetch_started.wait(), timeout=1)
        second = asyncio.create_task(nav_module._fetch_nav_history("125497"))
        await asyncio.sleep(0)
        release_fetch.set()
        first_results = await asyncio.gather(first, second)
        third_result = await nav_module._fetch_nav_history("125497")
        return first_results, third_result

    with patch.object(nav_module, "_fetch_nav_history_uncached", new=AsyncMock(side_effect=fetch)) as uncached:
        asyncio.run(run_calls())

    assert uncached.await_count == 2


def test_fetch_nav_history_propagates_error_to_all_waiters_then_clears_registry():
    import asyncio

    fetch_started = asyncio.Event()
    release_fetch = asyncio.Event()
    calls = 0

    async def fetch(amfi_code: str):
        nonlocal calls
        calls += 1
        if calls == 1:
            fetch_started.set()
            await asyncio.wait_for(release_fetch.wait(), timeout=1)
            raise httpx.HTTPError("boom")
        return [(date(2024, 1, 15), Decimal("50.1234"))]

    async def run_calls():
        first = asyncio.create_task(nav_module._fetch_nav_history("125497"))
        await asyncio.wait_for(fetch_started.wait(), timeout=1)
        second = asyncio.create_task(nav_module._fetch_nav_history("125497"))
        await asyncio.sleep(0)
        release_fetch.set()
        results = await asyncio.gather(first, second, return_exceptions=True)
        third_result = await nav_module._fetch_nav_history("125497")
        return results, third_result

    with patch.object(nav_module, "_fetch_nav_history_uncached", new=AsyncMock(side_effect=fetch)) as uncached:
        (first_err, second_err), third_result = asyncio.run(run_calls())

    assert isinstance(first_err, httpx.HTTPError)
    assert isinstance(second_err, httpx.HTTPError)
    assert third_result == [(date(2024, 1, 15), Decimal("50.1234"))]
    assert uncached.await_count == 2
    assert "125497" not in nav_module._nav_fetches_in_flight


def test_fetch_nav_history_cancelling_one_waiter_does_not_cancel_shared_fetch():
    import asyncio

    fetch_started = asyncio.Event()
    release_fetch = asyncio.Event()

    async def fetch(amfi_code: str):
        fetch_started.set()
        await asyncio.wait_for(release_fetch.wait(), timeout=1)
        return [(date(2024, 1, 15), Decimal("50.1234"))]

    async def run_calls():
        first = asyncio.create_task(nav_module._fetch_nav_history("125497"))
        await asyncio.wait_for(fetch_started.wait(), timeout=1)
        second = asyncio.create_task(nav_module._fetch_nav_history("125497"))
        await asyncio.sleep(0)

        first.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await first

        release_fetch.set()
        return await second

    with patch.object(nav_module, "_fetch_nav_history_uncached", new=AsyncMock(side_effect=fetch)) as uncached:
        result = asyncio.run(run_calls())

    assert result == [(date(2024, 1, 15), Decimal("50.1234"))]
    uncached.assert_awaited_once_with("125497")
    assert "125497" not in nav_module._nav_fetches_in_flight


def test_fetch_nav_history_uncached_reuses_lazily_created_client():
    import asyncio

    response = MagicMock()
    response.json.return_value = _mfapi_payload([("15-01-2024", "50.1234")])
    client = AsyncMock()
    client.get.return_value = response

    async def run_calls():
        await nav_module._fetch_nav_history_uncached("111111")
        await nav_module._fetch_nav_history_uncached("222222")

    with (
        patch.object(nav_module, "_nav_http_client", None),
        patch("app.services.dashboard.nav.httpx.AsyncClient", return_value=client) as client_factory,
    ):
        asyncio.run(run_calls())

    client_factory.assert_called_once()
    assert client.get.await_count == 2


def test_fetches_and_caches_on_first_call():
    db = _session()
    scheme = _scheme(db)
    payload = _mfapi_payload([("15-01-2024", "50.1234"), ("14-01-2024", "49.9876")])

    with patch(
        "app.services.dashboard.nav._fetch_nav_history",
        new=AsyncMock(return_value=[(date(2024, 1, 15), Decimal("50.1234")), (date(2024, 1, 14), Decimal("49.9876"))]),
    ):
        import asyncio
        result = asyncio.run(get_nav_on_or_before(db, scheme, date(2024, 1, 15)))

    assert result == (Decimal("50.1234"), date(2024, 1, 15))

    from app.models.reference import NavHistory
    cached = db.query(NavHistory).filter_by(scheme_id=scheme.id).all()
    assert len(cached) == 2


def test_uses_cache_without_fetching_for_a_past_date():
    import asyncio
    db = _session()
    scheme = _scheme(db)

    from app.models.reference import NavHistory
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 1, 10), nav=Decimal("45.0000")))
    db.commit()

    with patch("app.services.dashboard.nav._fetch_nav_history", new=AsyncMock(side_effect=AssertionError("should not fetch"))):
        result = asyncio.run(get_nav_on_or_before(db, scheme, date(2024, 1, 10)))

    assert result == (Decimal("45.0000"), date(2024, 1, 10))


def test_falls_back_to_most_recent_before_requested_date_when_exact_date_missing():
    import asyncio
    db = _session()
    scheme = _scheme(db)

    from app.models.reference import NavHistory
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 1, 5), nav=Decimal("40.0000")))
    db.commit()

    # Requesting a past date with an older cached row present but nothing
    # newer — falls back to the older row without fetching (the requested
    # date isn't "today", so there's no reason to expect a fresher fetch to
    # help).
    with patch("app.services.dashboard.nav._fetch_nav_history", new=AsyncMock(side_effect=AssertionError("should not fetch"))):
        result = asyncio.run(get_nav_on_or_before(db, scheme, date(2024, 1, 8)))

    assert result == (Decimal("40.0000"), date(2024, 1, 5))


def test_degrades_gracefully_on_mfapi_outage_with_no_cache():
    import asyncio
    db = _session()
    scheme = _scheme(db)

    with patch("app.services.dashboard.nav._fetch_nav_history", new=AsyncMock(side_effect=httpx.ConnectError("boom"))):
        result = asyncio.run(get_nav_on_or_before(db, scheme, date(2024, 1, 15)))

    assert result is None


def test_degrades_to_stale_cache_on_mfapi_outage_when_something_is_cached():
    import asyncio
    db = _session()
    scheme = _scheme(db)

    from app.models.reference import NavHistory
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 1, 1), nav=Decimal("30.0000")))
    db.commit()

    # Requesting "today" with only an old cached row forces a fetch attempt
    # (today's row might exist now); on outage, fall back to what's cached.
    with patch("app.services.dashboard.nav._fetch_nav_history", new=AsyncMock(side_effect=httpx.ConnectError("boom"))):
        result = asyncio.run(get_nav_on_or_before(db, scheme, date.today()))

    assert result == (Decimal("30.0000"), date(2024, 1, 1))


def test_get_previous_nav_from_cache_reads_strictly_before():
    db = _session()
    scheme = _scheme(db)

    from app.models.reference import NavHistory
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 1, 10), nav=Decimal("50.0000")))
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 1, 15), nav=Decimal("55.0000")))
    db.commit()

    result = get_previous_nav_from_cache(db, scheme.id, date(2024, 1, 15))
    assert result == (Decimal("50.0000"), date(2024, 1, 10))


def test_get_previous_nav_from_cache_returns_none_when_nothing_earlier():
    db = _session()
    scheme = _scheme(db)
    assert get_previous_nav_from_cache(db, scheme.id, date(2024, 1, 1)) is None


def test_get_navs_fetches_network_legs_concurrently_then_caches_sequentially():
    import asyncio

    db = _session()
    scheme_a = _scheme(db, "111111")
    scheme_b = _scheme(db, "222222")
    both_fetches_started = asyncio.Event()
    started: set[str] = set()

    async def fetch(amfi_code: str):
        started.add(amfi_code)
        if len(started) == 2:
            both_fetches_started.set()
        await asyncio.wait_for(both_fetches_started.wait(), timeout=1)
        nav = Decimal("51.0000") if amfi_code == "111111" else Decimal("62.0000")
        return [(date.today(), nav)]

    with patch("app.services.dashboard.nav._fetch_nav_history", side_effect=fetch):
        results = asyncio.run(
            get_navs_on_or_before(db, [(scheme_a, date.today()), (scheme_b, date.today())])
        )

    assert results == {
        scheme_a.id: (Decimal("51.0000"), date.today()),
        scheme_b.id: (Decimal("62.0000"), date.today()),
    }

    from app.models.reference import NavHistory

    assert db.query(NavHistory).count() == 2


def test_warm_nav_history_skips_scheme_refetched_within_ttl():
    import asyncio
    db = _session()
    scheme = _scheme(db)

    fetch = AsyncMock(return_value=[(date.today(), Decimal("50.0000"))])
    now = [1000.0]

    with (
        patch("app.services.dashboard.nav._fetch_nav_history", new=fetch),
        patch.object(nav_module, "_nav_warm_clock", side_effect=lambda: now[0]),
    ):
        asyncio.run(warm_nav_history(db, [scheme]))
        asyncio.run(warm_nav_history(db, [scheme]))

    fetch.assert_awaited_once()


def test_warm_nav_history_refetches_scheme_once_ttl_has_expired():
    import asyncio
    db = _session()
    scheme = _scheme(db)

    fetch = AsyncMock(return_value=[(date.today(), Decimal("50.0000"))])
    now = [1000.0]

    with (
        patch("app.services.dashboard.nav._fetch_nav_history", new=fetch),
        patch.object(nav_module, "_nav_warm_clock", side_effect=lambda: now[0]),
    ):
        asyncio.run(warm_nav_history(db, [scheme]))
        now[0] += nav_module._NAV_WARM_TTL_SECONDS + 1
        asyncio.run(warm_nav_history(db, [scheme]))

    assert fetch.await_count == 2


def test_warm_nav_history_commits_once_for_the_whole_batch_not_once_per_scheme():
    """A per-scheme commit means N fsync-bound round trips for an N-scheme
    category (live-measured 2026-08-19: ~57x slower per commit on a WSL
    DrvFs-mounted dev DB than a native filesystem, and a reproduced real
    `disk I/O error` running this exact path against a 1,150+-scheme AMFI
    category) — one commit for the whole batch removes that multiplier
    regardless of filesystem."""
    import asyncio

    db = _session()
    schemes = [_scheme(db, amfi_code=str(code)) for code in range(3)]

    async def fetch(amfi_code: str):
        return [(date.today(), Decimal("50.0000"))]

    commit_spy = MagicMock(wraps=db.commit)

    with (
        patch("app.services.dashboard.nav._fetch_nav_history", side_effect=fetch),
        patch.object(db, "commit", commit_spy),
    ):
        asyncio.run(warm_nav_history(db, schemes))

    assert commit_spy.call_count == 1

    from app.models.reference import NavHistory

    assert db.query(NavHistory).count() == 3


def test_upsert_nav_history_is_conflict_safe_across_sessions(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'nav-race.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(autoflush=False, bind=engine)
    setup_db = sessions()
    scheme = _scheme(setup_db)
    row = [(date(2024, 1, 15), Decimal("50.1234"))]

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(_upsert_nav_history, sessions(), scheme.id, row) for _ in range(2)]
        for future in futures:
            future.result()

    verify_db = sessions()
    from app.models.reference import NavHistory
    assert verify_db.query(NavHistory).filter_by(scheme_id=scheme.id).count() == 1
