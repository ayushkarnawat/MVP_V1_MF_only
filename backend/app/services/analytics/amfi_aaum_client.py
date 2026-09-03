"""AMFI scheme-wise AAUM (Average AUM) bulk ingestion.

This is ingestion infrastructure for PRD-04 FR-4 (category-average
weighting, built in a later Phase 4 step) — front-loaded now per the
design doc's confirmed build order, which groups "AMFI TER + AAUM
integrations" into one step. It is **not** consumed by FR-10/FR-11 (see
the design doc's "Two distinct meanings of AUM-weighted" note — the
user's own portfolio TER is weighted by the user's holding value, not by
a fund's platform-wide AAUM).

**Verification caveat.** The financial-years endpoint's response shape
was live-verified during design research (2026-08-10) —
`{"type":"financial_years","data":[{"id":..,"financial_year":".."}]}` —
and each scheme-wise AAUM row's `AMFI_Code` and value field were also
confirmed. The intermediate "periods within a financial year" endpoint's
exact response shape was **not** captured verbatim in that research
session (only "periods/quarters within that financial year" was noted).
This module assumes the same `{"data": [{"id": ..., "period": ...}]}`
envelope by analogy with the financial-years endpoint, and a `period`/
`text`/`name` label field parsed as "<Month name> <YYYY>". This should be
live-verified against a real response before FR-4 relies on this data —
flagging per CLAUDE.md's "stop and say so" instruction rather than
silently presenting an assumption as confirmed. Every failure mode here
(missing years/periods, an unrecognized period label, no scheme matches)
degrades to "nothing ingested this run" rather than a wrong value, so an
incorrect assumption here is inert, not silently corrupting.
"""

from __future__ import annotations

import re
import uuid
from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.reference import Scheme, SchemeAaum

AMFI_AAUM_BASE = "https://www.amfiindia.com/api/average-aum-schemewise"
_AAUM_VALUE_FIELD = "ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas"


async def _fetch_financial_years() -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(AMFI_AAUM_BASE, params={"strType": "Typewise", "MF_ID": 0})
        resp.raise_for_status()
        return resp.json().get("data", [])


async def _fetch_periods(fy_id: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(AMFI_AAUM_BASE, params={"strType": "Typewise", "MF_ID": 0, "fyId": fy_id})
        resp.raise_for_status()
        return resp.json().get("data", [])


async def _fetch_aaum_rows(fy_id: int, period_id: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            AMFI_AAUM_BASE, params={"strType": "Typewise", "MF_ID": 0, "fyId": fy_id, "periodId": period_id}
        )
        resp.raise_for_status()
        payload = resp.json()

    # Rows are "grouped by AMC" per the design doc — flatten to a single
    # scheme-row list regardless of whether the payload is already flat or
    # AMC-grouped, so this function tolerates either shape without
    # stacking a second unverified assumption on top of the periods one.
    data = payload.get("data", payload) if isinstance(payload, dict) else payload
    rows: list[dict] = []
    for entry in data or []:
        if not isinstance(entry, dict):
            continue
        if "AMFI_Code" in entry:
            rows.append(entry)
        elif "schemes" in entry:
            rows.extend(entry["schemes"])
    return rows


def _latest_by_id(items: list[dict]) -> dict | None:
    return max(items, key=lambda item: item["id"]) if items else None


def _period_end_date(period: dict) -> date | None:
    """Best-effort parse of a period's ending month from its label — see
    module docstring's verification caveat. Returns None (caller skips
    ingestion for this run) rather than guessing on an unrecognized
    shape."""
    label = (period.get("period") or period.get("text") or period.get("name") or "").strip()
    match = re.search(r"([A-Za-z]+)\s+(\d{4})$", label)
    if not match:
        return None
    month_name, year_str = match.groups()
    for fmt in ("%B", "%b"):
        try:
            month = datetime.strptime(month_name, fmt).month
            break
        except ValueError:
            continue
    else:
        return None
    year = int(year_str)
    return date(year, month, monthrange(year, month)[1])


def _extract_aaum_value(row: dict) -> Decimal | None:
    nested = row.get("AverageAumForTheMonth")
    value = nested.get(_AAUM_VALUE_FIELD) if isinstance(nested, dict) else None
    if value in (None, ""):
        return None
    return Decimal(str(value))


def _upsert_scheme_aaum(db: Session, scheme_id: uuid.UUID, reference_period: date, aaum_value: Decimal) -> None:
    existing = db.get(SchemeAaum, (scheme_id, reference_period))
    if existing is not None:
        existing.aaum_value = aaum_value
    else:
        db.add(SchemeAaum(scheme_id=scheme_id, reference_period=reference_period, aaum_value=aaum_value))


async def refresh_aaum_data(db: Session) -> bool:
    """Fetch the latest financial year's latest period's scheme-wise AAUM
    and upsert `scheme_aaum` for every locally-known scheme matched
    directly by `AMFI_Code` (no fuzzy matching needed here — unlike TER,
    this feed carries a clean, directly joinable code). Returns False if
    nothing was ingested this run (fetch failure, no years/periods
    available, an unparseable period label, or zero scheme matches) —
    same degrade-gracefully posture as `amfi_ter_client.py`."""
    try:
        years = await _fetch_financial_years()
        latest_year = _latest_by_id(years)
        if latest_year is None:
            return False
        periods = await _fetch_periods(latest_year["id"])
        latest_period = _latest_by_id(periods)
        if latest_period is None:
            return False
        rows = await _fetch_aaum_rows(latest_year["id"], latest_period["id"])
    except httpx.HTTPError:
        return False

    if not rows:
        return False

    reference_period = _period_end_date(latest_period)
    if reference_period is None:
        return False

    local_by_code = {s.amfi_code: s for s in db.query(Scheme).all()}
    matched_any = False
    for row in rows:
        scheme = local_by_code.get(str(row.get("AMFI_Code") or ""))
        if scheme is None:
            continue
        aaum_value = _extract_aaum_value(row)
        if aaum_value is None:
            continue
        _upsert_scheme_aaum(db, scheme.id, reference_period, aaum_value)
        matched_any = True

    await commit_off_loop(db)
    return matched_any
