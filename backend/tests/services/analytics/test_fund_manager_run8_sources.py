"""Source and content gates; every request is mocked, never live."""
from datetime import date
import base64
import json
from functools import wraps
from unittest.mock import Mock, patch

import httpx
import pytest

from app.services.analytics import amfi_factsheet_client as client
from app.services.analytics.fund_manager_layouts import SchemePage
from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
from scripts.jobs import import_manual_fund_managers as cli


def run_async(function):
    # MockTransport completes synchronously; fail if a test unexpectedly needs
    # the event loop (Windows sandbox socketpair initialization is blocked).
    @wraps(function)
    def run(*args, **kwargs):
        coroutine = function(*args, **kwargs)
        try:
            coroutine.send(None)
        except StopIteration as finished:
            return finished.value
        finally:
            coroutine.close()
        raise AssertionError("Mocked source test unexpectedly suspended")
    return run


def one_scheme(text):
    return SchemePage("ASK Liquid Fund", [dict(name="Dinesh Ahuja", role=None, since_raw=None)])


def test_single_scheme_requires_explicit_entry_threshold_and_stale_still_fails():
    default = ResolverEntry(ResolverKind.STATIC_LINK, "Company")
    single = ResolverEntry(ResolverKind.STATIC_LINK, "Company", min_schemes=1)
    current = ["Data as on September 30, 2026"]
    assert client.looks_like_current_factsheet(current, one_scheme, date(2026, 10, 10), min_schemes=default.min_schemes) == (False, "not_a_factsheet")
    assert client.looks_like_current_factsheet(current, one_scheme, date(2026, 10, 10), min_schemes=single.min_schemes) == (True, "ok")
    assert client.looks_like_current_factsheet(["Data as on July 31, 2026"], one_scheme, date(2026, 10, 10), min_schemes=1) == (False, "stale_month")


@run_async
async def test_monthly_resolver_passes_entry_threshold(monkeypatch):
    entry = ResolverEntry(ResolverKind.STATIC_LINK, "Company", landing_url="https://example.com/current.pdf", min_schemes=1)
    monkeypatch.setattr(client, "extract_page_text", lambda pdf: ["Data as on September 30, 2026"])
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b"%PDF-fake"))) as http:
        pages, reason = await client._resolve_and_read(http, entry, {}, one_scheme, date(2026, 10, 10))
    assert reason == "ok" and len(pages) == 1


def test_manual_import_passes_entry_threshold_and_rejects_stale_before_writes(tmp_path, monkeypatch):
    entry = ResolverEntry(ResolverKind.MANUAL, "Company", layout="single_test", min_schemes=1)
    monkeypatch.setitem(cli.AMC_RESOLVERS, "Single AMC", entry)
    monkeypatch.setitem(cli.LAYOUTS, "single_test", one_scheme)
    pdf = tmp_path / "single.pdf"
    pdf.write_bytes(b"%PDF-fake")
    with patch.object(cli, "extract_page_text", return_value=["Data as on September 30, 2026"]), patch.object(cli, "import_pages", return_value=(1, 0)) as imported:
        assert cli.run(Mock(), "Single AMC", [pdf], date(2026, 10, 10)) == dict(matched=1, unmatched=0)
        imported.assert_called_once()
    with patch.object(cli, "extract_page_text", return_value=["Data as on July 31, 2026"]), patch.object(cli, "import_pages") as imported, pytest.raises(SystemExit, match="stale_month"):
        cli.run(Mock(), "Single AMC", [pdf], date(2026, 10, 10))
    imported.assert_not_called()


@run_async
async def test_ask_fragment_relative_download_is_rooted_at_site_not_pages():
    landing = "https://www.askmutualfund.com/pages/downloads.html"
    body = '<a href="./assests/pdf/ASK_Liquid_fund_factsheet_Sept26.pdf">September 2026</a>'
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, text=body))) as http:
        assert await client._static_link_candidates(http, landing, None) == ["https://www.askmutualfund.com/assests/pdf/ASK_Liquid_fund_factsheet_Sept26.pdf"]


@run_async
async def test_sbi_own_public_post_lists_both_required_documents_newest_first():
    entry = ResolverEntry(ResolverKind.JSON_API, "SBI Funds Management Limited", endpoint_url="https://www.sbimf.com/ajaxcall/CMS/GetRecentFactSheets")
    def respond(request):
        assert request.method == "POST"
        return httpx.Response(200, text=''.join(f'<a href="https://www.sbimf.com/{file}">{label}</a>' for file, label in [
            ("all-sbimf-schemes-factsheet-july-2026.pdf", "All SBIMF Schemes Factsheet July 2026"),
            ("sbi-mf-passives-(index-etf-fof)-factsheet-august-2026.pdf", "SBI MF Passives (Index ETF FOF) Factsheet August 2026"),
            ("all-sbimf-schemes-factsheet-august-2026.pdf", "All SBIMF Schemes Factsheet August 2026")]))
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        urls = await client._json_api_candidates(http, entry)
    assert len(urls) == 3
    assert all("august-2026" in url for url in urls[:2])
    assert "july-2026" in urls[2]


@run_async
async def test_tata_own_cms_fallback_uses_document_month_not_upload_folder():
    entry = ResolverEntry(ResolverKind.JSON_API, "Tata Asset Management Private Limited", endpoint_url="https://prod-dist-api.tatamfdev.com/cms-data/api/CMSDATA_corporate_factsheets")
    calls = []
    def respond(request):
        calls.append(request)
        assert request.headers["check-enc"] == "false"
        return httpx.Response(200, json=[dict(title="Factsheet August 2026", field_media_document="https://betacms.tatamutualfund.com/system/files/2026-09/Tata%20Factsheet%20-%20August%202026.pdf")] if request.url.params["month"] == "08" else [])
    with patch.object(client, "date") as clock:
        clock.today.return_value = date(2026, 10, 10)
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
            urls = await client._json_api_candidates(http, entry)
    assert [r.url.params["month"] for r in calls] == ["10", "09", "08"]
    assert len(urls) == 1 and "August%202026" in urls[0]


@run_async
async def test_motilal_real_filename_variants_and_both_document_groups():
    entry = ResolverEntry(ResolverKind.JSON_API, "Motilal Oswal Asset Management Company Limited", endpoint_url="https://www.motilaloswalmf.com/content/aem-cloud-dept-backend-motilal-oswal/api/search-documents.json")
    documents = [dict(path="/content/dam/motilal-mf/downloads/mf/factsheet/2026/aug/factsheet-july-2026-active-funds.pdf", title="Factsheet-July-2026-Active", mimeType="application/pdf"),
        dict(path="/content/dam/motilal-mf/downloads/mf/factsheet/2026/sep/Most Factsheet August 2026 Active.pdf", title="factsheet August 2026 active", mimeType="application/pdf"),
        dict(path="/content/dam/motilal-mf/downloads/mf/factsheet/2026/sep/Factsheet August 2026 Passive.pdf", title="factsheet august 2026 passive", mimeType="application/pdf")]
    def respond(request):
        assert request.url.params["category"] == "factsheet" and request.url.params["type"] == "mf"
        return httpx.Response(200, json=dict(results=documents))
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        urls = await client._json_api_candidates(http, entry)
    assert len(urls) == 3 and all("August" in url for url in urls[:2])
    assert "july" in urls[2]


@run_async
async def test_motilal_january_includes_previous_year_current_candidates():
    entry = ResolverEntry(ResolverKind.JSON_API, "Motilal Oswal Asset Management Company Limited", endpoint_url="https://www.motilaloswalmf.com/search-documents.json")
    years = []
    def respond(request):
        year = request.url.params["year"]
        years.append(year)
        return httpx.Response(200, json=dict(results=[] if year == "2027" else [dict(path="/factsheet-december-2026-active.pdf", title="Factsheet December 2026 Active", mimeType="application/pdf")]))
    with patch.object(client, "date") as clock:
        clock.today.return_value = date(2027, 1, 10)
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
            assert await client._json_api_candidates(http, entry) == ["https://www.motilaloswalmf.com/factsheet-december-2026-active.pdf"]
    assert years == ["2027", "2026"]


@run_async
async def test_mahindra_public_payload_is_decoded_like_its_anonymous_page_script():
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives.padding import PKCS7
    # Synthetic public transport constants; no AMC key is stored in a fixture.
    key, iv = "0" * 32, "1" * 16
    data = dict(status=1, data=[dict(categoryName="INVESTORS", subcategories=[dict(categoryName="Fund Factsheet", subcategories=[], files=[
        dict(title="Fund Factsheet - July 2026", fileUrl="https://cms.mahindramanulife.com/july.pdf"),
        dict(title="Fund Factsheet - August 2026", fileUrl="https://cms.mahindramanulife.com/uuid.pdf"),
        dict(title="Scheme performance", fileUrl="https://cms.mahindramanulife.com/performance.pdf")])])])
    padder = PKCS7(128).padder()
    raw = padder.update(json.dumps(data).encode()) + padder.finalize()
    encryptor = Cipher(algorithms.AES(key.encode()), modes.CBC(iv.encode())).encryptor()
    encrypted = base64.b64encode(encryptor.update(raw) + encryptor.finalize()).decode()
    entry = ResolverEntry(ResolverKind.JSON_API, "Mahindra Manulife Investment Management Pvt Ltd", landing_url="https://www.mahindramanulife.com/downloads", endpoint_url="https://investorapi.mahindramanulife.com/api/v1/web/preLogin/downloads")
    def respond(request):
        assert request.method == "GET"
        assert not any(h in request.headers for h in ["Authorization", "Token", "x-api-key"])
        if request.url.path == "/downloads":
            return httpx.Response(200, text='<script src="/assets/index-public.js"></script>')
        if request.url.path == "/assets/index-public.js":
            return httpx.Response(200, text=f'const TE="{key}",jE="{iv}",Ib=ja.enc.Utf8.parse(TE),Eb=ja.enc.Utf8.parse(jE),Ti=e=>{{}};')
        return httpx.Response(200, json=dict(payload=encrypted))
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        assert await client._json_api_candidates(http, entry) == ["https://cms.mahindramanulife.com/uuid.pdf", "https://cms.mahindramanulife.com/july.pdf"]


@run_async
async def test_tata_unpublished_month_error_falls_through_to_earlier_months():
    """Run 8 review: a 404/500 for the not-yet-published month must not fail the AMC."""
    entry = ResolverEntry(ResolverKind.JSON_API, "Tata Asset Management Private Limited", endpoint_url="https://prod-dist-api.tatamfdev.com/cms-data/api/CMSDATA_corporate_factsheets")
    def respond(request):
        if request.url.params["month"] == "10":
            return httpx.Response(404)
        return httpx.Response(200, json=[dict(title="Factsheet August 2026", field_media_document="https://cms.test/aug.pdf")] if request.url.params["month"] == "08" else [])
    with patch.object(client, "date") as clock:
        clock.today.return_value = date(2026, 10, 10)
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
            assert await client._json_api_candidates(http, entry) == ["https://cms.test/aug.pdf"]
