"""AMFI TER (Total Expense Ratio) bulk ingestion — PRD-04 FR-10/FR-11.

AMFI republishes TER daily for the current reference month, one row per
scheme covering both Direct and Regular plans (`R_TER`/`D_TER`), keyed by
a scheme-name string with no shared join key against local `schemes`
(live-verified 2026-08-10, see
`Docs/superpowers/plans/2026-08-10-phase-4-analytics-backend-design.md`) —
matching is by fuzzy name, same `difflib.SequenceMatcher` idiom as
`import_/enrich.py`'s scheme resolution (PRD-01's stdlib-only constraint
applies equally here, no new fuzzy-matching dependency).

Unlike `dashboard/nav.py`'s per-scheme on-demand fetch, this is a bulk
endpoint — one month's data covers every scheme at once — so
`refresh_ter_data` pulls the whole month once and matches it against every
locally-known scheme with a resolved Direct/Regular plan in a single pass,
rather than one HTTP round-trip per scheme.

Live-verified 2026-08-14: `populate-te-rdata-revised` actually wraps each
page's rows in `{"data": [...], "meta": {"page", "pageSize", "total",
"pageCount"}}`, not a bare list as originally assumed — treating the
envelope itself as the row list silently iterated over its two string dict
keys ("data", "meta") instead of any real row. That was the true root cause
of the "stray non-dict row" `AttributeError` this module was first patched
around (`_latest_row_per_scheme`'s `isinstance` guard); the guard made the
symptom stop crashing, but until `_fetch_ter_rows` was fixed to unwrap the
envelope, every scheme's TER silently stayed unmatched (0 real rows, only
2 bogus "rows" per page). `TER_Date` is also an ISO-8601 datetime with a
"Z" suffix on this live endpoint (e.g. "2026-08-01T00:00:00.000Z"), not the
"DD-Mon-YYYY"/"YYYY-MM-DD" formats `_parse_amfi_date` originally targeted.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from difflib import SequenceMatcher

import httpx
from sqlalchemy.orm import Session

from app.models.enums import PlanNameVariant
from app.models.reference import Scheme, SchemeTer

AMFI_TER_MONTH_URL = "https://www.amfiindia.com/api/populate-ter-month"
AMFI_TER_DATA_URL = "https://www.amfiindia.com/api/populate-te-rdata-revised"
AMFI_TER_REFERER = "https://www.amfiindia.com/ter-of-mf-schemes"

# Claude's technical judgment (no PRD-04 sign-off needed, same posture as
# the FR-5b cost-overlay magnitude decision) — below this, a "best" fuzzy
# match is more likely a wrong scheme than a genuine one, so the scheme is
# left without a TER rather than risk a confidently wrong number. Lower
# than enrich.py's 0.92 scheme-resolution threshold on purpose: local
# scheme names carry a "- Direct/Regular Plan - Growth/IDCW" suffix that
# AMFI's TER feed's plan-generic Scheme_Name never has (confirmed live
# 2026-08-10), which caps a genuine match's ratio well below 0.92 — e.g. a
# real "HDFC Flexi Cap Fund - Direct Plan - Growth" vs. AMFI's "HDFC Flexi
# Cap Fund" scores ~0.67, while an unrelated pair scores ~0.26, so 0.55
# separates the two cases with real margin on both sides.
MIN_MATCH_CONFIDENCE = 0.55
_PAGE_SIZE = 500
_RESOLVED_PLAN_VARIANTS = (PlanNameVariant.DIRECT, PlanNameVariant.REGULAR)


def _current_financial_year(today: date) -> str:
    """AMFI's financial year runs April-March, e.g. "2025-2026" covers
    2025-04-01 through 2026-03-31."""
    start_year = today.year if today.month >= 4 else today.year - 1
    return f"{start_year}-{start_year + 1}"


def _normalize_scheme_name(name: str) -> str:
    s = name.upper()
    s = re.sub(r"\([^)]*\)", "", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _parse_amfi_date(raw: str) -> date:
    # AMFI's own site uses "DD-Mon-YYYY" elsewhere (e.g. NAVAll.txt's
    # "07-Aug-2026") but this specific JSON API's TER_Date is actually an
    # ISO-8601 datetime with milliseconds and a "Z" suffix (live-verified
    # 2026-08-14, e.g. "2026-08-01T00:00:00.000Z") — try that first, with
    # the two originally-assumed formats kept as fallbacks in case AMFI
    # changes shape again rather than assume and silently misorder.
    if raw.endswith("Z"):
        raw_iso = raw[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(raw_iso).date()
        except ValueError:
            pass
    for fmt in ("%d-%b-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized AMFI TER_Date format: {raw!r}")


async def _fetch_latest_ter_month(financial_year: str) -> str | None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            AMFI_TER_MONTH_URL, params={"year": financial_year}, headers={"Referer": AMFI_TER_REFERER}
        )
        resp.raise_for_status()
        months = resp.json()

    if not months:
        return None
    # MonthNumber is "MM-YYYY" — lexicographic sort orders month before
    # year, so parse before taking the max.
    parsed = [(datetime.strptime(m["MonthNumber"], "%m-%Y"), m["MonthNumber"]) for m in months]
    return max(parsed, key=lambda t: t[0])[1]


async def _fetch_ter_rows(month: str) -> list[dict]:
    # Live-verified 2026-08-14: this endpoint wraps each page's rows in
    # {"data": [...], "meta": {"page", "pageSize", "total", "pageCount"}},
    # not a bare list — treating the envelope itself as the row list
    # silently iterated over its two string dict keys instead of any real
    # row (the true root cause behind the "stray non-dict row" symptom
    # `_latest_row_per_scheme`'s isinstance guard was added for).
    rows: list[dict] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        page = 1
        while True:
            resp = await client.get(
                AMFI_TER_DATA_URL,
                params={
                    "MF_ID": "All",
                    "Month": month,
                    "strCat": -1,
                    "strType": -1,
                    "page": page,
                    "pageSize": _PAGE_SIZE,
                },
                headers={"Referer": AMFI_TER_REFERER},
            )
            resp.raise_for_status()
            payload = resp.json()
            page_rows = payload.get("data") if isinstance(payload, dict) else payload
            if not page_rows:
                break
            rows.extend(page_rows)
            meta = payload.get("meta") if isinstance(payload, dict) else None
            if meta is not None:
                if page >= meta.get("pageCount", page):
                    break
            elif len(page_rows) < _PAGE_SIZE:
                break
            page += 1
    return rows


def _latest_row_per_scheme(rows: list[dict]) -> dict[str, dict]:
    """AMFI republishes daily even when the value hasn't changed — keep
    only the row with the latest TER_Date per Scheme_Name."""
    latest: dict[str, tuple[date, dict]] = {}
    for row in rows:
        # AMFI's paginated feed has been observed mixing in stray non-dict
        # elements (live-verified 2026-08-14) alongside genuine scheme rows —
        # skip anything that isn't a row rather than crash the whole refresh.
        if not isinstance(row, dict):
            continue
        name = row.get("Scheme_Name")
        if not name:
            continue
        row_date = _parse_amfi_date(row["TER_Date"])
        existing = latest.get(name)
        if existing is None or row_date > existing[0]:
            latest[name] = (row_date, row)
    return {name: row for name, (_, row) in latest.items()}


def _best_match(scheme_name: str, ter_rows_by_name: dict[str, dict]) -> tuple[dict, float] | None:
    norm_query = _normalize_scheme_name(scheme_name)
    best: tuple[dict, float] | None = None
    for name, row in ter_rows_by_name.items():
        ratio = SequenceMatcher(None, norm_query, _normalize_scheme_name(name)).ratio()
        if best is None or ratio > best[1]:
            best = (row, ratio)
    return best


def _upsert_scheme_ter(db: Session, scheme_id: uuid.UUID, reference_period: date, ter_value: Decimal) -> None:
    existing = db.get(SchemeTer, (scheme_id, reference_period))
    if existing is not None:
        existing.ter_value = ter_value
    else:
        db.add(SchemeTer(scheme_id=scheme_id, reference_period=reference_period, ter_value=ter_value))


def _clear_stale_zero_ter(db: Session, scheme_id: uuid.UUID, reference_period: date) -> None:
    """A PRIOR (pre-fix) refresh may have persisted AMFI's "no plan of this
    type" 0 as if it were a real TER for this exact scheme/period. Skipping
    the upsert alone leaves that stale row in place, where it keeps
    satisfying `_missing_current_month_ter`'s coverage check forever and the
    scheme never gets a real TER. Only ever removes a row that is ITSELF
    zero — a genuine non-zero value already on record for this period is
    left untouched."""
    existing = db.get(SchemeTer, (scheme_id, reference_period))
    if existing is not None and existing.ter_value == 0:
        db.delete(existing)


async def refresh_ter_data(db: Session) -> bool:
    """Fetch the latest published TER month and upsert `scheme_ter` for
    every locally-known scheme with a confident fuzzy-name match and a
    resolved Direct/Regular plan (`R_TER` for REGULAR, `D_TER` for
    DIRECT — `Scheme_Name` is plan-generic, one row covers both plans;
    UNRESOLVED-plan schemes are skipped, since which column applies can't
    be known). Returns False on any fetch failure or empty result — same
    degrade-gracefully posture as `nav.py`/`arn_lookup.py`: a transient
    AMFI outage must never crash a request, callers fall back to whatever
    is already cached."""
    financial_year = _current_financial_year(date.today())
    try:
        month = await _fetch_latest_ter_month(financial_year)
        if month is None:
            return False
        rows = await _fetch_ter_rows(month)
    except (httpx.HTTPError, KeyError, ValueError, TypeError, AttributeError):
        return False

    if not rows:
        return False

    latest_by_name = _latest_row_per_scheme(rows)
    month_num, year_num = month.split("-")
    reference_period = date(int(year_num), int(month_num), 1)

    schemes = db.query(Scheme).filter(Scheme.plan_name_variant.in_(_RESOLVED_PLAN_VARIANTS)).all()
    for scheme in schemes:
        match = _best_match(scheme.name, latest_by_name)
        if match is None or match[1] < MIN_MATCH_CONFIDENCE:
            continue
        row, _confidence = match
        raw_value = row["R_TER"] if scheme.plan_name_variant == PlanNameVariant.REGULAR else row["D_TER"]
        if raw_value in (None, ""):
            continue
        ter_value = Decimal(str(raw_value))
        # AMFI uses a literal 0 here for "no plan of this type" (e.g. a
        # scheme with no Regular plan reports R_TER=0), not a genuine
        # zero-expense-ratio fund -- real TERs are never actually 0.00% in
        # practice (regulatory minimum operating costs). Treat it the same
        # as a missing/unmatched value rather than persisting a misleading
        # "valid coverage at 0%" row.
        if ter_value == 0:
            _clear_stale_zero_ter(db, scheme.id, reference_period)
            continue
        _upsert_scheme_ter(db, scheme.id, reference_period, ter_value)

    db.commit()
    return True
