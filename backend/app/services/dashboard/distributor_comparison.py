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

Fully sold folios are omitted; NAV-less held schemes are named in their row.
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
from app.models.enums import PlanType, SchemePlanType
from app.models.reference import Scheme, SchemeTer
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
    # current one. Held for the whole capture-then-check (and, below,
    # capture-then-publish) span, not released in between: holdings.py's
    # OWN _holdings_cache_lock (not _distributor_cache_lock) is the only
    # lock invalidate_holdings_cache ever takes, so holding it across both
    # steps makes each span atomic with respect to a concurrent
    # invalidation — closing the check-then-act window an earlier version
    # of this fix left open (capture generation, release the lock, THEN
    # check/publish — during that gap an invalidation could land and this
    # code would never see it). _distributor_cache_lock nests inside,
    # guarding only the local dict; imported, not modified, so holdings.py
    # stays untouched.
    with _holdings_cache_lock, _distributor_cache_lock:
        generation = tuple(_holdings_cache_generation[member_id] for member_id in cache_key[0])
        cached_entry = _distributor_cache.get(cache_key)
        if cached_entry is not None:
            cache_age = _distributor_cache_clock() - cached_entry.cached_at
            if cache_age <= _DISTRIBUTOR_CACHE_TTL_SECONDS and cached_entry.generation == generation:
                return cached_entry.rows
            del _distributor_cache[cache_key]

    def _publish_if_current(rows: list[DistributorPortfolioRow]) -> None:
        with _holdings_cache_lock, _distributor_cache_lock:
            current_generation = tuple(_holdings_cache_generation[m] for m in cache_key[0])
            if generation == current_generation:
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

    grouped = defaultdict(list)
    folio_states = {}
    for folio in folios:
        state = _process_folio_lots(txns_by_folio[folio.id])
        if state[0] <= 0:
            continue
        folio_states[folio.id] = state
        plan = folio.plan_type.value if folio.plan_type in (PlanType.DIRECT, PlanType.REGULAR) else None
        bucket = (folio.arn_code, plan if folio.arn_code is None else None)
        grouped[(bucket, folio.scheme_id, folio.household_member_id)].append(folio)
    if not grouped:
        _publish_if_current([])
        return []
    scheme_ids = {sid for _,sid,_ in grouped}
    schemes = {s.id:s for s in db.query(Scheme).filter(Scheme.id.in_(scheme_ids)).all()}
    amcs = {s.amc_name for s in schemes.values()}
    bases = {s.base_name for s in schemes.values() if s.base_name}
    siblings = db.query(Scheme).filter(Scheme.amc_name.in_(amcs), Scheme.base_name.in_(bases),
                                      Scheme.plan_type == SchemePlanType.REGULAR).order_by(Scheme.amfi_code, Scheme.id).all() if bases else []
    sibling_of = {}
    for sibling in siblings:
        sibling_of.setdefault((sibling.amc_name,sibling.base_name), sibling.id)
    ters = {}
    for ter in db.query(SchemeTer).filter(SchemeTer.scheme_id.in_(scheme_ids | {s.id for s in siblings})).order_by(SchemeTer.reference_period.desc()).all():
        ters.setdefault(ter.scheme_id, ter.ter_value)
    nav_results = await get_navs_on_or_before(db, [(schemes[sid],date.today()) for sid in scheme_ids])
    breakdowns = {bucket:[] for bucket,_,_ in grouped}
    missing = {bucket:set() for bucket in breakdowns}
    plans = {bucket:set() for bucket in breakdowns}
    for (bucket,scheme_id,member_id), group_folios in grouped.items():
        scheme = schemes[scheme_id]
        plans[bucket].update(f.plan_type.value for f in group_folios)
        nav_result = nav_results.get(scheme_id)
        if nav_result is None:
            missing[bucket].add(scheme.name)
            continue
        current_nav,_ = nav_result
        units = sum((folio_states[f.id][0] for f in group_folios), Decimal(0))
        cost = sum((folio_states[f.id][1] for f in group_folios), Decimal(0))
        realized = sum((folio_states[f.id][2] for f in group_folios), Decimal(0))
        value = units * current_nav
        saving = None
        if all(f.plan_type == PlanType.DIRECT for f in group_folios):
            own_ter = ters.get(scheme_id)
            sibling_ter = ters.get(sibling_of.get((scheme.amc_name,scheme.base_name)))
            if own_ter is not None and sibling_ter is not None and sibling_ter > own_ter:
                saving = f"{sibling_ter-own_ter:.2f}"
        breakdowns[bucket].append(DistributorSchemeBreakdown(
            scheme_id=str(scheme_id), scheme_name=scheme.name, household_member_id=str(member_id),
            household_member_name=members[member_id].name, units_held=str(units), average_nav=str(cost/units),
            amount_invested=str(cost), current_value=str(value), current_profit_total=str(realized+value-cost),
            realized_gain=str(realized), unrealized_gain=str(value-cost), annual_ter_saving=saving))
    rows = []
    for bucket, items in breakdowns.items():
        arn_code, no_arn_plan = bucket
        distributor_name = None
        arn_status = None
        plan = next(iter(plans[bucket])) if len(plans[bucket]) == 1 else None
        if plan not in ("direct","regular"):
            plan = None
        if arn_code is not None:
            resolved = await resolve_arn(db,arn_code)
            if resolved is not None:
                distributor_name,arn_status = resolved.distributor_name,resolved.status
        elif no_arn_plan == "regular":
            distributor_name = "Regular"
        elif no_arn_plan == "direct":
            distributor_name = "Direct Plan (No Broker)"
        totals = {field:str(sum((Decimal(getattr(item,field)) for item in items),Decimal(0)))
                  for field in ("amount_invested","current_value","current_profit_total","realized_gain","unrealized_gain")}
        rows.append(DistributorPortfolioRow(arn_code=arn_code, distributor_name=distributor_name,
                                            arn_status=arn_status, plan_type=plan, schemes=items,
                                            nav_unavailable_schemes=sorted(missing[bucket]), **totals))

    _publish_if_current(rows)
    return rows
