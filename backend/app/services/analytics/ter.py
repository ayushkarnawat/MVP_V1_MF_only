"""AUM-weighted portfolio TER — PRD-04 FR-10/FR-11.

"AUM-weighted" here means weighted by the *user's own holding value* in
each fund (`current_value` from `compute_holdings`), not by the fund's
platform-wide AAUM — see `amfi_aaum_client.py`'s docstring and the Phase 4
design doc's "Two distinct meanings of AUM-weighted" note. This module
never reads `scheme_aaum`.

Read-only (7 Oct fix A): `scheme_ter` is written only by the ter-daily job
(06:20 IST). A fund with no TER row is reported in `uncovered_schemes`; it
never triggers a refresh. The refresh used to run here and, on AWS, took
30+ minutes per Analytics run.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.models.enums import PlanType
from app.models.enums import SchemePlanType
from app.models.reference import Scheme, SchemeTer
from app.services.analytics.schemas import (
    AggregateDirectRegularTerResponse,
    AggregateWeightedTerResponse,
    DirectRegularTerComparison,
    FundTerRow,
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
    # Excludes NULL-value rows (amfi_ter_client.py's "checked this period,
    # found no usable TER" marker) -- those aren't a displayable value, so
    # this still falls through to an older *real* value if one exists,
    # same as it always has for a scheme simply missing this month's row.
    row = (
        db.query(SchemeTer)
        .filter(SchemeTer.scheme_id == scheme_id, SchemeTer.ter_value.isnot(None))
        .order_by(SchemeTer.reference_period.desc())
        .first()
    )
    return (row.ter_value, row.reference_period) if row else None


def _direct_ter_gaps(db: Session, holdings: list[HoldingRow], ter_by_scheme: dict[str, tuple[Decimal, date]]) -> dict[str, Decimal]:
    """Percentage points by which each fully-Direct held scheme is cheaper than its own
    Regular sibling (same AMC and base name, first by AMFI code, as distributor_comparison.py)."""
    if db is None:  # unit tests drive the weighting with patched holdings and no session
        return {}
    plans: dict[str, set] = {}
    for holding in holdings:
        plans.setdefault(holding.scheme_id, set()).add(holding.plan_type)
    direct_ids = [uuid.UUID(sid) for sid, kinds in plans.items() if kinds == {PlanType.DIRECT} and sid in ter_by_scheme]
    if not direct_ids:
        return {}
    schemes = db.query(Scheme).filter(Scheme.id.in_(direct_ids), Scheme.base_name.isnot(None)).all()
    siblings = db.query(Scheme).filter(
        Scheme.amc_name.in_({s.amc_name for s in schemes}), Scheme.base_name.in_({s.base_name for s in schemes}),
        Scheme.plan_type == SchemePlanType.REGULAR,
    ).order_by(Scheme.amfi_code, Scheme.id).all()
    sibling_of: dict[tuple, uuid.UUID] = {}
    for sibling in siblings:
        sibling_of.setdefault((sibling.amc_name, sibling.base_name), sibling.id)
    gaps: dict[str, Decimal] = {}
    for scheme in schemes:
        sibling_id = sibling_of.get((scheme.amc_name, scheme.base_name))
        sibling_ter = _latest_ter_for_scheme(db, sibling_id) if sibling_id else None
        if sibling_ter is not None and sibling_ter[0] > ter_by_scheme[str(scheme.id)][0]:
            gaps[str(scheme.id)] = sibling_ter[0] - ter_by_scheme[str(scheme.id)][0]
    return gaps


def _summarize(holdings: list[HoldingRow], ter_by_scheme: dict[str, tuple[Decimal, date]], *, include_funds: bool = False,
               direct_gaps: dict[str, Decimal] | None = None) -> WeightedTerSummary:
    total_value = Decimal("0")
    covered_value = Decimal("0")
    weighted_sum = Decimal("0")
    latest_period: date | None = None
    uncovered_schemes: set[str] = set()
    fund_rows: list[FundTerRow] = []
    value_by_scheme: dict[str, Decimal] = {}
    first_holding: dict[str, HoldingRow] = {}
    for holding in holdings:
        value_by_scheme[holding.scheme_id] = value_by_scheme.get(holding.scheme_id, Decimal("0")) + Decimal(holding.current_value)
        first_holding.setdefault(holding.scheme_id, holding)

    for scheme_id, holding in first_holding.items():
        value = value_by_scheme[scheme_id]
        total_value += value
        ter_info = ter_by_scheme.get(holding.scheme_id)
        row = FundTerRow(scheme_id=scheme_id, scheme_name=holding.scheme_name,
                         plan_type=holding.plan_type, value=str(value))
        fund_rows.append(row)
        if ter_info is None:
            uncovered_schemes.add(holding.scheme_name)
            continue
        ter_value, reference_period = ter_info
        cost_1y = (value * ter_value / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        row.ter = str(ter_value)
        row.cost_1y = f"{cost_1y:.2f}"
        row.cost_3y = f"{cost_1y * 3:.2f}"
        row.cost_5y = f"{cost_1y * 5:.2f}"
        if direct_gaps and scheme_id in direct_gaps:
            row.annual_ter_saving = f"{(value * direct_gaps[scheme_id] / 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):.2f}"
        covered_value += value
        weighted_sum += value * ter_value
        if latest_period is None or reference_period > latest_period:
            latest_period = reference_period

    weighted_ter = (weighted_sum / covered_value) if covered_value else None
    covered_rows = [row for row in fund_rows if row.ter is not None]
    costs = {
        field: f"{sum((Decimal(getattr(row, field)) for row in covered_rows), Decimal('0')):.2f}" if covered_rows else None
        for field in ("cost_1y", "cost_3y", "cost_5y")
    }
    return WeightedTerSummary(
        weighted_ter=str(weighted_ter.quantize(Decimal("0.01"))) if weighted_ter is not None else None,
        covered_value=str(covered_value),
        total_value=str(total_value),
        reference_period=latest_period,
        uncovered_schemes=sorted(uncovered_schemes),
        **costs,
        funds=sorted(fund_rows, key=lambda row: -Decimal(row.value)) if include_funds else [],
    )


async def _weighted_ter_for_holdings(db: Session, holdings: list[HoldingRow]) -> WeightedTerSummary:
    if not holdings:
        return _EMPTY_SUMMARY

    scheme_ids = {uuid.UUID(h.scheme_id) for h in holdings}

    ter_by_scheme = {
        str(scheme_id): info
        for scheme_id in scheme_ids
        if (info := _latest_ter_for_scheme(db, scheme_id)) is not None
    }
    return _summarize(holdings, ter_by_scheme, include_funds=True,
                      direct_gaps=_direct_ter_gaps(db, holdings, ter_by_scheme))


async def compute_weighted_ter(db: Session, household_member_ids: list[uuid.UUID]) -> WeightedTerSummary:
    holdings = await compute_holdings(db, household_member_ids)
    return await _weighted_ter_for_holdings(db, holdings)


async def compute_direct_regular_ter_comparison(
    db: Session, household_member_ids: list[uuid.UUID]
) -> DirectRegularTerComparison:
    holdings = await compute_holdings(db, household_member_ids)
    direct_holdings = [h for h in holdings if h.plan_type == PlanType.DIRECT]
    regular_holdings = [h for h in holdings if h.plan_type == PlanType.REGULAR]

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
