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
import logging
import threading
import time
import uuid
from collections.abc import Iterable
from datetime import date, datetime, timedelta
from decimal import Decimal

import httpx
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.reference import NavHistory, Scheme

MFAPI_BASE = "https://api.mfapi.in"

logger = logging.getLogger(__name__)

# `warm_nav_history` is now called only from recompute.py's
# recompute_household_analytics, run as a short-lived ECS Fargate RunTask —
# a fresh process per invocation, sometimes several times a day for the same
# household. A process-local "already warmed" cache doesn't survive across
# those invocations, so the freshness check instead queries nav_history
# itself: any scheme with a row dated within this window is treated as
# fresh regardless of which process fetched it. The window (rather than
# requiring exactly today's row) tolerates weekends/holidays when NSE/AMFI
# simply hasn't published a new NAV yet.
#
# Known, accepted limitation (mirrors holdings.py's posture): if mfapi.in is
# down for an entire daily-backstop run, every household in that run will
# retry the fetch and fail again rather than backing off after the first
# failure — bounded to at most one wasted retry per household per day, not
# worth a dedicated attempts-tracking table at this call frequency.
_NAV_FRESHNESS_WINDOW_DAYS = 3

_nav_http_client: httpx.AsyncClient | None = None
_nav_http_client_lock = threading.Lock()
_nav_fetches_in_flight: dict[str, asyncio.Task[list[tuple[date, Decimal]]]] = {}
_nav_fetches_in_flight_lock = threading.Lock()


def _get_nav_http_client() -> httpx.AsyncClient:
    global _nav_http_client

    if _nav_http_client is None:
        with _nav_http_client_lock:
            if _nav_http_client is None:
                _nav_http_client = httpx.AsyncClient(
                    timeout=30,
                    limits=httpx.Limits(max_connections=100, max_keepalive_connections=100),
                )
    return _nav_http_client


async def _fetch_nav_history_uncached(amfi_code: str) -> list[tuple[date, Decimal]]:
    client = _get_nav_http_client()
    resp = await client.get(f"{MFAPI_BASE}/mf/{amfi_code}")
    resp.raise_for_status()
    payload = resp.json()

    rows: list[tuple[date, Decimal]] = []
    for entry in payload.get("data", []):
        # mfapi.in dates are DD-MM-YYYY.
        parsed_date = datetime.strptime(entry["date"], "%d-%m-%Y").date()
        rows.append((parsed_date, Decimal(entry["nav"])))
    return rows


def _remove_completed_nav_fetch(
    amfi_code: str, fetch: asyncio.Task[list[tuple[date, Decimal]]]
) -> None:
    with _nav_fetches_in_flight_lock:
        if _nav_fetches_in_flight.get(amfi_code) is fetch:
            del _nav_fetches_in_flight[amfi_code]


async def _fetch_nav_history(amfi_code: str) -> list[tuple[date, Decimal]]:
    with _nav_fetches_in_flight_lock:
        fetch = _nav_fetches_in_flight.get(amfi_code)
        if fetch is None:
            fetch = asyncio.create_task(_fetch_nav_history_uncached(amfi_code))
            _nav_fetches_in_flight[amfi_code] = fetch
            fetch.add_done_callback(
                lambda completed, code=amfi_code: _remove_completed_nav_fetch(code, completed)
            )

    return await asyncio.shield(fetch)


async def _upsert_nav_history(
    db: Session, scheme_id: uuid.UUID, rows: list[tuple[date, Decimal]], *, commit: bool = True
) -> None:
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
    if commit:
        await commit_off_loop(db)


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

    await _upsert_nav_history(db, scheme.id, rows)
    refreshed = _latest_cached_on_or_before(db, scheme.id, on_date)
    return (refreshed.nav, refreshed.date) if refreshed else None


def _fresh_scheme_ids(db: Session, scheme_ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
    scheme_ids = list(scheme_ids)
    if not scheme_ids:
        return set()
    cutoff = date.today() - timedelta(days=_NAV_FRESHNESS_WINDOW_DAYS)
    rows = (
        db.query(NavHistory.scheme_id)
        .filter(NavHistory.scheme_id.in_(scheme_ids), NavHistory.date >= cutoff)
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


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

    Skips any scheme with a nav_history row within `_NAV_FRESHNESS_WINDOW_DAYS`
    of today — without this, repeat calls (e.g. two scopes in the same
    household recompute, or two households' recomputes minutes apart)
    re-fetch the entire category universe's NAV history from the network
    every time."""
    unique = {scheme.id: scheme for scheme in schemes}

    fresh_ids = _fresh_scheme_ids(db, unique.keys())
    to_fetch = {scheme_id: scheme for scheme_id, scheme in unique.items() if scheme_id not in fresh_ids}

    async def fetch(scheme: Scheme) -> tuple[Scheme, list[tuple[date, Decimal]] | None]:
        try:
            return scheme, await _fetch_nav_history(scheme.amfi_code)
        except httpx.HTTPError:
            return scheme, None

    # Instrumented 2026-08-20 to root-cause a reported regression (Category
    # Ranking/Scorer got slower, not faster, after the commit-batching and
    # bulk-query fixes) — logs which phase (network fetch vs DB write)
    # actually dominates a given run instead of guessing from wall-clock
    # alone. Cheap enough (a handful of time.perf_counter calls) to leave in
    # permanently rather than strip out once this is root-caused.
    fetch_start = time.perf_counter()
    fetched = await asyncio.gather(*(fetch(scheme) for scheme in to_fetch.values()))
    fetch_elapsed = time.perf_counter() - fetch_start

    commit_start = time.perf_counter()
    any_rows = False
    for scheme, rows in fetched:
        if rows:
            any_rows = True
            await _upsert_nav_history(db, scheme.id, rows, commit=False)
    # One commit for the whole batch, not one per scheme — a category
    # universe can be 1000+ schemes, and a per-scheme commit means
    # 1000+ fsync-bound round trips (57x slower measured on a WSL
    # DrvFs-mounted dev DB than a native filesystem, live 2026-08-19).
    if any_rows:
        await commit_off_loop(db)
    commit_elapsed = time.perf_counter() - commit_start

    logger.info(
        "warm_nav_history: %d schemes total, %d fetched over network, "
        "fetch=%.2fs commit=%.2fs",
        len(unique), len(to_fetch), fetch_elapsed, commit_elapsed,
    )


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
        await _upsert_nav_history(db, scheme.id, rows)
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
