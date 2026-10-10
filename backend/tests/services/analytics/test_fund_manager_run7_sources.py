"""Public request shapes verified 10 Oct 2026; every request is mocked."""
import json
import re
from functools import wraps
from datetime import date

import httpx
import pytest

from app.services.analytics import amfi_factsheet_client as service
from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS


def run_async(function):
    """MockTransport completes synchronously; avoid Windows' blocked socketpair.

    Fail if the test starts requiring scheduled I/O rather than silently mocking it.
    The existing regression files still run with their normal asyncio runner.
    """
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


def flight(key, data):
    stream = '1:' + json.dumps({key: data}) + '\n'
    return '<script>self.__next_f.push(' + json.dumps([1, stream]) + ')</script>'


@run_async
@pytest.mark.parametrize("host,key,data,expected", [
    ("www.360.one", "factSheets", {"yearlyData": [{"year": "2026", "monthlyData": [
        {"month": "08", "documentGroups": [
            {"title": "Factsheet - Regular", "documents": [{"fileName": "Regular Plan Factsheet - August", "fileUrl": "https://files.test/regular.pdf"}]},
            {"title": "Factsheet - Fund", "documents": [{"fileName": "Fund Factsheet - August", "fileUrl": "https://files.test/new-naming-style.pdf"}]}]},
        {"month": "07", "documentGroups": [{"title": "Factsheet - Fund", "documents": [{"fileName": "Fund Factsheet - July", "fileUrl": "https://files.test/july.pdf"}]}]}]}]},
        ["https://files.test/new-naming-style.pdf", "https://files.test/july.pdf"]),
    ("www.angelonemf.com", "factsheetsData", {
        "1675": {"fields": {"Dropdown": "July 2026", "post_guid": ["https://files.test/Factsheet-Jul-2026.pdf"]}},
        "1693": {"fields": {"Dropdown": "August 2026", "post_guid": ["https://files.test/Factsheet_August_2026.pdf"]}}},
        ["https://files.test/Factsheet_August_2026.pdf", "https://files.test/Factsheet-Jul-2026.pdf"]),
])
async def test_next_public_factsheet_lists(host, key, data, expected):
    html = flight(key, data) + '<a href="/September-2026-methodology.pdf">Factsheet methodology</a>'
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=html))) as client:
        assert await service._static_link_candidates(client, f"https://{host}/downloads", None) == expected


@run_async
async def test_boi_webservice_double_encoded_json_and_latest_name():
    def respond(request):
        assert request.method == "POST"
        assert json.loads(request.content) == dict(pagno=0, category=None, fromDate=None, toDate=None,
                                                  LibraryName="InvestorCorner", folderName="FACTSHEETS", CategoryValue="no")
        return httpx.Response(200, json={"d": json.dumps({"Documents": [
            dict(DocName="FACTSHEET JULY 2026", FolderTitle="FACTSHEETS", FolderUrl="/july.pdf"),
            dict(DocName="FACTSHEET AUGUST 2026", FolderTitle="FACTSHEETS", FolderUrl="/august.pdf"),
            dict(DocName="Annual report September 2026", FolderTitle="REPORTS", FolderUrl="/report.pdf")
        ]})})
    entry = ResolverEntry(ResolverKind.JSON_API, "Bank of India Investment Managers Private Limited", endpoint_url="https://www.boimf.in/AjaxService.asmx/GetDocuments")
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        assert await service._json_api_candidates(client, entry) == ["https://www.boimf.in/august.pdf", "https://www.boimf.in/july.pdf"]


@run_async
async def test_franklin_only_factsheets_with_download_prefix():
    payload = {"PageType": [{"irrelevant": {"literatureHref": "/report.pdf"}, "secondDropDown": [
        dict(id="FUND-FACTSHEETS", literatureHref="/en-in/fund-factsheets/Factsheet-as-on-August-31-2026_web.pdf", dctermsTitle="Factsheet as on August 31, 2026"),
        dict(id="FUND-FACTSHEETS", literatureHref="/en-in/fund-factsheets/Factsheet-as-on-July-31-2026_web.pdf", dctermsTitle="Factsheet as on July 31, 2026"),
        dict(id="FUND-FACTSHEETS", literatureHref="/en-in/fund-factsheets/2056a781-88ef-4bb6-b464-bc894fadb090/factsheet-april 2019-jvjaz50p-en-in.pdf", dctermsTitle="Factsheet as on April 30, 2019")]}]}
    entry = ResolverEntry(ResolverKind.JSON_API, "Franklin Templeton Asset Management (India) Private Limited", endpoint_url="https://www.franklintempletonindia.com/api/literature/v1/responseLitJson?type=download")
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload))) as client:
        assert await service._json_api_candidates(client, entry) == [
            "https://www.franklintempletonindia.com/download/en-in/fund-factsheets/Factsheet-as-on-August-31-2026_web.pdf",
            "https://www.franklintempletonindia.com/download/en-in/fund-factsheets/Factsheet-as-on-July-31-2026_web.pdf",
            "https://www.franklintempletonindia.com/download/en-in/fund-factsheets/2056a781-88ef-4bb6-b464-bc894fadb090/factsheet-april 2019-jvjaz50p-en-in.pdf"]


@run_async
async def test_jio_dynamic_public_action_skips_methodology_and_empty_month(monkeypatch):
    class Today(date):
        @classmethod
        def today(cls):
            return cls(2026, 10, 10)
    monkeypatch.setattr(service, "date", Today)
    calls = []
    def respond(request):
        if request.method == "GET":
            if request.url.path.endswith(".js"):
                return httpx.Response(200, text='let b=(0,v.createServerReference)("deployment-changed",v.callServer,void 0,v.findSourceMapURL,"getDisclosureL3Data");')
            return httpx.Response(200, text='<script src="/_next/static/chunks/app/(mf)/(public)/statutory-disclosure/%5Bl1Id%5D/%5Bl2Id%5D/page-new.js"></script>')
        assert request.headers["Next-Action"] == "deployment-changed"
        _, filters, kind = json.loads(request.content)
        assert filters["year"] == "FI2026-2027" and kind == "MF"
        month = filters["month"]; calls.append(month)
        documents = [] if month == "October" else [dict(title="Calculation and Methodology used in Factsheet", file=dict(url="https://files.test/methodology.pdf", ext=".pdf"))] if month == "September" else [dict(title="JioBlackRock Mutual Fund - August 2026", file=dict(url="https://files.test/opaque-new-name.pdf", ext=".pdf"))]
        return httpx.Response(200, text='0:{"a":"$@1"}\n1:' + json.dumps({"data": documents, "meta": {}}) + '\n')
    entry = ResolverEntry(ResolverKind.JSON_API, "Jio BlackRock Asset Management Private Limited", endpoint_url="https://www.jioblackrockamc.com/statutory-disclosure/fund-documents/factsheet")
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        assert await service._json_api_candidates(client, entry) == ["https://files.test/opaque-new-name.pdf"]
    assert calls == ["October", "September", "August"]


@pytest.mark.parametrize("amc,layout", [
    ("360 ONE Mutual Fund", "360"), ("Angel One Mutual Fund", "angel"),
    ("Baroda BNP Paribas Mutual Fund", "baroda"), ("Franklin Templeton Mutual Fund", "franklin"),
    ("Jio BlackRock Mutual Fund", "jio"),
    ("Bank of India Mutual Fund", "boi"),  # 22/25, a reason per miss (Run 7 ruling)
])
def test_enabled_entries_record_live_source_and_measured_coverage(amc, layout):
    entry = AMC_RESOLVERS[amc]
    assert entry.layout == layout
    assert entry.landing_url or entry.endpoint_url
    assert "10 Oct 2026" in entry.note and "coverage" in entry.note
    assert entry.needs_boxes == (layout in {"360", "franklin"})


@pytest.mark.parametrize("amc,proof", [
    ("Bandhan Mutual Fund", "401"),
    ("Invesco Mutual Fund", "403"), ("JM Financial Mutual Fund", "406"),
])
def test_manual_entries_preserve_run_seven_access_control_proof(amc, proof):
    entry = AMC_RESOLVERS[amc]
    assert entry.kind is ResolverKind.MANUAL
    assert entry.layout is not None
    assert proof in entry.note


@run_async
@pytest.mark.parametrize("filename", ["BBNPP_MF_Fund_Facts_August_2026_19985.pdf", "BBNPP-MF-Fund-Facts-October-2026.pdf", "BBNPP%20MF%20Fund%20Facts%20October%202026.pdf"])
async def test_baroda_real_filename_variants(filename):
    entry = AMC_RESOLVERS["Baroda BNP Paribas Mutual Fund"]
    text = f'<a href="/assets/download_documents/{filename}">Download</a>'
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=text))) as client:
        assert await service._static_link_candidates(client, entry.landing_url, entry.link_pattern) == [f"https://www.barodabnpparibasmf.in/assets/download_documents/{filename}"]


@run_async
async def test_jio_finds_the_disclosure_action_in_any_page_chunk_among_several_references(monkeypatch):
    """Run 7 review: a minified chunk can hold several server references; the first page chunk may not be
    the disclosure one; RSC row ids are hex ("1a:")."""
    class Today(date):
        @classmethod
        def today(cls):
            return cls(2026, 10, 10)
    monkeypatch.setattr(service, "date", Today)
    def respond(request):
        if request.method == "GET":
            if request.url.path.endswith("page-layout.js"):
                return httpx.Response(200, text='let a=(0,v.createServerReference)("other-only",v.callServer,void 0,v.findSourceMapURL,"getMenu");')
            if request.url.path.endswith("page-docs.js"):
                return httpx.Response(200, text='let a=(0,v.createServerReference)("wrong-id",v.callServer,void 0,v.findSourceMapURL,"getMenu"),'
                                                 'b=(0,v.createServerReference)("right-id",v.callServer,void 0,v.findSourceMapURL,"getDisclosureL3Data");')
            return httpx.Response(200, text='<script src="/_next/static/chunks/app/statutory-disclosure/page-layout.js"></script>'
                                            '<script src="/_next/static/chunks/app/statutory-disclosure/x/page-docs.js"></script>')
        assert request.headers["Next-Action"] == "right-id"
        documents = [dict(title="JioBlackRock Mutual Fund - October 2026", file=dict(url="https://files.test/oct.pdf", ext=".pdf"))]
        return httpx.Response(200, text='0:{"a":"$@1a"}\n1a:' + json.dumps({"data": documents}) + '\n')
    entry = ResolverEntry(ResolverKind.JSON_API, "Jio BlackRock Asset Management Private Limited", endpoint_url="https://www.jioblackrockamc.com/statutory-disclosure/fund-documents/factsheet")
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        assert await service._json_api_candidates(client, entry) == ["https://files.test/oct.pdf"]


@pytest.mark.parametrize("name,ok", [
    ("Rajasa Kakulavarapu", True), ("R. Janakiraman", True), ("Shyam Sundar Sriram", True),
    ("Anand Padwal-Desai", True), ("Sandeep D'Souza", True), ("Templeton", False),
    ("total net assets", False),
])
def test_franklin_name_shape_keeps_hyphen_and_apostrophe_names(name, ok):
    """Run 7 review: a hyphenated or apostrophe surname must not be dropped silently."""
    from app.services.analytics.fund_manager_layouts import _FRANKLIN_NAME
    assert bool(re.fullmatch(_FRANKLIN_NAME, name)) is ok
