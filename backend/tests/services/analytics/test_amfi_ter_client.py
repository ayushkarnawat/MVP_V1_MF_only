import asyncio
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _scheme(db, name, plan_name_variant, base_name=None):
    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code=uuid.uuid4().hex[:6],
        isin="INF123",
        name=name,
        base_name=base_name,
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
            "data": [{"NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "2026-08-01T00:00:00.000Z"}],
            "meta": {"page": 1, "pageSize": 1, "total": 2, "pageCount": 2},
        },
        2: {
            "data": [{"NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "ICICI Prudential Bluechip Fund", "TER_Date": "2026-08-01T00:00:00.000Z"}],
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
            "data": [{"NSDLSchemeCode": "TEST/CODE", "Scheme_Name": f"Fund {p}", "TER_Date": "2026-08-01T00:00:00.000Z"}],
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
    direct = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT, base_name='HDFC Flexi Cap Fund')
    regular = _scheme(db, "HDFC Flexi Cap Fund - Regular Plan - Growth", PlanNameVariant.REGULAR, base_name='HDFC Flexi Cap Fund')

    rows = [
        {
            "NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund",
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
    direct = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT, base_name='HDFC Flexi Cap Fund')
    regular = _scheme(db, "HDFC Flexi Cap Fund - Regular Plan - Growth", PlanNameVariant.REGULAR, base_name='HDFC Flexi Cap Fund')

    rows = [
        {
            "NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund",
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
    regular = _scheme(db, "HDFC Flexi Cap Fund - Regular Plan - Growth", PlanNameVariant.REGULAR, base_name='HDFC Flexi Cap Fund')
    db.add(SchemeTer(scheme_id=regular.id, reference_period=date(2026, 8, 1), ter_value=Decimal("0")))
    db.commit()

    rows = [
        {
            "NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund",
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
    unresolved = _scheme(db, "HDFC Flexi Cap Fund", PlanNameVariant.UNRESOLVED, base_name='HDFC Flexi Cap Fund')
    rows = [{"NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "10-Aug-2026", "R_TER": "1.85", "D_TER": "0.75"}]

    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        asyncio.run(refresh_ter_data(db))

    assert db.query(SchemeTer).filter_by(scheme_id=unresolved.id).first() is None


def test_refresh_ter_data_keeps_only_latest_ter_date_per_scheme_name():
    db = _session()
    direct = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT, base_name='HDFC Flexi Cap Fund')
    rows = [
        {"NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "05-Aug-2026", "R_TER": "1.90", "D_TER": "0.80"},
        {"NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "10-Aug-2026", "R_TER": "1.85", "D_TER": "0.75"},
    ]

    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        asyncio.run(refresh_ter_data(db))

    direct_ter = db.get(SchemeTer, (direct.id, date(2026, 8, 1)))
    assert direct_ter.ter_value == Decimal("0.75")


def test_refresh_ter_data_returns_false_and_writes_nothing_on_fetch_failure():
    db = _session()
    scheme = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT, base_name='HDFC Flexi Cap Fund')

    with patch(
        "app.services.analytics.amfi_ter_client._fetch_latest_ter_month",
        new=AsyncMock(side_effect=httpx.ConnectError("boom")),
    ):
        result = asyncio.run(refresh_ter_data(db))

    assert result is False
    assert db.query(SchemeTer).filter_by(scheme_id=scheme.id).first() is None


def test_refresh_ter_data_skips_stray_non_dict_rows_without_crashing():
    db = _session()
    direct = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT, base_name='HDFC Flexi Cap Fund')
    rows = [
        "No Records Found",
        {"NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "10-Aug-2026", "R_TER": "1.85", "D_TER": "0.75"},
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


from app.models.enums import SchemePlanType, SchemeSource


from app.services.analytics.amfi_ter_client import (
    TerRefreshResult, refresh_ter,
)


def test_refresh_ter_returns_counts_and_keeps_bool_wrapper():
    db = _session()
    _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT, base_name='HDFC Flexi Cap Fund')
    _scheme(db, "Totally Unrelated Fund Name", PlanNameVariant.DIRECT, base_name='Totally Unrelated Fund Name')
    rows = [{"NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "10-Aug-2026", "R_TER": "1.85", "D_TER": "0.75"}]
    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        result = asyncio.run(refresh_ter(db))
    assert isinstance(result, TerRefreshResult)
    assert (result.success, result.month, result.schemes, result.matched, result.no_match) == (True, "08-2026", 2, 1, 1)
    assert result.seconds >= 0


def test_refresh_updates_existing_month_row_in_place():
    db = _session()
    scheme = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT, base_name='HDFC Flexi Cap Fund')
    db.add(SchemeTer(scheme_id=scheme.id, reference_period=date(2026, 8, 1), ter_value=None))
    db.commit()
    rows = [{"NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "10-Aug-2026", "R_TER": "1.85", "D_TER": "0.75"}]
    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        asyncio.run(refresh_ter(db))
    saved = db.query(SchemeTer).filter_by(scheme_id=scheme.id).all()
    assert len(saved) == 1 and saved[0].ter_value == Decimal("0.75")


def _feed_row(name, code, d_ter="0.75", r_ter="1.85", on="2026-10-01T00:00:00.000Z"):
    return {"Scheme_Name": name, "NSDLSchemeCode": code, "TER_Date": on, "D_TER": d_ter, "R_TER": r_ter}


def _master(db, name, base_name, plan, code=None, source=None):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name=name, base_name=base_name,
                    amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund", plan_type=plan,
                    source=SchemeSource.AMFI, ter_scheme_code=code, ter_link_source=source)
    db.add(scheme)
    db.commit()
    return scheme


def _refresh(db, rows, month="10-2026"):
    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value=month)),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        return asyncio.run(refresh_ter(db))


def test_exact_name_links_direct_and_regular_to_one_code():
    db = _session()
    direct = _master(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", "HDFC Flexi Cap Fund", SchemePlanType.DIRECT)
    regular = _master(db, "HDFC Flexi Cap Fund - Regular Plan - Growth", "HDFC Flexi Cap Fund", SchemePlanType.REGULAR)
    result = _refresh(db, [_feed_row("HDFC Flexi Cap Fund", "HDFC/O/E/FCF/95/01/0001")])
    assert (result.matched, result.no_match, result.new_links) == (2, 0, 2)
    assert {direct.ter_scheme_code, regular.ter_scheme_code} == {"HDFC/O/E/FCF/95/01/0001"}
    assert direct.ter_link_source == "exact_name" and direct.ter_linked_at is not None
    assert db.get(SchemeTer, (direct.id, date(2026, 10, 1))).ter_value == Decimal("0.75")
    assert db.get(SchemeTer, (regular.id, date(2026, 10, 1))).ter_value == Decimal("1.85")


def test_spacing_and_punctuation_differences_still_link():
    db = _session()
    navi = _master(db, "Navi NiftyIT Index Fund - Direct Plan - Growth", "Navi NiftyIT Index Fund", SchemePlanType.DIRECT)
    assert _refresh(db, [_feed_row("Navi Nifty IT Index Fund", "NAVI/O/O/IIT/22/01/0009")]).matched == 1
    assert navi.ter_scheme_code == "NAVI/O/O/IIT/22/01/0009"


def test_fund_house_that_has_not_filed_gets_no_ter_not_a_competitors():
    """8 Oct: with no Kotak rows in the month, fuzzy matching gave Kotak
    Business Cycle Fund the TER of Tata Business Cycle Fund."""
    db = _session()
    kotak = _master(db, "Kotak Business Cycle Fund - Regular Plan - Growth", "Kotak Business Cycle Fund", SchemePlanType.REGULAR)
    result = _refresh(db, [_feed_row("TATA BUSINESS CYCLE FUND", "TATA/O/E/THE/21/06/0099")])
    assert (result.matched, result.no_match, result.new_links) == (0, 1, 0)
    assert kotak.ter_scheme_code is None
    assert db.get(SchemeTer, (kotak.id, date(2026, 10, 1))).ter_value is None


def test_same_house_fund_with_a_different_year_is_not_matched():
    db = _session()
    gilt_2026 = _master(db, "BANDHAN CRISIL IBX GILT APRIL 2026 INDEX FUND - Direct Plan - Growth",
                        "BANDHAN CRISIL IBX GILT APRIL 2026 INDEX FUND", SchemePlanType.DIRECT)
    _refresh(db, [_feed_row("Bandhan CRISIL IBX Gilt April 2028 Index Fund", "BAND/O/O/GIL/23/02/0100")])
    assert gilt_2026.ter_scheme_code is None


def test_linked_code_survives_a_rename_in_the_feed():
    db = _session()
    fund = _master(db, "X Flexi Cap Fund - Direct Plan", "X Flexi Cap Fund", SchemePlanType.DIRECT,
                   code="X/O/E/FCF/20/01/0001", source="exact_name")
    _refresh(db, [_feed_row("X Flexicap Opportunities Fund", "X/O/E/FCF/20/01/0001", d_ter="0.66")])
    assert db.get(SchemeTer, (fund.id, date(2026, 10, 1))).ter_value == Decimal("0.66")
    assert fund.ter_scheme_code == "X/O/E/FCF/20/01/0001"


def test_manual_link_is_never_replaced_by_an_exact_name_match():
    db = _session()
    fund = _master(db, "Y Fund - Direct Plan", "Y Fund", SchemePlanType.DIRECT, code="MANUAL/CODE", source="manual")
    _refresh(db, [_feed_row("Y Fund", "OTHER/CODE"), _feed_row("Y Fund Renamed", "MANUAL/CODE", d_ter="0.40")])
    assert (fund.ter_scheme_code, fund.ter_link_source) == ("MANUAL/CODE", "manual")
    assert db.get(SchemeTer, (fund.id, date(2026, 10, 1))).ter_value == Decimal("0.40")


def test_two_feed_rows_with_the_same_cleaned_name_link_nothing():
    db = _session()
    fund = _master(db, "Z Fund - Direct Plan", "Z Fund", SchemePlanType.DIRECT)
    _refresh(db, [_feed_row("Z Fund", "Z/1"), _feed_row("Z-Fund", "Z/2")])
    assert fund.ter_scheme_code is None


def test_a_wrong_ter_saved_earlier_this_month_is_cleared():
    """The 7 Oct staging run saved ~1,040 fuzzy (wrong) October TERs. A scheme
    the new job can't link must not keep one."""
    db = _session()
    kotak = _master(db, "Kotak Business Cycle Fund - Regular Plan - Growth", "Kotak Business Cycle Fund", SchemePlanType.REGULAR)
    db.add(SchemeTer(scheme_id=kotak.id, reference_period=date(2026, 10, 1), ter_value=Decimal("1.99")))
    db.commit()
    _refresh(db, [_feed_row("TATA BUSINESS CYCLE FUND", "TATA/O/E/THE/21/06/0099")])
    assert db.get(SchemeTer, (kotak.id, date(2026, 10, 1))).ter_value is None


def test_linked_code_absent_this_month_gives_no_ter_and_keeps_the_link():
    db = _session()
    fund = _master(db, "W Fund - Direct Plan", "W Fund", SchemePlanType.DIRECT, code="W/1", source="exact_name")
    result = _refresh(db, [_feed_row("Other Fund", "O/1")])
    assert result.no_match == 1 and fund.ter_scheme_code == "W/1"


# ---- Run 1 review fixes (8 Oct) ----


def test_segregated_portfolio_does_not_link_to_the_main_fund():
    """Parentheses are part of the link key: "(Segregated - 06032020)" is a
    different fund from the main one (review finding 1)."""
    db = _session()
    seg = _master(db, "UTI - Credit Risk Fund (Segregated - 06032020) - Regular Plan",
                  "UTI - Credit Risk Fund (Segregated - 06032020)", SchemePlanType.REGULAR)
    _refresh(db, [_feed_row("UTI - Credit Risk Fund", "UTI/O/D/CRF/12/01/0001")])
    assert seg.ter_scheme_code is None


def test_row_without_a_code_is_never_linked_or_joined():
    db = _session()
    fund = _master(db, "V Fund - Direct Plan", "V Fund", SchemePlanType.DIRECT)
    # One coded row alongside: a feed with no codes at all is rejected outright (final review, 8 Oct).
    _refresh(db, [{"Scheme_Name": "V Fund", "TER_Date": "2026-10-01T00:00:00.000Z", "D_TER": "0.5", "R_TER": "1.5"},
                  _feed_row("Other Fund", "O/1", on="2026-10-01T00:00:00.000Z")])
    assert fund.ter_scheme_code is None
    assert db.get(SchemeTer, (fund.id, date(2026, 10, 1))).ter_value is None


def test_two_names_sharing_a_code_use_the_latest_dated_row():
    db = _session()
    fund = _master(db, "R Fund - Direct Plan", "R Fund", SchemePlanType.DIRECT, code="R/1", source="exact_name")
    _refresh(db, [_feed_row("R Fund Renamed", "R/1", d_ter="0.66", on="2026-10-05T00:00:00.000Z"),
                  _feed_row("R Fund", "R/1", d_ter="0.99", on="2026-10-01T00:00:00.000Z")])
    assert db.get(SchemeTer, (fund.id, date(2026, 10, 1))).ter_value == Decimal("0.66")


def test_manual_entry_without_a_code_is_not_relinked():
    db = _session()
    fund = _master(db, "M Fund - Direct Plan", "M Fund", SchemePlanType.DIRECT, code=None, source="manual")
    _refresh(db, [_feed_row("M Fund", "M/1")])
    assert (fund.ter_scheme_code, fund.ter_link_source) == (None, "manual")


def test_a_name_that_cleans_to_nothing_never_links():
    db = _session()
    fund = _master(db, "- - Direct Plan", "- -", SchemePlanType.DIRECT)
    _refresh(db, [_feed_row("--", "E/1")])
    assert fund.ter_scheme_code is None


def test_refresh_for_a_given_month_skips_the_latest_month_lookup():
    """The deploy rebuilds last month first (its feed is complete), then the
    current month (review finding 2)."""
    db = _session()
    fund = _master(db, "S Fund - Direct Plan", "S Fund", SchemePlanType.DIRECT)
    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month",
              new=AsyncMock(side_effect=AssertionError("must not look up the latest month"))),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows",
              new=AsyncMock(return_value=[_feed_row("S Fund", "S/1", on="2026-09-01T00:00:00.000Z")])) as rows,
    ):
        result = asyncio.run(refresh_ter(db, month="09-2026"))
    rows.assert_awaited_once_with("09-2026")
    assert result.month == "09-2026" and fund.ter_scheme_code == "S/1"
    assert db.get(SchemeTer, (fund.id, date(2026, 9, 1))).ter_value == Decimal("0.75")


def test_a_malformed_feed_row_is_skipped_not_fatal():
    db = _session()
    fund = _master(db, "Q Fund - Direct Plan", "Q Fund", SchemePlanType.DIRECT)
    rows = [{"Scheme_Name": "Broken", "NSDLSchemeCode": "B/1", "TER_Date": "not a date", "D_TER": "1", "R_TER": "1"},
            {"Scheme_Name": "No Date", "NSDLSchemeCode": "B/2", "D_TER": "1", "R_TER": "1"},
            _feed_row("Q Fund", "Q/1")]
    assert _refresh(db, rows).success is True
    assert fund.ter_scheme_code == "Q/1"


def test_refresh_ter_fails_without_clearing_when_the_feed_has_no_sebi_codes():
    """A feed whose rows carry no NSDLSchemeCode must not wipe the month's
    TERs and report success (final review L5, 8 Oct)."""
    db = _session()
    scheme = _scheme(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", PlanNameVariant.DIRECT, base_name='HDFC Flexi Cap Fund')
    row = {"NSDLSchemeCode": "TEST/CODE", "Scheme_Name": "HDFC Flexi Cap Fund", "TER_Date": "10-Aug-2026",
           "R_TER": "1.85", "D_TER": "0.75"}
    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=[row])),
    ):
        assert asyncio.run(refresh_ter_data(db)) is True
    codeless = {k: v for k, v in row.items() if k != "NSDLSchemeCode"}
    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value="08-2026")),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=[codeless])),
    ):
        assert asyncio.run(refresh_ter_data(db)) is False
    assert db.get(SchemeTer, (scheme.id, date(2026, 8, 1))).ter_value == Decimal("0.75")
