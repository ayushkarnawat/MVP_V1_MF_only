import asyncio
from unittest.mock import AsyncMock, patch

import httpx

from app.services.import_ import enrich
from app.services.import_.enrich import MFAPI_BASE, MfApiClient


def test_resolve_scheme_trusts_cas_amfi_code(tmp_path):
    client = MfApiClient(cache_dir=tmp_path)
    match, status = asyncio.run(client.resolve_scheme("Any Fund Name", "125497"))
    assert match.amfi_code == "125497"
    assert match.confidence == 1.0
    assert status == "confirmed"


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
