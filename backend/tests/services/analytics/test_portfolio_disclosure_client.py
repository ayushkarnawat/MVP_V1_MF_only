import asyncio
import json
import io
import logging
import uuid
import zipfile
from datetime import date
from decimal import Decimal
from pathlib import Path

import httpx
import openpyxl
import pytest

from app.models.enums import DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding
from app.services.analytics import portfolio_disclosure_client as client
from app.services.analytics.portfolio_disclosure_resolvers import (
    AMC_DISCLOSURE_RESOLVERS, DisclosureFileShape as Shape,
    DisclosureResolverEntry as Entry, DisclosureResolverKind as Kind,
)


@pytest.fixture
def mock_http(monkeypatch):
    """Every refresh request must go through MockTransport; unexpected URLs fail."""
    real_client = httpx.AsyncClient
    requests = []

    def install(routes):
        def handler(request):
            requests.append(str(request.url))
            key = str(request.url)
            assert key in routes, f"Unexpected HTTP request: {key}"
            response = routes[key]
            return response(request) if callable(response) else response

        monkeypatch.setattr(client.httpx, "AsyncClient", lambda **kw: real_client(
            transport=httpx.MockTransport(handler), trust_env=False, **kw))
        return requests

    return install


def workbook(sheets=None):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, weight, total in sheets or [("Example Equity Fund", 100, 100)]:
        ws = wb.create_sheet(name)
        ws.append(["Name of the Instrument", "ISIN", "Industry", "Quantity",
                   "Market Value (Rs. in Lakhs)", "% to NAV"])
        ws.append(["Equity & Equity related"])
        ws.append(["HDFC Bank Ltd", "INE040A01034", "Banks", 1000, 15, weight])
        if total is not None:
            ws.append(["Grand Total", None, None, None, 15, total])
    buf = io.BytesIO()
    wb.save(buf)
    wb.close()
    return buf.getvalue()


def seed(db, amc="Example Mutual Fund", base="Example Equity Fund", plans=1):
    rows = [Scheme(id=uuid.uuid4(), name=f"{base} - Plan {i}", amc_name=amc,
                   base_name=base, sebi_category="Equity Scheme - Flexi Cap Fund")
            for i in range(plans)]
    db.add_all(rows)
    db.commit()
    return rows


def static_entry(shape=Shape.SINGLE_WORKBOOK_MULTI_SHEET):
    return Entry(kind=Kind.STATIC_REGEX, file_shape=shape,
                 landing_url="https://example.test/list", link_pattern="portfolio",
                 exclude_pattern="fortnightly")


def run_refresh(db, monkeypatch, mock_http, routes, entry=None, amc="Example Mutual Fund", today=None):
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {amc: entry or static_entry()})
    requests = mock_http(routes)
    return asyncio.run(client.refresh_portfolio_disclosures(db, today=today)), requests


@pytest.mark.parametrize("filename,expected", [
    ("NIMF-MONTHLY-PORTFOLIO-31-Aug-26.xls", date(2026, 8, 31)),
    ("helios-flexi-cap-fund-monthly-portfolio-as-on-30th-september-2026.xls", date(2026, 9, 30)),
    ("helios-overnight-fund-monthly-portfolio-as-on-30st-september-2026.xls", date(2026, 9, 30)),
    ("MP-Unifi-Flexi-Cap-Fund-30092026.xlsx", date(2026, 9, 30)),
    ("MP-Unifi-Liquid-Fund-31082026.xls", date(2026, 8, 31)),
    ("OBMF_Flexi_Cap_Portfolio_Sept_26_0cfdd46aac.xlsx", date(2026, 9, 30)),
    ("Old_Bridge_Arbitrage_Fund_January_2026_deadbeef.xlsx", date(2026, 1, 31)),
    ("IN_MF_MONTHLY_PORTFOLIO_Sep2026_Final_fc91906e39.xls", date(2026, 9, 30)),
    ("IN_MF_MONTHLY_PORTFOLIO_Apr_2026_final_x.xlsx", date(2026, 4, 30)),
    ("Monthly%20HDFC%20Flexi%20Cap%20Fund%20-%2031%20August%202026.xlsx", date(2026, 8, 31)),
    ("SC-%E2%80%93-Canara-Robeco-Small-Cap-Fund-%E2%80%93-September-2026.xlsx", date(2026, 9, 30)),
    ("OF-Canara-Robeco-Overnight-Fund-September-2026.xlsx", date(2026, 9, 30)),
    ("portfolio-30-Sep-26.xlsx", date(2026, 9, 30)),
    ("portfolio-30-09-2026.xlsx", date(2026, 9, 30)),
    ("portfolio-February-2024.xlsx", date(2024, 2, 29)),
    ("portfolio-31-Feb-26.xls", None),
    ("portfolio-31022026.xls", None),
    ("portfolio-30-Foo-2026.xlsx", None),
    ("current.xls", None),
    ("Monthly_Portfolio_Flexi_Cap_0fd0dc18c8.xlsx", None),
])
def test_filename_as_of_date_real_shapes_and_invalid_dates(filename, expected):
    # Dates must come from the filename, never the upload folder or query string.
    assert client._filename_as_of_date(f"https://example.test/2026/10/{filename}?date=30-Sep-26") == expected


@pytest.mark.parametrize("snippet,url", [
    (r'<script>{\"url\":\"https://files.hdfcfund.com/s3fs-public/2026-09/Monthly%20HDFC%20Flexi%20Cap%20Fund%20-%2031%20August%202026.xlsx\"}</script>',
     "https://files.hdfcfund.com/s3fs-public/2026-09/Monthly%20HDFC%20Flexi%20Cap%20Fund%20-%2031%20August%202026.xlsx"),
    (r'<script>{\"attachment\":{\"url\":\"/uploads/Monthly_Portfolio_Flexi_Cap_0fd0dc18c8.xlsx\"}}</script>',
     "/uploads/Monthly_Portfolio_Flexi_Cap_0fd0dc18c8.xlsx"),
    (r'<script>{\"fileUrl\":\"https://s3.ap-south-1.amazonaws.com/x-web-s3.360.one/IN_MF_MONTHLY_PORTFOLIO_Sep2026_Final_fc91906e39.xls\"}</script>',
     "https://s3.ap-south-1.amazonaws.com/x-web-s3.360.one/IN_MF_MONTHLY_PORTFOLIO_Sep2026_Final_fc91906e39.xls"),
    (r'<script>{"url":"https:\/\/example.test\/portfolio-30-Sep-26.xlsx?a=1\u0026b=2"}</script>',
     "https://example.test/portfolio-30-Sep-26.xlsx?a=1&b=2"),
])
def test_extract_links_unescapes_trimmed_capture_payloads(snippet, url):
    assert client._extract_links(snippet) == [(url, "")]


def test_extract_links_preserves_anchor_label_and_deduplicates():
    snippet = '<a href="/portfolio-30-Sep-26.xls?a=1&amp;b=2"><b>Example</b> Equity Fund</a>'
    assert client._extract_links(snippet) == [("/portfolio-30-Sep-26.xls?a=1&b=2", "Example Equity Fund")]


def test_refresh_latest_file_magic_bytes_plan_variants_and_rerun(db_session, monkeypatch, mock_http):
    seed(db_session, plans=2)
    old = "https://example.test/portfolio-31-Aug-26.xls"
    new = "https://example.test/portfolio-30-Sep-26.xls"  # OOXML under .xls
    routes = {
        "https://example.test/list": httpx.Response(200, text=f'<a href="{old}">Old</a><a href="{new}">New</a>'),
        new: httpx.Response(200, content=workbook()),
    }
    result, requests = run_refresh(db_session, monkeypatch, mock_http, routes)
    assert (result.success, result.amcs_processed, result.amcs_failed, result.schemes_written) == (True, 1, 0, 2)
    assert old not in requests
    batches = db_session.query(DisclosureBatch).all()
    assert len(batches) == 2 and all(b.status is DisclosureBatchStatus.WRITTEN for b in batches)
    assert all(b.as_of_date == date(2026, 9, 30) for b in batches)
    assert db_session.query(SchemeHolding).first().market_value == Decimal("1500000")
    result2 = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result2.amcs_processed == 1 and result2.schemes_written == 0
    assert db_session.query(SchemeHolding).count() == 2


def test_multifile_matches_link_text_and_excludes_fortnightly(db_session, monkeypatch, mock_http):
    seed(db_session, base="Helios Flexi Cap Fund")
    seed(db_session, base="Helios Small Cap Fund")
    urls = [f"https://example.test/helios-{name}-fund-monthly-portfolio-as-on-30st-september-2026.xls"
            for name in ("flexi-cap", "small-cap")]
    html = ''.join(f'<a href="{u}">{label} - Monthly Portfolio</a>' for u, label in zip(
        urls, ("Helios Flexi Cap Fund", "Helios Small Cap Fund")))
    html += '<a href="/fortnightly-portfolio-30-Sep-26.xls">Fortnightly</a>'
    routes = {"https://example.test/list": httpx.Response(200, text=html)}
    routes.update({u: httpx.Response(200, content=workbook([("Sheet", 100, 100)])) for u in urls})
    result, requests = run_refresh(db_session, monkeypatch, mock_http, routes,
                                   static_entry(Shape.MULTI_FILE_SINGLE_SCHEME))
    assert result.schemes_written == 2
    assert len(requests) == 3
    assert db_session.query(DisclosureBatch).count() == 2


def test_template_uses_month_end_and_deduplicates_plan_variants(db_session, monkeypatch, mock_http):
    seed(db_session, base="Union Corporate Bond Fund", plans=2)
    seed(db_session, base="Union Missing Fund")
    monkeypatch.setattr(client, "_latest_month_end", lambda: date(2026, 9, 30))
    entry = Entry(kind=Kind.STATIC_REGEX, file_shape=Shape.DETERMINISTIC_TEMPLATE,
                  url_template="https://example.test/{month_name_lower}-{yyyy}/{scheme_slug}-{dd}-{mm}-{yyyy}.xlsx")
    good = "https://example.test/september-2026/union-corporate-bond-fund-30-09-2026.xlsx"
    bad = "https://example.test/september-2026/union-missing-fund-30-09-2026.xlsx"
    result, requests = run_refresh(db_session, monkeypatch, mock_http, {
        good: httpx.Response(200, content=workbook([("Sheet", 100, 100)])), bad: httpx.Response(500),
    }, entry)
    assert result.schemes_written == 2
    assert requests == [good, bad]


def test_template_supplies_all_fields_and_fetches_amc_bundle_once(db_session, monkeypatch, mock_http):
    seed(db_session, base="Example Equity Fund", plans=2)
    seed(db_session, base="Example Debt Fund")
    monkeypatch.setattr(client, "_latest_month_end", lambda: date(2026, 9, 30))
    entry = Entry(kind=Kind.STATIC_REGEX, file_shape=Shape.DETERMINISTIC_TEMPLATE,
                  url_template="https://example.test/{month_name}-{yyyy}-{yy}-{yy_plus_1}-{dd}-{mm}.xls")
    url = "https://example.test/September-2026-26-27-30-09.xls"
    result, requests = run_refresh(db_session, monkeypatch, mock_http, {
        url: httpx.Response(200, content=workbook([
            ("Example Equity Fund", 100, 100), ("Example Debt Fund", 100, 100)])),
    }, entry)
    assert requests == [url]
    assert result.schemes_written == 3


@pytest.mark.parametrize("weight,total,status", [
    (98, 100, DisclosureBatchStatus.FAILED),  # in band but unreconciled
    (100, 100, DisclosureBatchStatus.WRITTEN),
    (1, "100%", DisclosureBatchStatus.WRITTEN),
    (100, 1, DisclosureBatchStatus.FAILED),  # error WITH holdings
])
def test_refresh_passes_declared_total_and_keeps_errored_holdings(db_session, monkeypatch, mock_http, weight, total, status):
    seed(db_session)
    url = "https://example.test/portfolio-30-Sep-26.xls"
    result, _ = run_refresh(db_session, monkeypatch, mock_http, {
        "https://example.test/list": httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
        url: httpx.Response(200, content=workbook([("Example Equity Fund", weight, total)])),
    })
    batch = db_session.query(DisclosureBatch).one()
    assert batch.status is status
    assert db_session.query(SchemeHolding).count() == 1
    if weight == 100 and total == 1:
        assert "scale disagrees" in str(batch.parse_errors)
    assert result.schemes_written == 1  # writer counts persisted scheme batches, including FAILED


def test_zip_bad_member_isolated_and_format_sniffed_despite_extension(db_session, monkeypatch, mock_http, caplog):
    seed(db_session)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("bad.xlsx", b"not a workbook")
        archive.writestr("valid.xls", workbook())
        archive.writestr("readme.txt", b"not holdings")
    url = "https://example.test/portfolio-30-Sep-26.xls"  # ZIP under .xls
    with caplog.at_level(logging.WARNING):
        result, _ = run_refresh(db_session, monkeypatch, mock_http, {
            "https://example.test/list": httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
            url: httpx.Response(200, content=buf.getvalue()),
        }, static_entry(Shape.ZIP_OF_WORKBOOKS))
    assert result.amcs_processed == 1 and result.schemes_written == 1
    assert db_session.query(DisclosureBatch).one().status is DisclosureBatchStatus.WRITTEN
    assert "bad.xlsx" in caplog.text


def test_sheet_error_without_holdings_does_not_fail_good_sheets(db_session, monkeypatch, mock_http):
    seed(db_session)
    data = workbook([("Broken Empty", 100, 100), ("Example Equity Fund", 100, 100)])
    wb = openpyxl.load_workbook(io.BytesIO(data))
    wb["Broken Empty"].cell(1, 5, "Market Value (Rs. in Millions)")
    buf = io.BytesIO()
    wb.save(buf)
    wb.close()
    url = "https://example.test/portfolio-30-Sep-26.xlsx"
    result, _ = run_refresh(db_session, monkeypatch, mock_http, {
        "https://example.test/list": httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
        url: httpx.Response(200, content=buf.getvalue()),
    })
    assert result.schemes_written == 1
    batch = db_session.query(DisclosureBatch).one()
    # Per-sheet errors: the empty broken sheet is not written and must not FAIL its good neighbour.
    assert batch.status is DisclosureBatchStatus.WRITTEN
    assert batch.parse_errors is None


def test_zero_schemes_matched_has_distinct_alert_and_no_http(db_session, monkeypatch, mock_http, caplog):
    with caplog.at_level(logging.WARNING):
        result, requests = run_refresh(db_session, monkeypatch, mock_http, {})
    assert result.amcs_failed == 1 and requests == []
    assert "reason=zero_schemes_matched" in caplog.text
    assert "no_file_found" not in caplog.text


def test_manual_and_unbuilt_json_are_skips_without_alerts_or_http(db_session, monkeypatch, mock_http, caplog):
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "Manual Mutual Fund": Entry(kind=Kind.MANUAL),
        "JSON Mutual Fund": Entry(kind=Kind.JSON_API, endpoint_url="https://example.test/api"),
    })
    requests = mock_http({})
    with caplog.at_level(logging.WARNING):
        result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.amcs_not_onboarded == 1 and result.amcs_failed == 0
    assert requests == [] and "PORTFOLIO_DISCLOSURE_ALERT" not in caplog.text


def test_no_dated_file_raises_no_file_found_without_guessing(db_session, monkeypatch, mock_http, caplog):
    seed(db_session)
    with caplog.at_level(logging.WARNING):
        result, requests = run_refresh(db_session, monkeypatch, mock_http, {
            "https://example.test/list": httpx.Response(200, text='<a href="/portfolio-current.xls">September 2026</a>'),
        }, today=date(2026, 10, 10))
    assert result.amcs_failed == 1 and len(requests) == 1
    assert "reason=no_file_found" in caplog.text


def test_fetch_candidates_newest_first_with_http_failure_fallback():
    requests = []
    def handler(request):
        requests.append(request.url.path)
        return httpx.Response(404) if "Sep" in request.url.path else httpx.Response(200, content=workbook())
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._fetch_candidates(http, [
                ("https://example.test/portfolio-31-Aug-26.xls", "August"),
                ("https://example.test/portfolio-30-Sep-26.xls", "September"),
            ], keep_all=False)
    files = asyncio.run(run())
    assert requests == ["/portfolio-30-Sep-26.xls", "/portfolio-31-Aug-26.xls"]
    assert files[0].as_of_date == date(2026, 8, 31)


def test_download_rejects_oversized_stream_and_accepts_boundary(monkeypatch):
    monkeypatch.setattr(client, "_MAX_WORKBOOK_BYTES", 5)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(
                200, content=b"PK\x03\x0412" if r.url.path == "/big" else b"PK\x03\x041"))) as http:
            return (await client._download_workbook(http, "https://example.test/big"),
                    await client._download_workbook(http, "https://example.test/exact"))
    assert asyncio.run(run()) == (None, b"PK\x03\x041")


_CDX_HEADER = ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]


def cdx_rows(urls):
    return [_CDX_HEADER] + [["key", "20260910104807", u, "text/html", "200", "digest", "1"] for u in urls]


@pytest.mark.parametrize("rows,expected", [
    ([], []), ([_CDX_HEADER], []),
    (cdx_rows(["https://example.test/a", "https://example.test/b"]),
     ["https://example.test/a", "https://example.test/b"]),
])
def test_cdx_query_parameters_and_original_column(rows, expected):
    def handler(request):
        assert request.url.host == "web.archive.org"
        assert dict(request.url.params) == {
            "url": "https://example.test/uploads/", "output": "json", "matchType": "prefix",
            "filter": "statuscode:200", "collapse": "urlkey", "limit": "-50",
        }
        return httpx.Response(200, json=rows)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._cdx_query(http, "https://example.test/uploads/", match_type="prefix")
    assert asyncio.run(run()) == expected


def test_wayback_hdfc_capture_log_url_and_embedded_august_link():
    entry = AMC_DISCLOSURE_RESOLVERS["HDFC Mutual Fund"]
    assert entry.landing_url == "https://www.hdfcfund.com/statutory-disclosure/portfolio/monthly-portfolio"
    live = "https://files.hdfcfund.com/s3fs-public/2026-09/Monthly%20HDFC%20Flexi%20Cap%20Fund%20-%2031%20August%202026.xlsx"
    cached = r'<script>{\"url\":\"https:\/\/files.hdfcfund.com\/s3fs-public\/2026-09\/Monthly%20HDFC%20Flexi%20Cap%20Fund%20-%2031%20August%202026.xlsx\"}</script>'
    requests = []
    def handler(request):
        requests.append(str(request.url))
        if request.url.path == "/cdx/search/cdx":
            assert request.url.params["url"] == entry.landing_url
            assert request.url.params["matchType"] == "exact"
            return httpx.Response(200, json=cdx_rows([entry.landing_url]))
        if str(request.url) == f"https://web.archive.org/web/2id_/{entry.landing_url}":
            return httpx.Response(200, text=cached)
        assert str(request.url) == live
        return httpx.Response(200, content=workbook([("HDFCEQ", 100, 100)]))
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._locate_wayback(http, entry)
    files = asyncio.run(run())
    assert len(files) == 1 and files[0].source_url == live
    assert files[0].as_of_date == date(2026, 8, 31)
    assert len(requests) == 3  # no invented September direct-template fetch


def test_wayback_cached_page_rewrites_relative_path_to_live_cdn():
    entry = Entry(kind=Kind.WAYBACK_LOCATE, landing_url="https://blocked.test/list", cdn_domain="files.test")
    requests = []
    def handler(request):
        requests.append(str(request.url))
        if request.url.path == "/cdx/search/cdx":
            return httpx.Response(200, json=cdx_rows([entry.landing_url]))
        if request.url.host == "web.archive.org":
            return httpx.Response(200, text='<a href="/portfolio-30-Sep-26.xlsx">Example Equity Fund</a>')
        assert str(request.url) == "https://files.test/portfolio-30-Sep-26.xlsx"
        return httpx.Response(200, content=workbook())
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._locate_wayback(http, entry)
    files = asyncio.run(run())
    assert files[0].source_url == "https://files.test/portfolio-30-Sep-26.xlsx"
    assert files[0].scheme_hint == "Example Equity Fund"


def test_wayback_no_capture_does_not_fetch_cached_or_live_page():
    requests = []
    def handler(request):
        requests.append(str(request.url))
        assert request.url.path == "/cdx/search/cdx"
        return httpx.Response(200, json=[])
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._locate_wayback(http, AMC_DISCLOSURE_RESOLVERS["HDFC Mutual Fund"])
    assert asyncio.run(run()) == []
    assert len(requests) == 1


def test_wayback_canara_filters_unrelated_fortnightly_and_older_months():
    entry = AMC_DISCLOSURE_RESOLVERS["Canara Robeco Mutual Fund"]
    prefix = "https://www.canararobeco.com/wp-content/uploads/"
    new = prefix + "2026/10/SC-%E2%80%93-Canara-Robeco-Small-Cap-Fund-%E2%80%93-September-2026.xlsx"
    overnight = prefix + "2026/10/OF-Canara-Robeco-Overnight-Fund-September-2026.xlsx"
    old = prefix + "2026/09/SC-Canara-Robeco-Small-Cap-Fund-August-2026.xlsx"
    fortnightly = prefix + "2026/09/BP-%E2%80%93-Canara-Robeco-Banking-and-PSU-Debt-Fund-%E2%80%93-15th-September-2026.xlsx"
    unrelated = prefix + "2026/10/logo.png"
    requests = []
    def handler(request):
        requests.append(str(request.url))
        if request.url.path == "/cdx/search/cdx":
            assert request.url.params["matchType"] == "prefix"
            # limit=-50 can omit older months: discovery makes no completeness claim.
            assert request.url.params["limit"] == "-50"
            return httpx.Response(200, json=cdx_rows([old, unrelated, fortnightly, new, overnight]))
        assert str(request.url) in {new, overnight}
        return httpx.Response(200, content=workbook())
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._locate_wayback(http, entry)
    files = asyncio.run(run())
    assert {f.source_url for f in files} == {new, overnight}
    assert all(f.as_of_date == date(2026, 9, 30) for f in files)
    assert len(requests) == 3


def test_wayback_prefix_without_pattern_preserves_candidate_behavior():
    entry = Entry(kind=Kind.WAYBACK_LOCATE, landing_url="https://example.test/uploads/")
    url = "https://example.test/uploads/portfolio-30-Sep-26.xls"
    def handler(request):
        if request.url.host == "web.archive.org":
            return httpx.Response(200, json=cdx_rows([url]))
        assert str(request.url) == url
        return httpx.Response(200, content=workbook())
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._locate_wayback(http, entry)
    assert asyncio.run(run())[0].source_url == url


def test_one_amc_http_failure_does_not_stop_next(db_session, monkeypatch, mock_http, caplog):
    seed(db_session, amc="Bad Mutual Fund", base="Bad Equity Fund")
    seed(db_session)
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        "Bad Mutual Fund": Entry(kind=Kind.STATIC_REGEX, landing_url="https://example.test/bad", link_pattern="portfolio"),
        "Example Mutual Fund": static_entry(),
    })
    url = "https://example.test/portfolio-30-Sep-26.xls"
    mock_http({"https://example.test/bad": httpx.Response(500),
               "https://example.test/list": httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
               url: httpx.Response(200, content=workbook())})
    with caplog.at_level(logging.WARNING):
        result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.amcs_failed == 1 and result.amcs_processed == 1 and result.schemes_written == 1
    assert "amc=Bad Mutual Fund reason=error" in caplog.text
    assert db_session.query(DisclosureBatch).one().amc_name == "Example Mutual Fund"


def test_ambiguous_sheet_name_logged_unmatched_without_writing(db_session, monkeypatch, mock_http, caplog):
    seed(db_session, base="Example Equity Fund")
    seed(db_session, base="Example Equity Fund Series Two")
    url = "https://example.test/portfolio-30-Sep-26.xlsx"
    with caplog.at_level(logging.INFO):
        result, _ = run_refresh(db_session, monkeypatch, mock_http, {
            "https://example.test/list": httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
            url: httpx.Response(200, content=workbook([("Example Equity", 100, 100)])),
        })
    assert result.schemes_written == 0 and db_session.query(DisclosureBatch).count() == 0
    assert "unmatched" in caplog.text and "Example Equity" in caplog.text
    assert "reason=unmatched_scheme" in caplog.text  # Task 14 now alerts immediately.


def test_fuzzy_identity_veto_remains_unmatched_through_refresh(db_session, monkeypatch, mock_http, caplog):
    seed(db_session, base="ICICI Prudential Gold ETF FOF")
    url = "https://example.test/portfolio-30-Sep-26.xlsx"
    with caplog.at_level(logging.INFO):
        result, _ = run_refresh(db_session, monkeypatch, mock_http, {
            "https://example.test/list": httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
            url: httpx.Response(200, content=workbook([("ICICI Prudential Silver ETF FOF", 100, 100)])),
        })
    assert result.schemes_written == 0 and db_session.query(DisclosureBatch).count() == 0
    assert "unmatched" in caplog.text


def test_per_amc_commit_and_rollback_preserve_neighbors(db_session, monkeypatch, mock_http):
    amcs = ("First Mutual Fund", "Bad Mutual Fund", "Last Mutual Fund")
    for amc in amcs:
        seed(db_session, amc=amc)
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {
        amc: Entry(kind=Kind.STATIC_REGEX, landing_url=f"https://example.test/{index}/list", link_pattern="portfolio")
        for index, amc in enumerate(amcs)
    })
    routes = {}
    for index in range(3):
        url = f"https://example.test/{index}/portfolio-30-Sep-26.xls"
        routes[f"https://example.test/{index}/list"] = httpx.Response(200, text=f'<a href="{url}">Portfolio</a>')
        routes[url] = httpx.Response(200, content=workbook())
    mock_http(routes)
    real_write = client.write_disclosure_batch
    def failing_write(*args, **kwargs):
        count = real_write(*args, **kwargs)
        if args[3] == "Bad Mutual Fund":
            raise RuntimeError("Injected failure after rows were flushed")
        return count
    monkeypatch.setattr(client, "write_disclosure_batch", failing_write)
    result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    db_session.rollback()  # committed successes must survive an additional caller rollback
    assert result.amcs_processed == 2 and result.amcs_failed == 1 and result.schemes_written == 2
    assert {b.amc_name for b in db_session.query(DisclosureBatch)} == {amcs[0], amcs[2]}
    assert db_session.query(SchemeHolding).count() == 2


def test_wayback_dispatch_runs_through_refresh(db_session, monkeypatch, mock_http):
    seed(db_session)
    entry = Entry(kind=Kind.WAYBACK_LOCATE, landing_url="https://blocked.test/list", cdn_domain="files.test")
    def cdx_response(request):
        assert request.url.params["url"] == entry.landing_url
        return httpx.Response(200, json=cdx_rows([entry.landing_url]))
    real_client = httpx.AsyncClient
    def handler(request):
        if request.url.path == "/cdx/search/cdx":
            return cdx_response(request)
        if request.url.host == "web.archive.org":
            return httpx.Response(200, text='<a href="/portfolio-30-Sep-26.xlsx">Example Equity Fund</a>')
        assert str(request.url) == "https://files.test/portfolio-30-Sep-26.xlsx"
        return httpx.Response(200, content=workbook([("Sheet", 100, 100)]))
    monkeypatch.setattr(client.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {"Example Mutual Fund": entry})
    result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.schemes_written == 1
    assert db_session.query(DisclosureBatch).one().status is DisclosureBatchStatus.WRITTEN


def test_unreadable_standalone_workbook_is_amc_failure(db_session, monkeypatch, mock_http, caplog):
    seed(db_session)
    # The package sniffs as OOXML but the workbook XML cannot be parsed.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("[Content_Types].xml", b"invalid xml")
        archive.writestr("xl/workbook.xml", b"invalid xml")
    url = "https://example.test/portfolio-30-Sep-26.xlsx"
    with caplog.at_level(logging.WARNING):
        result, _ = run_refresh(db_session, monkeypatch, mock_http, {
            "https://example.test/list": httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
            url: httpx.Response(200, content=buf.getvalue()),
        })
    assert result.amcs_failed == 1 and result.amcs_processed == 0
    assert "amc=Example Mutual Fund reason=error" in caplog.text
    assert db_session.query(DisclosureBatch).count() == 0


def test_crc_bad_zip_member_does_not_stop_valid_peer(db_session, monkeypatch, mock_http, caplog):
    seed(db_session)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("bad.xlsx", b"unique corrupt workbook bytes")
        archive.writestr("valid.xls", workbook())
    data = buf.getvalue().replace(b"unique corrupt workbook bytes", b"UNIQUE corrupt workbook bytes")
    url = "https://example.test/portfolio-30-Sep-26.zip"
    with caplog.at_level(logging.WARNING):
        result, _ = run_refresh(db_session, monkeypatch, mock_http, {
            "https://example.test/list": httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
            url: httpx.Response(200, content=data),
        }, static_entry(Shape.ZIP_OF_WORKBOOKS))
    assert result.amcs_processed == 1 and result.schemes_written == 1
    assert db_session.query(DisclosureBatch).one().status is DisclosureBatchStatus.WRITTEN
    assert "amc=Example Mutual Fund reason=parse_error" in caplog.text
    assert "bad.xlsx" in caplog.text


def test_bad_zip_member_alert_names_amc_not_source_url(db_session, monkeypatch, mock_http, caplog):
    seed(db_session)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("bad.xlsx", b"invalid")
        archive.writestr("valid.xlsx", workbook())
    url = "https://example.test/portfolio-30-Sep-26.zip"
    with caplog.at_level(logging.WARNING):
        run_refresh(db_session, monkeypatch, mock_http, {
            "https://example.test/list": httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
            url: httpx.Response(200, content=buf.getvalue()),
        })
    assert "amc=Example Mutual Fund reason=parse_error" in caplog.text
    assert "amc=https://" not in caplog.text


@pytest.mark.parametrize("include_bad_member", [False, True])
def test_zip_without_readable_workbooks_is_amc_failure(db_session, monkeypatch, mock_http, include_bad_member):
    seed(db_session)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("readme.txt", b"no portfolio")
        if include_bad_member:
            archive.writestr("bad.xlsx", b"not a workbook")
    url = "https://example.test/portfolio-30-Sep-26.zip"
    result, _ = run_refresh(db_session, monkeypatch, mock_http, {
        "https://example.test/list": httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
        url: httpx.Response(200, content=buf.getvalue()),
    })
    assert result.amcs_failed == 1 and result.amcs_processed == 0
    assert db_session.query(DisclosureBatch).count() == 0


def test_canara_real_filename_hint_writes_code_named_fixture(db_session, monkeypatch):
    seed(db_session, amc="Canara Robeco Mutual Fund", base="Canara Robeco Small Cap Fund")
    entry = AMC_DISCLOSURE_RESOLVERS["Canara Robeco Mutual Fund"]
    url = "https://www.canararobeco.com/wp-content/uploads/2026/10/SC-%E2%80%93-Canara-Robeco-Small-Cap-Fund-%E2%80%93-September-2026.xlsx"
    fixture = Path(__file__).resolve().parents[2] / "fixtures/portfolio_disclosures/canara-robeco-small-cap_asof_2026-09-30.xlsx"
    data = fixture.read_bytes()
    real_client = httpx.AsyncClient
    def handler(request):
        if request.url.host == "web.archive.org":
            assert request.url.params["matchType"] == "prefix"
            return httpx.Response(200, json=cdx_rows([url]))
        assert str(request.url) == url
        return httpx.Response(200, content=data)
    monkeypatch.setattr(client.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {"Canara Robeco Mutual Fund": entry})
    result = asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.schemes_written == 1
    batch = db_session.query(DisclosureBatch).one()
    assert batch.status is DisclosureBatchStatus.WRITTEN
    assert batch.as_of_date == date(2026, 9, 30)
    assert batch.source_url == url and db_session.query(SchemeHolding).count() > 1


def locate_run3(amc, handler, monkeypatch, as_of=date(2026, 9, 30)):
    monkeypatch.setattr(client, "_latest_month_end", lambda: as_of)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                    headers=client._HEADERS, follow_redirects=True) as http:
            return await client._locate_and_fetch(http, AMC_DISCLOSURE_RESOLVERS[f"{amc} Mutual Fund"], [])
    return asyncio.run(run())


def assert_located(files, urls, hints=None, as_of=date(2026, 9, 30)):
    assert [f.source_url for f in files] == urls
    assert all(f.as_of_date == as_of and f.data == b"PK\x03\x04fixture" for f in files)
    if hints is not None:
        assert [f.scheme_hint for f in files] == hints


def test_run3_franklin_sitemap_and_title_date_not_reference_date(monkeypatch):
    # Capture log §12 Franklin: document[], contentGrouping/dctermsTitle/downloadUrl.
    url = "https://franklintempletonprod.widen.net/content/captured/original/Franklin_India_Long_Term_Fund_Sep_26_Monthly_Portfolio.xls?u=pl55mb&download=true"
    seen = []
    def handler(r):
        seen.append(str(r.url))
        if r.url.path == "/sitemap.xml":
            return httpx.Response(200, text='<urlset><url><loc>https://www.franklintempletonindia.com/fund-details/fund-overview/42352</loc></url><url><loc>https://www.franklintempletonindia.com/fund-details/fund-overview/42352/reports</loc></url></urlset>')
        if r.url.path == "/api/literature/v1/documents":
            assert r.method == "GET" and dict(r.url.params) == {"channel": "en-in", "cache": "true", "frkOneTISNumber": "42352"}
            return httpx.Response(200, json={"document": [
                {"contentGrouping": "Dis-Portfolio-Monthly", "dctermsTitle": "As on September 30, 2026 (Uploaded on October 08, 2026)", "frkReferenceDate": "2026-10-08", "downloadUrl": url},
                {"contentGrouping": "Dis-Portfolio-Fortnightly", "dctermsTitle": "As on September 30, 2026", "downloadUrl": "https://bad.test/fortnightly.xls"},
                {"contentGrouping": "Dis-Portfolio-Monthly", "dctermsTitle": "As on August 31, 2026", "frkReferenceDate": "2026-09-09", "downloadUrl": "https://bad.test/old.xls"},
            ]})
        assert str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("Franklin Templeton", handler, monkeypatch), [url], ["Franklin India Long Term Fund"])
    assert len(seen) == 3


@pytest.mark.parametrize("token_data", [{"token": "Bearer captured-token"}, "{'token': 'Bearer captured-token'}"])
def test_run3_axis_token_chain_and_misspelled_url_key(monkeypatch, token_data):
    # Capture log Axis: data string/dict, data.documentList[].docuementURL.
    url = "https://www.axismf.com/1/5/464/560/3622/4593/Monthly_Portfolio_30_09_2026_75011dd855.xlsx"
    def handler(r):
        if r.url.path == "/cms/token":
            assert r.method == "POST" and json.loads(r.content) == {}
            return httpx.Response(200, json={"status": "success", "statusCode": "0", "data": token_data})
        if r.url.path == "/cms/get-scheme-documents":
            assert r.headers["Authorization"] == "Bearer captured-token"
            assert json.loads(r.content) == {"sdType": "yearMonthSchemeDocs", "sdID": "sdMonthSchemePortfolio", "year": "2026", "month": "September", "schemeCode": "Consolidated"}
            return httpx.Response(200, json={"data": {"documentList": [
                {"documentName": "Weekly Debt Portfolio 30-09-2026", "docuementURL": "https://bad.test/weekly.xlsx"},
                {"documentName": "Monthly Portfolio 30-09-2026", "docuementURL": url, "documentPostedDate": "2026-10-09"},
            ]}})
        assert str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("Axis", handler, monkeypatch), [url], [None])


def test_run3_lic_consolidated_form_chain_returns_both_files(monkeypatch):
    # Capture log LIC consolidated route: option fragments; two equity/debt anchors.
    urls = ["https://www.licmf.com/assets/pdf/statuary_disclosure_new/21/LIC%20MF%20Monthly%20" + name + "%20Portfolio_Sep_26.xlsx" for name in ("Equity", "Debt")]
    def handler(r):
        body = dict(httpx.QueryParams(r.content.decode()))
        if r.url.path == "/downloads/consolidated-portfolio-filters":
            assert r.method == "POST" and r.headers["X-Requested-With"] == "XMLHttpRequest"
            assert r.headers["Content-Type"].startswith("application/x-www-form-urlencoded")
            if body == {"id": "639", "filter": "year"}:
                return httpx.Response(200, text="<option value='2026'>2026</option>")
            assert body == {"year": "2026", "id": "639", "filter": "month"}
            return httpx.Response(200, text="<option value='9'>September</option>")
        if r.url.path == "/downloads/consolidated-portfolio-files":
            assert body == {"id": "639", "month": "9", "year": "2026"}
            return httpx.Response(200, text='<a href="/assets/pdf/statuary_disclosure_new/21/LIC MF Monthly Equity Portfolio_Sep_26.xlsx">Monthly Portfolio Equity as on September 30, 2026</a><a href="/assets/pdf/statuary_disclosure_new/21/LIC MF Monthly Debt Portfolio_Sep_26.xlsx">Monthly Portfolio Debt as on September 30, 2026</a>')
        assert str(r.url) in urls
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("LIC", handler, monkeypatch), urls, [None, None])


def test_run3_sbi_html_fragment_prefers_all_schemes(monkeypatch):
    # Capture log SBI: GetSchemePortfolioSheets (without QS), HTML response.
    url = "https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-30th-september-2026.xlsx?sfvrsn=2a79126c_2"
    def handler(r):
        if r.url.path == "/ajaxcall/CMS/GetSchemePortfolioSheets":
            assert r.method == "POST" and r.headers["X-Requested-With"] == "XMLHttpRequest"
            assert json.loads(r.content) == {"FundId": "", "PSYear": "2026", "PSMonth": "September", "PSFrequency": "Monthly"}
            return httpx.Response(200, text=f'<table><a href="/docs/default-source/scheme-portfolios/sbi-balanced-advantage-fund-monthly-portfolio---september-2026.xlsx">Portfolio</a><a href="{url}">All Schemes Monthly Portfolio</a></table>')
        assert str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("SBI", handler, monkeypatch), [url], [None])


def test_run3_trust_title_dates_opaque_url_and_follows_apex_redirect(monkeypatch):
    # Capture log Trust: resultSetArray[].fileurl; filename is upload timestamp.
    apex = "https://trustmf.com/Content/2026/10/Monthly%20Port_20261009132916.xlsx"
    live = apex.replace("https://trustmf.com", "https://www.trustmf.com")
    def handler(r):
        if r.url.path == "/api/api/Trust/GetData":
            assert json.loads(r.content) == {"systemQueryFileName": "disclosuresweb.xml", "tagName": "GetDisclosureByType", "searchField": "", "searchValue": "", "sortField": "uploaddate", "sortDirection": "DESC", "replaceField": "_slug_", "replaceValue": "portfolio-monthly-disclosure"}
            return httpx.Response(200, json={"resultSetArray": [{"title": "TRUSTMF Monthly Portfolio Report as on 30.09.2026", "uploaddate": "10/9/2026 12:00:00 AM", "fileurl": apex.replace("%20", " ")}]})
        if str(r.url) == apex:
            return httpx.Response(307, headers={"Location": live})
        assert str(r.url) == live
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("Trust", handler, monkeypatch), [apex], [None])


def test_run3_mirae_title_scheme_hint_and_redirected_html_rejected(monkeypatch):
    # Capture log Mirae: Data[].URL/Title, DataCount, 302 soft-404.
    url = "https://www.miraeassetmf.co.in/docs/default-source/portfolios/mafcf_sept2026.xlsx"
    def handler(r):
        if r.url.path == "/AjaxService/GetDownloadsData":
            assert json.loads(r.content) == {"request": {"modulename": "portfolio_tab1", "pgno": 1, "pgsize": 200}}
            return httpx.Response(200, json={"Data": [
                {"Title": "Portfolio Details as on 30th September 2026 for Mirae Asset Flexi Cap Fund", "URL": "/docs/default-source/portfolios/mafcf_sept2026.xlsx"},
                {"Title": "Portfolio Details as on 30th September 2026 for Mirae Asset Missing Fund", "URL": "/docs/default-source/portfolios/missing_sept2026.xlsx"},
            ], "DataCount": 2})
        if "missing_" in r.url.path:
            return httpx.Response(302, headers={"Location": "/error?aspxerrorpath=missing"})
        if r.url.path == "/error":
            return httpx.Response(200, text="<html>Not found</html>")
        assert str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("Mirae Asset", handler, monkeypatch), [url], ["Mirae Asset Flexi Cap Fund"])


def test_run3_boi_case_sensitive_folder_and_nested_json_string(monkeypatch):
    # Capture log Bank of India: d is JSON text; Documents[].FolderUrl/DocName.
    url = "https://www.boimf.in/docs/default-source/investorcorner/monthly-portfolio/monthly-portfolio---30-sep-2026.xlsx?sfvrsn=8dbd0a0e_3"
    def handler(r):
        if r.url.path == "/AjaxService.asmx/GetDocuments":
            assert r.url.host == "www.boimf.in" and r.method == "POST"
            assert json.loads(r.content) == {"pagno": 0, "category": None, "fromDate": None, "toDate": None, "LibraryName": "InvestorCorner", "folderName": "MONTHLY PORTFOLIO", "CategoryValue": None}
            return httpx.Response(200, json={"d": json.dumps({"Documents": [{"DocName": "MONTHLY-PORTFOLIO - 30-SEP-2026", "FolderUrl": url}]})})
        assert str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("Bank of India", handler, monkeypatch), [url], [None])


@pytest.mark.parametrize("as_of,month_id,has_files", [(date(2026, 9, 30), "436", False), (date(2026, 3, 31), "435", True)])
def test_run3_taurus_select_ids_half_yearly_and_unpublished_september(monkeypatch, as_of, month_id, has_files):
    # Capture log Taurus: year 562, months 435/436; March href starts with space.
    url = "https://www.taurusmutualfund.com/sites/default/files/downloads/Taurus_Flexi_Cap_Fund_Half_Yearly_Portfolio_Report_Performance_March_2026.xlsx"
    def handler(r):
        if r.url.path == "/financials/portfolio":
            if not r.url.query:
                return httpx.Response(200, text='<select name="field_hy_portfolio_year_target_id"><option value="562">2026</option></select><select name="field_hy_portfolio_month_target_id"><option value="435">March</option><option value="436">September</option></select>')
            assert dict(r.url.params) == {"field_hy_portfolio_year_target_id": "562", "field_hy_portfolio_month_target_id": month_id}
            return httpx.Response(200, text=f'<a href=" /sites/default/files/downloads/Taurus_Flexi_Cap_Fund_Half_Yearly_Portfolio_Report_Performance_March_2026.xlsx">Portfolio</a>' if has_files else "<html>No file links</html>")
        assert str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    files = locate_run3("Taurus", handler, monkeypatch, as_of)
    if has_files:
        assert_located(files, [url], ["Taurus Flexi Cap Fund"], as_of)
    else:
        assert files == []


def test_run3_absl_captured_accordion_request_and_dead_host_rewrite(monkeypatch):
    # Capture log ABSL: AccordionList[].pdfUrl/ResourceLink; varying ZIP stems.
    dead = "https://abcscprod.azureedge.net/-/media/bsl/files/resources/monthly-portfolio/2026/30092026_abslmf_monthlydisclosure.zip"
    live = dead.replace("abcscprod.azureedge.net", "mutualfund.adityabirlacapital.com")
    def handler(r):
        if r.url.path.endswith("/FactsheetAccordionById"):
            assert r.method == "GET" and dict(r.url.params) == {"id": "3ccab227-9de5-4494-b78d-2b4f7c0c054a", "ctype": "/sitecore/content/Root/BSL/Library/Lists/FAQ/Customer Types/Individual", "month": " ", "year": "0"}
            return httpx.Response(200, json={"AccordionList": [{"ResourceLink": "Monthly Portfolios as on September 30, 2026", "IconClass": "zip", "pdfUrl": dead}]})
        assert str(r.url) == live
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("Aditya Birla Sun Life", handler, monkeypatch), [live], [None])


@pytest.mark.parametrize("as_of,fy,month", [(date(2026, 9, 30), "2026-2027", "September"), (date(2026, 1, 31), "2025-2026", "January")])
def test_run3_navi_nonce_header_category_and_financial_year(monkeypatch, as_of, fy, month):
    # Capture log Navi: navi_property rest_url/nonce; data[].title/url, form POST.
    title = f"Navi Flexi Cap Fund 1st &#8211; {as_of.day}th {month} {as_of.year}"
    url = f"https://public-assets.prod.navi-tech.in/navi-website-assests/documents/Navi_Flexi_Cap_Fund_1st_{as_of.day}th_{month}_{as_of.year}_20261009174229.xlsx"
    def handler(r):
        if r.url.path == "/mutual-fund/downloads/portfolio":
            return httpx.Response(200, text='<script>navi_property = {"ajaxurl":"/ajax","rest_url":"https://navi.com/wp-json/","nonce":"abc123","filter_nonce":"wrong"}</script>')
        if r.url.path == "/wp-json/nv/v1/documents":
            assert r.method == "POST" and r.headers["WP-NONCE"] == "abc123"
            assert dict(httpx.QueryParams(r.content.decode())) == {"financial_year": fy, "value": month, "category": "884", "type": "Monthly", "order": "DESC"}
            return httpx.Response(200, json={"success": True, "data": [{"title": title, "url": url}]})
        assert str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("Navi", handler, monkeypatch, as_of), [url], ["Navi Flexi Cap Fund"], as_of)


def test_run3_pgim_nested_tabs_and_report_date(monkeypatch):
    # Capture log PGIM: data[].content[].pdfPath/title/dateMonthYear/month/year.
    url = "https://www.pgimindia.com/api/v1/brochure/about-us/image/PGIM%20INDIA%20FLEXI%20CAP%20FUND%20Sep%202026.xlsx"
    def handler(r):
        if r.url.path == "/api/v1/brochure/published/disclosure":
            assert json.loads(r.content) == {"headerId": 2, "sectionId": "SECTION_747960037", "source": "W", "branchCode": None}
            return httpx.Response(200, json={"resultInfo": {}, "data": [{"tabName": "Equity", "content": [
                {"title": "PGIM INDIA FLEXI CAP FUND Sep 2026", "pdfPath": url.replace("%20", " "), "dateMonthYear": "30 September 2026", "month": "September", "year": "2026"},
                {"title": "PGIM INDIA FLEXI CAP FUND Aug 2026", "pdfPath": "https://bad.test/old.xlsx", "dateMonthYear": "31 August 2026", "month": "August", "year": "2026"},
            ]}]})
        assert str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("PGIM India", handler, monkeypatch), [url], ["PGIM INDIA FLEXI CAP FUND"])


def test_run3_whiteoak_strapi_paging_monthly_filter_and_project_ua(monkeypatch):
    # Capture log WhiteOak: data[].attributes.doc_file.data.attributes.url;
    # meta.pagination, published_date is upload date, not disclosure date.
    url = "https://content.whiteoakamc.com/WOC_Special_Opportunities_Fund_Sept_2026_e22c53bbd6.xlsx"
    def handler(r):
        assert r.headers["User-Agent"] == client._HEADERS["User-Agent"]
        if r.url.path == "/api/scheme-portfolios":
            p = dict(r.url.params)
            assert p == {"pagination[page]": p["pagination[page]"], "pagination[pageSize]": "100", "sort[0]": "published_date:desc", "sort[1]": "id:desc", "populate": "*"}
            attrs = {"scheme_name": "WhiteOak Capital Special Opportunities Fund", "period": "Monthly", "doc_name": "WhiteOak Capital Special Opportunities Fund Monthly Portfolio Disclosure - 30th September2026", "doc_link": None, "published_date": "2026-10-09", "doc_file": {"data": {"attributes": {"url": url}}}}
            if p["pagination[page]"] == "1":
                attrs = dict(attrs, period="Fortnightly")
            return httpx.Response(200, json={"data": [{"id": 1560, "attributes": attrs}], "meta": {"pagination": {"page": int(p["pagination[page]"]), "pageCount": 2, "pageSize": 100, "total": 2}}})
        assert str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("WhiteOak Capital", handler, monkeypatch), [url], ["WhiteOak Capital Special Opportunities Fund"])


@pytest.mark.parametrize("blocked", [False, True])
def test_run3_icici_complete_headers_json_gate_and_blob_path(monkeypatch, blocked):
    # Capture log ICICI: success.data.files[].title.text/url; F5 HTML gate.
    url = "https://www.icicipruamc.com/blob/downloads/Files/Monthly%20Portfolio%20Disclosures/2026/Sep/Monthly-Portfolio-Disclosure-September-2026.zip"
    def handler(r):
        if r.url.host == "apimf.icicipruamc.com":
            assert r.method == "POST" and r.url.path == "/nms/v1/downloads/files"
            assert r.headers["sourceurl"] == "DOWNLOADS" and r.headers["env"] == "api"
            uuid.UUID(r.headers["requestapiid"])
            assert r.headers["Origin"] == "https://www.icicipruamc.com"
            assert r.headers["Referer"].startswith("https://www.icicipruamc.com/media-center/downloads")
            assert "application/json" in r.headers["Accept"]
            assert json.loads(r.content) == {"categoryId": "26a073d7-08d2-4a95-95fa-f83a4ee51e40", "schemeCategory": "", "userType": "Investor", "fileType": "All", "page": "1", "size": "20", "filter": [], "categoryName": "OTHERS"}
            if blocked:
                return httpx.Response(200, text="<html>bobcmn /TSPD/ challenge</html>", headers={"Content-Type": "text/html"})
            return httpx.Response(200, json={"success": {"data": {"files": [{"title": {"text": "Monthly Portfolio Disclosure September 2026"}, "url": "/downloads/Files/Monthly Portfolio Disclosures/2026/Sep/Monthly-Portfolio-Disclosure-September-2026.zip"}], "isNext": False}}})
        assert not blocked and str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    if blocked:
        with pytest.raises(ValueError, match="BLOCKED.*JSON"):
            locate_run3("ICICI Prudential", handler, monkeypatch)
    else:
        assert_located(locate_run3("ICICI Prudential", handler, monkeypatch), [url], [None])


def test_run3_uti_exact_doc_zip_and_no_invented_scheme_hint(monkeypatch):
    # Capture log UTI: rows[0].doc; raw codes map only through an exact name source.
    url = "https://d3ce1o48hc5oli.cloudfront.net/static/generic-zip/Oct-26/FW__UTI_MF_SCHEME_PORTFOLIOS_-_30.09.2026_.zip"
    def handler(r):
        if r.url.path == "/api/get-consolidate-portfolio-disclosure":
            assert dict(r.url.params) == {"year": "2026", "month": "September"}
            return httpx.Response(200, json={"rows": [{"name": "Consolidated Portfolio September 2026", "type": "Zip", "doc": url, "url": url, "category": "Consolidate portfolio disclosure", "month": "September", "year": "2026"}]})
        assert str(r.url) == url
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("UTI", handler, monkeypatch), [url], [None])


@pytest.mark.parametrize("method", ["GET", "POST"])
def test_run3_generic_json_path_regex_placeholders_and_rewrite(method):
    entry = Entry(kind=Kind.JSON_API, endpoint_url="https://example.test/api", http_method=method,
                  request_params={"year": "{yyyy}", "month": "{mm}"}, request_body={"month": "{month_name}"},
                  response_json_path="data.files", documents=(r"Monthly Portfolio {month_name} {yyyy}",),
                  rewrite_host=("abcscprod.azureedge.net", "mutualfund.adityabirlacapital.com"))
    live = "https://mutualfund.adityabirlacapital.com/-/media/portfolio-30-Sep-26.zip"
    def handler(r):
        if r.url.path == "/api":
            assert r.method == method and dict(r.url.params) == {"year": "2026", "month": "09"}
            if method == "POST":
                assert json.loads(r.content) == {"month": "September"}
            return httpx.Response(200, json={"data": {"files": [
                {"name": "Monthly Portfolio September 2026", "url": live.replace("mutualfund.adityabirlacapital.com", "abcscprod.azureedge.net")},
                {"name": "Other Document September 2026", "url": "https://bad.test/notselected.zip"},
            ]}})
        assert str(r.url) == live
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._locate_json_api(http, entry, date(2026, 9, 30))
    assert_located(asyncio.run(run()), [live], [None])


@pytest.mark.parametrize("rows", [[], [{"name": "Portfolio", "url": "https://bad.test/current.zip"}]])
def test_run3_generic_empty_or_undated_response_has_no_download(rows):
    entry = Entry(kind=Kind.JSON_API, endpoint_url="https://example.test/api", response_json_path="data", documents=())
    def handler(r):
        assert r.url.path == "/api"
        return httpx.Response(200, json={"data": rows})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._locate_json_api(http, entry, date(2026, 9, 30))
    assert asyncio.run(run()) == []


@pytest.mark.parametrize("amc", ["Franklin Templeton", "Axis", "LIC", "SBI", "Trust", "Mirae Asset",
                                "Bank of India", "Taurus", "Aditya Birla Sun Life", "Navi", "PGIM India",
                                "WhiteOak Capital", "ICICI Prudential", "UTI"])
def test_run3_every_scoped_locator_empty_response_returns_no_files(monkeypatch, amc):
    # Same capture-log response containers, trimmed to no published documents.
    def handler(r):
        assert not client._WORKBOOK_URL.search(str(r.url)), "Empty response must not download a file"
        if r.url.path == "/sitemap.xml":
            return httpx.Response(200, text='<loc>https://www.franklintempletonindia.com/fund-details/fund-overview/42352</loc>')
        if r.url.path == "/cms/token":
            return httpx.Response(200, json={"data": {"token": "Bearer captured-token"}})
        if r.url.path == "/cms/get-scheme-documents":
            return httpx.Response(200, json={"data": {"documentList": []}})
        if amc in {"LIC", "SBI", "Taurus"}:
            return httpx.Response(200, text="<html></html>")
        if r.url.path == "/mutual-fund/downloads/portfolio":
            return httpx.Response(200, text='<script>navi_property={"rest_url":"https://navi.com/wp-json/","nonce":"abc123"}</script>')
        payloads = {
            "Franklin Templeton": {"document": []}, "Trust": {"resultSetArray": []},
            "Mirae Asset": {"Data": [], "DataCount": 0}, "Bank of India": {"d": '{"Documents":[]}'},
            "Aditya Birla Sun Life": {"AccordionList": []}, "Navi": {"success": True, "data": []},
            "PGIM India": {"data": []}, "WhiteOak Capital": {"data": [], "meta": {"pagination": {"pageCount": 1}}},
            "ICICI Prudential": {"success": {"data": {"files": [], "isNext": False}}}, "UTI": {"rows": []},
        }
        return httpx.Response(200, json=payloads[amc])
    assert locate_run3(amc, handler, monkeypatch) == []


def test_run3_mirae_paging_keeps_all_target_scheme_files(monkeypatch):
    # Capture log Mirae DataCount/pgno: two pages, older rows never downloaded.
    first = "https://www.miraeassetmf.co.in/docs/default-source/portfolios/mafcf_sept2026.xlsx"
    second = "https://www.miraeassetmf.co.in/docs/default-source/portfolios/macmf_sept2026.xlsx"
    def handler(r):
        if r.url.path == "/AjaxService/GetDownloadsData":
            page = json.loads(r.content)["request"]["pgno"]
            row = {"Title": "Portfolio Details as on 30th September 2026 for Mirae Asset Flexi Cap Fund", "URL": first}
            if page == 1:
                rows = [row] * 200
            else:
                assert page == 2
                rows = [{"Title": "Portfolio Details as on 30th September 2026 for Mirae Asset Liquid Fund", "URL": second}]
            return httpx.Response(200, json={"Data": rows, "DataCount": 201})
        assert str(r.url) in {first, second}
        return httpx.Response(200, content=b"PK\x03\x04fixture")
    assert_located(locate_run3("Mirae Asset", handler, monkeypatch), [first, second], ["Mirae Asset Flexi Cap Fund", "Mirae Asset Liquid Fund"])


def test_run3b_uti_exact_scheme_title_reaches_writer(db_session, monkeypatch, mock_http, caplog):
    # Capture log UTI: exact SCHEME: titles map each block independently.
    # Never assign every EXPOSURE block to one family.
    seed(db_session, amc="UTI Mutual Fund", base="UTI - Unit Linked Insurance Plan")
    fixture = Path(__file__).resolve().parents[2] / 'fixtures/portfolio_disclosures/uti-consolidated_asof_2026-09-30.zip'
    url = "https://d3ce1o48hc5oli.cloudfront.net/static/generic-zip/Oct-26/FW__UTI_MF_SCHEME_PORTFOLIOS_-_30.09.2026_.zip"
    api = "https://www.utimf.com/api/get-consolidate-portfolio-disclosure?year=2026&month=September"
    monkeypatch.setattr(client, "_latest_month_end", lambda: date(2026, 9, 30))
    with caplog.at_level(logging.INFO):
        result, _ = run_refresh(db_session, monkeypatch, mock_http, {
            api: httpx.Response(200, json={"rows": [{"name": "Consolidated Portfolio September 2026", "doc": url}]}),
            url: httpx.Response(200, content=fixture.read_bytes()),
        }, AMC_DISCLOSURE_RESOLVERS["UTI Mutual Fund"], amc="UTI Mutual Fund")
    assert result.amcs_processed == 1 and result.schemes_written == 1
    assert db_session.query(DisclosureBatch).one().amc_name == 'UTI Mutual Fund'
    assert "UTI - Unit Linked Insurance Plan" not in caplog.text


def test_run3_upload_only_title_is_not_a_disclosure_date():
    # Franklin explicitly distinguishes as-on from uploaded-on in dctermsTitle.
    assert client._disclosed_date("Monthly Portfolio (Uploaded on September 30, 2026)") is None


def test_run3_whiteoak_monthly_row_without_attached_file_is_skipped(monkeypatch):
    # Strapi nullable relations must not turn an unavailable file into today's data.
    def handler(r):
        assert r.url.path == "/api/scheme-portfolios"
        return httpx.Response(200, json={"data": [{"attributes": {"period": "Monthly", "scheme_name": "WhiteOak Capital Liquid Fund", "doc_name": "Monthly Portfolio Disclosure - 30th September2026", "doc_file": None}}], "meta": {"pagination": {"pageCount": 1}}})
    assert locate_run3("WhiteOak Capital", handler, monkeypatch) == []


@pytest.mark.parametrize('real_fixture', [False, True])
def test_run3b_index_name_translation_reaches_writer(db_session, monkeypatch, mock_http, real_fixture):
    if real_fixture:
        base, code = 'Bank Of India Liquid Fund', 'YB01'
        data = (Path(__file__).resolve().parents[2] / 'fixtures/portfolio_disclosures/bank-of-india_asof_2026-09-30.xlsx').read_bytes()
    else:
        base, code = 'Fund A', 'YB01'
        wb = openpyxl.load_workbook(io.BytesIO(workbook([(code, 100, 100)])))
        index = wb.create_sheet('Index', 0)
        index.append(['Scheme Code', 'Scheme Name']); index.append([code, base])
        buf = io.BytesIO(); wb.save(buf); wb.close(); data = buf.getvalue()
    scheme = seed(db_session, base=base)[0]
    if real_fixture:
        seed(db_session, base='Bank of India Value Fund')
    url = 'https://example.test/portfolio-30-Sep-26.xlsx'
    result, _ = run_refresh(db_session, monkeypatch, mock_http, {
        'https://example.test/list': httpx.Response(200, text=f'<a href="{url}">Portfolio</a>'),
        url: httpx.Response(200, content=data),
    })
    assert result.schemes_written == (2 if real_fixture else 1)
    assert db_session.query(DisclosureBatch).filter_by(scheme_id=scheme.id).one().status is DisclosureBatchStatus.WRITTEN


def rsc_page(value):
    # Reconstructed Next envelope; its leaf fields/values below come from the log.
    return '<script>self.__next_f.push([1,' + json.dumps(json.dumps(value)) + '])</script>'


@pytest.mark.parametrize('action', ['705bdd1994b82409c4f44c64a077cd477327752135', 'redeployed-action-id'])
def test_run3b_jio_discovers_deployed_action_and_prefers_all_schemes(monkeypatch, action):
    # Capture log Jio: real action/request/row fields. Substitutes: page-captured.js,
    # redeployed-action-id, and all-schemes CDN URL (opaque ID absent from log).
    url = 'https://cdnstorage-ddh3hqhvg3gyedd9.a02.azurefd.net/brcms/all-schemes-test.xlsx'
    per = 'https://cdnstorage-ddh3hqhvg3gyedd9.a02.azurefd.net/brcms/jioblackro-mv0kd9he-62d1e1.xlsx'
    def handler(r):
        if r.method == 'GET' and r.url.path.endswith('monthly-portfolio-disclosure'):
            return httpx.Response(200, text='<script src="/_next/static/chunks/app/statutory-disclosure/disclosures/page-captured.js"></script>')
        if r.url.path.endswith('page-captured.js'):
            return httpx.Response(200, text=f'(0,a.createServerReference)("{action}",a,null,"getDisclosureL3Data");')
        if r.method == 'POST':
            assert r.headers['Next-Action'] == action and r.headers['Accept'] == 'text/x-component'
            assert json.loads(r.content) == ['monthly-portfolio-disclosure', {'year':'FI2026-2027','month':'September','date':'$undefined'}, 'MF']
            return httpx.Response(200, text='0:{"a":"$@1"}\n1:'+json.dumps({'data':[
                {'title':'JioBlackRock Arbitrage Fund-Monthly-Portfolio-30-09-2026','file':{'url':per,'ext':'.xlsx'}},
                {'title':'JioBlackRock Mutual Fund-Monthly-Portfolio-30-09-2026','file':{'url':url,'ext':'.xlsx'}},
            ]}))
        assert str(r.url) == url
        return httpx.Response(200, content=b'PK\x03\x04fixture')
    assert_located(locate_run3('Jio BlackRock', handler, monkeypatch), [url], [None])


def test_run3b_quant_replays_three_page_methods_and_per_fund_hint(monkeypatch):
    # Capture log quant: literal pseudo-JSON bodies and d HTML. Month li envelope
    # reconstructed from the recorded ids 1..9; file links/labels are recorded.
    root = 'https://quantmutual.com'
    all_url = root+'/Admin/disclouser/Monthly_portfolio_sept_30092026.xlsx'
    per_url = root+'/Admin/disclouser/quant_Flexi_Cap_Fund_30_Sep_2026.xlsx'
    bodies = {'displaydisclouser': "{id:'2026',cat:'MONTHLY PORTFOLIO'}",
              'displaydisclouser1': "{id:'2026',cat:'MONTHLY PORTFOLIO - FUND - WISE'}",
              'displaydisclouser2': "{id:'9',cat:'MONTHLY PORTFOLIO - FUND - WISE',tab:'2026'}"}
    def handler(r):
        key = r.url.path.rsplit('/',1)[-1]
        if key in bodies:
            assert r.method == 'POST' and r.content.decode() == bodies[key]
            assert r.headers['Content-Type'].startswith('application/json')
            replies = {'displaydisclouser': "<ul><li>&#9658;<a href='/Admin/disclouser/Monthly_portfolio_sept_30092026.xlsx'>September 2026</a></li></ul>",
                       'displaydisclouser1': "<ul><li id='9'>September</li></ul>",
                       'displaydisclouser2': "<a href='/Admin/disclouser/quant_Flexi_Cap_Fund_30_Sep_2026.xlsx'>quant Flexi cap Fund</a>"}
            return httpx.Response(200, json={'d':replies[key]})
        assert str(r.url) in {all_url,per_url}
        return httpx.Response(200, content=b'PK\x03\x04fixture')
    assert_located(locate_run3('quant', handler, monkeypatch), [all_url,per_url], [None,'quant Flexi cap Fund'])


def test_run3b_abakkus_embedded_vertical_tree(monkeypatch):
    # Capture log Abakkus: exact vertical/items keys and recorded misspelled URL.
    url = 'https://www.abakkusmf.com/uploads/Final_Monthly_Portolio_Sep30_2026_fd59e57829.xlsx'
    payload = [{'title':'Monthly Portfolio Disclosures','sections':[{'subSections':[{'items':[
        {'title':'September 30, 2026','downloadUrl':None,'downloadMedia':{'url':url.replace('https://www.abakkusmf.com',''),'ext':'.xlsx'}},
        {'title':'Flexi Cap 15 Jan 2026','downloadMedia':{'url':'/uploads/old.xls'}},
    ]}]}]}]
    def handler(r):
        if r.url.path.endswith('statutory-disclosures.html'):
            return httpx.Response(200,text='<script id="verticals-data" type="application/json">'+json.dumps(payload)+'</script>')
        assert str(r.url) == url
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('Abakkus', handler, monkeypatch), [url], [None])


def test_run3b_zerodha_redirect_payload_and_exact_workbook_title(monkeypatch):
    # Capture log Zerodha: actual URL/name format; UUID replaced by uuid-test.
    url = 'https://assets.zerodhafundhouse.com/statutory-reports/portfolio-disclosures/ZARBI%20-%20Monthly%20Portfolio%20September%202026.xlsx'
    fixture = (Path(__file__).resolve().parents[2]/'fixtures/portfolio_disclosures/zerodha-arbitrage_asof_2026-09-30.xlsx').read_bytes()
    def handler(r):
        if r.url.path == '/resources/disclosures/':
            return httpx.Response(308, headers={'Location':'/resources/disclosures'})
        if r.url.path == '/resources/disclosures':
            return httpx.Response(200, text=rsc_page({'id':'uuid-test','name':'ZARBI - Monthly Portfolio September 2026','url':url.replace('%20',' '),'modTs':'2026-10-09T09:39:25Z'}))
        assert str(r.url) == url
        return httpx.Response(200,content=fixture)
    files=locate_run3('Zerodha',handler,monkeypatch)
    assert len(files)==1 and files[0].scheme_hint=='ZERODHA ARBITRAGE FUND'
    assert files[0].as_of_date==date(2026,9,30) and files[0].data==fixture


def test_run3b_unifi_uses_mp_links_not_notice_and_supports_xls(monkeypatch):
    # Capture log Unifi: real MP-Unifi stems; notice href placeholder is a negative control.
    root='https://unifimf.com/wp-content/uploads/fund-sheets/'
    urls=[root+'MP-Unifi-Flexi-Cap-Fund-30092026.xlsx',root+'MP-Unifi-Liquid-Fund-30092026.xls']
    def handler(r):
        if r.url.path=='/statutorydocuments/':
            return httpx.Response(200,text='<a href="/notice.pdf">September 2026</a>'+''.join(f'<a href="{u}">Download</a>' for u in urls)+'<a href="/FN-Unifi-Liquid-Fund-15092026.xls">Fortnightly</a>')
        assert str(r.url) in urls
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('Unifi',handler,monkeypatch),urls,['Unifi Flexi Cap Fund','Unifi Liquid Fund'])


def test_run3b_tata_escaped_fields_title_date_and_redirect(monkeypatch):
    # Capture log Tata: exact field names, title and beta CMS URL.
    url='https://betacms.tatamutualfund.com/system/files/2026-10/Monthly%20Portfolio%20as%20on%2030th%20September%202026.xlsx'
    live=url.replace('betacms.','www.')
    def handler(r):
        if r.url.path=='/schemes-related/portfolio':
            return httpx.Response(200,text=rsc_page({'field_document_title':'Portfolio as on 30th September, 2026','field_media_document':url}))
        if str(r.url)==url:
            return httpx.Response(302,headers={'Location':live})
        assert str(r.url)==live
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('Tata',handler,monkeypatch),[url],[None])


def test_run3b_sundaram_discovers_proxy_and_keeps_both_workbooks(monkeypatch):
    # Capture log Sundaram: recorded deploy hash and single-quoted HTML response.
    script='/ajax/Modules_Disclosure_Monthly_Fortnightly_Adhoc_Portfolios,App_Web_ni5waqhv.ashx'
    urls=['https://www.sundarammutual.com/uploaddir/MonthlyPortfolio/monthlyportfolio_'+stem+'.xlsx' for stem in ('091026155031','091026155117')]
    markup=''.join(f'<a href="{u}">Monthly Portfolio Disclosure {kind} - Sep 2026</a>' for u,kind in zip(urls,('Equity & Fund of Funds','Fixed Income')))
    def handler(r):
        if r.url.path=='/monthly-fortnightly-adhoc-portfolios':
            return httpx.Response(200,text=f'<script src="{script}"></script>')
        if r.url.path==script:
            assert r.method=='POST' and dict(r.url.params)=={'_method':'GetCategory','_session':'no'}
            assert r.content==b'Catid=Monthly' and r.headers['Content-Type']=='text/plain'
            return httpx.Response(200,text="'"+markup.replace("'",r"\'")+"'")
        assert str(r.url) in urls
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('Sundaram',handler,monkeypatch),urls,[None,None])


def test_run3b_bajaj_uses_own_nonce_and_financial_year(monkeypatch):
    # Capture log Bajaj: both literal nonce examples, options/HTML fields and URL.
    url='https://media.bajajamc.com/wp-content/uploads/2026/10/Bajaj-Finserv-Mutual-Fund_Monthly-Portfolio-as-on-30-Sep2026-1.xls'
    def handler(r):
        if r.url.path=='/downloads':
            return httpx.Response(200,text='<script>other={"nonce":"aaf0554ab8"};bajajDownloads={"ajaxUrl":"https://www.bajajamc.com/wp-admin/admin-ajax.php","nonce":"e0b28f6063"}</script>')
        if r.url.path=='/wp-admin/admin-ajax.php':
            body=dict(httpx.QueryParams(r.content.decode()))
            assert body['nonce']=='e0b28f6063' and body['section_id']=='757'
            if body['action']=='bajaj_get_filter_options':
                if body['filter_for']=='years':
                    return httpx.Response(200,json={'success':True,'data':{'options':[{'value':'2026-27'}]}})
                assert body['filter_for']=='months' and body['year']=='2026-27'
                return httpx.Response(200,json={'success':True,'data':{'options':[{'value':'September'}]}})
            assert body['action']=='bajaj_get_downloads' and body['year']=='2026-27' and body['month']=='September'
            return httpx.Response(200,json={'success':True,'data':{'html':f'<div class="bd-download-row"><span class="bd-download-title">Bajaj Finserv Mutual Fund_Monthly Portfolio as on 30 Sep 2026</span><a href="{url}">Download</a></div>','count':1}})
        assert str(r.url)==url
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('Bajaj Finserv',handler,monkeypatch),[url],[None])


def test_run3b_alphagrep_manifest_folder_case_and_soft404(monkeypatch):
    # Capture log AlphaGrep leaves, reconstructed root monthly container.
    url='https://www.alphagrepmf.ai/assets/documents/AlphaGrep_Flexi_Cap_Fund/monthly/FY-2026-27/September_2026.xls'
    def handler(r):
        if r.url.path=='/assets/documents/files.json':
            return httpx.Response(200,json={'monthly':[
                {'schemeName':'AlphaGrep Flexi Cap Fund','folderName':'AlphaGrep_Flexi_Cap_Fund','financialYears':[{'yearFolder':'FY-2026-27','documents':[{'title':'September Report','fileName':'September_2026'}]}]},
                {'schemeName':'AlphaGrep Liquid Omni Fof Fund','folderName':'AlphaGrep_Liquid_OMNI_Fund','financialYears':[{'yearFolder':'FY-2026-27','documents':[{'title':'September Report','fileName':'September_2026'}]}]},
            ]})
        if 'AlphaGrep_Liquid_OMNI_Fund' in r.url.path:
            return httpx.Response(200,text='<html>SPA shell</html>')
        assert str(r.url)==url
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('AlphaGrep',handler,monkeypatch),[url],['AlphaGrep Flexi Cap Fund'])


def test_run3b_wealth_pagination_dates_opaque_names_from_payload(monkeypatch):
    # Capture log Wealth: exact September record fields and two captured URLs.
    # records envelope and second-page metadata are reconstructed control values.
    urls=['https://www.wealthcompanyamc.in/uploads/Monthly_Portfolio_Flexi_Cap_0fd0dc18c8.xlsx','https://www.wealthcompanyamc.in/uploads/Monthly_Portfolio_Arbitrage_49f61aa67c.xlsx']
    def handler(r):
        if r.url.path.endswith('/monthly/'):
            page=int(r.url.params.get('page','1')); assert page in (1,2)
            label='Flexicap' if page==1 else 'Arbitrage'
            return httpx.Response(200,text=rsc_page({'records':[{'uploadDate':'2026-09-30','name':f'Monthly - The Wealth Company {label} Fund - Sep 30, 2026','attachment':{'url':urls[page-1].replace('https://www.wealthcompanyamc.in','')}}], 'pagination':{'page':page,'pageSize':25,'pageCount':2,'total':26}}))
        assert str(r.url) in urls
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('The Wealth Company',handler,monkeypatch),urls,['The Wealth Company Flexicap Fund','The Wealth Company Arbitrage Fund'])


def test_run3b_360_strict_monthly_pattern_excludes_other_documents(monkeypatch):
    # Capture log 360 ONE: captured S3 URL; negative document URLs are controls.
    url='https://s3.ap-south-1.amazonaws.com/x-web-s3.360.one/IN_MF_MONTHLY_PORTFOLIO_Sep2026_Final_fc91906e39.xls'
    def handler(r):
        if r.url.path=='/asset/mutual-funds/downloads/':
            return httpx.Response(200,text=rsc_page({'fileUrl':url,'other':['https://bad.test/Notice_Monthly_Portfolio_10_09_26.pdf','https://bad.test/MF_Portfolio_Overlap_Sep_2026_Monthly.xlsx','https://bad.test/360_ONE_MF_Half_yearly_portfolio_Sep_2026.xlsb']}))
        assert str(r.url)==url
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('360 ONE',handler,monkeypatch),[url],[None])


def test_run3b_motilal_sitemap_text_link_empty_page_and_workbook_name(monkeypatch):
    # Capture log Motilal: real page/link, missing-fund page slug is a control.
    root='https://www.motilaloswalmf.com'
    url=root+'/content/dam/motilal-mf/sheets/fund-csvs/Month_End_Portfolio_September_2026/YO58.xlsx'
    fixture=(Path(__file__).resolve().parents[2]/'fixtures/portfolio_disclosures/motilal-oswal-yo58_asof_2026-09-30.xlsx').read_bytes()
    def handler(r):
        if r.url.path=='/sitemap.xml':
            return httpx.Response(200,text='<urlset><loc>'+root+'/mutual-funds/motilal-oswal-digital-india-fund</loc><loc>'+root+'/mutual-funds/missing-fund</loc></urlset>')
        if r.url.path.startswith('/mutual-funds/'):
            path=url.replace(root,'') if 'digital-india' in r.url.path else ''
            return httpx.Response(200,text=f'<p><strong>Date As On:</strong> 30 Sep 2026</p><p><strong>portfolioUrl:</strong> {path}</p>')
        assert str(r.url)==url
        return httpx.Response(200,content=fixture)
    files=locate_run3('Motilal Oswal',handler,monkeypatch)
    assert len(files)==1 and files[0].source_url==url and files[0].data==fixture
    assert files[0].scheme_hint.upper()=='MOTILAL OSWAL DIGITAL INDIA FUND'


def test_run3b_choice_tree_only_published_month_end_overnight(monkeypatch):
    # Capture log Choice: real full URL/branch fields; tree envelope reconstructed.
    url='https://choicemf.com/api/document/ngCwkJfMCu/Choice-Mutual-Fund-Fortnightly-Portfolio-OV-30-Sep-2026.xlsx'
    def handler(r):
        if r.url.path=='/api/document-master-list':
            return httpx.Response(200,json={'body':[{'slug':'regulatory-compliance','children':[
                {'slug':'fortnight-portfolio','financial_years':[{'financial_year':'2026-27','files':[{'doc_name':'Choice Mutual Fund-Fortnightly Portfolio-OV-30 Sep 2026.xlsx','scheme_id':10,'scheme_name':'Choice Overnight Fund','frequency':'monthly','month':'September','open_file_url':url},
                    {'scheme_name':'Choice Overnight Fund','open_file_url':'https://bad.test/portfolio-15-Sep-2026.xlsx'}]}]},
                {'slug':'monthly-portfolio','financial_years':[{'files':[{'scheme_name':'Choice Gold ETF','open_file_url':'https://bad.test/portfolio-28-Feb-2026.xls'}]}]},
            ]}]})
        assert str(r.url)==url
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('Choice',handler,monkeypatch),[url],['Choice Overnight Fund'])


@pytest.mark.parametrize('amc',['Jio BlackRock','quant','Abakkus','Zerodha','Unifi','Tata','Sundaram','Bajaj Finserv','AlphaGrep','The Wealth Company','360 ONE','Motilal Oswal','Choice'])
def test_run3b_empty_payload_never_guesses_a_date(monkeypatch,amc):
    # Synthetic negative responses in the documented containers, no dates/files.
    def handler(r):
        assert not client._WORKBOOK_URL.search(str(r.url))
        if amc=='quant':
            return httpx.Response(200,json={'d':''})
        if amc=='AlphaGrep':
            return httpx.Response(200,json={'monthly':[]})
        if amc=='Choice':
            return httpx.Response(200,json={'body':[]})
        return httpx.Response(200,text='<html></html>')
    assert locate_run3(amc,handler,monkeypatch)==[]


def test_run3b_full_registry_has_zero_not_onboarded(db_session,monkeypatch,mock_http):
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',AMC_DISCLOSURE_RESOLVERS)
    requests=mock_http({})  # Empty scheme master: no provider request is needed.
    result=asyncio.run(client.refresh_portfolio_disclosures(db_session))
    assert result.amcs_not_onboarded==0 and requests==[]


def test_run3b_quantum_dates_opaque_uuid_from_its_own_anchor(monkeypatch):
    # Capture log Quantum: exact September UUID and same-anchor label.
    url='https://www.quantumamc.com/FileCDN/FactSheet/18650bf5-c7b8-47b1-a725-78a86416c1a5.xlsx'
    def handler(r):
        if r.url.path.startswith('/portfolio/combined/'):
            return httpx.Response(200,text=f'<a href="{url}">September 2026 - All Funds</a>')
        assert str(r.url)==url
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('Quantum',handler,monkeypatch),[url],[None])


def test_run3b_nj_dates_only_explicit_file_parameter_and_reads_title(monkeypatch):
    # Capture log NJ: exact September file query and source workbook title.
    url='https://downloads.njmutualfund.com/viewfile.php?file=NJ-MF-Monthly-Portfolio-NJFCP-September-2026-20261008113127.xlsx'
    fixture=(Path(__file__).resolve().parents[2]/'fixtures/portfolio_disclosures/nj-flexi-cap_asof_2026-09-30.xlsx').read_bytes()
    def handler(r):
        if r.url.path=='/njmf_download.php':
            return httpx.Response(200,text=f'<a href="{url}">Download</a><a href="/viewfile.php?date=30-Sep-2026">Other</a>')
        assert str(r.url)==url
        return httpx.Response(200,content=fixture)
    files=locate_run3('NJ',handler,monkeypatch)
    assert len(files)==1 and files[0].source_url==url and files[0].as_of_date==date(2026,9,30)
    assert files[0].scheme_hint=='NJ Flexi Cap Fund' and files[0].data==fixture


def test_run3b_alphagrep_excludes_nonmonthly_manifest_categories(monkeypatch):
    # Reconstructed mixed-category envelope; HalfYearly_September_2026 is a
    # synthetic negative file stem, not a reported real document.
    url='https://www.alphagrepmf.ai/assets/documents/AlphaGrep_Flexi_Cap_Fund/monthly/FY-2026-27/September_2026.xls'
    def record(filename):
        return {'schemeName':'AlphaGrep Flexi Cap Fund','folderName':'AlphaGrep_Flexi_Cap_Fund',
                'financialYears':[{'yearFolder':'FY-2026-27','documents':[{'fileName':filename}]}]}
    def handler(r):
        if r.url.path.endswith('files.json'):
            return httpx.Response(200,json={'monthly':[record('September_2026')],
                                          'halfyearly':[record('HalfYearly_September_2026')],
                                          'fortnightly':[record('Fortnightly_September_2026')]})
        assert str(r.url)==url
        return httpx.Response(200,content=b'PK\x03\x04fixture')
    assert_located(locate_run3('AlphaGrep',handler,monkeypatch),[url],['AlphaGrep Flexi Cap Fund'])


def test_html_served_under_a_workbook_name_is_not_a_file():
    # Mirae-style: HTTP 200 with an HTML error page under a .xlsx name (F18).
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(
                200, content=b"<html>Not found</html>"))) as http:
            return await client._download_workbook(http, "https://example.test/x.xlsx")
    assert asyncio.run(run()) is None


def test_wayback_prefix_search_ignores_dated_pdfs_and_images_that_would_win_on_date():
    entry = Entry(kind=Kind.WAYBACK_LOCATE, landing_url="https://www.example.test/wp-content/uploads/",
                  link_pattern=r"Example-Equity-Fund")
    xlsx = "https://www.example.test/wp-content/uploads/2026/10/Example-Equity-Fund-September-2026.xlsx"
    pdf = "https://www.example.test/wp-content/uploads/2026/10/Example-Equity-Fund-SID-October-2026.pdf"
    def handler(request):
        if request.url.host == "web.archive.org":
            return httpx.Response(200, json=cdx_rows([xlsx, pdf]))
        assert str(request.url) == xlsx  # the PDF must never be requested
        return httpx.Response(200, content=workbook())
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._locate_wayback(http, entry)
    assert [f.source_url for f in asyncio.run(run())] == [xlsx]


def test_empty_204_json_response_means_no_documents_not_an_error():
    # Franklin answers HTTP 204 with an empty body for funds that have no documents
    # (found live 2026-10-13: 6 of 52 funds); one such fund must not fail the whole AMC.
    req = httpx.Request("GET", "https://example.test/api")
    assert client._response_json(httpx.Response(204, headers={"Content-Type": "application/json"}, request=req)) == {}
    assert client._response_json(httpx.Response(200, headers={"Content-Type": "application/json"}, content=b"", request=req)) == {}
def test_run4_skip_before_download_late_file_and_transient_retry(db_session, monkeypatch, mock_http, caplog):
    seed(db_session,base='Example Equity Fund')
    seed(db_session,base='Example Debt Fund')
    a='https://example.test/portfolio-a-30-Sep-26.xlsx'
    b='https://example.test/portfolio-b-30-Sep-26.xlsx'
    routes={'https://example.test/list':httpx.Response(200,text=f'<a href="{a}">Example Equity Fund</a>'),
            a:httpx.Response(200,content=workbook([('Sheet',100,100)])),
            b:httpx.Response(503)}
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{'Example Mutual Fund':static_entry(Shape.MULTI_FILE_SINGLE_SCHEME)})
    requests=mock_http(routes)
    today=date(2026,10,3)
    first=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=today))
    second=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=today))
    assert first.schemes_written==1 and second.schemes_written==0 and requests.count(a)==1
    routes['https://example.test/list']=httpx.Response(200,text=f'<a href="{a}">Example Equity Fund</a><a href="{b}">Example Debt Fund</a>')
    failed=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=today))
    assert failed.amcs_failed==1 and 'reason=error' in caplog.text
    assert len([r for r in caplog.records if 'reason=error' in r.message])==1
    routes[b]=httpx.Response(200,content=workbook([('Sheet',100,100)]))
    repaired=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=today))
    assert repaired.schemes_written==1 and requests.count(a)==1 and requests.count(b)==2
    assert db_session.query(DisclosureBatch).filter_by(status=DisclosureBatchStatus.WRITTEN).count()==2


def test_run4_parse_and_release_before_next_download(db_session, monkeypatch, mock_http):
    import weakref
    import gc
    for name in ('Equity','Debt','Liquid'):
        seed(db_session,base=f'Example {name} Fund')
    urls=[f'https://example.test/portfolio-{name}-30-Sep-26.xlsx' for name in ('equity','debt','liquid')]
    live=[]
    original_parse=client.parse_workbook
    completed=[]
    def parse(data):
        result=original_parse(data)
        completed.append(1)
        return result
    monkeypatch.setattr(client,'parse_workbook',parse)
    def body(request):
        gc.collect()
        assert len(completed)==urls.index(str(request.url))
        assert all(ref() is None for ref in live), 'previous file retained at next GET'
        return httpx.Response(200,content=workbook([('Sheet',100,100)]))
    original_file=client.LocatedFile
    def tracked(*args,**kwargs):
        file=original_file(*args,**kwargs)
        if file.data:
            live.append(weakref.ref(file))
        return file
    monkeypatch.setattr(client,'LocatedFile',tracked)
    html=''.join(f'<a href="{url}">Example {name} Fund</a>' for url,name in zip(urls,('Equity','Debt','Liquid')))
    result,_=run_refresh(db_session,monkeypatch,mock_http,
        {'https://example.test/list':httpx.Response(200,text=html),**{url:body for url in urls}},
        static_entry(Shape.MULTI_FILE_SINGLE_SCHEME))
    assert result.schemes_written==3 and len(completed)==3


@pytest.mark.parametrize('day,due',[(3,False),(10,True),(15,False),(20,True)])
def test_run4_lateness_gated(db_session,monkeypatch,mock_http,caplog,day,due):
    seed(db_session)
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{'Example Mutual Fund':static_entry()})
    mock_http({'https://example.test/list':httpx.Response(200,text='none')})
    asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,day)))
    assert ('reason=no_file_found' in caplog.text) is due


def test_run4_hint_first_holdings_sheet_and_failed_sum_alert(db_session,monkeypatch,mock_http,caplog):
    seed(db_session)
    url='https://example.test/portfolio-30-Sep-26.xlsx'
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{'Example Mutual Fund':static_entry(Shape.MULTI_FILE_SINGLE_SCHEME)})
    mock_http({'https://example.test/list':httpx.Response(200,text=f'<a href="{url}">Example Equity Fund</a>'),
               url:httpx.Response(200,content=workbook([('First',100,100),('Second',20,20)]))})
    result=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3)))
    assert result.schemes_written==1
    assert db_session.query(DisclosureBatch).one().status is DisclosureBatchStatus.WRITTEN
    assert db_session.query(SchemeHolding).one().pct_to_nav==Decimal(100)


def test_run4_unmatched_aggregated_and_zero_summary(db_session,monkeypatch,mock_http,caplog):
    seed(db_session)
    entry=static_entry()
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{'Example Mutual Fund':entry,'ITI Mutual Fund':AMC_DISCLOSURE_RESOLVERS['ITI Mutual Fund']})
    seed(db_session,amc='ITI Mutual Fund',base='ITI Liquid Fund')
    url='https://example.test/portfolio-30-Sep-26.xlsx'
    mock_http({'https://example.test/list':httpx.Response(200,text=f'<a href="{url}">all</a>'),
        url:httpx.Response(200,content=workbook([(f'Unknown {i}',100,100) for i in range(7)]))})
    asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3)))
    alerts=[r.message for r in caplog.records if 'reason=unmatched_scheme' in r.message]
    assert len(alerts)==1 and 'Unknown 4' in alerts[0] and 'Unknown 5' not in alerts[0]
    assert client.monthly_zero_batch_summary(db_session,date(2026,10,3))==['Example Mutual Fund','ITI Mutual Fund']


def test_run4_single_fallback_alert_and_failed_archive(db_session,monkeypatch,mock_http,caplog):
    seed(db_session)
    old='https://example.test/portfolio-31-Aug-26.xlsx'
    new='https://example.test/portfolio-30-Sep-26.xlsx'
    archived=[]
    monkeypatch.setattr(client,'archive_failed_file',lambda *args: archived.append(args) or 's3://test/failed.xls',raising=False)
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{'Example Mutual Fund':static_entry()})
    mock_http({'https://example.test/list':httpx.Response(200,text=f'<a href="{new}">new</a><a href="{old}">old</a>'),
               new:httpx.Response(503),old:httpx.Response(200,content=workbook([('Example Equity Fund',50,50)]))})
    asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3)))
    assert 'reason=stale_fallback' in caplog.text and 'reason=failed_sum_check' in caplog.text
    assert len(archived)==1
    batch=db_session.query(DisclosureBatch).one()
    assert batch.status is DisclosureBatchStatus.FAILED and batch.raw_file_reference=='s3://test/failed.xls'
@pytest.mark.parametrize('day,due',[(3,False),(10,True),(20,True)])
def test_run4_stale_wayback_and_manual_pending_gated(db_session,monkeypatch,mock_http,caplog,day,due):
    seed(db_session)
    seed(db_session,amc='ITI Mutual Fund',base='ITI Liquid Fund')
    manual_scheme=db_session.query(Scheme).filter_by(amc_name='ITI Mutual Fund').one()
    db_session.add(DisclosureBatch(scheme_id=manual_scheme.id,amc_name='ITI Mutual Fund',
        as_of_date=date(2026,9,30),status=DisclosureBatchStatus.AWAITING_MANUAL_UPLOAD))
    db_session.commit()
    entry=Entry(kind=Kind.WAYBACK_LOCATE,landing_url='https://example.test/portfolio-')
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{'Example Mutual Fund':entry,'ITI Mutual Fund':AMC_DISCLOSURE_RESOLVERS['ITI Mutual Fund']})
    old='https://example.test/portfolio-31-Aug-26.xlsx'
    cdx='https://web.archive.org/cdx/search/cdx?url=https%3A%2F%2Fexample.test%2Fportfolio-&output=json&matchType=prefix&filter=statuscode%3A200&collapse=urlkey&limit=-50'
    mock_http({cdx:httpx.Response(200,json=[['original'],[old]]),old:httpx.Response(200,content=workbook())})
    asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,day)))
    assert ('reason=stale_wayback_capture' in caplog.text) is due
    assert ('reason=manual_upload_pending' in caplog.text) is due


def test_run4_stray_later_date_does_not_discard_target_month(db_session,monkeypatch,mock_http):
    seed(db_session)
    current='https://example.test/portfolio-30-Sep-26.xlsx'
    stray='https://example.test/portfolio-31-Oct-26.xlsx'
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{'Example Mutual Fund':static_entry(Shape.MULTI_FILE_SINGLE_SCHEME)})
    requests=mock_http({'https://example.test/list':httpx.Response(200,text=f'<a href="{stray}">Wrong</a><a href="{current}">Example Equity Fund</a>'),
                       current:httpx.Response(200,content=workbook())})
    asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3)))
    assert stray not in requests and requests.count(current)==1
    assert db_session.query(DisclosureBatch).one().as_of_date==date(2026,9,30)
def test_run4_title_reader_failure_does_not_hide_other_file(db_session,monkeypatch,mock_http,caplog):
    seed(db_session,amc='NJ Mutual Fund',base='NJ Flexi Cap Fund')
    entry=AMC_DISCLOSURE_RESOLVERS['NJ Mutual Fund']
    a='https://example.test/a.xlsx'
    b='https://example.test/b.xlsx'
    async def discover(http,entry,rows):
        assert client._DISCOVERY_ONLY.get()
        return [client.LocatedFile(None,a,date(2026,9,30)),client.LocatedFile(None,b,date(2026,9,30),'NJ Flexi Cap Fund')]
    monkeypatch.setitem(client._CUSTOM_LOCATORS,'nj',discover)
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{'NJ Mutual Fund':entry})
    good=workbook([('NJ Flexi Cap Fund',100,100)])
    bad=io.BytesIO()
    with zipfile.ZipFile(bad,'w') as archive:
        archive.writestr('[Content_Types].xml',b'invalid xml')
        archive.writestr('xl/workbook.xml',b'invalid xml')
    mock_http({a:httpx.Response(200,content=bad.getvalue()),b:httpx.Response(200,content=good)})
    result=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3)))
    assert result.schemes_written==1 and result.amcs_failed==1
    assert db_session.query(DisclosureBatch).one().source_url==b


def test_run4_zip_members_parsed_before_next_extraction(db_session,monkeypatch,mock_http):
    seed(db_session)
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w') as archive:
        for i in range(3):
            archive.writestr(f'member{i}.xlsx',workbook())
    completed=[]
    real_parse=client.parse_workbook
    def parse(data):
        result=real_parse(data)
        completed.append(1)
        return result
    real_read=zipfile.ZipFile.read
    def read(archive,name,*args,**kwargs):
        if isinstance(name,str) and name.startswith('member'):
            assert len(completed)==int(name[6]), 'eagerly extracted a later member'
        return real_read(archive,name,*args,**kwargs)
    monkeypatch.setattr(client,'parse_workbook',parse)
    monkeypatch.setattr(zipfile.ZipFile,'read',read)
    url='https://example.test/portfolio-30-Sep-26.zip'
    result,_=run_refresh(db_session,monkeypatch,mock_http,{
        'https://example.test/list':httpx.Response(200,text=f'<a href="{url}">all</a>'),
        url:httpx.Response(200,content=buf.getvalue())},static_entry(Shape.ZIP_OF_WORKBOOKS))
    assert result.schemes_written==3 and len(completed)==3
def test_run4_parse_error_archives_once_written_peer_has_no_reference(db_session,monkeypatch,mock_http):
    seed(db_session)
    bundle=io.BytesIO()
    with zipfile.ZipFile(bundle,'w') as archive:
        archive.writestr('bad.xlsx',b'not a workbook')
        archive.writestr('good.xls',workbook())
    calls=[]
    monkeypatch.setattr(client,'archive_failed_file',lambda *args: calls.append(args) or 's3://test/failed.zip')
    url='https://example.test/portfolio-30-Sep-26.zip'
    result,_=run_refresh(db_session,monkeypatch,mock_http,{
        'https://example.test/list':httpx.Response(200,text=f'<a href="{url}">all</a>'),
        url:httpx.Response(200,content=bundle.getvalue())},static_entry(Shape.ZIP_OF_WORKBOOKS))
    assert result.schemes_written==1 and len(calls)==1
    batch=db_session.query(DisclosureBatch).one()
    assert batch.status is DisclosureBatchStatus.WRITTEN and batch.raw_file_reference is None
@pytest.mark.parametrize('label',[ 'Download','View','September 2026','September','2026','...','30-Sep-2026','Sep 30,2026'])
def test_run4b_unusable_hint_absent(label):
    assert client._usable_hint(label) is None


@pytest.mark.parametrize('filename,expected',[
    ('Monthly%20Portfolio-%20Sep%2030%202026.xlsx',date(2026,9,30)),
    ('June 30, 2026.xlsx',date(2026,6,30)),('May 31,2026.xlsx',date(2026,5,31)),
    ('July 31 2026.xlsx',date(2026,7,31)),('February 30 2026.xlsx',None),
])
def test_run4b_month_first_filename(filename,expected):
    assert client._filename_as_of_date('https://example.test/'+filename)==expected


def test_run4b_real_fixtures_match_cached_master(db_session):
    from app.services.analytics.scheme_master import refresh_scheme_master
    from app.services.analytics.amfi_factsheet_client import build_families
    text=(Path(__file__).parents[3]/'.cache/amfi_navall/nav_all.txt').read_text(encoding='utf-8')
    asyncio.run(refresh_scheme_master(db_session,text=text))
    cases=[
        ('Nippon India Mutual Fund','nippon-india_asof_2026-09-30.xls','GF','Nippon India Growth Mid Cap Fund'),
        ('PPFAS Mutual Fund','ppfas_asof_2026-09-30.xls','PPFCF','Parag Parikh Flexi Cap Fund'),
        ('quant Mutual Fund','quant-all-schemes_asof_2026-09-30.xlsx','qMES','quant Equity Savings Fund'),
        ('Bajaj Finserv Mutual Fund','bajaj-finserv_asof_2026-09-30.xls','BFARB','Bajaj Finserv Arbitrage Fund'),
        ('Bajaj Finserv Mutual Fund','bajaj-finserv_asof_2026-09-30.xls','BFBPSU','Bajaj Finserv Banking and PSU Debt Fund'),
        ('Bajaj Finserv Mutual Fund','bajaj-finserv_asof_2026-09-30.xls','BFELSS','Bajaj Finserv ELSS - Tax Saver Fund'),
        ('Bajaj Finserv Mutual Fund','bajaj-finserv_asof_2026-09-30.xls','BFLMC','Bajaj Finserv Large & Mid Cap Fund'),
        ('Bajaj Finserv Mutual Fund','bajaj-finserv_asof_2026-09-30.xls','BFLOWD','Bajaj Finserv Ultra Short to Short Term Fund'),
        ('Trust Mutual Fund','trust_asof_2026-09-30-trimmed.xlsx','TMFLIQ','TRUSTMF Liquid Fund'),
        ('Helios Mutual Fund','helios-flexi-cap_asof_2026-09-30.xls','HFCF','Helios Flexi Cap Fund'),
        ('Samco Mutual Fund','samco-arbitrage_asof_2026-09-30.xlsx',None,'Samco Arbitrage Fund'),
        ('Zerodha Mutual Fund','zerodha-arbitrage_asof_2026-09-30.xlsx',None,'Zerodha Arbitrage Fund'),
        ('Angel One Mutual Fund','angel-one-nifty-50-etf_asof_2026-09-30.xlsx',None,'Angel One Nifty 50 ETF'),
        ('Old Bridge Mutual Fund','old-bridge-arbitrage_asof_2026-09-30.xlsx',None,'Old Bridge Arbitrage Fund'),
        ('Capitalmind Mutual Fund','capitalmind-arbitrage_asof_2026-09-30.xlsx',None,'Capitalmind Arbitrage Fund'),
        ('360 ONE Mutual Fund','360-one_asof_2026-09-30.xls','Liquid Fund','360 ONE Liquid Fund'),
    ]
    for amc,filename,code,expected in cases:
        data=(Path(__file__).parents[2]/'fixtures/portfolio_disclosures'/filename).read_bytes()
        sheet=next(s for s in client.parse_workbook(data) if code is None or s.sheet_name==code)
        families=build_families(db_session.query(Scheme).filter_by(amc_name=amc).all())
        file=client.LocatedFile(data,'https://example.test/file.xlsx',date(2026,9,30),'Download')
        match=client._match_sheet(sheet,file,file.source_url,client.read_index_sheet(data),families,amc)
        assert match is not None, (filename,sheet.sheet_name)
        assert match[0].base_name.lower()==expected.lower(), (filename,match[0])
    union=build_families(db_session.query(Scheme).filter_by(amc_name='Union Mutual Fund').all())
    from app.services.analytics.portfolio_disclosure_parsing import ParsedSheet
    # Existing shortened-name veto sees both Gold ETF and Gold ETF Fund of Fund.
    assert client._match_sheet(ParsedSheet('CODE',[],None),
        client.LocatedFile(None,'https://example.test/x.xlsx',date(2026,9,30),'Union Gold ETF'),
        'https://example.test/x.xlsx',{},union,'Union Mutual Fund') is None
    nippon=build_families(db_session.query(Scheme).filter_by(amc_name='Nippon India Mutual Fund').all())
    # Quarterly Series 2 cannot be silently assigned to Interval Fund V Series 2.
    ambiguous=ParsedSheet('K5',[],None,title_candidates=('Nippon India Quarterly Interval Fund-Series 2',))
    file=client.LocatedFile(None,'https://example.test/x.xlsx',date(2026,9,30))
    assert client._match_sheet(ambiguous,file,file.source_url,{},nippon,'Nippon India Mutual Fund') is None


def test_run4b_zip_member_hint_and_bad_hint_allow_all_sheets(db_session,monkeypatch,mock_http):
    seed(db_session,base='Example Equity Fund')
    seed(db_session,base='Example Debt Fund')
    bundle=io.BytesIO()
    with zipfile.ZipFile(bundle,'w') as archive:
        archive.writestr('Example Equity Fund.xlsx',workbook([('CODE1',100,100)]))
        archive.writestr('Example Debt Fund.xlsx',workbook([('CODE2',100,100)]))
    result,_=run_refresh(db_session,monkeypatch,mock_http,{
        'https://example.test/list':httpx.Response(200,text='<a href="/portfolio-30-Sep-26.zip">Download</a>'),
        'https://example.test/portfolio-30-Sep-26.zip':httpx.Response(200,content=bundle.getvalue())},static_entry(Shape.MULTI_FILE_SINGLE_SCHEME))
    assert result.schemes_written==2
    assert db_session.query(DisclosureBatch).filter_by(status=DisclosureBatchStatus.WRITTEN).count()==2


def test_run4b_samco_relative_preferred_and_404_variant_fallback(db_session,monkeypatch,mock_http):
    amc='Samco Mutual Fund'
    seed(db_session,amc=amc,base='Samco Arbitrage Fund')
    entry=AMC_DISCLOSURE_RESOLVERS[amc]
    name='IN_MF_MONTHLY_PORTFOLIO_September_2026_Arbitrage.xlsx'
    relative='https://www.samcomf.com/amc-document-download/'+name
    absolute='https://media1.samco.in/'+name
    routes={entry.landing_url:httpx.Response(200,text=f'<a href="{absolute} ">Download</a><a href="/amc-document-download/{name}">Download</a>'),
            relative:httpx.Response(404),absolute:httpx.Response(200,content=workbook([('Samco Arbitrage Fund',100,100)]))}
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{amc:entry})
    requests=mock_http(routes)
    result=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3)))
    assert result.schemes_written==1 and requests[1:]==[relative,absolute]
    requests.clear()
    assert asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,4))).schemes_written==0
    assert requests==[entry.landing_url]  # persisted alternate skips the entire file group
    routes[relative]=httpx.Response(200,content=workbook([('Samco Arbitrage Fund',100,100)]))
    db_session.query(SchemeHolding).delete();db_session.query(DisclosureBatch).delete();db_session.commit()
    requests.clear()
    asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3)))
    assert requests[1:]==[relative]
    db_session.query(SchemeHolding).delete();db_session.query(DisclosureBatch).delete();db_session.commit()
    routes[relative]=httpx.Response(500)
    requests.clear()
    assert asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3))).amcs_failed==1
    assert requests[1:]==[relative]  # alternatives are tried only on 404


def test_run4b_union_missing_slugs_quiet_but_whole_amc_missing_gated(db_session,monkeypatch,mock_http,caplog):
    amc='Union Mutual Fund'
    seed(db_session,amc=amc,base='Union Flexi Cap Fund')
    seed(db_session,amc=amc,base='Union Fixed Maturity Plan')
    entry=AMC_DISCLOSURE_RESOLVERS[amc]
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{amc:entry})
    state={'available':True}
    def response(request):
        if state['available'] and 'union-flexi-cap' in str(request.url): return httpx.Response(200,content=workbook([('Union Flexi Cap Fund',100,100)]))
        return httpx.Response(500)
    real=httpx.AsyncClient
    monkeypatch.setattr(client.httpx,'AsyncClient',lambda **kw:real(transport=httpx.MockTransport(response),**kw))
    result=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3)))
    assert result.amcs_processed==1 and result.amcs_failed==0 and 'reason=error' not in caplog.text
    db_session.query(SchemeHolding).delete();db_session.query(DisclosureBatch).delete();db_session.commit()
    state['available']=False
    caplog.clear()
    result=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3)))
    assert result.amcs_failed==1 and not caplog.text
    asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,10)))
    assert 'reason=no_file_found' in caplog.text and 'reason=error' not in caplog.text


def test_run4b_filename_fallback_preserves_scheme_identity(db_session):
    from app.services.analytics.amfi_factsheet_client import build_families
    from app.services.analytics.portfolio_disclosure_parsing import ParsedSheet
    rows=seed(db_session,base='Example Nifty 50 Index Fund')
    rows+=seed(db_session,base='Example Nifty Next 50 Index Fund')
    file=client.LocatedFile(None,'https://example.test/Example-Nifty-50-Index-Fund-monthly-portfolio-30-Sep-2026.xlsx',date(2026,9,30),'Download')
    match=client._match_sheet(ParsedSheet('CODE',[],None),file,file.source_url,{},build_families(rows),'Example Mutual Fund')
    assert match and match[0].base_name=='Example Nifty 50 Index Fund'


@pytest.mark.parametrize('statuses,expected', [([429,503,200],True),([429,503,503],False)])
def test_run4b_wayback_bounded_backoff(monkeypatch,statuses,expected):
    attempts=[];delays=[]
    async def sleep(seconds): delays.append(seconds)
    monkeypatch.setattr(client.asyncio,'sleep',sleep,raising=False)
    def handler(request):
        status=statuses[len(attempts)];attempts.append(status)
        return httpx.Response(status,json=cdx_rows(['https://example.test/page']) if status==200 else None)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await client._cdx_query(http,'https://example.test/page')
    if expected:
        assert asyncio.run(run())==['https://example.test/page']
    else:
        with pytest.raises(ValueError,match='BLOCKED.*3'):
            asyncio.run(run())
    assert len(attempts)==3 and delays==[1,2]


def test_run4b_absl_503_retried_next_run_not_done(db_session,monkeypatch,mock_http,caplog):
    amc='Aditya Birla Sun Life Mutual Fund'
    seed(db_session,amc=amc,base='Aditya Birla Sun Life Flexi Cap Fund')
    entry=AMC_DISCLOSURE_RESOLVERS[amc]
    url='https://mutualfund.adityabirlacapital.com/30092026_abslmf_monthlydisclosure.zip'
    bundle=io.BytesIO()
    with zipfile.ZipFile(bundle,'w') as archive:
        archive.writestr('Aditya Birla Sun Life Flexi Cap Fund.xls',workbook([('CODE',100,100)]))
    calls=[];attempts=[]
    def handler(request):
        calls.append(str(request.url))
        if request.url.path.endswith('/FactsheetAccordionById'):
            return httpx.Response(200,json={'AccordionList':[{'ResourceLink':'Monthly Portfolios as on September 30, 2026','IconClass':'zip','pdfUrl':url}]})
        assert str(request.url)==url
        attempts.append(1)
        return httpx.Response(503) if len(attempts)==1 else httpx.Response(200,content=bundle.getvalue())
    real=httpx.AsyncClient
    monkeypatch.setattr(client.httpx,'AsyncClient',lambda **kw:real(transport=httpx.MockTransport(handler),**kw))
    monkeypatch.setattr(client,'AMC_DISCLOSURE_RESOLVERS',{amc:entry})
    first=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,3)))
    assert first.amcs_failed==1 and db_session.query(DisclosureBatch).count()==0
    assert len([r for r in caplog.records if 'reason=error' in r.message])==1
    second=asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,4)))
    assert second.schemes_written==1 and len(attempts)==2
    asyncio.run(client.refresh_portfolio_disclosures(db_session,today=date(2026,10,5)))
    assert len(attempts)==2


@pytest.mark.parametrize("url,expected", [
    ("https://x.test/monthend-portfolio-february-28-2026.zip", date(2026, 2, 28)),
    ("https://x.test/monthend-portfolio-january-31-2026.zip", date(2026, 1, 31)),
    ("https://x.test/monthend-portfolio-december-31-2025.zip", date(2025, 12, 31)),
    ("https://x.test/monthend-portfolio-31march2026.zip", date(2026, 3, 31)),
    ("https://x.test/monthend-portfolios_30-april-2026.zip", date(2026, 4, 30)),
])
def test_month_name_day_year_with_hyphens_is_not_read_as_a_two_digit_year(url, expected):
    # DSP live 2026-10-14: "february-28-2026" was read as month + year "28" = 2028-02-29.
    assert client._filename_as_of_date(url) == expected


def test_one_run_writes_one_month_only_even_when_the_landing_page_lists_years(db_session, monkeypatch, mock_http):
    seed(db_session)
    sep = "https://example.test/portfolio-30-Sep-26.xlsx"
    aug = "https://example.test/portfolio-31-Aug-26.xlsx"
    jun = "https://example.test/portfolio-30-Jun-25.xlsx"
    html = "".join(f'<a href="{u}">Portfolio</a>' for u in (sep, aug, jun))
    result, requests = run_refresh(db_session, monkeypatch, mock_http, {
        "https://example.test/list": httpx.Response(200, text=html),
        sep: httpx.Response(200, content=workbook()),
        aug: httpx.Response(200, content=workbook()),
        jun: httpx.Response(200, content=workbook()),
    }, entry=Entry(kind=Kind.STATIC_REGEX, file_shape=Shape.ZIP_OF_WORKBOOKS,
                   landing_url="https://example.test/list", link_pattern=r"portfolio"))
    dates = {b.as_of_date for b in db_session.query(DisclosureBatch).all()}
    assert dates == {date(2026, 9, 30)}, dates
    assert sep in requests and aug not in requests and jun not in requests
