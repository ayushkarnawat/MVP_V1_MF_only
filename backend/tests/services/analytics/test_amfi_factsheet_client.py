# backend/tests/services/analytics/test_amfi_factsheet_client.py
import uuid
import json
import asyncio
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest
from decimal import Decimal

from app.models.reference import Scheme
from app.services.analytics.amfi_factsheet_client import (
    MATCH_METHOD_EXACT,
    MATCH_METHOD_FUZZY,
    MATCH_METHOD_ISIN,
    build_families,
    match_scheme_page,
)
from app.services.analytics.fund_manager_layouts import SchemePage


@pytest.mark.parametrize("heading,nav_name", [
    ("Sundaram Aggressive Hybrid Fund", "Sundaram Aggressive Hybrid Fund (Formerly Known as Principal Hybrid Equity Fund)"),
    ("Sundaram Arbitrage Fund", "Sundaram Arbitrage Fund(Formerly Known as Prinicpal Arbitrage Fund)"),
    ("Sundaram Banking and PSU Debt Fund", "Sundaram Banking and PSU Debt Fund (Formerly Known as Sundaram Banking and PSU Fund)"),
    ("Sundaram Conservative Hybrid Fund", "Sundaram Conservative Hybrid Fund (Formerly Known as Sundaram Debt Oriented Hybrid Fund)"),
    ("Sundaram Consumption Fund", "Sundaram Consumption Fund (Formerly Known as Sundaram Rural and Consumption Fund)"),
    ("Sundaram Dividend Yield Fund", "Sundaram Dividend Yield Fund (Formerly Known as Principal Dividend Yield Fund)"),
    ("Sundaram Dynamic Asset Allocation Fund", "Sundaram Dynamic Asset Allocation Fund (Formerly Known as Sundaram Balanced Advantage Fund)"),
    ("Sundaram Equity Savings Fund", "Sundaram Equity Savings Fund (Formerly Known as Principal Equity Savings Fund)"),
    ("Sundaram Focused Fund", "Sundaram Focused Fund (Formerly Known as Principal Focused Multicap Fund)"),
    ("Sundaram Large Cap Fund", "Sundaram Large Cap Fund ( Formerly Know as Sundaram Blue Chip Fund)"),
    ("Sundaram Liquid Fund", "Sundaram Liquid Fund (Formerly Known as Principal Cash Management Fund)"),
    ("Sundaram Medium Term Fund", "Sundaram Medium Term Fund (Formerly Known as Sundaram Medium Duration Fund)"),
    ("Sundaram Multi Cap Fund", "Sundaram Multi Cap Fund (Formerly Known as Principal Multi Cap Growth Fund)"),
    ("Sundaram Nifty 100 Equal Weight Fund", "Sundaram Nifty 100 Equal Weight Fund (Formerly Known as Principal Nifty 100 Equal Weight Fund)"),
    ("Sundaram Short Term Fund", "Sundaram Short Term Fund (Formerly Known as Sundaram Short Duration Fund)"),
    ("Sundaram Ultra Short Term Fund", "Sundaram Ultra Short Term Fund (Formerly Known as Sundaram Ultra Short Duration Fund)"),
    ("Sundaram Ultra Short to Short Term Fund", "Sundaram Ultra Short to Short Term Fund (Formerly Known as Sundaram Low Duration Fund)"),
])
def test_sundaram_printed_headings_match_verified_navall_legacy_names(heading, nav_name):
    family = build_families([_scheme(nav_name, amc="Sundaram Mutual Fund")])
    match = match_scheme_page(_page(heading), family)
    assert match is not None
    assert match[0].base_name == nav_name
    assert match[1] == MATCH_METHOD_EXACT
    # Identical strings in another AMC cannot inherit Sundaram's alias.
    other = match_scheme_page(_page(heading), build_families([_scheme(nav_name, amc="Other AMC")]))
    assert other is None or other[1] != MATCH_METHOD_EXACT


@pytest.mark.parametrize("today,month", [(date(2026, 10, 10), "09/2026"), (date(2027, 1, 10), "12/2026")])
def test_sundaram_archive_uses_literal_month_and_verified_response(monkeypatch, today, month):
    from app.services.analytics import amfi_factsheet_client as fc
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    class Today(date):
        @classmethod
        def today(cls): return today
    monkeypatch.setattr(fc, "date", Today)
    entry = ResolverEntry(ResolverKind.JSON_API, "Sundaram Asset Management Company Ltd", endpoint_url="https://www.sundarammutual.com/ajax/verified.ashx?_method=DownloadArchive&_session=no")
    def handle(request):
        assert request.method == "POST"
        assert request.content == f"cat=1\r\nmnth={month}".encode()
        return httpx.Response(200, text="'https://www.sundarammutual.com/uploaddir/consolidated_factsheet/Consolidated_Factsheet_9_2026_280926_125349.pdf'")
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            return await fc._json_api_candidates(client, entry)
    assert asyncio.run(run()) == ["https://www.sundarammutual.com/uploaddir/consolidated_factsheet/Consolidated_Factsheet_9_2026_280926_125349.pdf"]


def test_zerodha_two_digit_filename_years_sort_current_before_old_december():
    from app.services.analytics.amfi_factsheet_client import _static_link_candidates
    def handle(request):
        return httpx.Response(200, text='<a href="https://assets.zerodhafundhouse.com/offer-documents/factsheet/Factsheet - Dec 25.pdf">Download</a><a href="https://assets.zerodhafundhouse.com/offer-documents/factsheet/Factsheet - Aug 26.pdf">Download</a>')
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            return await _static_link_candidates(client, "https://www.zerodhafundhouse.com/resources/fund-documents", None)
    assert asyncio.run(run())[0].endswith("Aug 26.pdf")


def test_box_reader_receives_real_lic_boxes_during_check_and_import(db_session):
    from app.services.analytics.amfi_factsheet_client import FactsheetPages, import_pages, looks_like_current_factsheet
    root = Path(__file__).parents[2] / "fixtures/factsheets"
    words = json.loads((root / "lic_words.json").read_text(encoding="utf-8"))
    texts = (root / "lic.txt").read_text(encoding="utf-8").split("\f")
    pages = FactsheetPages(texts, words)
    seen = []
    def reader(text, boxes):
        seen.append(boxes)
        return [_page("LIC MF Large Cap Fund"), _page("LIC MF Liquid Fund"), _page("LIC MF Flexi Cap Fund")] if boxes == words[0] else []
    for name in ("LIC MF Large Cap Fund", "LIC MF Liquid Fund", "LIC MF Flexi Cap Fund"):
        db_session.add(_scheme(name))
    db_session.flush()
    assert looks_like_current_factsheet(pages, reader, date(2026, 10, 10)) == (True, "ok")
    assert import_pages(db_session, "Test AMC", pages, reader, date(2026, 10, 1)) == (3, 0)
    assert seen == words + words


def test_real_lic_summary_imports_all_families_all_plans_and_is_idempotent(db_session):
    from app.models.reference import SchemeFundManager
    from app.services.analytics import amfi_factsheet_client as fc
    from app.services.analytics.fund_manager_layouts import LAYOUTS
    root = Path(__file__).parents[2] / "fixtures/factsheets"
    pages = fc.FactsheetPages((root / "lic.txt").read_text(encoding="utf-8").split("\f"),
                             json.loads((root / "lic_words.json").read_text(encoding="utf-8")))
    reader = LAYOUTS["lic"]
    schemes = [_scheme(row.heading, amc="LIC Mutual Fund") for row in reader(pages[0], pages.words[0])]
    regular = _scheme("LIC MF Large Cap Fund", "Regular Plan - Growth", amc="LIC Mutual Fund")
    other_amc = _scheme("LIC MF Large Cap Fund", amc="Other AMC")
    db_session.add_all(schemes + [regular, other_amc])
    db_session.flush()
    for _ in range(2):
        assert fc.import_pages(db_session, "LIC Mutual Fund", pages, reader, date(2026, 10, 1)) == (43, 0)
    rows = db_session.query(SchemeFundManager).all()
    assert len(rows) == 76  # 75 printed manager rows, plus the Large Cap regular plan
    assert not [row for row in rows if row.scheme_id == other_amc.id]
    assert [(row.manager_name, row.role) for row in rows if row.scheme_id == regular.id] == [("Sumit Bhatnagar", "Equity")]


def test_resolver_extracts_boxes_only_when_requested(monkeypatch):
    from app.services.analytics import amfi_factsheet_client as fc
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    entry = ResolverEntry(ResolverKind.STATIC_LINK, "LIC", landing_url="https://example.test/latest.pdf", needs_boxes=True)
    boxes = json.loads((Path(__file__).parents[2] / "fixtures/factsheets/lic_words.json").read_text(encoding="utf-8"))[:1]
    monkeypatch.setattr(fc, "_download_pdf", AsyncMock(return_value=b"%PDF mocked"))
    monkeypatch.setattr(fc, "extract_page_text", lambda pdf: ["Data as on August 31, 2026"])
    monkeypatch.setattr(fc, "extract_page_words", lambda pdf: boxes)
    def reader(text, words):
        assert words == boxes[0]
        return [_page("one"), _page("two"), _page("three")]
    pages, reason = asyncio.run(fc._resolve_and_read(None, entry, {}, reader, date(2026, 10, 10)))
    assert reason == "ok"
    assert pages.words == boxes


def test_extract_words_unions_character_boxes_and_separates_whitespace(monkeypatch):
    from app.services.analytics import amfi_factsheet_client as fc
    class Text:
        def count_chars(self): return 6
        def get_text_range(self, start, count): return "LIC MF"[start:start + count]
        def get_charbox(self, index): return (index, 10, index + 1, 12)
    class Page:
        def get_textpage(self): return Text()
    monkeypatch.setattr(fc.pdfium, "PdfDocument", lambda pdf: [Page()])
    assert fc.extract_page_words(b"%PDF mocked") == [[(0, 10, 3, 12, "LIC"), (4, 10, 6, 12, "MF")]]


def test_hsbc_document_uuid_does_not_override_the_monthly_filename():
    from app.services.analytics.amfi_factsheet_client import _static_link_candidates
    def handle(request):
        return httpx.Response(200, text='<a href="/assets/2050/the-asset-factsheet-feb-2023.pdf">The Asset Feb 2023</a><a href="/assets/877d5650/the-asset-august-2026.pdf">The Asset as on - August 2026</a>')
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            return await _static_link_candidates(client, "https://www.assetmanagement.hsbc.co.in/en/mutual-funds/investor-resources", "the-asset|The Asset")
    assert asyncio.run(run())[0].endswith("the-asset-august-2026.pdf")


def test_groww_static_landing_includes_embedded_monthly_documents():
    from app.services.analytics.amfi_factsheet_client import _static_link_candidates
    payload = {"props": {"pageProps": {"filesData": {"name": "Downloads", "folders": [
        {"name": "Fact Sheet", "folders": [{"name": "2026 - 2027", "files": [
            {"name": "Monthly Factsheet August 2026.pdf", "publicUrl": "https://assets-netstorage.growwmf.in/2026-2027/august-2026.pdf"},
            {"name": "Monthly Factsheet_July 2026.pdf", "publicUrl": "https://assets-netstorage.growwmf.in/2026-2027/july-2026.pdf"},
        ]}]}]}}}}
    def handle(request):
        return httpx.Response(200, text='<script id="__NEXT_DATA__" type="application/json">' + json.dumps(payload) + '</script>')
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            return await _static_link_candidates(client, "https://www.growwmf.in/downloads/fact-sheet", r"Monthly\s+Factsheet")
    assert asyncio.run(run()) == ["https://assets-netstorage.growwmf.in/2026-2027/august-2026.pdf", "https://assets-netstorage.growwmf.in/2026-2027/july-2026.pdf"]


def test_dsp_download_api_uses_verified_fields_and_monthly_order():
    from app.services.analytics.amfi_factsheet_client import _json_api_candidates
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    def handle(request):
        assert request.url.params["sub_category"] == "Factsheets"
        return httpx.Response(200, json={"data": [
            {"title": "Factsheet July 2026", "pdf_url": "/downloads/dsp-factsheet-july-2026.pdf"},
            {"title": "Factsheet August 2026", "pdf_url": "/downloads/dsp-factsheet-august-2026.pdf"},
        ]})
    entry = ResolverEntry(ResolverKind.JSON_API, "DSP Asset Managers Private Limited",
        endpoint_url="https://www.dspim.com/downloads.json?page=1&per_page=10&category=Information%20Documents&sub_category=Factsheets", response_json_path="data")
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            return await _json_api_candidates(client, entry)
    assert asyncio.run(run()) == ["https://www.dspim.com/downloads/dsp-factsheet-august-2026.pdf", "https://www.dspim.com/downloads/dsp-factsheet-july-2026.pdf"]


def test_absl_document_api_uses_verified_fields_and_current_year():
    from app.services.analytics.amfi_factsheet_client import _json_api_candidates
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"MonthlyFactsheets": [
            {"DocumentTitle": "Empower for the Month of August 2026", "DocumentLink": "/august-2026.pdf"},
            {"DocumentTitle": "Empower for the Month of September 2026", "DocumentLink": "/september-2026.pdf"},
        ]})

    entry = ResolverEntry(ResolverKind.JSON_API, "Aditya Birla Sun Life AMC Limited", layout="absl",
        endpoint_url="https://mutualfund.adityabirlacapital.com/api/sitecore/CalculatorPage/GetMonthlyFactsheetsByYear?datasourceId=%7B2D97ABF5-4F12-479A-86D6-27C538F48D13%7D",
        response_json_path="MonthlyFactsheets")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            return await _json_api_candidates(client, entry)

    assert asyncio.run(run()) == ["https://mutualfund.adityabirlacapital.com/september-2026.pdf", "https://mutualfund.adityabirlacapital.com/august-2026.pdf"]
    assert requests[0].url.params["year"] == "2026"
    assert requests[0].url.params["datasourceId"] == "{2D97ABF5-4F12-479A-86D6-27C538F48D13}"


@pytest.fixture(autouse=True)
def _fixed_refresh_day(monkeypatch):
    from app.services.analytics import amfi_factsheet_client as client

    class RefreshDate(date):
        @classmethod
        def today(cls):
            return date(2026, 10, 10)

    monkeypatch.setattr(client, "date", RefreshDate)
    # Most tests use a 2-AMC directory; the "page changed shape" minimum is tested on its own.
    monkeypatch.setattr(client, "_MIN_DIRECTORY_ENTRIES", 0)


def _scheme(base_name, plan="Direct Plan - Growth", isin=None, category="Equity Scheme - Flexi Cap Fund", amc="Test AMC"):
    return Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], name=f"{base_name} - {plan}", base_name=base_name,
                  amc_name=amc, sebi_category=category, isin=isin)


def _page(heading, isins=(), category=None):
    return SchemePage(heading=heading, managers=[{"name": "Jane Doe", "role": None, "since_raw": None}],
                      isins=list(isins), category=category)


def test_multi_scheme_page_content_and_import_iterate_every_scheme(db_session):
    from app.services.analytics.amfi_factsheet_client import import_pages, looks_like_current_factsheet
    schemes = [_scheme("LIC MF Large Cap Fund"), _scheme("LIC MF Liquid Fund"), _scheme("LIC MF Flexi Cap Fund")]
    db_session.add_all(schemes); db_session.flush()
    rows = [_page(s.base_name) for s in schemes]
    reader = lambda text: rows
    assert looks_like_current_factsheet(["Data as on August 31, 2026"], reader, date(2026,10,10)) == (True, "ok")
    assert import_pages(db_session, "Test AMC", ["summary"], reader, date(2026,10,1)) == (3,0)


def test_one_family_per_fund_holds_every_plan_row():
    rows = [_scheme("ABC Bluechip Fund"), _scheme("ABC Bluechip Fund", "Regular Plan - Growth"),
            _scheme("ABC Bluechip Fund", "Direct Plan - IDCW"), _scheme("XYZ Fund")]
    families = build_families(rows)
    assert sorted(len(f.schemes) for f in families) == [1, 3]


def test_exact_name_matches_the_family_not_a_plan_row():
    families = build_families([_scheme("ABC Bluechip Fund"), _scheme("ABC Bluechip Fund", "Regular Plan - Growth"), _scheme("XYZ Fund")])
    family, method, confidence = match_scheme_page(_page("ABC Bluechip"), families)
    assert family.base_name == "ABC Bluechip Fund" and len(family.schemes) == 2
    assert (method, confidence) == (MATCH_METHOD_EXACT, Decimal("1.0"))


def test_isin_wins_over_a_different_looking_name():
    families = build_families([_scheme("ABC Long Old Name Fund", isin="INF000A01AB1"), _scheme("ABC Bluechip Fund")])
    family, method, _ = match_scheme_page(_page("ABC Bluechip", isins=["INF000A01AB1"]), families)
    assert family.base_name == "ABC Long Old Name Fund" and method == MATCH_METHOD_ISIN


def test_fuzzy_match_in_another_category_is_refused():
    families = build_families([_scheme("ABC Small Cap Opportunities Fund", category="Equity Scheme - Mid Cap Fund")])
    assert match_scheme_page(_page("ABC Small Cap Opportunity Fund", category="Small Cap Fund"), families) is None


def test_fuzzy_match_in_the_same_category_is_accepted():
    families = build_families([_scheme("ABC Small Cap Opportunities Fund", category="Equity Scheme - Small Cap Fund")])
    family, method, confidence = match_scheme_page(_page("ABC Small Cap Opportunity Fund", category="Small Cap Fund"), families)
    assert method == MATCH_METHOD_FUZZY and confidence >= Decimal("0.80")


def test_two_close_candidates_are_refused():
    # Target-maturity funds differ only by date; a heading missing it scores 0.824 against both.
    families = build_families([_scheme("ABC Nifty G-Sec Jun 2027 Index Fund"), _scheme("ABC Nifty G-Sec Dec 2027 Index Fund")])
    assert match_scheme_page(_page("ABC Nifty G-Sec Index"), families) is None


@pytest.mark.parametrize("printed,current", [
    ("Aditya Birla Sun Life Large & Midcap Fund", "Aditya Birla Sun Life Large & Mid Cap Fund"),
    ("Aditya Birla Sun Life Silver ETF Fund of Fund", "Aditya Birla Sun Life Silver ETF FOF"),
    ("Aditya Birla Sun Life US Treasury 1-3 year Bonds ETFs Passive FOF", "Aditya Birla Sun Life US Treasury 1-3 Year Bond ETFs Passive FOF"),
    ("Aditya Birla Sun Life US Treasury 3-10 year Bonds ETFs Passive FOF", "Aditya Birla Sun Life US Treasury 3-10 Year Bond ETFs Passive FOF"),
])
def test_absl_verified_printed_name_aliases_are_exact_and_amc_scoped(printed, current):
    amc = "Aditya Birla Sun Life Mutual Fund"
    families = build_families([_scheme(current, amc=amc)])
    result = match_scheme_page(_page(printed), families)
    assert result is not None
    assert (result[0].base_name, result[1], result[2]) == (current, MATCH_METHOD_EXACT, Decimal("1.0"))
    other = match_scheme_page(_page(printed), build_families([_scheme(current, amc="Other AMC")]))
    assert other is None or other[1] != MATCH_METHOD_EXACT


def test_segregated_and_erstwhile_notes_are_ignored():
    families = build_families([_scheme("ABC Credit Risk Fund (Existing Number of Segregated Portfolios - 1)")])
    family, method, _ = match_scheme_page(_page("ABC Credit Risk Fund [(Erstwhile ABC Income Fund)]"), families)
    assert method == MATCH_METHOD_EXACT


def test_upsert_scheme_fund_managers_is_idempotent(db_session):
    # db_session: use the same in-memory SQLite session helper as
    # test_fund_manager_allocation.py's _session().
    from datetime import date
    from app.services.analytics.amfi_factsheet_client import upsert_scheme_fund_managers, MATCH_METHOD_EXACT
    from app.models.reference import SchemeFundManager
    scheme = _scheme("ABC Fund")
    db = db_session
    db.add(scheme)
    db.commit()
    period = date(2026, 9, 1)
    managers = [{"name": "Jane Doe", "role": None, "since_raw": "Jun 10, 2019"}]

    upsert_scheme_fund_managers(db, scheme, managers, period, MATCH_METHOD_EXACT, Decimal("1.0"))
    upsert_scheme_fund_managers(db, scheme, managers, period, MATCH_METHOD_EXACT, Decimal("1.0"))

    rows = db.query(SchemeFundManager).filter_by(scheme_id=scheme.id, reference_period=period).all()
    assert len(rows) == 1  # not 2 -- re-running the job must not duplicate


def _fixture_pages():
    return (Path(__file__).resolve().parents[2] / "fixtures/factsheets/edelweiss.txt").read_text(encoding="utf-8").split("\f")


def _http(monkeypatch, handler):
    from app.services.analytics import amfi_factsheet_client as client
    real_client = httpx.AsyncClient
    monkeypatch.setattr(client.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), trust_env=False, **kw))
    return real_client


def test_directory_uses_company_names_and_escaped_ampersands():
    from app.services.analytics.amfi_factsheet_client import _parse_amfi_directory_payload
    text = r'{\"amc_name\":\"Aditya Birla Sun Life AMC Limited\",\"amc_monthly_mf_factsheets\":\"https://example.test/absl\"},{\"amc_name\":\"IL\u0026FS Infra Asset Management Limited\",\"amc_monthly_mf_factsheets\":\"\"}'
    assert _parse_amfi_directory_payload(text) == {"Aditya Birla Sun Life AMC Limited": "https://example.test/absl", "IL&FS Infra Asset Management Limited": ""}


def test_links_newest_first_exclude_howto_and_accept_direct_pdf():
    from app.services.analytics.amfi_factsheet_client import _static_link_candidates
    async def run():
        def handler(request):
            return httpx.Response(200, text='<a href="how-to-factsheet.pdf">Factsheet</a><a href="factsheet-April-2026.pdf">April</a><a href="factsheet-September-2026.pdf">September</a>')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as http:
            assert await _static_link_candidates(http, "https://example.test/docs", None) == ["https://example.test/factsheet-September-2026.pdf", "https://example.test/factsheet-April-2026.pdf"]
            assert await _static_link_candidates(http, "https://example.test/direct.pdf", None) == ["https://example.test/direct.pdf"]
    asyncio.run(run())


@pytest.mark.parametrize("count,as_on,expected", [
    (2, "August 31, 2026", (False, "not_a_factsheet")),
    (3, "March 31, 2026", (False, "stale_month")),
    (3, "August 31, 2026", (True, "ok")),
    (3, "30th September 2026", (True, "ok")),
])
def test_factsheet_content_and_date_checks(count, as_on, expected):
    from app.services.analytics.amfi_factsheet_client import looks_like_current_factsheet
    from app.services.analytics.fund_manager_layouts import LAYOUTS
    pages = [_fixture_pages()[0].replace("August 31, 2026", as_on)] * count
    assert looks_like_current_factsheet(pages, LAYOUTS["edelweiss"], date(2026, 10, 10)) == expected


def test_import_propagates_to_all_plans_only_in_requested_amc(db_session):
    from app.models.reference import SchemeFundManager
    from app.services.analytics.amfi_factsheet_client import import_pages
    rows = [_scheme("ABC Fund"), _scheme("ABC Fund", "Regular Plan - IDCW"), _scheme("ABC Fund", amc="Other AMC")]
    db_session.add_all(rows)
    db_session.commit()
    page = SchemePage("ABC Fund", [{"name": "Jane Doe", "role": None, "since_raw": None}, {"name": "John Roe", "role": "Assistant Fund Manager", "since_raw": None}])
    for _ in range(2):
        assert import_pages(db_session, "Test AMC", ["one", "one"], lambda _: page, date(2026, 10, 1)) == (1, 0)
        db_session.commit()
    stored = db_session.query(SchemeFundManager).all()
    assert len(stored) == 4
    assert {r.scheme_id for r in stored} == {rows[0].id, rows[1].id}
    assert {r.manager_name for r in stored} == {"Jane Doe", "John Roe"}


def test_upsert_replaces_current_month_preserves_previous_month(db_session):
    from app.models.reference import SchemeFundManager
    from app.services.analytics.amfi_factsheet_client import upsert_scheme_fund_managers
    scheme = _scheme("ABC Fund")
    db_session.add(scheme)
    db_session.commit()
    upsert = lambda names, period: upsert_scheme_fund_managers(db_session, scheme, [{"name": n, "role": None, "since_raw": None} for n in names], period, "EXACT", Decimal("1"))
    upsert(["Jane Doe"], date(2026, 9, 1))
    upsert(["Jane Doe"], date(2026, 10, 1))
    db_session.commit()
    upsert(["John Roe"], date(2026, 10, 1))
    db_session.commit()
    assert {(r.reference_period, r.manager_name) for r in db_session.query(SchemeFundManager)} == {(date(2026, 9, 1), "Jane Doe"), (date(2026, 10, 1), "John Roe")}


def test_resolve_rejects_stale_candidate_then_accepts_current(monkeypatch):
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_layouts import LAYOUTS
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    current = [_fixture_pages()[0] + "\nData as on September 30, 2026"] * 3
    stale = [_fixture_pages()[0].replace("August 31, 2026", "March 31, 2026")] * 3
    monkeypatch.setattr(client, "extract_page_text", lambda pdf: current if pdf == b"%PDF-current" else stale)
    def handler(request):
        if request.url.path == "/landing":
            return httpx.Response(200, text='<a href="factsheet-October-2026.pdf">October</a><a href="factsheet-September-2026.pdf">September</a>')
        return httpx.Response(200, content=b"%PDF-stale" if "October" in request.url.path else b"%PDF-current")
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as http:
            return await client._resolve_and_read(http, ResolverEntry(ResolverKind.STATIC_LINK, "Company", layout="edelweiss"), {"Company": "https://example.test/landing"}, LAYOUTS["edelweiss"], date(2026, 10, 10))
    assert asyncio.run(run()) == (current, "ok")


def test_refresh_isolates_failure_commits_next_amc_skips_manual_and_pending(db_session, monkeypatch, caplog):
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    from app.models.reference import SchemeFundManager
    scheme = _scheme("Edelweiss Large & Mid Cap Fund", amc="Good AMC")
    db_session.add(scheme)
    db_session.commit()
    monkeypatch.setattr(client, "AMC_RESOLVERS", {
        "Bad AMC": ResolverEntry(ResolverKind.STATIC_LINK, "Bad", layout="edelweiss"),
        "Good AMC": ResolverEntry(ResolverKind.STATIC_LINK, "Good", layout="edelweiss"),
        "Manual AMC": ResolverEntry(ResolverKind.MANUAL, "Manual", layout="hdfc"),
        "Pending AMC": ResolverEntry(ResolverKind.STATIC_LINK, "Pending"),
    })
    monkeypatch.setattr(client, "_fetch_amfi_directory", AsyncMock(return_value={"Bad": "https://example.test/bad", "Good": "https://example.test/good"}))
    pages = [_fixture_pages()[0] + "\nData as on September 30, 2026"] * 3
    monkeypatch.setattr(client, "extract_page_text", lambda _: pages)
    def handler(request):
        if request.url.path == "/bad":
            raise RuntimeError("download broken")
        if request.url.path == "/good":
            return httpx.Response(200, text='<a href="factsheet-September-2026.pdf">Factsheet</a>')
        if request.url.path == "/factsheet-September-2026.pdf":
            return httpx.Response(200, content=b"%PDF-current")
        raise AssertionError(f"unexpected request {request.url}")
    _http(monkeypatch, handler)
    result = asyncio.run(client.refresh_fund_managers(db_session))
    assert (result.amcs_processed, result.amcs_failed, result.schemes_matched) == (1, 1, 1)
    assert db_session.query(SchemeFundManager).count() == 3
    assert len([r for r in caplog.records if "FUND_MANAGER_ALERT" in r.message]) == 1
    assert "amc=Bad AMC reason=error" in caplog.text


def test_refresh_logs_collapsed_matching(db_session, monkeypatch, caplog):
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    monkeypatch.setattr(client, "AMC_RESOLVERS", {"Test AMC": ResolverEntry(ResolverKind.STATIC_LINK, "Company", layout="edelweiss")})
    monkeypatch.setattr(client, "_fetch_amfi_directory", AsyncMock(return_value={}))
    monkeypatch.setattr(client, "_resolve_and_read", AsyncMock(return_value=(["page"], "ok")))
    monkeypatch.setattr(client, "import_pages", lambda *args: (5, 0))
    monkeypatch.setattr(client, "_families_matched_last_month", lambda *args: 40)
    _http(monkeypatch, lambda request: (_ for _ in ()).throw(AssertionError("network forbidden")))
    result = asyncio.run(client.refresh_fund_managers(db_session))
    assert result.amcs_processed == 1
    assert "reason=matching_collapsed" in caplog.text


@pytest.mark.parametrize("reason", ["no_landing_url", "no_factsheet_link", "not_a_factsheet", "stale_month"])
def test_rejected_amc_preserves_last_month(db_session, monkeypatch, caplog, reason):
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    from app.models.reference import SchemeFundManager
    scheme = _scheme("ABC Fund")
    db_session.add(scheme)
    db_session.commit()
    row = SchemeFundManager(scheme_id=scheme.id, manager_name="Jane Doe", sequence_order=0, reference_period=date(2026, 9, 1), match_method="EXACT")
    db_session.add(row)
    db_session.commit()
    monkeypatch.setattr(client, "AMC_RESOLVERS", {"Test AMC": ResolverEntry(ResolverKind.STATIC_LINK, "Company", layout="edelweiss")})
    monkeypatch.setattr(client, "_fetch_amfi_directory", AsyncMock(return_value={}))
    monkeypatch.setattr(client, "_resolve_and_read", AsyncMock(return_value=(None, reason)))
    _http(monkeypatch, lambda request: (_ for _ in ()).throw(AssertionError("network forbidden")))
    result = asyncio.run(client.refresh_fund_managers(db_session))
    assert result.amcs_failed == 1
    assert db_session.query(SchemeFundManager).one().id == row.id
    assert len([r for r in caplog.records if "FUND_MANAGER_ALERT" in r.message]) == 1
    assert f"reason={reason}" in caplog.text


def test_alert_detail_is_kept_on_one_log_line(caplog):
    from app.services.analytics.amfi_factsheet_client import _alert
    _alert("Test AMC", "error", "failed\nSQL detail\rnext line")
    message = caplog.records[-1].getMessage()
    assert "\n" not in message and "\r" not in message


def test_reader_lookup_failure_does_not_abort_next_amc(db_session, monkeypatch, caplog):
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    from app.models.reference import SchemeFundManager
    scheme = _scheme("Edelweiss Large & Mid Cap Fund", amc="Good AMC")
    db_session.add(scheme)
    db_session.commit()
    monkeypatch.setattr(client, "AMC_RESOLVERS", {
        "Bad AMC": ResolverEntry(ResolverKind.STATIC_LINK, "Bad", layout="missing-reader"),
        "Good AMC": ResolverEntry(ResolverKind.STATIC_LINK, "Good", layout="edelweiss"),
    })
    monkeypatch.setattr(client, "_fetch_amfi_directory", AsyncMock(return_value={}))
    monkeypatch.setattr(client, "_resolve_and_read", AsyncMock(return_value=(_fixture_pages(), "ok")))
    _http(monkeypatch, lambda request: (_ for _ in ()).throw(AssertionError("network forbidden")))
    result = asyncio.run(client.refresh_fund_managers(db_session))
    assert (result.amcs_processed, result.amcs_failed) == (1, 1)
    assert db_session.query(SchemeFundManager).count() == 3
    assert len([r for r in caplog.records if "FUND_MANAGER_ALERT" in r.message]) == 1


def test_a_future_as_on_date_does_not_make_a_stale_file_look_current():
    """A typo'd or misread future date must not win over the file's real (old) date."""
    from app.services.analytics.amfi_factsheet_client import _latest_as_on
    pages = ["Data as on March 31, 2026", "NAV as on December 31, 2027"]
    assert _latest_as_on(pages, today=date(2026, 10, 12)) == date(2026, 3, 31)


# --- A04 Run 1 review fixes (9 Oct) ---

def test_link_date_ignores_month_letters_inside_words():
    """'marketing'/'summary' aren't March, 'separate' isn't September."""
    from app.services.analytics.amfi_factsheet_client import _link_date
    assert _link_date("/marketing/summary/factsheet-september-2026.pdf") == (2026, 9)
    assert _link_date("/separate/docs/Factsheet_Oct_2026.pdf") == (2026, 10)
    assert _link_date("/docs/factsheet.pdf Monthly Factsheet") == (0, 0)
    assert _link_date("/marketing/factsheet-2026.pdf") == (2026, 0)


def test_a_dead_link_falls_through_to_the_next_candidate(monkeypatch):
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_layouts import LAYOUTS
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    current = [_fixture_pages()[0] + "\nData as on September 30, 2026"] * 3
    monkeypatch.setattr(client, "extract_page_text", lambda pdf: current)
    def handler(request):
        if request.url.path == "/landing":
            return httpx.Response(200, text='<a href="factsheet-October-2026.pdf">October</a><a href="factsheet-September-2026.pdf">September</a>')
        if "October" in request.url.path:
            return httpx.Response(404)
        return httpx.Response(200, content=b"%PDF-current")
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as http:
            return await client._resolve_and_read(http, ResolverEntry(ResolverKind.STATIC_LINK, "Company", layout="edelweiss"), {"Company": "https://example.test/landing"}, LAYOUTS["edelweiss"], date(2026, 10, 10))
    assert asyncio.run(run()) == (current, "ok")


def test_an_oversized_download_is_refused(monkeypatch):
    from app.services.analytics import amfi_factsheet_client as client
    monkeypatch.setattr(client, "_MAX_PDF_BYTES", 16)
    def handler(request):
        return httpx.Response(200, content=b"%PDF-" + b"x" * 64)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as http:
            return await client._download_pdf(http, "https://example.test/huge.pdf")
    assert asyncio.run(run()) is None


def test_html_escaped_ampersands_in_links_are_decoded():
    from app.services.analytics.amfi_factsheet_client import _parse_amfi_directory_payload, _static_link_candidates
    payload = '{\\"amc_name\\":\\"X AMC Limited\\",\\"amc_monthly_mf_factsheets\\":\\"https://x.test/dl?a=1\\u0026b=2\\"}'
    assert _parse_amfi_directory_payload(payload) == {"X AMC Limited": "https://x.test/dl?a=1&b=2"}
    async def run():
        def handler(request):
            return httpx.Response(200, text='<a href="get.pdf?file=factsheet-september-2026&amp;v=2">Factsheet</a>')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as http:
            return await _static_link_candidates(http, "https://example.test/docs", None)
    assert asyncio.run(run()) == ["https://example.test/get.pdf?file=factsheet-september-2026&v=2"]


def test_a_directory_that_parses_to_almost_nothing_raises_one_alert(db_session, monkeypatch, caplog):
    import logging
    from app.services.analytics import amfi_factsheet_client as client
    monkeypatch.setattr(client, "_MIN_DIRECTORY_ENTRIES", 40)
    monkeypatch.setattr(client, "_fetch_amfi_directory", AsyncMock(return_value={"Only One AMC Limited": "https://x.test"}))
    caplog.set_level(logging.WARNING)
    result = asyncio.run(client.refresh_fund_managers(db_session))
    assert result.success is False
    assert any("FUND_MANAGER_ALERT amc=ALL reason=directory_failed" in m for m in caplog.messages)


def test_a_name_listed_twice_on_one_page_is_written_once(db_session):
    from app.models.reference import SchemeFundManager
    from app.services.analytics.amfi_factsheet_client import upsert_scheme_fund_managers
    scheme = _scheme("ABC Fund")
    db_session.add(scheme)
    db_session.commit()
    managers = [{"name": "Jane Doe", "role": None, "since_raw": None}, {"name": "Jane Doe", "role": "Overseas Investments", "since_raw": None}]
    upsert_scheme_fund_managers(db_session, scheme, managers, date(2026, 10, 1), MATCH_METHOD_EXACT, Decimal("1.0"))
    db_session.commit()
    rows = db_session.query(SchemeFundManager).filter_by(scheme_id=scheme.id).all()
    assert [(r.manager_name, r.role) for r in rows] == [("Jane Doe", None)]


def test_file_name_date_beats_the_upload_folder_and_duplicates_collapse():
    """Run 3 (Canara, Helios): /uploads/2026/01/…-December-2025.pdf outranked the August 2026
    file because the folder's year was taken; and repeated links used up candidate slots."""
    from app.services.analytics.amfi_factsheet_client import _static_link_candidates
    page = (
        '<a href="/wp-content/uploads/2026/01/Factsheet-as-on-December-2025.pdf">Factsheet Dec</a>'
        '<a href="/wp-content/uploads/2026/09/Factsheet-as-on-August-2026.pdf">Factsheet Aug</a>'
        '<a href="/wp-content/uploads/2026/09/Factsheet-as-on-August-2026.pdf">Download</a>'
        '<a href="/wp-content/uploads/2026/08/Factsheet-as-on-July-2026.pdf">Factsheet Jul</a>'
    )
    async def run():
        def handler(request):
            return httpx.Response(200, text=page)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as http:
            return await _static_link_candidates(http, "https://example.test/docs", None)
    assert asyncio.run(run()) == [
        "https://example.test/wp-content/uploads/2026/09/Factsheet-as-on-August-2026.pdf",
        "https://example.test/wp-content/uploads/2026/08/Factsheet-as-on-July-2026.pdf",
        "https://example.test/wp-content/uploads/2026/01/Factsheet-as-on-December-2025.pdf",
    ]


def test_absl_falls_back_to_last_year_early_in_january(monkeypatch):
    """Review (10 Oct): on 5 Jan the current year has no uploads yet; December's file is current."""
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind

    class January(date):
        @classmethod
        def today(cls):
            return date(2027, 1, 5)
    monkeypatch.setattr(client, "date", January)

    def handle(request):
        if request.url.params["year"] == "2027":
            return httpx.Response(200, json={"MonthlyFactsheets": []})
        return httpx.Response(200, json={"MonthlyFactsheets": [
            {"DocumentTitle": "Empower for the Month of December 2026", "DocumentLink": "/december-2026.pdf"}]})
    entry = ResolverEntry(ResolverKind.JSON_API, "Aditya Birla Sun Life AMC Limited", layout="absl",
        endpoint_url="https://mutualfund.adityabirlacapital.com/api/x?datasourceId=1", response_json_path="MonthlyFactsheets")
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
            return await client._json_api_candidates(http, entry)
    assert asyncio.run(run()) == ["https://mutualfund.adityabirlacapital.com/december-2026.pdf"]


def test_groww_skips_a_malformed_embedded_document():
    import json
    from app.services.analytics.amfi_factsheet_client import _static_link_candidates
    payload = {"props": {"pageProps": {"filesData": {"files": [
        {"name": "Monthly Factsheet September 2026.pdf"},  # no publicUrl
        {"name": "Monthly Factsheet August 2026.pdf", "publicUrl": "https://assets-netstorage.growwmf.in/august-2026.pdf"},
    ], "folders": []}}}}
    def handler(request):
        return httpx.Response(200, text='<script id="__NEXT_DATA__" type="application/json">' + json.dumps(payload) + '</script>')
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False) as http:
            return await _static_link_candidates(http, "https://www.growwmf.in/downloads/fact-sheet", r"Monthly\s+Factsheet")
    assert asyncio.run(run()) == ["https://assets-netstorage.growwmf.in/august-2026.pdf"]


@pytest.mark.parametrize("raw,expected", [
    ("Jun 10, 2019", date(2019, 6, 10)),
    ("August 26,2026", date(2026, 8, 26)),
    ("03 February 2025", date(2025, 2, 3)),     # quant, NJ: day first
    ("23rd March 2026", date(2026, 3, 23)),     # Abakkus: ordinal day
    ("1st Sep 2025", date(2025, 9, 1)),
    ("August 2007", date(2007, 8, 1)),
    ("Inception", None),
    ("Since Inception", None),
])
def test_managing_since_parses_the_formats_factsheets_print(raw, expected):
    """Run 4: day-first dates were left NULL in managing_since; only the raw text survived."""
    from app.services.analytics.amfi_factsheet_client import _parse_managing_since
    assert _parse_managing_since(raw) == expected


def test_quant_scoped_month_pattern_uses_real_scheme_pages_only_when_configured():
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_layouts import LAYOUTS
    pages = (Path(__file__).parents[2] / "fixtures/factsheets/quant.txt").read_text(encoding="utf-8").split("\f")
    pages = ["Contents"] * 12 + pages + [pages[0]]
    pattern = r"\bAUM\s*\((\d{1,2}\s+[A-Za-z]+\s+\d{4})\)"
    assert client.looks_like_current_factsheet(pages, LAYOUTS["quant"], date(2026, 10, 10)) == (False, "stale_month")
    assert client.looks_like_current_factsheet(pages, LAYOUTS["quant"], date(2026, 10, 10), as_on_pattern=pattern) == (True, "ok")
    stale = [p.replace("30 September 2026", "30 June 2026") for p in pages]
    assert client.looks_like_current_factsheet(stale, LAYOUTS["quant"], date(2026, 10, 10), as_on_pattern=pattern) == (False, "stale_month")


@pytest.mark.parametrize("rejection", [None, "missing", "stale"])
def test_multi_document_resolver_validates_every_file_before_import(monkeypatch, rejection):
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_layouts import SchemePage
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    active = (Path(__file__).parents[2] / "fixtures/factsheets/mirae_active.txt").read_text(encoding="utf-8").split("\f")
    passive = (Path(__file__).parents[2] / "fixtures/factsheets/mirae_passive.txt").read_text(encoding="utf-8").split("\f")
    # Verbatim caption on active fund-performance page 95 (scheme-page ordinal wraps).
    active = active + ["Monthly Factsheet as on 31 August, 2026"]
    passive = passive + [passive[0]]
    if rejection == "stale":
        passive = [p.replace("31 August, 2026", "31 May, 2026").replace("31st August, 2026", "31st May, 2026") for p in passive]
    monkeypatch.setattr(client, "extract_page_text", lambda pdf: active if pdf == b"%PDF-active" else passive)
    # Reader shape is tested separately; this test isolates the document contract.
    reader = lambda p: SchemePage("Real scheme", [{"name": "A", "role": None, "since_raw": None}])
    entry = ResolverEntry(ResolverKind.STATIC_LINK, "Mirae", documents=(r"active", r"passive"))
    def handle(request):
        if request.url.path == "/landing":
            return httpx.Response(200, text='<a href="active-factsheet-september-2026.pdf">Active</a>' + ('' if rejection == "missing" else '<a href="passive-factsheet-september-2026.pdf">Passive</a>'))
        return httpx.Response(200, content=b"%PDF-active" if "active" in request.url.path else b"%PDF-passive")
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle), trust_env=False) as http:
            return await client._resolve_and_read(http, entry, {"Mirae": "https://example.test/landing"}, reader, date(2026,10,10))
    result = asyncio.run(run())
    expected = {"missing": (None, "no_factsheet_link"), "stale": (None, "stale_month")}
    assert result == expected.get(rejection, (active + passive, "ok"))


def test_mirae_api_keeps_candidates_for_each_document_pattern():
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    entry = ResolverEntry(ResolverKind.JSON_API, "Mirae Asset Investment Managers (India) Pvt. Ltd",
                          endpoint_url="https://www.miraeassetmf.co.in/AjaxService/GetDownloadsData", documents=("active", "passive"))
    def handle(request):
        assert request.method == "POST"
        assert json.loads(request.content) == {"request": {"modulename": "Factsheet", "pgno": 1, "pgsize": 10}}
        return httpx.Response(200, json={"Data": [
            {"Title": "August 2026 - Active Fund Factsheet", "URL": "/active-factsheet---august-2026.pdf"},
            {"Title": "September 2026 - Passive Fund Factsheet", "URL": "/passive-factsheet---september-2026.pdf"},
            {"Title": "September 2026 - Active Fund Factsheet", "URL": "/active-factsheet---september-2026.pdf"},
            {"Title": "July 2026 - Passive Fund Factsheet", "URL": "/passive-factsheet---july-2026.pdf"},
        ]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle), trust_env=False) as http:
            return await client._json_api_candidates(http, entry)
    assert asyncio.run(run()) == [
        "https://www.miraeassetmf.co.in/passive-factsheet---september-2026.pdf",
        "https://www.miraeassetmf.co.in/active-factsheet---september-2026.pdf",
        "https://www.miraeassetmf.co.in/active-factsheet---august-2026.pdf",
        "https://www.miraeassetmf.co.in/passive-factsheet---july-2026.pdf",
    ]


def test_uti_api_uses_month_names_falls_back_and_keeps_both_english_files(monkeypatch):
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    class Today(date):
        @classmethod
        def today(cls):
            return date(2026,10,10)
    monkeypatch.setattr(client, "date", Today)
    entry = ResolverEntry(ResolverKind.JSON_API, "UTI Asset Mgmt. Co. Ltd.", endpoint_url="https://www.utimf.com/api/get-fact-sheet", documents=("active", "passive"))
    calls = []
    def handle(request):
        calls.append(dict(request.url.params))
        if request.url.params["month"] == "October":
            return httpx.Response(200, json={"rows": []})
        return httpx.Response(200, json={"rows": [
            {"name": "UTI Fund Watch (Active)-September 2026", "doc": "https://cdn.test/active_september_2026.pdf"},
            {"name": "UTI Fund Watch (Passive)-September 2026", "doc": "https://cdn.test/passive_september_2026.pdf"},
            {"name": "UTI Fund Watch (Active)-September 2026 Hindi", "doc": "https://cdn.test/Hindi.pdf"},
        ]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle), trust_env=False) as http:
            return await client._json_api_candidates(http, entry)
    assert asyncio.run(run()) == ["https://cdn.test/active_september_2026.pdf", "https://cdn.test/passive_september_2026.pdf"]
    assert calls == [{"year": "2026", "month": "October"}, {"year": "2026", "month": "September"}]


@pytest.mark.parametrize("company,payload,expected", [
    ("Choice AMC Private Limited", {"body": [{"slug": "scheme-documents", "children": [
        {"redirection_link": "disclosures/sid", "financial_years": [{"files": [{"doc_name": "SID", "file_path": "sid.pdf"}]}]},
        {"redirection_link": "disclosures/factsheets", "financial_years": [{"files": [
            {"doc_name": "Choice Factsheet July 2026", "file_path": "july-2026.pdf", "scheme_id": None},
            {"doc_name": "Choice Factsheet August 2026", "file_path": "august-2026.pdf", "scheme_id": None},
            {"doc_name": "Gold ETF August 2026", "file_path": "one-pager.pdf", "scheme_id": 1},
        ]}]}]}]}, ["https://doc.choicemf.com/august-2026.pdf", "https://doc.choicemf.com/july-2026.pdf"]),
    ("PGIM India Asset Management Private Limite", {"data": {"tab_0001": [{"pdfPath": "https://cdn.test/SID.pdf"}], "tab_0007": [
        {"monthYear": "July 2026", "pdfPath": "https://cdn.test/july-2026.pdf", "displayStatus": True},
        {"monthYear": "September 2026", "pdfPath": "https://cdn.test/september-2026.pdf", "displayStatus": False},
        {"monthYear": "August 2026", "pdfPath": "https://cdn.test/august-2026.pdf", "displayStatus": True},
    ]}}, ["https://cdn.test/august-2026.pdf", "https://cdn.test/july-2026.pdf"]),
])
def test_choice_and_pgim_verified_api_shapes(company, payload, expected):
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    entry = ResolverEntry(ResolverKind.JSON_API, company, endpoint_url="https://example.test/api")
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload)), trust_env=False) as http:
            return await client._json_api_candidates(http, entry)
    assert asyncio.run(run()) == expected


@pytest.mark.parametrize("amc,heading,wanted,other", [
    ("Mirae Asset Mutual Fund", "MIRAE ASSET NIFTY 1D RATE LIQUID ETF - IDCW*", "Mirae Asset Nifty 1D Rate Liquid ETF-IDCW", "Mirae Asset Nifty 1D Rate Liquid ETF - Growth"),
    ("Mirae Asset Mutual Fund", "MIRAE ASSET NIFTY 1D RATE LIQUID ETF - GROWTH", "Mirae Asset Nifty 1D Rate Liquid ETF - Growth", "Mirae Asset Nifty 1D Rate Liquid ETF-IDCW"),
    ("UTI Mutual Fund", "UTI CREDIT RISK FUND", "UTI - Credit Risk Fund.", "UTI - Credit Risk Fund (Segregated - 06032020)"),
    ("UTI Mutual Fund", "UTI FOCUSED FUND", "UTI Focused Fund (30 stocks)", "UTI Flexi Cap Fund"),
])
def test_mirae_and_uti_matching_keeps_ambiguous_families_unmatched(amc, heading, wanted, other):
    families = build_families([_scheme(wanted, amc=amc), _scheme(other, amc=amc)])
    match = match_scheme_page(_page(heading), families)
    if "FOCUSED" in heading:
        assert match and match[0].base_name == wanted
        assert match[1] == MATCH_METHOD_EXACT
    else:
        # Global Constraints: never resolve two families with the same canonical
        # name by guesswork. Growth/IDCW and segregated labels collapse today.
        assert match is None


@pytest.mark.parametrize("fail_second_file", [False, True])
def test_multi_document_import_commits_once_or_rolls_back_the_whole_amc(db_session, monkeypatch, caplog, fail_second_file):
    from app.models.reference import SchemeFundManager
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_layouts import LAYOUTS
    from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
    fixtures = Path(__file__).parents[2] / "fixtures/factsheets"
    active = (fixtures / "mirae_active.txt").read_text(encoding="utf-8").split("\f")
    passive = (fixtures / "mirae_passive.txt").read_text(encoding="utf-8").split("\f")
    pages = active + passive
    schemes = [_scheme(LAYOUTS["mirae"](p).heading, amc="Mirae Test AMC") for p in pages]
    db_session.add_all(schemes)
    db_session.commit()
    monkeypatch.setattr(client, "AMC_RESOLVERS", {"Mirae Test AMC": ResolverEntry(
        ResolverKind.STATIC_LINK, "Mirae", layout="mirae", documents=("active", "passive"))})
    monkeypatch.setattr(client, "_fetch_amfi_directory", AsyncMock(return_value={}))
    monkeypatch.setattr(client, "_resolve_and_read", AsyncMock(return_value=(pages, "ok")))
    _http(monkeypatch, lambda request: (_ for _ in ()).throw(AssertionError("network forbidden")))
    commit = AsyncMock(side_effect=client.commit_off_loop)
    monkeypatch.setattr(client, "commit_off_loop", commit)
    upsert = client.upsert_scheme_fund_managers
    def write(db, scheme, *args, **kwargs):
        if fail_second_file and scheme.scheme_name == schemes[2].scheme_name:
            raise RuntimeError("second file write failed")
        return upsert(db, scheme, *args, **kwargs)
    monkeypatch.setattr(client, "upsert_scheme_fund_managers", write)
    result = asyncio.run(client.refresh_fund_managers(db_session))
    if fail_second_file:
        assert (result.amcs_processed, result.amcs_failed) == (0, 1)
        assert db_session.query(SchemeFundManager).count() == 0
        commit.assert_not_awaited()
        assert sum("FUND_MANAGER_ALERT" in m for m in caplog.messages) == 1
    else:
        assert (result.amcs_processed, result.amcs_failed, result.schemes_matched) == (1, 0, 4)
        assert db_session.query(SchemeFundManager).count() == 7
        commit.assert_awaited_once_with(db_session)


def test_quant_custom_caption_replaces_shared_scan_and_ignores_future_dates():
    from app.services.analytics import amfi_factsheet_client as client
    from app.services.analytics.fund_manager_layouts import LAYOUTS
    pages = (Path(__file__).parents[2] / "fixtures/factsheets/quant.txt").read_text(encoding="utf-8").split("\f")
    pattern = r"\bAUM\s*\((\d{1,2}\s+[A-Za-z]+\s+\d{4})\)"
    stale = [p.replace("30 September 2026", "30 June 2026") for p in pages]
    stale += [stale[0] + "\nData as on September 30, 2026\nAUM (30 September 2027)"]
    assert client.looks_like_current_factsheet(stale, LAYOUTS["quant"], date(2026, 10, 10)) == (True, "ok")
    assert client.looks_like_current_factsheet(stale, LAYOUTS["quant"], date(2026, 10, 10), as_on_pattern=pattern) == (False, "stale_month")


def test_a_fund_on_two_pages_keeps_every_manager(db_session):
    """Run 5 review: a fund printed on two pages (or in two files of one month, e.g. Mirae
    active + passive) must keep the managers from both, not just the last page's."""
    from app.models.reference import SchemeFundManager
    from app.services.analytics.amfi_factsheet_client import import_pages
    scheme = _scheme("ABC Liquid Fund", amc="Two Files AMC")
    db_session.add(scheme)
    db_session.commit()
    def reader(text):
        name, managers = text.split("|")
        return SchemePage(heading=name, managers=[{"name": m, "role": None, "since_raw": None} for m in managers.split(",")])
    matched, unmatched = import_pages(db_session, "Two Files AMC", ["ABC Liquid Fund|Jane Doe,John Roe", "ABC Liquid Fund|Jane Doe,Asha Rao"],
                                      reader, date(2026, 10, 1))
    db_session.commit()
    rows = db_session.query(SchemeFundManager).filter_by(scheme_id=scheme.id).order_by(SchemeFundManager.sequence_order).all()
    assert [r.manager_name for r in rows] == ["Jane Doe", "John Roe", "Asha Rao"]
    assert (matched, unmatched) == (1, 0)
