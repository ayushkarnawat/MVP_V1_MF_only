"""AMFI TER (Total Expense Ratio) bulk ingestion — PRD-04 FR-10/FR-11.

AMFI republishes TER daily for the current reference month, one row per
scheme covering both Direct and Regular plans (`R_TER`/`D_TER`). Each row
has a `Scheme_Name` and SEBI's scheme code (`NSDLSchemeCode`) but no AMFI
code or ISIN. A scheme is linked once to that code by an exact cleaned name
(`schemes.ter_scheme_code`), then joined by code every month, never fuzzy
(8 Oct). Fuzzy matching assigned
Kotak Business Cycle Fund Tata's TER when Kotak hadn't filed that month.
The stored link also survives a renamed fund in the TER feed.

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
around (the `isinstance` guard now in `_rows_by_code`); the guard made the
symptom stop crashing, but until `_fetch_ter_rows` was fixed to unwrap the
envelope, every scheme's TER silently stayed unmatched (0 real rows, only
2 bogus "rows" per page). `TER_Date` is also an ISO-8601 datetime with a
"Z" suffix on this live endpoint (e.g. "2026-08-01T00:00:00.000Z"), not the
"DD-Mon-YYYY"/"YYYY-MM-DD" formats `_parse_amfi_date` originally targeted.
"""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
import time
from dataclasses import dataclass
from functools import lru_cache
from datetime import date, datetime, timezone
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.db.session import commit_off_loop
from app.models.enums import PlanNameVariant, SchemePlanType
from app.models.reference import Scheme, SchemeTer

logger = logging.getLogger(__name__)

AMFI_TER_MONTH_URL = "https://www.amfiindia.com/api/populate-ter-month"
AMFI_TER_DATA_URL = "https://www.amfiindia.com/api/populate-te-rdata-revised"
AMFI_TER_REFERER = "https://www.amfiindia.com/ter-of-mf-schemes"

_PAGE_SIZE = 500
_RESOLVED_PLAN_VARIANTS = (PlanNameVariant.DIRECT, PlanNameVariant.REGULAR)

# Caps how many of AMFI's 380+ TER pages are in flight at once (live-verified
# 2026-08-20: fetching them one at a time was a ~4 minute sequential network
# wait, the dominant cost behind a reported post-fix "still slow" regression).
# Originally 20, on the assumption this endpoint had no documented rate
# limit -- live-verified 2026-08-21 that assumption was wrong: 20 concurrent
# requests got a 429 from AMFI. Lowered to 5; failed refreshes are
# retried by the next daily TER job, with no retry-on-429 layer here.
_TER_FETCH_CONCURRENCY = 5


def _current_financial_year(today: date) -> str:
    """AMFI's financial year runs April-March, e.g. "2025-2026" covers
    2025-04-01 through 2026-03-31."""
    start_year = today.year if today.month >= 4 else today.year - 1
    return f"{start_year}-{start_year + 1}"


@lru_cache(maxsize=65536)
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


# Live-verified 2026-08-25: a colleague's `ReadTimeout` here wasn't AMFI
# being slow -- it was this process's OWN event loop stalling. Sync
# SQLAlchemy `db.commit()` calls elsewhere (e.g. `nav.py`'s
# `warm_nav_history`) run directly inside `async def`s with no thread
# offload, so a slow-disk commit (measured 63-66s live on that machine,
# see `nav.py`'s "57x slower on WSL DrvFs" note) freezes the whole loop --
# including an in-flight AMFI page request already waiting on its socket,
# which then blows a 30s client-side timeout even though AMFI answered
# fine. One page timing out fails the *entire* refresh_ter_data batch
# (unlike nav.py's per-scheme degrade), so this
# client gets real margin against an observed stall rather than matching
# nav.py's 30s.
_TER_HTTP_TIMEOUT = 90.0


async def _fetch_latest_ter_month(financial_year: str) -> str | None:
    async with httpx.AsyncClient(timeout=_TER_HTTP_TIMEOUT) as client:
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
    # `_rows_by_code`'s isinstance guard was added for).
    async with httpx.AsyncClient(timeout=_TER_HTTP_TIMEOUT) as client:

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


# How a scheme got its TER code: by an exact cleaned name (the job) or by hand.
# The job never replaces a manual entry (8 Oct).
TER_LINK_EXACT = "exact_name"
TER_LINK_MANUAL = "manual"


def _compact_key(name: str) -> str:
    """Upper-cased name with spaces and punctuation removed, so "Navi NiftyIT"
    and "Navi Nifty IT" agree. Parenthesised text is kept: "(Segregated -
    06032020)" is a different fund from the main one (8 Oct review)."""
    return re.sub(r"[^A-Z0-9]", "", name.upper())


def _rows_by_code(rows: list[dict]) -> dict[str, dict]:
    """Latest-dated row per SEBI scheme code. A row without a code is never
    used: it can't be linked or joined (8 Oct review)."""
    latest: dict[str, tuple[date, dict]] = {}
    for row in rows:
        if not isinstance(row, dict) or not row.get("NSDLSchemeCode") or not row.get("Scheme_Name"):
            continue
        try:
            row_date = _parse_amfi_date(row["TER_Date"])
        except (KeyError, ValueError, TypeError):
            continue  # a malformed row is skipped, never fatal (8 Oct re-review)
        code = row["NSDLSchemeCode"]
        if code not in latest or row_date > latest[code][0]:
            latest[code] = (row_date, row)
    return {code: row for code, (_, row) in latest.items()}


def _ter_value(scheme: Scheme, row: dict | None) -> Decimal | None:
    """The scheme's TER from its linked row, or None for "checked, no usable TER"."""
    if row is None:
        return None
    plan = scheme.plan_type or scheme.plan_name_variant
    raw_value = row["R_TER"] if plan.value == "regular" else row["D_TER"]
    if raw_value in (None, ""):
        return None
    ter_value = Decimal(str(raw_value))
    # AMFI uses a literal 0 for "no plan of this type", never a real 0.00% TER.
    return None if ter_value == 0 else ter_value


def _upsert_scheme_ter(db: Session, existing: dict[uuid.UUID, SchemeTer], scheme_id: uuid.UUID,
                       reference_period: date, ter_value: Decimal) -> None:
    row = existing.get(scheme_id)
    if row is not None:
        row.ter_value = ter_value
    else:
        existing[scheme_id] = row = SchemeTer(scheme_id=scheme_id, reference_period=reference_period, ter_value=ter_value)
        db.add(row)


def _mark_checked_no_match(db: Session, existing: dict[uuid.UUID, SchemeTer], scheme_id: uuid.UUID,
                           reference_period: date) -> None:
    """"Checked this month, no usable TER": a NULL row, never a stale value.
    Clears any value saved earlier this month, including the wrong fuzzy
    matches the 7 Oct staging run saved (8 Oct)."""
    row = existing.get(scheme_id)
    if row is None:
        existing[scheme_id] = row = SchemeTer(scheme_id=scheme_id, reference_period=reference_period, ter_value=None)
        db.add(row)
    else:
        row.ter_value = None


@dataclass(frozen=True)
class TerRefreshResult:
    success: bool
    month: str | None = None
    schemes: int = 0
    matched: int = 0
    no_match: int = 0
    new_links: int = 0
    seconds: float = 0.0


async def refresh_ter(db: Session, month: str | None = None) -> TerRefreshResult:
    """Fetch a TER month (the latest published one, or `month`) and upsert `scheme_ter` for
    every locally-known scheme linked to a code by exact cleaned name, with a
    resolved Direct/Regular plan (`R_TER` for REGULAR, `D_TER` for
    DIRECT — `Scheme_Name` is plan-generic, one row covers both plans;
    UNRESOLVED-plan schemes are skipped, since which column applies can't
    be known). Never fuzzy: a missing link or code clears this month's TER.
    `month` ("MM-YYYY") processes that month instead of the latest one; the
    deploy rebuilds last month first, whose feed is complete (8 Oct).
    Returns success=False on any fetch failure or empty result — same
    degrade-gracefully posture as `nav.py`/`arn_lookup.py`: a transient
    AMFI outage must never crash a request, callers fall back to whatever
    is already cached."""
    started = time.perf_counter()
    financial_year = _current_financial_year(date.today())
    try:
        if month is None:
            month = await _fetch_latest_ter_month(financial_year)
        if month is None:
            return TerRefreshResult(success=False)
        rows = await _fetch_ter_rows(month)
    except (httpx.HTTPError, KeyError, ValueError, TypeError, AttributeError) as exc:
        logger.warning("refresh_ter_data: fetch failed: %r", exc)
        return TerRefreshResult(success=False, month=month)
    if not rows:
        logger.warning("refresh_ter_data: AMFI returned no rows for month %s", month)
        return TerRefreshResult(success=False, month=month)

    by_code = _rows_by_code(rows)
    if not by_code:
        # No usable SEBI code in the whole feed (a format change): writing
        # would clear every scheme's TER for the month (final review, 8 Oct).
        logger.warning("refresh_ter_data: no rows with a SEBI scheme code for month %s", month)
        return TerRefreshResult(success=False, month=month)
    codes_by_key: dict[str, set[str]] = {}
    for code, row in by_code.items():
        codes_by_key.setdefault(_compact_key(row["Scheme_Name"]), set()).add(code)
    month_num, year_num = month.split("-")
    reference_period = date(int(year_num), int(month_num), 1)

    schemes = db.query(Scheme).filter(or_(
        Scheme.plan_type.in_((SchemePlanType.DIRECT, SchemePlanType.REGULAR)),
        and_(Scheme.plan_type.is_(None), Scheme.plan_name_variant.in_(_RESOLVED_PLAN_VARIANTS)),
    )).all()
    existing = {row.scheme_id: row for row in
                db.query(SchemeTer).filter(SchemeTer.reference_period == reference_period).all()}
    now = datetime.now(timezone.utc)
    matched = no_match = new_links = 0
    for scheme in schemes:
        key = _compact_key(scheme.base_name) if scheme.base_name else ""
        # A manual entry (even "deliberately no code") is never touched.
        if scheme.ter_scheme_code is None and scheme.ter_link_source != TER_LINK_MANUAL and key:
            codes = codes_by_key.get(key, set())
            if len(codes) == 1:  # exactly one fund with this name: link it once
                scheme.ter_scheme_code = next(iter(codes))
                scheme.ter_link_source = TER_LINK_EXACT
                scheme.ter_linked_at = now
                new_links += 1
        ter_value = _ter_value(scheme, by_code.get(scheme.ter_scheme_code)) if scheme.ter_scheme_code else None
        if ter_value is None:
            _mark_checked_no_match(db, existing, scheme.id, reference_period)
            no_match += 1
        else:
            _upsert_scheme_ter(db, existing, scheme.id, reference_period, ter_value)
            matched += 1

    await commit_off_loop(db)
    return TerRefreshResult(success=True, month=month, schemes=len(schemes), matched=matched,
                            no_match=no_match, new_links=new_links, seconds=round(time.perf_counter() - started, 1))


async def refresh_ter_data(db: Session) -> bool:
    return (await refresh_ter(db)).success
