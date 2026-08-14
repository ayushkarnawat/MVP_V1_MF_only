"""On-demand NAV fetch-and-cache — a separate client from Import Service's
MfApiClient (import_/enrich.py), which explicitly scopes itself to scheme
metadata, not valuation history (see its module docstring). This phase's
real production plan is a daily EventBridge-scheduled refresh job
(TDD-Unifolio.md Background Jobs), but that's deployment-phase
infrastructure — this module is the local-dev-first stand-in: fetch a
scheme's NAV the first time it's needed, cache it in `nav_history`, reuse
the cache after that.
"""

from __future__ import annotations

import asyncio
import threading
import time
import uuid
from collections.abc import Iterable
from datetime import date, datetime
from decimal import Decimal

import httpx
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models.reference import NavHistory, Scheme

MFAPI_BASE = "https://api.mfapi.in"

# Process-local, same posture as holdings.py's _HOLDINGS_CACHE_TTL_SECONDS
# (matching its window on purpose — re-warming a scheme's NAV history more
# often than compute_holdings itself re-reads it buys nothing). Without
# this, every Category Ranking/Scorer request re-fetched full NAV history
# over the network for an entire SEBI-category peer universe (30-150+
# schemes) on every call, live-verified 2026-08-14 as the dominant cost
# behind slow repeat navigation between dashboard views. Timestamp is
# recorded even on a failed fetch (best-effort, matching this module's
# degrade-gracefully posture elsewhere) so an AMFI/mfapi outage doesn't
# turn every request into a full re-fetch storm.
_NAV_WARM_TTL_SECONDS = 15 * 60
_nav_warm_clock = time.monotonic
_nav_warm_cache: dict[uuid.UUID, float] = {}
_nav_warm_lock = threading.Lock()


async def _fetch_nav_history(amfi_code: str) -> list[tuple[date, Decimal]]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{MFAPI_BASE}/mf/{amfi_code}")
        resp.raise_for_status()
        payload = resp.json()

    rows: list[tuple[date, Decimal]] = []
    for entry in payload.get("data", []):
        # mfapi.in dates are DD-MM-YYYY.
        parsed_date = datetime.strptime(entry["date"], "%d-%m-%Y").date()
        rows.append((parsed_date, Decimal(entry["nav"])))
    return rows


def _upsert_nav_history(db: Session, scheme_id: uuid.UUID, rows: list[tuple[date, Decimal]]) -> None:
    if not rows:
        return
    values = [{"scheme_id": scheme_id, "date": row_date, "nav": nav} for row_date, nav in rows]
    dialect_name = db.get_bind().dialect.name
    if dialect_name == "sqlite":
        statement = sqlite_insert(NavHistory).values(values).on_conflict_do_nothing(
            index_elements=[NavHistory.scheme_id, NavHistory.date]
        )
    elif dialect_name == "postgresql":
        statement = postgresql_insert(NavHistory).values(values).on_conflict_do_nothing(
            index_elements=[NavHistory.scheme_id, NavHistory.date]
        )
    else:
        raise RuntimeError(f"Unsupported database dialect for NAV upsert: {dialect_name}")
    db.execute(statement)
    db.commit()


def _latest_cached_on_or_before(db: Session, scheme_id: uuid.UUID, on_date: date) -> NavHistory | None:
    return (
        db.query(NavHistory)
        .filter(NavHistory.scheme_id == scheme_id, NavHistory.date <= on_date)
        .order_by(NavHistory.date.desc())
        .first()
    )


async def get_nav_on_or_before(
    db: Session, scheme: Scheme, on_date: date, *, allow_stale_today: bool = False
) -> tuple[Decimal, date] | None:
    """Most recent NAV on or before `on_date`. Returns `(nav, actual_date)`,
    or `None` if nothing is available even after attempting a fetch.

    A cached row exactly on a past `on_date` is trusted without fetching —
    there's no reason to expect a fresher fetch to change history. A cached
    row on `on_date == date.today()` is NOT trusted without at least
    attempting a fetch, since today's NAV may not have been published yet
    when it was last cached (FR-3's "not yet published" case is normal, not
    an error, but this function should still try to get the freshest data
    available) — unless `allow_stale_today=True`, for callers that only
    need "latest available NAV as of roughly now" (e.g. category-ranking/
    scorer's CAGR calc, where same-day vs. prior-business-day NAV is
    immaterial) and have already warmed the cache via `warm_nav_history`,
    where forcing a live re-fetch would just re-download data fetched
    moments ago."""
    cached = _latest_cached_on_or_before(db, scheme.id, on_date)
    have_trustworthy_cache = cached is not None and (
        allow_stale_today or cached.date == on_date or on_date != date.today()
    )
    if have_trustworthy_cache:
        return cached.nav, cached.date

    try:
        rows = await _fetch_nav_history(scheme.amfi_code)
    except httpx.HTTPError:
        return (cached.nav, cached.date) if cached else None

    _upsert_nav_history(db, scheme.id, rows)
    refreshed = _latest_cached_on_or_before(db, scheme.id, on_date)
    return (refreshed.nav, refreshed.date) if refreshed else None


async def warm_nav_history(db: Session, schemes: Iterable[Scheme]) -> None:
    """Concurrently fetch and cache full NAV history for a batch of
    schemes, deduplicated by scheme id. Lets a subsequent sequential
    per-scheme, per-window lookup loop (category-ranking/scorer's 3yr+5yr
    CAGR calc across an entire SEBI-category peer universe, which can be
    30-150+ schemes) resolve from the local cache instead of one live
    network round-trip per scheme per window — the difference between a
    single concurrent batch and a multi-minute sequential hang. Best-
    effort: a scheme whose fetch fails is simply left unwarmed, same
    degrade-gracefully posture as `get_nav_on_or_before`.

    Skips any scheme warmed within `_NAV_WARM_TTL_SECONDS` of a prior call —
    without this, repeat calls (e.g. re-navigating to the same Category
    Ranking/Scorer view within the same session) re-fetched the entire
    category universe's NAV history from the network every single time."""
    unique = {scheme.id: scheme for scheme in schemes}

    now = _nav_warm_clock()
    with _nav_warm_lock:
        to_fetch = {
            scheme_id: scheme
            for scheme_id, scheme in unique.items()
            if now - _nav_warm_cache.get(scheme_id, 0.0) > _NAV_WARM_TTL_SECONDS
        }

    async def fetch(scheme: Scheme) -> tuple[Scheme, list[tuple[date, Decimal]] | None]:
        try:
            return scheme, await _fetch_nav_history(scheme.amfi_code)
        except httpx.HTTPError:
            return scheme, None

    fetched = await asyncio.gather(*(fetch(scheme) for scheme in to_fetch.values()))
    with _nav_warm_lock:
        for scheme, rows in fetched:
            if rows:
                _upsert_nav_history(db, scheme.id, rows)
            _nav_warm_cache[scheme.id] = now


async def get_navs_on_or_before(
    db: Session,
    scheme_date_pairs: list[tuple[Scheme, date]],
) -> dict[uuid.UUID, tuple[Decimal, date] | None]:
    """Batch NAV lookup with concurrency confined to the pure HTTP leg."""
    results: dict[uuid.UUID, tuple[Decimal, date] | None] = {}
    pending: list[tuple[Scheme, date, NavHistory | None]] = []

    # A synchronous SQLAlchemy Session is not coroutine-safe: all reads stay
    # outside gather and execute in this sequential loop.
    for scheme, on_date in scheme_date_pairs:
        cached = _latest_cached_on_or_before(db, scheme.id, on_date)
        trustworthy = cached is not None and (cached.date == on_date or on_date != date.today())
        if trustworthy:
            results[scheme.id] = (cached.nav, cached.date)
        else:
            pending.append((scheme, on_date, cached))

    async def fetch(scheme: Scheme):
        try:
            return await _fetch_nav_history(scheme.amfi_code)
        except httpx.HTTPError:
            return None

    fetched = await asyncio.gather(*(fetch(scheme) for scheme, _, _ in pending))

    # Writes and final reads likewise remain strictly sequential.
    for (scheme, on_date, cached), rows in zip(pending, fetched, strict=True):
        if rows is None:
            results[scheme.id] = (cached.nav, cached.date) if cached else None
            continue
        _upsert_nav_history(db, scheme.id, rows)
        refreshed = _latest_cached_on_or_before(db, scheme.id, on_date)
        results[scheme.id] = (refreshed.nav, refreshed.date) if refreshed else None

    return results


def get_previous_nav_from_cache(db: Session, scheme_id: uuid.UUID, before_date: date) -> tuple[Decimal, date] | None:
    row = (
        db.query(NavHistory)
        .filter(NavHistory.scheme_id == scheme_id, NavHistory.date < before_date)
        .order_by(NavHistory.date.desc())
        .first()
    )
    return (row.nav, row.date) if row else None
