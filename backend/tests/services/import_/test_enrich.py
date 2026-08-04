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
