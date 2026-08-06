import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import Scheme
from app.services.dashboard.nav import get_nav_on_or_before, get_previous_nav_from_cache


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
