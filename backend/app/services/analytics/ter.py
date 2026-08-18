"""AUM-weighted portfolio TER — PRD-04 FR-10/FR-11.

"AUM-weighted" here means weighted by the *user's own holding value* in
each fund (`current_value` from `compute_holdings`), not by the fund's
platform-wide AAUM — see `amfi_aaum_client.py`'s docstring and the Phase 4
design doc's "Two distinct meanings of AUM-weighted" note. This module
never reads `scheme_aaum`.
"""

from __future__ import annotations

import asyncio
import threading
import time
import uuid
import weakref
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import PlanType
from app.models.reference import SchemeTer
from app.services.analytics.amfi_ter_client import refresh_ter_data
from app.services.analytics.schemas import (
    AggregateDirectRegularTerResponse,
    AggregateWeightedTerResponse,
    DirectRegularTerComparison,
    WeightedTerSummary,
)
from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.schemas import HoldingRow

_EMPTY_SUMMARY = WeightedTerSummary(
    weighted_ter=None, covered_value="0", total_value="0", reference_period=None, uncovered_schemes=[]
)

# A single permanently-unresolvable scheme (bad fuzzy match, or TER never
# published for it) would otherwise make `_missing_current_month_ter` stay
# true forever, triggering a full AMFI national-feed scan on every request.
# Back off refresh attempts to at most once per window (mirrors nav.py's
# `_NAV_WARM_TTL_SECONDS` pattern) regardless of whether coverage is still
# missing afterward, and coalesce concurrent callers so only one in-flight
# scan happens at a time.
_TER_REFRESH_BACKOFF_SECONDS = 15 * 60
_ter_refresh_clock = time.monotonic
_last_ter_refresh_attempt: float | None = None

# A bare module-global `asyncio.Lock()` only actually binds to a specific
# event loop once genuinely CONTENDED -- `Lock.acquire()`'s uncontended fast
# path never touches the loop at all. So a single shared lock instance
# contended from two *different* loops (e.g. two OS threads each running
# their own loop) can silently deadlock rather than just error: the lock's
# internal wake-up future belongs to whichever loop first contends it, and
# `Future.set_result()` called from a different loop's thread isn't
# thread-safe -- it never actually wakes the waiting loop up. Keying the
# lock by the currently-running loop (via a `WeakKeyDictionary`, so an
# entry is dropped once its loop is garbage-collected) means each loop
# always gets its own lock and this can never happen. Reviewer-flagged
# finding; reproduced live via two threads each with their own loop before
# this fix, confirmed hanging without it.
_ter_refresh_locks: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock]" = weakref.WeakKeyDictionary()


def _get_ter_refresh_lock() -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    lock = _ter_refresh_locks.get(loop)
    if lock is None:
        lock = asyncio.Lock()
        _ter_refresh_locks[loop] = lock
    return lock


# The per-loop lock above only coalesces callers on the SAME loop -- two
# different loops (e.g. two OS threads each with their own loop) each get
# their own lock instance and can both slip past `_missing_current_month_ter`
# concurrently. `_last_ter_refresh_attempt` is a plain module global shared
# across every loop/thread, so the check-then-set below must be its own
# atomic, genuinely cross-thread-safe operation, or two different loops can
# both observe a stale timestamp and both launch a refresh. A plain
# `threading.Lock` (not `asyncio.Lock`) is correct here specifically because
# the critical section is a synchronous comparison-and-assignment with no
# `await` inside it. Reviewer-flagged finding on the per-loop-lock fix above.
_ter_refresh_backoff_guard = threading.Lock()


def _claim_ter_refresh_slot() -> bool:
    """Atomically checks-and-claims the refresh backoff window across every
    thread/loop. Returns True if this caller should proceed with a refresh."""
    global _last_ter_refresh_attempt
    now = _ter_refresh_clock()
    with _ter_refresh_backoff_guard:
        if _last_ter_refresh_attempt is not None and now - _last_ter_refresh_attempt < _TER_REFRESH_BACKOFF_SECONDS:
            return False
        _last_ter_refresh_attempt = now
        return True


def _latest_ter_for_scheme(db: Session, scheme_id: uuid.UUID) -> tuple[Decimal, date] | None:
    row = (
        db.query(SchemeTer)
        .filter(SchemeTer.scheme_id == scheme_id)
        .order_by(SchemeTer.reference_period.desc())
        .first()
    )
    return (row.ter_value, row.reference_period) if row else None


def _missing_current_month_ter(db: Session, scheme_ids: set[uuid.UUID]) -> bool:
    if not scheme_ids:
        return False
    current_month_start = date.today().replace(day=1)
    covered = (
        db.query(SchemeTer.scheme_id)
        .filter(SchemeTer.scheme_id.in_(scheme_ids), SchemeTer.reference_period >= current_month_start)
        .distinct()
        .count()
    )
    return covered < len(scheme_ids)


async def _ensure_ter_fresh(db: Session, scheme_ids: set[uuid.UUID]) -> None:
    """At most one bulk refresh attempt per `_TER_REFRESH_BACKOFF_SECONDS`,
    only if at least one held scheme lacks a current-month TER row — TER is
    a bulk endpoint (one fetch covers every scheme), unlike NAV's per-scheme
    fetch, so this never loops a fetch per scheme. A refresh failure
    (network error, or every scheme's fuzzy match failing) leaves whatever
    is already cached in place — PRD-04's "TER not yet published" edge
    case, not an error. The backoff applies even when coverage is still
    missing after a refresh, otherwise a permanently-unresolvable scheme
    would re-trigger a full AMFI national scan on every single request.
    Concurrent callers share one in-flight refresh via `_get_ter_refresh_lock()`."""
    if not _missing_current_month_ter(db, scheme_ids):
        return
    async with _get_ter_refresh_lock():
        if not _missing_current_month_ter(db, scheme_ids):
            return  # a concurrent waiter already refreshed while we waited for the lock
        if not _claim_ter_refresh_slot():
            return  # a different loop/thread already claimed this backoff window
        await refresh_ter_data(db)


def _summarize(holdings: list[HoldingRow], ter_by_scheme: dict[str, tuple[Decimal, date]]) -> WeightedTerSummary:
    total_value = Decimal("0")
    covered_value = Decimal("0")
    weighted_sum = Decimal("0")
    latest_period: date | None = None
    uncovered_schemes: set[str] = set()

    for holding in holdings:
        value = Decimal(holding.current_value)
        total_value += value
        ter_info = ter_by_scheme.get(holding.scheme_id)
        if ter_info is None:
            uncovered_schemes.add(holding.scheme_name)
            continue
        ter_value, reference_period = ter_info
        covered_value += value
        weighted_sum += value * ter_value
        if latest_period is None or reference_period > latest_period:
            latest_period = reference_period

    weighted_ter = (weighted_sum / covered_value) if covered_value else None
    return WeightedTerSummary(
        weighted_ter=str(weighted_ter.quantize(Decimal("0.01"))) if weighted_ter is not None else None,
        covered_value=str(covered_value),
        total_value=str(total_value),
        reference_period=latest_period,
        uncovered_schemes=sorted(uncovered_schemes),
    )


async def _weighted_ter_for_holdings(db: Session, holdings: list[HoldingRow]) -> WeightedTerSummary:
    if not holdings:
        return _EMPTY_SUMMARY

    scheme_ids = {uuid.UUID(h.scheme_id) for h in holdings}
    await _ensure_ter_fresh(db, scheme_ids)

    ter_by_scheme = {
        str(scheme_id): info
        for scheme_id in scheme_ids
        if (info := _latest_ter_for_scheme(db, scheme_id)) is not None
    }
    return _summarize(holdings, ter_by_scheme)


async def compute_weighted_ter(db: Session, household_member_ids: list[uuid.UUID]) -> WeightedTerSummary:
    holdings = await compute_holdings(db, household_member_ids)
    return await _weighted_ter_for_holdings(db, holdings)


async def compute_direct_regular_ter_comparison(
    db: Session, household_member_ids: list[uuid.UUID]
) -> DirectRegularTerComparison:
    holdings = await compute_holdings(db, household_member_ids)
    direct_holdings = [h for h in holdings if h.plan_type == PlanType.DIRECT]
    regular_holdings = [h for h in holdings if h.plan_type == PlanType.REGULAR]

    # Both plan buckets can share held schemes (a scheme held via both a
    # direct and a regular folio) — ensure freshness once across the full
    # scheme set rather than twice, then reuse the now-fresh cache for
    # both summaries.
    all_scheme_ids = {uuid.UUID(h.scheme_id) for h in holdings}
    await _ensure_ter_fresh(db, all_scheme_ids)

    def _summarize_without_refresh(rows: list[HoldingRow]) -> WeightedTerSummary:
        if not rows:
            return _EMPTY_SUMMARY
        scheme_ids = {uuid.UUID(h.scheme_id) for h in rows}
        ter_by_scheme = {
            str(scheme_id): info
            for scheme_id in scheme_ids
            if (info := _latest_ter_for_scheme(db, scheme_id)) is not None
        }
        return _summarize(rows, ter_by_scheme)

    return DirectRegularTerComparison(
        direct=_summarize_without_refresh(direct_holdings),
        regular=_summarize_without_refresh(regular_holdings),
    )


async def get_aggregate_weighted_ter(db: Session, user_id: uuid.UUID) -> AggregateWeightedTerResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    ter = await compute_weighted_ter(db, [m.id for m in members])
    return AggregateWeightedTerResponse(members=statuses, ter=ter)


async def get_aggregate_direct_regular_ter_comparison(
    db: Session, user_id: uuid.UUID
) -> AggregateDirectRegularTerResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    ter = await compute_direct_regular_ter_comparison(db, [m.id for m in members])
    return AggregateDirectRegularTerResponse(members=statuses, ter=ter)
