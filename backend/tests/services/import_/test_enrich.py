import asyncio
from unittest.mock import AsyncMock, patch

import httpx

from app.services.import_ import enrich
from app.services.import_.enrich import MFAPI_BASE, MfApiClient


def test_resolve_scheme_trusts_cas_amfi_code_when_name_plausibly_matches(tmp_path):
    client = MfApiClient(cache_dir=tmp_path)
    scheme_list = [{"schemeCode": "125497", "schemeName": "Any Fund Name"}]
    with patch.object(client, "get_scheme_list", new=AsyncMock(return_value=scheme_list)):
        match, status = asyncio.run(client.resolve_scheme("Any Fund Name", "125497"))
    assert match.amfi_code == "125497"
    assert match.confidence == 1.0
    assert status == "confirmed"


def test_resolve_scheme_rejects_cas_amfi_code_paired_with_mismatched_name(tmp_path):
    """DATA-001 finding: a CAS-parsed AMFI code was previously trusted at
    confidence 1.0 with zero cross-check against the CAS-parsed scheme
    name — a corrupted/mismatched (code, name) pair from a CAS parse would
    silently persist as "confirmed". Here the master list's real name for
    this code is completely unrelated to the CAS-supplied name, so the
    pairing must NOT be confirmed -- it should fall through to a genuine
    fuzzy match by name instead (which finds nothing here, so "pending")."""
    client = MfApiClient(cache_dir=tmp_path)
    scheme_list = [{"schemeCode": "125497", "schemeName": "Completely Unrelated Scheme Name"}]
    with patch.object(client, "get_scheme_list", new=AsyncMock(return_value=scheme_list)):
        match, status = asyncio.run(client.resolve_scheme("XYZ Totally Different Fund", "125497"))
    assert status == "pending"
    assert not (match is not None and match.amfi_code == "125497" and match.confidence == 1.0)


def test_resolve_scheme_trusts_isin_match_even_when_cas_name_differs_from_canonical(tmp_path):
    """JioBlackRock Flexi Cap Fund (launched Oct 2025) real-world case: the
    CAS prints the scheme name without "Plan"/"Option" suffixes, dropping
    text-similarity against mfapi.in's canonical name to 0.87 -- below the
    0.92 gate -- even though `amfi_from_cas` is correct (casparser resolved
    it via ISIN, a unique identifier). An ISIN match against mfapi.in's own
    isinGrowth for that code must confirm regardless of the name gap."""
    client = MfApiClient(cache_dir=tmp_path)
    scheme_list = [
        {
            "schemeCode": "153859",
            "schemeName": "JioBlackRock Flexi Cap Fund - Direct Plan - Growth Option",
            "isinGrowth": "INF22M001093",
        }
    ]
    with patch.object(client, "get_scheme_list", new=AsyncMock(return_value=scheme_list)):
        match, status = asyncio.run(
            client.resolve_scheme("JioBlackRock Flexi Cap Fund - Direct - Growth", "153859", "INF22M001093")
        )
    assert match.amfi_code == "153859"
    assert match.confidence == 1.0
    assert status == "confirmed"


def test_resolve_scheme_isin_mismatch_falls_through_to_name_similarity(tmp_path):
    """An `isin` that doesn't match mfapi.in's ISIN for `amfi_from_cas` isn't
    treated as confirmation -- falls through to the existing name-similarity
    check (still correctly confirms here since the names match closely)."""
    client = MfApiClient(cache_dir=tmp_path)
    scheme_list = [
        {
            "schemeCode": "125497",
            "schemeName": "Any Fund Name",
            "isinGrowth": "INF000A00000",
        }
    ]
    with patch.object(client, "get_scheme_list", new=AsyncMock(return_value=scheme_list)):
        match, status = asyncio.run(client.resolve_scheme("Any Fund Name", "125497", "INF999Z99999"))
    assert match.amfi_code == "125497"
    assert status == "confirmed"


def test_resolve_scheme_falls_through_when_cas_amfi_code_not_in_master_list(tmp_path):
    """An override/CAS-supplied code that doesn't exist in AMFI's own master
    list at all can't be cross-checked -- falls through to fuzzy-match-by-name
    rather than blindly trusting an unverifiable code."""
    client = MfApiClient(cache_dir=tmp_path)
    scheme_list = [{"schemeCode": "999999", "schemeName": "HDFC Flexi Cap Fund Direct Growth"}]
    with patch.object(client, "get_scheme_list", new=AsyncMock(return_value=scheme_list)):
        match, status = asyncio.run(
            client.resolve_scheme("HDFC Flexi Cap Fund - Direct Plan - Growth", "no-such-code")
        )
    assert match.amfi_code == "999999"
    assert match.confidence > 0.9


def test_resolve_scheme_does_not_confirm_blank_name_pairing(tmp_path):
    """Review finding (round 2): SequenceMatcher("", "").ratio() returns 1.0
    -- a whitespace/punctuation-only CAS or canonical name (which normalizes
    to an empty string) must not be treated as a perfect match. Falls
    through to fuzzy-match-by-name instead, same as any other implausible
    pairing."""
    client = MfApiClient(cache_dir=tmp_path)
    scheme_list = [{"schemeCode": "125497", "schemeName": "***"}]
    with patch.object(client, "get_scheme_list", new=AsyncMock(return_value=scheme_list)):
        match, status = asyncio.run(client.resolve_scheme("///", "125497"))
    assert not (match is not None and match.amfi_code == "125497" and match.confidence == 1.0)


def test_resolve_scheme_with_cas_amfi_code_degrades_gracefully_on_mfapi_outage(tmp_path):
    """Cross-checking a CAS-supplied code now needs the master list too --
    an mfapi.in outage must still degrade to "pending", not crash."""
    client = MfApiClient(cache_dir=tmp_path)
    with patch.object(client, "_get_json", new=AsyncMock(side_effect=httpx.ConnectError("boom"))):
        match, status = asyncio.run(client.resolve_scheme("Any Fund Name", "125497"))
    assert status == "pending"


def test_resolve_scheme_fuzzy_matches_when_no_cas_amfi_code(tmp_path):
    client = MfApiClient(cache_dir=tmp_path)
    scheme_list = [{"schemeCode": "100001", "schemeName": "HDFC Flexi Cap Fund Direct Growth"}]
    with patch.object(client, "get_scheme_list", new=AsyncMock(return_value=scheme_list)):
        match, status = asyncio.run(client.resolve_scheme("HDFC Flexi Cap Fund - Direct Plan - Growth", None))
    assert match.amfi_code == "100001"
    assert match.confidence > 0.9
    assert status in ("confirmed", "pending")


def test_resolve_scheme_low_confidence_is_pending(tmp_path):
    client = MfApiClient(cache_dir=tmp_path)
    scheme_list = [{"schemeCode": "999999", "schemeName": "Completely Unrelated Scheme Name"}]
    with patch.object(client, "get_scheme_list", new=AsyncMock(return_value=scheme_list)):
        match, status = asyncio.run(client.resolve_scheme("XYZ Totally Different Fund", None))
    assert status == "pending"


def test_get_scheme_category_happy_path(tmp_path):
    """Verify get_scheme_category returns category from mfapi.in response."""
    client = MfApiClient(cache_dir=tmp_path)
    mock_response = {
        "meta": {"scheme_category": "Equity Scheme - Flexi Cap Fund"},
        "data": [],
    }
    get_json = AsyncMock(return_value=mock_response)
    with patch.object(client, "_get_json", new=get_json):
        category = asyncio.run(client.get_scheme_category("125497"))
    assert category == "Equity Scheme - Flexi Cap Fund"
    get_json.assert_awaited_once_with(f"{MFAPI_BASE}/mf/125497/latest")


def test_get_json_lazily_creates_and_reuses_shared_client():
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True}

    class FakeAsyncClient:
        def __init__(self):
            self.get = AsyncMock(return_value=FakeResponse())

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    shared_client = FakeAsyncClient()
    client = MfApiClient()

    async def fetch_twice():
        await client._get_json("https://example.test/first")
        await client._get_json("https://example.test/second")

    with (
        patch.object(enrich, "_http_client", None, create=True),
        patch.object(enrich.httpx, "AsyncClient", return_value=shared_client) as client_factory,
    ):
        asyncio.run(fetch_twice())

    client_factory.assert_called_once_with(timeout=30.0)
    assert shared_client.get.await_args_list[0].args == ("https://example.test/first",)
    assert shared_client.get.await_args_list[1].args == ("https://example.test/second",)


def test_get_scheme_list_deduplicates_concurrent_uncached_calls(tmp_path):
    """Fix (import-preview-concurrency review finding): build_import_preview
    now resolves schemes concurrently, so multiple no-AMFI schemes in the
    same preview can all reach get_scheme_list() before any of them has
    populated self._schemes. Without a lock, each would independently fetch
    the full ~20k-scheme directory."""
    client = MfApiClient(cache_dir=tmp_path)
    fetch_started = asyncio.Event()
    release_fetch = asyncio.Event()

    async def get_json(url):
        fetch_started.set()
        await asyncio.wait_for(release_fetch.wait(), timeout=1)
        return [{"schemeCode": "1", "schemeName": "Fund"}]

    async def run_calls():
        first = asyncio.create_task(client.get_scheme_list())
        await asyncio.wait_for(fetch_started.wait(), timeout=1)
        second = asyncio.create_task(client.get_scheme_list())
        await asyncio.sleep(0)
        release_fetch.set()
        return await asyncio.gather(first, second)

    with patch.object(client, "_get_json", new=AsyncMock(side_effect=get_json)) as mock_get_json:
        results = asyncio.run(run_calls())

    assert results[0] is results[1]
    mock_get_json.assert_awaited_once()


def test_get_scheme_category_missing_returns_none(tmp_path):
    """Verify get_scheme_category returns None when category key is missing."""
    client = MfApiClient(cache_dir=tmp_path)
    mock_response = {"meta": {}, "data": []}
    with patch.object(client, "_get_json", new=AsyncMock(return_value=mock_response)):
        category = asyncio.run(client.get_scheme_category("999999"))
    assert category is None


def test_resolve_scheme_degrades_gracefully_on_mfapi_outage(tmp_path):
    """Fix 4: an mfapi.in outage during fuzzy matching must not crash the
    parse and discard an already-parsed CAS — it degrades to a
    manual-resolution case, same as any other low-confidence match."""
    client = MfApiClient(cache_dir=tmp_path)
    with patch.object(client, "_get_json", new=AsyncMock(side_effect=httpx.ConnectError("boom"))):
        match, status = asyncio.run(client.resolve_scheme("Some Fund Name", None))
    assert match is None
    assert status == "pending"


def test_get_scheme_category_degrades_gracefully_on_mfapi_outage(tmp_path):
    """Fix 4: same outage handling for category lookup — returns None instead
    of propagating httpx.HTTPError up through resolve_scheme/preview building."""
    client = MfApiClient(cache_dir=tmp_path)
    with patch.object(client, "_get_json", new=AsyncMock(side_effect=httpx.ConnectError("boom"))):
        category = asyncio.run(client.get_scheme_category("125497"))
    assert category is None


def test_disk_cache_read_write_for_scheme_category(tmp_path):
    """Verify disk cache is written on first call and read on second call."""
    client = MfApiClient(cache_dir=tmp_path)
    mock_response = {
        "meta": {"scheme_category": "Equity Scheme - Large Cap Fund"},
        "data": [],
    }
    mock_get_json = AsyncMock(return_value=mock_response)

    with patch.object(client, "_get_json", mock_get_json):
        # First call: should hit _get_json and write to cache
        category1 = asyncio.run(client.get_scheme_category("100001"))
        assert category1 == "Equity Scheme - Large Cap Fund"
        assert mock_get_json.call_count == 1

        # Verify cache file was written
        cache_file = tmp_path / "100001_meta.json"
        assert cache_file.exists()

        # Reset mock to verify second call doesn't use it
        mock_get_json.reset_mock()

        # Second call: should read from cache, not call _get_json
        category2 = asyncio.run(client.get_scheme_category("100001"))
        assert category2 == "Equity Scheme - Large Cap Fund"
        assert mock_get_json.call_count == 0  # Not called on cache hit
