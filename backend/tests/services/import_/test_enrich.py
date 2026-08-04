import asyncio
from unittest.mock import AsyncMock, patch

from app.services.import_.enrich import MfApiClient


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
    with patch.object(client, "_get_json", new=AsyncMock(return_value=mock_response)):
        category = asyncio.run(client.get_scheme_category("125497"))
    assert category == "Equity Scheme - Flexi Cap Fund"


def test_get_scheme_category_missing_returns_none(tmp_path):
    """Verify get_scheme_category returns None when category key is missing."""
    client = MfApiClient(cache_dir=tmp_path)
    mock_response = {"meta": {}, "data": []}
    with patch.object(client, "_get_json", new=AsyncMock(return_value=mock_response)):
        category = asyncio.run(client.get_scheme_category("999999"))
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
