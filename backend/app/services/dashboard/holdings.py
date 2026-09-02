"""FIFO holdings engine — the core of the Main Dashboard backend. First lot
purchased is the first lot considered redeemed, matching Indian
capital-gains convention and how CAMS/KFintech CAS statements themselves
report gains.
"""

from __future__ import annotations

import threading
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.models.enums import PlanType, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.dashboard.nav import get_nav_on_or_before, get_navs_on_or_before, get_previous_nav_from_cache
from app.services.dashboard.schemas import HoldingRow

_LOT_ADDING_TYPES = {TransactionType.PURCHASE, TransactionType.PURCHASE_SIP, TransactionType.SWITCH_IN, TransactionType.DIVIDEND_REINVEST}
_LOT_CONSUMING_TYPES = {TransactionType.REDEMPTION, TransactionType.SWITCH_OUT}

# Deliberately process-local: this avoids duplicate dashboard computations in
# the MVP and is not intended to coordinate cache state across app instances.
# The bounded TTL self-heals stale NAV snapshots while Fix C's recurring refresh
# job is absent; it is not a substitute for that deployment-phase job.
#
# Known, accepted limitation (2026-08-13 adversarial review, round 4): there is
# no per-key single-flight coordination. If two requests race on a cold or
# just-expired entry for the same key (e.g. the dashboard's /holdings and
# /allocation calls firing together on first load), both can miss and run a
# full independent computation; the lock only guarantees the later publish
# can't install a stale result, not that only one computation happens. This is
# a bounded, occasional perf cost (at most once per TTL window), not a
# correctness issue, and is accepted rather than fixed with a single-flight
# primitive — that complexity is judged not worth it for an MVP whose real fix
# is Fix C's recurring job, not a more elaborate process-local cache.
_HOLDINGS_CACHE_TTL_SECONDS = 15 * 60
_holdings_cache_clock = time.monotonic


@dataclass(frozen=True)
class _HoldingsCacheEntry:
    rows: list[HoldingRow]
    cached_at: float


_holdings_cache: dict[tuple[tuple[uuid.UUID, ...], date], _HoldingsCacheEntry] = {}
_holdings_cache_generation: dict[uuid.UUID, int] = defaultdict(int)
_holdings_cache_lock = threading.Lock()
_default_single_nav_lookup = get_nav_on_or_before


def invalidate_holdings_cache(household_member_id: uuid.UUID) -> None:
    # Advance even when no entry exists: an in-flight computation may have
    # captured the previous generation and must not publish after this point.
    with _holdings_cache_lock:
        _holdings_cache_generation[household_member_id] += 1
        for key in [key for key in _holdings_cache if household_member_id in key[0]]:
            del _holdings_cache[key]


@dataclass
class _Lot:
    units: Decimal
    nav: Decimal


def _process_folio_lots(transactions: list[Transaction]) -> tuple[Decimal, Decimal, Decimal]:
    """Returns (units_held, cost_basis, realized_gain) for one folio's
    transaction history, in FIFO order. `transactions` must already be
    sorted chronologically by the caller.

    STT/stamp_duty/misc/segregation transactions have no effect here — a
    stated simplification, see the design spec's Open Items."""
    lots: list[_Lot] = []
    realized_gain = Decimal("0")

    for txn in transactions:
        if txn.type in _LOT_ADDING_TYPES:
            lots.append(_Lot(units=txn.units, nav=txn.nav))
        elif txn.type in _LOT_CONSUMING_TYPES:
            remaining = txn.units
            while remaining > 0 and lots:
                lot = lots[0]
                take = min(lot.units, remaining)
                realized_gain += take * (txn.nav - lot.nav)
                lot.units -= take
                remaining -= take
                if lot.units == 0:
                    lots.pop(0)

    units_held = sum((lot.units for lot in lots), Decimal("0"))
    cost_basis = sum((lot.units * lot.nav for lot in lots), Decimal("0"))
    return units_held, cost_basis, realized_gain


async def compute_holdings(db: Session, household_member_ids: list[uuid.UUID]) -> list[HoldingRow]:
    if not household_member_ids:
        return []

    cache_key = (tuple(sorted(household_member_ids)), date.today())
    with _holdings_cache_lock:
        cached_entry = _holdings_cache.get(cache_key)
        if cached_entry is not None:
            cache_age = _holdings_cache_clock() - cached_entry.cached_at
            if cache_age <= _HOLDINGS_CACHE_TTL_SECONDS:
                return cached_entry.rows
            del _holdings_cache[cache_key]
        generation = tuple(_holdings_cache_generation[member_id] for member_id in cache_key[0])

    members = {
        m.id: m
        for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()
    }
    folios = db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()

    grouped: dict[tuple[uuid.UUID, uuid.UUID, PlanType], list[Folio]] = defaultdict(list)
    for folio in folios:
        grouped[(folio.household_member_id, folio.scheme_id, folio.plan_type)].append(folio)

    # Batched across all folios in one query instead of one query per folio —
    # the same fix already applied to the NAV lookup below. Global ordering
    # (date, consuming-after-adding, id) is preserved per-folio by grouping
    # in query order, since a stable groupby over an already-ordered stream
    # keeps each group's relative order intact.
    all_transactions = (
        db.query(Transaction)
        .filter(Transaction.folio_id.in_([folio.id for folio in folios]))
        .order_by(
            Transaction.date,
            # Same-date purchases must sort before redemptions —
            # Transaction.id is a random uuid4, so id-only tiebreak
            # would let a same-day redemption randomly process first
            # and silently under-consume (no lots to draw from).
            case((Transaction.type.in_(_LOT_CONSUMING_TYPES), 1), else_=0),
            Transaction.id,
        )
        .all()
        if folios
        else []
    )
    transactions_by_folio: dict[uuid.UUID, list[Transaction]] = defaultdict(list)
    for txn in all_transactions:
        transactions_by_folio[txn.folio_id].append(txn)

    computed: list[tuple[uuid.UUID, Scheme, PlanType, Decimal, Decimal, Decimal]] = []
    for (member_id, scheme_id, plan_type), member_folios in grouped.items():
        scheme = db.get(Scheme, scheme_id)
        total_units = Decimal("0")
        total_cost = Decimal("0")
        total_realized = Decimal("0")
        for folio in member_folios:
            transactions = transactions_by_folio.get(folio.id, [])
            units_held, cost_basis, realized_gain = _process_folio_lots(transactions)
            total_units += units_held
            total_cost += cost_basis
            total_realized += realized_gain

        if total_units == 0:
            continue

        computed.append((member_id, scheme, plan_type, total_units, total_cost, total_realized))

    on_date = date.today()
    scheme_date_pairs = [(scheme, on_date) for _, scheme, _, _, _, _ in computed]
    if get_nav_on_or_before is not _default_single_nav_lookup:
        # Compatibility seam for existing hand-built tests that replace the
        # former single-scheme lookup. Keep these awaits sequential so even a
        # DB-touching test double cannot make the sync Session concurrent.
        nav_results = {
            scheme.id: await get_nav_on_or_before(db, scheme, lookup_date)
            for scheme, lookup_date in scheme_date_pairs
        }
    else:
        nav_results = await get_navs_on_or_before(db, scheme_date_pairs)

    rows: list[HoldingRow] = []
    for member_id, scheme, plan_type, total_units, total_cost, total_realized in computed:
        nav_result = nav_results[scheme.id]
        if nav_result is None:
            continue
        current_nav, current_nav_date = nav_result
        previous = get_previous_nav_from_cache(db, scheme.id, current_nav_date)
        previous_nav = previous[0] if previous else current_nav

        current_value = total_units * current_nav
        unrealized_gain = current_value - total_cost
        current_profit_total = total_realized + unrealized_gain
        today_gain = (current_nav - previous_nav) * total_units
        average_nav = (total_cost / total_units) if total_units else None

        rows.append(
            HoldingRow(
                scheme_id=str(scheme.id),
                scheme_name=scheme.name,
                amc_name=scheme.amc_name,
                household_member_id=str(member_id),
                household_member_name=members[member_id].name,
                plan_type=plan_type,
                units_held=str(total_units),
                average_nav=str(average_nav) if average_nav is not None else None,
                current_nav=str(current_nav),
                current_nav_date=current_nav_date,
                amount_invested=str(total_cost),
                current_value=str(current_value),
                current_profit_total=str(current_profit_total),
                realized_gain=str(total_realized),
                unrealized_gain=str(unrealized_gain),
                today_gain=str(today_gain),
            )
        )
    # Delayed publication, weekends, and holidays are normal; cache the
    # snapshot regardless of NAV date. Imports and successful newer-NAV
    # prefetches advance the generation and invalidate it explicitly.
    with _holdings_cache_lock:
        generation_is_current = generation == tuple(
            _holdings_cache_generation[member_id] for member_id in cache_key[0]
        )
        if generation_is_current:
            _holdings_cache[cache_key] = _HoldingsCacheEntry(
                rows=rows,
                cached_at=_holdings_cache_clock(),
            )
    return rows
