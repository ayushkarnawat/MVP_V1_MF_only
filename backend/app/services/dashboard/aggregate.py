"""Family aggregate views — the only place per-member and family code paths
genuinely differ: not the computation (every compute_* function already
takes a list of member IDs), but the response shape. PRD-03 FR-10 requires
a member with no imports yet to show as a clear placeholder, never silently
excluded, so every aggregate response carries a `members` status list
alongside the combined data."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.enums import ImportStatus
from app.models.imports import Import
from app.services.dashboard.allocation import compute_allocation
from app.services.dashboard.cash_flow import compute_cash_flow
from app.services.dashboard.distributor_comparison import compute_distributor_comparison
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.schemas import (
    AggregateAllocationResponse,
    AggregateCashFlowResponse,
    AggregateDistributorComparisonResponse,
    AggregateHoldingsResponse,
    AggregateSipsMonthlyResponse,
    AggregateSipsResponse,
    AggregateSnapshotsResponse,
    MemberStatus,
)
from app.services.dashboard.sip import compute_active_sips, compute_sips_for_month
from app.services.dashboard.snapshots import get_snapshots


def _has_data(db: Session, member_id: uuid.UUID) -> bool:
    return (
        db.query(Import)
        .filter(Import.household_member_id == member_id, Import.status == ImportStatus.CONFIRMED)
        .first()
        is not None
    )


def get_member_statuses(db: Session, user_id: uuid.UUID) -> list[MemberStatus]:
    members = list_household_members(db, user_id)
    return [MemberStatus(id=str(m.id), name=m.name, has_data=_has_data(db, m.id)) for m in members]


async def get_aggregate_holdings(db: Session, user_id: uuid.UUID) -> AggregateHoldingsResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    holdings = await compute_holdings(db, [m.id for m in members])
    return AggregateHoldingsResponse(members=statuses, holdings=holdings)


async def get_aggregate_distributor_comparison(
    db: Session, user_id: uuid.UUID
) -> AggregateDistributorComparisonResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    rows = await compute_distributor_comparison(db, [m.id for m in members])
    return AggregateDistributorComparisonResponse(members=statuses, rows=rows)


async def get_aggregate_allocation(db: Session, user_id: uuid.UUID) -> AggregateAllocationResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    allocation = await compute_allocation(db, [m.id for m in members])
    return AggregateAllocationResponse(members=statuses, allocation=allocation)


def get_aggregate_sips(db: Session, user_id: uuid.UUID) -> AggregateSipsResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    sips = compute_active_sips(db, [m.id for m in members])
    return AggregateSipsResponse(members=statuses, sips=sips)


def get_aggregate_sips_monthly(
    db: Session, user_id: uuid.UUID, year: int, month: int
) -> AggregateSipsMonthlyResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    sips = compute_sips_for_month(db, [m.id for m in members], year, month)
    return AggregateSipsMonthlyResponse(members=statuses, sips=sips)


def get_aggregate_cash_flow(db: Session, user_id: uuid.UUID) -> AggregateCashFlowResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    cash_flow = compute_cash_flow(db, [m.id for m in members])
    return AggregateCashFlowResponse(members=statuses, cash_flow=cash_flow)


async def get_aggregate_snapshots(db: Session, user_id: uuid.UUID) -> AggregateSnapshotsResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    snapshots = await get_snapshots(db, [m.id for m in members])
    return AggregateSnapshotsResponse(members=statuses, snapshots=snapshots)
