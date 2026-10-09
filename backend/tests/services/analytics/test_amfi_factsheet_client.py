# backend/tests/services/analytics/test_amfi_factsheet_client.py
import uuid
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
