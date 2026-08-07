import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import ArnStatus
from app.models.reference import ArnDirectory
from app.services.dashboard.arn_lookup import _bare_arn_digits, resolve_arn


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_bare_arn_digits_strips_arn_prefix_case_insensitively():
    assert _bare_arn_digits("ARN-0671") == "0671"
    assert _bare_arn_digits("arn-0671") == "0671"
    assert _bare_arn_digits("0671") == "0671"


# Real response captured live against AMFI's distributor-search endpoint
# during design (2026-08-07):
# GET https://www.amfiindia.com/api/distributor-agent?strOpt=ALL&search=0671&page=1&pageSize=1
# -> {"data": [{"ARN": "0671", "ARNHolderName": "Multiplize Investment
#     Services", "ARNValidTill": "2027-10-18T00:00:00.000Z", ...}],
#     "meta": {"total": 1, ...}}
# Confirms the endpoint is real and this shape is correct. Every test below
# mocks _fetch_arn_record directly (same convention as test_nav.py mocking
# _fetch_nav_history) — no live network call in the suite.
#
# The captured ARNValidTill (2027-10-18) is real but not permanently in the
# future — hardcoding it as an "ACTIVE" fixture would make this test start
# failing the day that date passes. _REAL_ACTIVE_RECORD stays as the
# verified example only; test payloads below use a synthetic 2099 date for
# "definitely active" and a synthetic 2020 date for "definitely expired".
_REAL_ACTIVE_RECORD = {
    "ARN": "0671",
    "ARNHolderName": "Multiplize Investment Services",
    "ARNValidTill": "2027-10-18T00:00:00.000Z",
}


def test_resolve_arn_returns_cached_row_without_fetching():
    import asyncio

    db = _session()
    db.add(ArnDirectory(arn_code="ARN-0671", distributor_name="Cached Name", status=ArnStatus.ACTIVE))
    db.commit()

    with patch(
        "app.services.dashboard.arn_lookup._fetch_arn_record",
        new=AsyncMock(side_effect=AssertionError("should not fetch")),
    ):
        result = asyncio.run(resolve_arn(db, "ARN-0671"))

    assert result.distributor_name == "Cached Name"
    assert result.status == ArnStatus.ACTIVE


def test_resolve_arn_writes_active_when_found_with_future_valid_till():
    import asyncio

    db = _session()
    active_record = {**_REAL_ACTIVE_RECORD, "ARNValidTill": "2099-01-01T00:00:00.000Z"}

    with patch(
        "app.services.dashboard.arn_lookup._fetch_arn_record",
        new=AsyncMock(return_value=active_record),
    ):
        result = asyncio.run(resolve_arn(db, "ARN-0671"))

    assert result.status == ArnStatus.ACTIVE
    assert result.distributor_name == "Multiplize Investment Services"
    cached = db.get(ArnDirectory, "ARN-0671")
    assert cached is not None and cached.status == ArnStatus.ACTIVE


def test_resolve_arn_writes_suspended_when_found_with_past_valid_till():
    import asyncio

    db = _session()
    expired_record = {**_REAL_ACTIVE_RECORD, "ARN": "0999", "ARNValidTill": "2020-01-01T00:00:00.000Z"}

    with patch(
        "app.services.dashboard.arn_lookup._fetch_arn_record",
        new=AsyncMock(return_value=expired_record),
    ):
        result = asyncio.run(resolve_arn(db, "ARN-0999"))

    assert result.status == ArnStatus.SUSPENDED


def test_resolve_arn_writes_invalid_when_amfi_has_no_record():
    import asyncio

    db = _session()

    with patch(
        "app.services.dashboard.arn_lookup._fetch_arn_record",
        new=AsyncMock(return_value=None),
    ):
        result = asyncio.run(resolve_arn(db, "ARN-9999999"))

    assert result.status == ArnStatus.INVALID
    assert result.distributor_name is None


def test_resolve_arn_writes_nothing_and_returns_none_on_fetch_failure():
    import asyncio

    db = _session()

    with patch(
        "app.services.dashboard.arn_lookup._fetch_arn_record",
        new=AsyncMock(side_effect=httpx.ConnectError("boom")),
    ):
        result = asyncio.run(resolve_arn(db, "ARN-5555"))

    assert result is None
    assert db.get(ArnDirectory, "ARN-5555") is None
