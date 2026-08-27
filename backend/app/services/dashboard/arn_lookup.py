"""On-demand AMFI ARN (distributor) name/status resolution — PRD-03 FR-11a.
A separate, small integration from nav.py's mfapi.in client, following the
identical shape: an isolated, mockable fetch function plus a cache-aware
wrapper. Unlike NAV there is no future scheduled refresh job replacing this
— on-demand, resolve-once-cache-forever is the permanent mechanism, per
the TDD's Background Jobs table ("ARN resolution stays on-demand...").

The endpoint below is real and was independently verified with live HTTP
calls during design (see the design spec and test_arn_lookup.py's captured
example) — not a guess. It is, however, undocumented/reverse-engineered
(same category of risk this project already accepts for AMFI's TER/AAUM
integrations per the TDD), which is exactly why every failure mode here
degrades to the raw ARN code (FR-11b) rather than blocking or erroring.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.enums import ArnStatus
from app.models.reference import ArnDirectory

AMFI_DISTRIBUTOR_SEARCH_URL = "https://www.amfiindia.com/api/distributor-agent"
AMFI_LOCATE_DISTRIBUTOR_REFERER = "https://www.amfiindia.com/locate-distributor"


def _bare_arn_digits(arn_code: str) -> str:
    """AMFI's endpoint matches on the bare numeric ARN, not the "ARN-"
    prefixed form this codebase stores in folios.arn_code — verified live:
    search=0671 returns an exact match, search=ARN-0671 returns zero
    results."""
    return re.sub(r"(?i)^ARN-", "", arn_code)


async def _fetch_arn_record(arn_code: str) -> dict | None:
    """Single-item lookup — never bulk/paginated (pageSize=1, one specific
    ARN per call). Returns AMFI's matched record dict, or None if AMFI has
    no record of this ARN at all (meta.total == 0)."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            AMFI_DISTRIBUTOR_SEARCH_URL,
            params={"strOpt": "ALL", "search": _bare_arn_digits(arn_code), "page": 1, "pageSize": 1},
            headers={"Referer": AMFI_LOCATE_DISTRIBUTOR_REFERER},
        )
        resp.raise_for_status()
        payload = resp.json()

    records = payload.get("data", [])
    return records[0] if records else None


def _parse_amfi_valid_till(raw: str) -> date:
    # AMFI's ARNValidTill looks like "2027-10-18T00:00:00.000Z".
    return datetime.strptime(raw, "%Y-%m-%dT%H:%M:%S.%fZ").date()


async def resolve_arn(db: Session, arn_code: str) -> ArnDirectory | None:
    """Cache-first, resolve-once-forever (FR-11a: 'looked up once per ARN
    ever encountered platform-wide, not once per user') — an existing
    arn_directory row is returned as-is, no re-fetch, no TTL.

    On a cache miss, calls _fetch_arn_record and writes a definitive
    result. A transient failure — network/HTTP error, or a malformed/
    unexpected-shape response body (a real risk on an undocumented,
    reverse-engineered endpoint that could change without notice) — writes
    nothing and returns None, so the caller falls back to the raw ARN this
    one time and the next request retries — never cache a transient
    failure as a permanent value."""
    cached = db.get(ArnDirectory, arn_code)
    if cached is not None:
        return cached

    try:
        record = await _fetch_arn_record(arn_code)
        if record is None:
            status = ArnStatus.INVALID
            distributor_name = None
        else:
            valid_till = _parse_amfi_valid_till(record["ARNValidTill"])
            status = ArnStatus.ACTIVE if valid_till >= date.today() else ArnStatus.SUSPENDED
            distributor_name = record["ARNHolderName"]
    except (httpx.HTTPError, KeyError, ValueError, TypeError):
        # KeyError/ValueError/TypeError cover a malformed or unexpected-shape
        # 200 response (missing field, non-JSON body, an unparseable date) —
        # AMFI returning something not caught by raise_for_status() is just
        # as real a failure mode here as a network error, and must degrade
        # the same way: nothing cached, raw ARN shown, retried next time.
        return None

    row = ArnDirectory(
        arn_code=arn_code,
        distributor_name=distributor_name,
        status=status,
        last_checked_at=datetime.now(timezone.utc),
    )
    db.add(row)
    await commit_off_loop(db)
    return row
