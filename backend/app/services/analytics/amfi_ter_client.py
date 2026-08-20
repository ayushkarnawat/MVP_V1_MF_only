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

import asyncio
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

# Caps how many of AMFI's 380+ TER pages are in flight at once (live-verified
# 2026-08-20: fetching them one at a time was a ~4 minute sequential network
# wait, the dominant cost behind a reported post-fix "still slow" regression).
# Bounded rather than unbounded `gather` -- this endpoint has no documented
# rate limit, and 300+ simultaneous requests risks tripping one.
_TER_FETCH_CONCURRENCY = 20


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
    async with httpx.AsyncClient(timeout=30.0) as client:

        async def get_page(page: int) -> dict:
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
            return resp.json()

        first = await get_page(1)
        first_rows = first.get("data") if isinstance(first, dict) else first
        if not first_rows:
            return []
        rows: list[dict] = list(first_rows)
        meta = first.get("meta") if isinstance(first, dict) else None

        if meta is None:
            # No envelope (never observed live, defensive fallback only) --
            # page count can't be known upfront, so this path stays
            # sequential, terminating on a short page like before.
            page = 2
            while len(first_rows) >= _PAGE_SIZE:
                payload = await get_page(page)
                page_rows = payload if not isinstance(payload, dict) else payload.get("data")
                if not page_rows:
                    break
                rows.extend(page_rows)
                first_rows = page_rows
                page += 1
            return rows

        page_count = meta.get("pageCount", 1)
        semaphore = asyncio.Semaphore(_TER_FETCH_CONCURRENCY)

        async def get_page_bounded(page: int) -> dict:
            async with semaphore:
                return await get_page(page)

        remaining = await asyncio.gather(*(get_page_bounded(p) for p in range(2, page_count + 1)))
        for payload in remaining:
            page_rows = payload.get("data") if isinstance(payload, dict) else payload
            if page_rows:
                rows.extend(page_rows)
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


def _mark_checked_no_match(db: Session, scheme_id: uuid.UUID, reference_period: date) -> None:
    """Persists "checked this scheme against this period's AMFI feed, found
    no usable TER" as a NULL-value row — distinct from no row at all ("never
    checked"). Without this, `_missing_current_month_ter` (ter.py) sees a
    permanently-unmatchable scheme (e.g. a matured FMP no longer in AMFI's
    feed) as perpetually missing coverage, re-triggering a full AMFI
    national-feed rescan every backoff window forever — exactly the risk
    ter.py's own docstring already flagged. Keyed by `reference_period`, so
    a new calendar month still gets a fresh check; this only silences
    repeat checks within an already-checked month. If AMFI's feed later
    does start covering the scheme, the next refresh (triggered by any
    other still-uncovered scheme, or the month rolling over) re-examines
    every scheme fresh and overwrites this marker via `_upsert_scheme_ter`.

    Also converts a PRIOR (pre-fix) refresh's stale 0 -- AMFI's "no plan of
    this type" sentinel, once wrongly persisted as if it were a real TER --
    into the same NULL marker, rather than leaving it looking like a
    covered zero-expense-ratio fund."""
    existing = db.get(SchemeTer, (scheme_id, reference_period))
    if existing is None:
        db.add(SchemeTer(scheme_id=scheme_id, reference_period=reference_period, ter_value=None))
    elif existing.ter_value == 0:
        existing.ter_value = None


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
            _mark_checked_no_match(db, scheme.id, reference_period)
            continue
        row, _confidence = match
        raw_value = row["R_TER"] if scheme.plan_name_variant == PlanNameVariant.REGULAR else row["D_TER"]
        if raw_value in (None, ""):
            _mark_checked_no_match(db, scheme.id, reference_period)
            continue
        ter_value = Decimal(str(raw_value))
        # AMFI uses a literal 0 here for "no plan of this type" (e.g. a
        # scheme with no Regular plan reports R_TER=0), not a genuine
        # zero-expense-ratio fund -- real TERs are never actually 0.00% in
        # practice (regulatory minimum operating costs). Treat it the same
        # as a missing/unmatched value rather than persisting a misleading
        # "valid coverage at 0%" row.
        if ter_value == 0:
            _mark_checked_no_match(db, scheme.id, reference_period)
            continue
        _upsert_scheme_ter(db, scheme.id, reference_period, ter_value)

    db.commit()
    return True
