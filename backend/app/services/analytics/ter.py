"""AUM-weighted portfolio TER — PRD-04 FR-10/FR-11.

"AUM-weighted" here means weighted by the *user's own holding value* in
each fund (`current_value` from `compute_holdings`), not by the fund's
platform-wide AAUM — see `amfi_aaum_client.py`'s docstring and the Phase 4
design doc's "Two distinct meanings of AUM-weighted" note. This module
never reads `scheme_aaum`.
"""

from __future__ import annotations

import uuid
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
    """One bulk refresh attempt per call, only if at least one held scheme
    lacks a current-month TER row — TER is a bulk endpoint (one fetch
    covers every scheme), unlike NAV's per-scheme fetch, so this never
    loops a fetch per scheme. A refresh failure (network error, or every
    scheme's fuzzy match failing) leaves whatever is already cached in
    place — PRD-04's "TER not yet published" edge case, not an error."""
    if _missing_current_month_ter(db, scheme_ids):
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
