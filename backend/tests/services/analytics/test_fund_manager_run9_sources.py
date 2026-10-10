"""Run 9 public-source formats; all HTTP requests use MockTransport."""
from datetime import date
from functools import wraps
import json
import urllib.parse

import httpx
import pytest

from app.services.analytics import amfi_factsheet_client as client
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverEntry, ResolverKind


def run_async(function):
    @wraps(function)
    def run(*args, **kwargs):
        coroutine = function(*args, **kwargs)
        try:
            coroutine.send(None)
        except StopIteration as result:
            return result.value
        finally:
            coroutine.close()
        raise AssertionError("Mocked request unexpectedly suspended")
    return run


@pytest.mark.parametrize("list_urls", [False, True])
@run_async
async def test_navi_public_nonce_months_and_both_pdf_groups(monkeypatch, list_urls):
    class Today(date):
        @classmethod
        def today(cls):
            return cls(2026, 10, 10)
    monkeypatch.setattr(client, "date", Today)
    entry = ResolverEntry(ResolverKind.JSON_API, "Navi AMC Limited", landing_url="https://navi.com/mutual-fund/downloads/factsheet", endpoint_url="https://navi.com/wp-json/nv/v1/documents")
    seen = []
    def respond(request):
        if request.method == "GET":
            return httpx.Response(200, text='var navi_property = {"rest_url":"https://navi.com/wp-json/","nonce":"public-page-value"}; <select data-category="867" data-type="Monthly">')
        fields = urllib.parse.parse_qs(request.content.decode())
        seen.append(fields["value"][0])
        assert fields["financial_year"] == ["2026-2027"] and fields["category"] == ["867"]
        assert request.headers["WP-NONCE"] == "public-page-value"
        docs = [dict(title="Navi Passive Factsheet August 2026", url="https://assets.example/Navi_Passive_Factsheet_August_2026.pdf"), dict(title="Navi Active Factsheet August 2026", url="https://assets.example/Navi_Active_Factsheet_August_2026.pdf"), dict(title="Additional Information", url="https://assets.example/additional.xlsx")] if seen[-1] == "August" else []
        if list_urls:
            for document in docs:
                document["url"] = [{"link": document["url"]}]
        return httpx.Response(200, json=dict(success=True, data=docs))
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        result = await client._json_api_candidates(http, entry)
    assert seen == ["October", "September", "August"]
    assert set(result) == {"https://assets.example/Navi_Passive_Factsheet_August_2026.pdf", "https://assets.example/Navi_Active_Factsheet_August_2026.pdf"}


@run_async
async def test_union_own_inline_download_list_and_not_other_disclosures():
    page = 'downloadfactsheets.push({ Title: "August 2026", Url: "https://www.unionmf.com/factsheet-august-2026.pdf?x=1&amp;y=2" }); downloadfactsheets.push({ Title: "July 2026", Url: "https://www.unionmf.com/factsheet-july-2026.pdf" }); <a href="/portfolio-september-2026.pdf">Portfolio</a>'
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, text=page))) as http:
        assert await client._static_link_candidates(http, "https://www.unionmf.com/about-us/downloads/factsheets", None) == ["https://www.unionmf.com/factsheet-august-2026.pdf?x=1&y=2", "https://www.unionmf.com/factsheet-july-2026.pdf"]


@run_async
async def test_wealth_public_next_downloads_relative_urls_and_numeric_title_date():
    docs = [dict(name="Factsheet as on 31-08-2026", attachment=dict(url="/uploads/The_Wealth_Company_Factsheet_August_2026_a.pdf")), dict(name="Factsheet as on 30-06-2026", attachment=dict(url="/uploads/Factsheet_as_on_30_06_2026_b.pdf")), dict(name="Presentation", attachment=dict(url="/uploads/Presentation.pdf"))]
    chunk = '1:' + json.dumps({"downloads": docs})
    page = '<script>self.__next_f.push(' + json.dumps([1, chunk]) + ')</script>'
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, text=page))) as http:
        assert await client._static_link_candidates(http, "https://www.wealthcompanyamc.in/literature-forms/scheme-documents/factsheets/", None) == ["https://www.wealthcompanyamc.in/uploads/The_Wealth_Company_Factsheet_August_2026_a.pdf", "https://www.wealthcompanyamc.in/uploads/Factsheet_as_on_30_06_2026_b.pdf"]


@run_async
async def test_taurus_uses_current_year_value_from_public_filter(monkeypatch):
    class Today(date):
        @classmethod
        def today(cls):
            return cls(2026, 10, 10)
    monkeypatch.setattr(client, "date", Today)
    seen = []
    def respond(request):
        seen.append(str(request.url))
        if not request.url.query:
            return httpx.Response(200, text='<select name="field_factsheet_item_target_id"><option value="565">2026</option></select>')
        assert request.url.params["field_factsheet_item_target_id"] == "565"
        return httpx.Response(200, text='<a href=" /sites/default/files/Taurus_Times_Aug_2026.pdf">August 2026</a><a href="/sites/default/files/Taurus_Times_Jul_2026.pdf">July 2026</a>')
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        assert await client._static_link_candidates(http, "https://www.taurusmutualfund.com/factsheet", r"Taurus[_ -]Times|factsheet") == ["https://www.taurusmutualfund.com/sites/default/files/Taurus_Times_Aug_2026.pdf", "https://www.taurusmutualfund.com/sites/default/files/Taurus_Times_Jul_2026.pdf"]
    assert len(seen) == 2


@run_async
async def test_old_bridge_real_short_and_long_filename_variants():
    page = '<a href="/uploads/Old_Bridge_MF_Sept_26_Factsheet_a.pdf">Download</a><a href="/uploads/OLD_BRIDGE_MF_Factsheet_AUG_26_b.pdf">Download</a><a href="/uploads/Old_Bridge_Factsheet_July_2026.pdf">Download</a>'
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, text=page))) as http:
        assert await client._static_link_candidates(http, "https://www.oldbridgemf.com/factsheet.html", None) == ["https://www.oldbridgemf.com/uploads/Old_Bridge_MF_Sept_26_Factsheet_a.pdf", "https://www.oldbridgemf.com/uploads/OLD_BRIDGE_MF_Factsheet_AUG_26_b.pdf", "https://www.oldbridgemf.com/uploads/Old_Bridge_Factsheet_July_2026.pdf"]


@run_async
async def test_samco_dates_filename_month_not_year_digits_in_document_id():
    page = '<a href="/amc-document-download/Factsheet-June2026_1782920868.pdf">Download</a><a href="/amc-document-download/Factsheet-May2026_1780320295.pdf">Download</a><a href="/amc-document-download/Factsheet-September2026_1791201633.pdf">Download</a><a href="/amc-document-download/Factsheet_August_2026_1788525518.pdf">Download</a>'
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, text=page))) as http:
        assert await client._static_link_candidates(http, "https://www.samcomf.com/downloads", None) == ["https://www.samcomf.com/amc-document-download/Factsheet-September2026_1791201633.pdf", "https://www.samcomf.com/amc-document-download/Factsheet_August_2026_1788525518.pdf", "https://www.samcomf.com/amc-document-download/Factsheet-June2026_1782920868.pdf"]


@pytest.mark.parametrize("amc,layout,coverage", [
    ("Navi Mutual Fund", "navi", "17/18"),
    ("Old Bridge Mutual Fund", "oldbridge", "3/3"),
    ("Taurus Mutual Fund", "taurus", "8/10"),
    ("The Wealth Company Mutual Fund", "wealth", "11/12"),
    ("Union Mutual Fund", "union", "32/32"),
    ("Samco Mutual Fund", "samco", "13/13"),
])
def test_registry_enables_only_verified_sources(amc, layout, coverage):
    entry = AMC_RESOLVERS[amc]
    assert entry.layout == layout
    assert entry.landing_url and coverage in entry.note
    assert entry.needs_boxes == (layout == "taurus")
    if layout == "navi":
        assert entry.kind == ResolverKind.JSON_API
        assert len(entry.documents) == 2
        assert entry.endpoint_url == "https://navi.com/wp-json/nv/v1/documents"


@pytest.mark.parametrize("amc,evidence", [
    ("AlphaGrep Mutual Fund", "text/html"),
    ("IL&FS Mutual Fund (IDF)", "2018"),
    ("Lakshya Mutual Fund", "factSheet=[]"),
    ("Monarch Mutual Fund", "no factsheet"),
    ("Bajaj Finserv Mutual Fund", "July 2026"),
])
def test_unavailable_sources_remain_disabled_with_live_proof(amc, evidence):
    entry = AMC_RESOLVERS[amc]
    assert entry.layout is None
    assert evidence in entry.note and "10 Oct 2026" in entry.note
    assert entry.kind != ResolverKind.MANUAL  # the user has not chosen manual for these AMCs
    if amc in {"Lakshya Mutual Fund", "Monarch Mutual Fund"}:
        assert entry.min_schemes == 1


@run_async
async def test_taurus_january_falls_back_to_last_year_when_new_year_is_empty(monkeypatch):
    """Run 9 review: early January the new year's option exists but lists nothing; December's file is current."""
    class Today(date):
        @classmethod
        def today(cls):
            return cls(2027, 1, 5)
    monkeypatch.setattr(client, "date", Today)
    def respond(request):
        if not request.url.query:
            return httpx.Response(200, text='<select name="field_factsheet_item_target_id"><option value="600">2027</option><option value="565">2026</option></select>')
        if request.url.params["field_factsheet_item_target_id"] == "600":
            return httpx.Response(200, text="<p>No documents</p>")
        return httpx.Response(200, text='<a href="/sites/default/files/Taurus_Times_Dec_2026.pdf">December 2026</a>')
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        assert await client._static_link_candidates(http, "https://www.taurusmutualfund.com/factsheet", r"Taurus[_ -]Times|factsheet") == ["https://www.taurusmutualfund.com/sites/default/files/Taurus_Times_Dec_2026.pdf"]
