import asyncio
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


def run_refresh(db, monkeypatch, mock_http, routes, entry=None, amc="Example Mutual Fund"):
    monkeypatch.setattr(client, "AMC_DISCLOSURE_RESOLVERS", {amc: entry or static_entry()})
    requests = mock_http(routes)
    return asyncio.run(client.refresh_portfolio_disclosures(db)), requests


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
        })
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
    assert "PORTFOLIO_DISCLOSURE_ALERT" not in caplog.text  # unmatched alerts belong to Task 14


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
