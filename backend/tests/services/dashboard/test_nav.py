import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import Scheme
from app.services.dashboard.nav import _upsert_nav_history, get_nav_on_or_before, get_navs_on_or_before, get_previous_nav_from_cache


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
