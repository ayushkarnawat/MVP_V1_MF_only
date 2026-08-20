import asyncio
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import PlanNameVariant
from app.models.reference import Scheme, SchemeTer
from app.services.analytics.amfi_ter_client import (
    _current_financial_year,
    _fetch_ter_rows,
    _normalize_scheme_name,
    _parse_amfi_date,
    refresh_ter_data,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _scheme(db, name, plan_name_variant):
    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code=uuid.uuid4().hex[:6],
        isin="INF123",
        name=name,
        amc_name="HDFC AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
        plan_name_variant=plan_name_variant,
    )
    db.add(scheme)
    db.commit()
    return scheme


def test_current_financial_year_before_april_is_prior_calendar_year_start():
    assert _current_financial_year(date(2026, 2, 1)) == "2025-2026"


def test_current_financial_year_on_or_after_april_is_same_calendar_year_start():
    assert _current_financial_year(date(2026, 8, 11)) == "2026-2027"


def test_normalize_scheme_name_strips_parens_and_punctuation():
    assert _normalize_scheme_name("HDFC Flexi Cap Fund - Direct (IDCW)") == "HDFC FLEXI CAP FUND DIRECT"


def test_parse_amfi_date_accepts_iso_datetime_with_milliseconds_and_z():
    # Live-verified 2026-08-14: AMFI's populate-te-rdata-revised endpoint
    # emits TER_Date as an ISO-8601 datetime, not the "DD-Mon-YYYY" this
    # parser originally targeted.
    assert _parse_amfi_date("2026-08-01T00:00:00.000Z") == date(2026, 8, 1)


def test_fetch_ter_rows_unwraps_data_meta_envelope_and_paginates():
    # Live-verified 2026-08-14: this endpoint wraps each page's rows in
    # {"data": [...], "meta": {"page", "pageSize", "total", "pageCount"}}
    # rather than returning a bare list — treating the envelope itself as
    # the row list silently iterated over its two string keys ("data",
    # "meta") instead of any real row, which is the true root cause behind
    # the earlier "stray non-dict row" symptom.
    pages = {
        1: {
            "data": [{"Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "2026-08-01T00:00:00.000Z"}],
            "meta": {"page": 1, "pageSize": 1, "total": 2, "pageCount": 2},
        },
        2: {
            "data": [{"Scheme_Name": "ICICI Prudential Bluechip Fund", "TER_Date": "2026-08-01T00:00:00.000Z"}],
            "meta": {"page": 2, "pageSize": 1, "total": 2, "pageCount": 2},
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["page"])
        return httpx.Response(200, json=pages[page])

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    async def _run():
        with patch(
            "app.services.analytics.amfi_ter_client.httpx.AsyncClient",
            lambda *a, **k: real_async_client(*a, transport=transport, **k),
        ):
            return await _fetch_ter_rows("08-2026")

    rows = asyncio.run(_run())
    assert [r["Scheme_Name"] for r in rows] == ["HDFC Flexi Cap Fund", "ICICI Prudential Bluechip Fund"]


def test_fetch_ter_rows_fetches_pages_beyond_the_first_concurrently():
    """Page count is known from page 1's `meta` envelope upfront -- pages
    2..N must all be fetched (not just page 2), and in page order, even
    though they're gathered concurrently rather than one at a time (the
    ~4-minute sequential-fetch regression this replaces)."""
    page_count = 5
    pages = {
        p: {
            "data": [{"Scheme_Name": f"Fund {p}", "TER_Date": "2026-08-01T00:00:00.000Z"}],
            "meta": {"page": p, "pageSize": 1, "total": page_count, "pageCount": page_count},
        }
        for p in range(1, page_count + 1)
    }

    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["page"])
        return httpx.Response(200, json=pages[page])

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    async def _run():
        with patch(
            "app.services.analytics.amfi_ter_client.httpx.AsyncClient",
            lambda *a, **k: real_async_client(*a, transport=transport, **k),
        ):
            return await _fetch_ter_rows("08-2026")

    rows = asyncio.run(_run())
    assert [r["Scheme_Name"] for r in rows] == [f"Fund {p}" for p in range(1, page_count + 1)]


def test_refresh_ter_data_upserts_regular_and_direct_variants_from_shared_row():
    db = _session()
    direct = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT)
    regular = _scheme(db, "HDFC Flexi Cap Fund - Regular Plan - Growth", PlanNameVariant.REGULAR)

    rows = [
        {
            "Scheme_Name": "HDFC Flexi Cap Fund",
            "SchemeCat_Desc": "Equity Scheme - Flexi Cap Fund",
            "TER_Date": "10-Aug-2026",
            "R_TER": "1.85",
            "D_TER": "0.75",
        }
    ]
    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        result = asyncio.run(refresh_ter_data(db))

    assert result is True
    direct_ter = db.get(SchemeTer, (direct.id, date(2026, 8, 1)))
    regular_ter = db.get(SchemeTer, (regular.id, date(2026, 8, 1)))
    assert direct_ter.ter_value == Decimal("0.75")
    assert regular_ter.ter_value == Decimal("1.85")


def test_refresh_ter_data_treats_zero_ter_as_no_data_not_a_real_value():
    """DATA-001: AMFI's feed uses a literal 0 in R_TER/D_TER for a scheme
    that has no plan of that type (e.g. a scheme with no Regular plan
    reports R_TER=0), not a genuine zero-expense-ratio fund -- mutual fund
    TERs are never actually 0.00% in practice (regulatory minimum
    operating costs). Storing it as a real TER made a failed/inapplicable
    match indistinguishable downstream from real coverage. It's persisted
    as a NULL "checked, no match" marker row (not simply absent) so this
    scheme/period doesn't keep looking like missing coverage forever --
    see `_mark_checked_no_match`."""
    db = _session()
    direct = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT)
    regular = _scheme(db, "HDFC Flexi Cap Fund - Regular Plan - Growth", PlanNameVariant.REGULAR)

    rows = [
        {
            "Scheme_Name": "HDFC Flexi Cap Fund",
            "TER_Date": "10-Aug-2026",
            "R_TER": "0",
            "D_TER": "0.75",
        }
    ]
    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        asyncio.run(refresh_ter_data(db))

    direct_ter = db.get(SchemeTer, (direct.id, date(2026, 8, 1)))
    assert direct_ter.ter_value == Decimal("0.75")
    regular_ter = db.get(SchemeTer, (regular.id, date(2026, 8, 1)))
    assert regular_ter is not None
    assert regular_ter.ter_value is None


def test_refresh_ter_data_converts_a_stale_zero_row_from_a_pre_fix_refresh_into_a_marker():
    """Reviewer-flagged gap in the zero-skip fix above: skipping a NEW zero
    value only stops writing fresh fake-coverage rows -- it does nothing
    about a zero-value `SchemeTer` row a PRIOR (pre-fix) refresh already
    persisted for this exact scheme/period. That stale row would keep
    satisfying `_missing_current_month_ter`'s coverage check forever, since
    this scheme/period combination would never again reach `_upsert_scheme_ter`
    to get corrected -- the scheme silently never gets a real TER."""
    db = _session()
    regular = _scheme(db, "HDFC Flexi Cap Fund - Regular Plan - Growth", PlanNameVariant.REGULAR)
    db.add(SchemeTer(scheme_id=regular.id, reference_period=date(2026, 8, 1), ter_value=Decimal("0")))
    db.commit()

    rows = [
        {
            "Scheme_Name": "HDFC Flexi Cap Fund",
            "TER_Date": "10-Aug-2026",
            "R_TER": "0",
            "D_TER": "0.75",
        }
    ]
    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        asyncio.run(refresh_ter_data(db))

    regular_ter = db.get(SchemeTer, (regular.id, date(2026, 8, 1)))
    assert regular_ter is not None
    assert regular_ter.ter_value is None


def test_refresh_ter_data_skips_schemes_with_unresolved_plan_variant():
    db = _session()
    unresolved = _scheme(db, "HDFC Flexi Cap Fund", PlanNameVariant.UNRESOLVED)
    rows = [{"Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "10-Aug-2026", "R_TER": "1.85", "D_TER": "0.75"}]

    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        asyncio.run(refresh_ter_data(db))

    assert db.query(SchemeTer).filter_by(scheme_id=unresolved.id).first() is None


def test_refresh_ter_data_keeps_only_latest_ter_date_per_scheme_name():
    db = _session()
    direct = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT)
    rows = [
        {"Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "05-Aug-2026", "R_TER": "1.90", "D_TER": "0.80"},
        {"Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "10-Aug-2026", "R_TER": "1.85", "D_TER": "0.75"},
    ]

    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        asyncio.run(refresh_ter_data(db))

    direct_ter = db.get(SchemeTer, (direct.id, date(2026, 8, 1)))
    assert direct_ter.ter_value == Decimal("0.75")


def test_refresh_ter_data_skips_low_confidence_matches():
    """A low-confidence non-match still gets a NULL "checked, no match"
    marker (not simply left with no row at all) -- otherwise a scheme
    that's genuinely absent from AMFI's feed (e.g. a matured FMP) would
    keep looking like missing coverage forever and re-trigger a full
    national rescan every backoff window -- see `_mark_checked_no_match`."""
    db = _session()
    scheme = _scheme(db, "Totally Unrelated Fund Name", PlanNameVariant.DIRECT)
    rows = [{"Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "10-Aug-2026", "R_TER": "1.85", "D_TER": "0.75"}]

    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        asyncio.run(refresh_ter_data(db))

    marker = db.query(SchemeTer).filter_by(scheme_id=scheme.id).first()
    assert marker is not None
    assert marker.ter_value is None


def test_refresh_ter_data_returns_false_and_writes_nothing_on_fetch_failure():
    db = _session()
    scheme = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT)

    with patch(
        "app.services.analytics.amfi_ter_client._fetch_latest_ter_month",
        new=AsyncMock(side_effect=httpx.ConnectError("boom")),
    ):
        result = asyncio.run(refresh_ter_data(db))

    assert result is False
    assert db.query(SchemeTer).filter_by(scheme_id=scheme.id).first() is None


def test_refresh_ter_data_skips_stray_non_dict_rows_without_crashing():
    db = _session()
    direct = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT)
    rows = [
        "No Records Found",
        {"Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "10-Aug-2026", "R_TER": "1.85", "D_TER": "0.75"},
    ]

    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        result = asyncio.run(refresh_ter_data(db))

    assert result is True
    direct_ter = db.get(SchemeTer, (direct.id, date(2026, 8, 1)))
    assert direct_ter.ter_value == Decimal("0.75")


def test_refresh_ter_data_returns_false_when_no_month_data_available():
    db = _session()
    with patch(
        "app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value=None)
    ):
        result = asyncio.run(refresh_ter_data(db))
    assert result is False
