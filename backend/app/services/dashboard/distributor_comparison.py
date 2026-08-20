"""Distributor comparison — PRD-03 FR-11, reframed portfolio-wide (2026-08-20
redesign, see Docs/superpowers/specs/2026-08-20-distributor-comparison-
portfolio-level-design.md). Groups every held scheme, across every
requested household member, by which ARN (distributor) it was bought
through — one DistributorPortfolioRow per ARN (or the Direct bucket), each
carrying a nested per-(scheme, member) breakdown so a distributor's
contribution to the whole portfolio can be inspected, not just one fund at
a time.

Batched by construction (folios, transactions, and NAVs are each fetched in
one query/call for the whole request) — this is new code, so it never
introduces the per-folio N+1 query pattern that compute_holdings still has.
That pre-existing pattern is deliberately left untouched in holdings.py —
see the design spec's Scope section for why.

Unlike holdings.py, a (scheme, member, ARN) group with zero units held
(e.g. fully redeemed through one distributor) is still included, not
dropped — this view compares performance across distributors, including
ones you've since fully exited, not just what's currently held.
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

from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.dashboard.arn_lookup import resolve_arn
from app.services.dashboard.holdings import (
    _LOT_CONSUMING_TYPES,
    _holdings_cache_generation,
    _holdings_cache_lock,
    _process_folio_lots,
    invalidate_holdings_cache,
)
from app.services.dashboard.nav import get_navs_on_or_before
from app.services.dashboard.schemas import DistributorPortfolioRow, DistributorSchemeBreakdown

# Independent from holdings.py's _HOLDINGS_CACHE_TTL_SECONDS by value only
# (same 15-minute posture) — kept as its own constant since these are two
# separate data stores that happen to share a policy, not shared state.
_DISTRIBUTOR_CACHE_TTL_SECONDS = 15 * 60
_distributor_cache_clock = time.monotonic


@dataclass(frozen=True)
class _DistributorCacheEntry:
    rows: list[DistributorPortfolioRow]
    cached_at: float
    generation: tuple[int, ...]


_distributor_cache: dict[tuple[tuple[uuid.UUID, ...], date], _DistributorCacheEntry] = {}
_distributor_cache_lock = threading.Lock()


async def compute_distributor_comparison(
    db: Session, household_member_ids: list[uuid.UUID]
) -> list[DistributorPortfolioRow]:
    if not household_member_ids:
        return []

    cache_key = (tuple(sorted(household_member_ids)), date.today())
    # Reuses holdings.py's own generation counter — this cache is
    # invalidated by the exact same signal ("this member's transactions
    # changed") already bumped by invalidate_holdings_cache on import
    # confirm / opening-balance resolution, not a parallel one.
    # invalidate_holdings_cache only physically purges holdings.py's own
    # _holdings_cache (a dict it owns), so this cache's stale entries
    # aren't deleted on that call — they're rejected here on next read
    # instead, by comparing the entry's captured generation against the
    # current one. Read under holdings.py's OWN _holdings_cache_lock (not
    # _distributor_cache_lock) — the same lock invalidate_holdings_cache
    # writes this dict under — so this never observes a torn write from a
    # concurrent invalidation; imported, not modified, so holdings.py stays
    # untouched.
    with _holdings_cache_lock:
        generation = tuple(_holdings_cache_generation[member_id] for member_id in cache_key[0])

    with _distributor_cache_lock:
        cached_entry = _distributor_cache.get(cache_key)
        if cached_entry is not None:
            cache_age = _distributor_cache_clock() - cached_entry.cached_at
            if cache_age <= _DISTRIBUTOR_CACHE_TTL_SECONDS and cached_entry.generation == generation:
                return cached_entry.rows
            del _distributor_cache[cache_key]

    def _publish_if_current(rows: list[DistributorPortfolioRow]) -> None:
        with _holdings_cache_lock:
            current_generation = tuple(_holdings_cache_generation[m] for m in cache_key[0])
        if generation == current_generation:
            with _distributor_cache_lock:
                _distributor_cache[cache_key] = _DistributorCacheEntry(
                    rows=rows, cached_at=_distributor_cache_clock(), generation=generation
                )

    members = {
        m.id: m
        for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()
    }
    folios = db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()
    if not folios:
        _publish_if_current([])
        return []

    folio_ids = [folio.id for folio in folios]
    transactions = (
        db.query(Transaction)
        .filter(Transaction.folio_id.in_(folio_ids))
        .order_by(
            Transaction.date,
            # Same same-date purchase-before-redemption tiebreak as
            # holdings.py — reused via the shared constant, not redefined.
            case((Transaction.type.in_(_LOT_CONSUMING_TYPES), 1), else_=0),
            Transaction.id,
        )
        .all()
    )
    txns_by_folio: dict[uuid.UUID, list[Transaction]] = defaultdict(list)
    for txn in transactions:
        txns_by_folio[txn.folio_id].append(txn)

    grouped: dict[tuple[str | None, uuid.UUID, uuid.UUID], list[Folio]] = defaultdict(list)
    for folio in folios:
        grouped[(folio.arn_code, folio.scheme_id, folio.household_member_id)].append(folio)

    scheme_ids = {scheme_id for _, scheme_id, _ in grouped}
    schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_(scheme_ids)).all()}

    on_date = date.today()
    nav_results = await get_navs_on_or_before(db, [(schemes[sid], on_date) for sid in scheme_ids])

    # Pre-seed every distinct ARN so a distributor whose every scheme
    # misses NAV still produces a row with an empty breakdown, instead of
    # silently vanishing entirely (see design spec's Error Handling
    # section).
    breakdowns_by_arn: dict[str | None, list[DistributorSchemeBreakdown]] = {
        arn_code: [] for arn_code, _, _ in grouped
    }

    for (arn_code, scheme_id, member_id), group_folios in grouped.items():
        nav_result = nav_results.get(scheme_id)
        if nav_result is None:
            continue
        current_nav, _current_nav_date = nav_result

        total_units = Decimal("0")
        total_cost = Decimal("0")
        total_realized = Decimal("0")
        for folio in group_folios:
            units_held, cost_basis, realized_gain = _process_folio_lots(txns_by_folio[folio.id])
            total_units += units_held
            total_cost += cost_basis
            total_realized += realized_gain

        current_value = total_units * current_nav
        unrealized_gain = current_value - total_cost
        current_profit_total = total_realized + unrealized_gain
        average_nav = (total_cost / total_units) if total_units else None
        scheme = schemes[scheme_id]

        breakdowns_by_arn[arn_code].append(
            DistributorSchemeBreakdown(
                scheme_id=str(scheme_id),
                scheme_name=scheme.name,
                household_member_id=str(member_id),
                household_member_name=members[member_id].name,
                units_held=str(total_units),
                average_nav=str(average_nav) if average_nav is not None else None,
                amount_invested=str(total_cost),
                current_value=str(current_value),
                current_profit_total=str(current_profit_total),
                realized_gain=str(total_realized),
                unrealized_gain=str(unrealized_gain),
            )
        )

    rows: list[DistributorPortfolioRow] = []
    for arn_code, schemes_breakdown in breakdowns_by_arn.items():
        distributor_name = None
        arn_status = None
        if arn_code is not None:
            resolved = await resolve_arn(db, arn_code)
            if resolved is not None:
                distributor_name = resolved.distributor_name
                arn_status = resolved.status

        amount_invested = sum((Decimal(b.amount_invested) for b in schemes_breakdown), Decimal("0"))
        current_value = sum((Decimal(b.current_value) for b in schemes_breakdown), Decimal("0"))
        realized_gain = sum((Decimal(b.realized_gain) for b in schemes_breakdown), Decimal("0"))
        unrealized_gain = sum((Decimal(b.unrealized_gain) for b in schemes_breakdown), Decimal("0"))
        current_profit_total = sum((Decimal(b.current_profit_total) for b in schemes_breakdown), Decimal("0"))

        rows.append(
            DistributorPortfolioRow(
                arn_code=arn_code,
                distributor_name=distributor_name,
                arn_status=arn_status,
                amount_invested=str(amount_invested),
                current_value=str(current_value),
                current_profit_total=str(current_profit_total),
                realized_gain=str(realized_gain),
                unrealized_gain=str(unrealized_gain),
                schemes=schemes_breakdown,
            )
        )

    _publish_if_current(rows)
    return rows
