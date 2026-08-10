import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db
from app.models.user import User #user db model
from app.services.auth.session import get_current_user
from app.services.dashboard.aggregate import (
    get_aggregate_allocation,
    get_aggregate_cash_flow,
    get_aggregate_holdings,
    get_aggregate_sips,
    get_aggregate_snapshots,
) #for aggregated data

from app.services.dashboard.allocation import compute_allocation 
from app.services.dashboard.cash_flow import compute_cash_flow #for individual
from app.services.dashboard.distributor_comparison import compute_distributor_comparison 
from app.services.dashboard.holdings import compute_holdings

#household member related db operations
from app.services.dashboard.household_members import (
    create_household_member,
    get_household_member_for_user,
    list_household_members,
)

#validate requests & structure api responses
from app.services.dashboard.schemas import (
    AggregateAllocationResponse,
    AggregateCashFlowResponse,
    AggregateHoldingsResponse,
    AggregateSipsResponse,
    AggregateSnapshotsResponse,
    AllocationSummary,
    CashFlowEntry,
    DistributorComparisonRow,
    HoldingRow,
    HouseholdMemberCreate,
    HouseholdMemberResponse,
    SipRow,
    SnapshotRow,
)

from app.services.dashboard.sip import compute_active_sips 
from app.services.dashboard.snapshots import get_snapshots

router = APIRouter(tags=["dashboard"])

#household member management
@router.post("/household-members", response_model=HouseholdMemberResponse)
def create_member(
    body: HouseholdMemberCreate,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    member = create_household_member(
        db, user.id, body.name, body.relationship, body.relationship_other_label
    )
    return HouseholdMemberResponse(
        id=str(member.id),
        name=member.name,
        relationship=member.relationship,
        relationship_other_label=member.relationship_other_label,
    )

#return household members
@router.get("/household-members", response_model=list[HouseholdMemberResponse])
def list_members(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    members = list_household_members(db, user.id)
    return [
        HouseholdMemberResponse(
            id=str(m.id),
            name=m.name,
            relationship=m.relationship,
            relationship_other_label=m.relationship_other_label,
        )
        for m in members
    ]

#individual member dashboard
@router.get("/household-members/{member_id}/holdings", response_model=list[HoldingRow])
async def get_member_holdings(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_holdings(db, [member_id])


@router.get(
    "/household-members/{member_id}/schemes/{scheme_id}/distributor-comparison",
    response_model=list[DistributorComparisonRow],
)
async def get_member_distributor_comparison(
    member_id: uuid.UUID,
    scheme_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_distributor_comparison(db, member_id, scheme_id)


@router.get("/household-members/{member_id}/allocation", response_model=AllocationSummary)
async def get_member_allocation(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_allocation(db, [member_id])


@router.get("/household-members/{member_id}/sips", response_model=list[SipRow])
def get_member_sips(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return compute_active_sips(db, [member_id])


@router.get("/household-members/{member_id}/cash-flow", response_model=list[CashFlowEntry])
def get_member_cash_flow(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return compute_cash_flow(db, [member_id])


@router.get("/household-members/{member_id}/snapshots", response_model=list[SnapshotRow])
async def get_member_snapshots(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await get_snapshots(db, [member_id])

#aggregate dashboard
@router.get("/household/aggregate/holdings", response_model=AggregateHoldingsResponse)
async def get_household_aggregate_holdings(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_holdings(db, user.id)


@router.get("/household/aggregate/allocation", response_model=AggregateAllocationResponse)
async def get_household_aggregate_allocation(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_allocation(db, user.id)


@router.get("/household/aggregate/sips", response_model=AggregateSipsResponse)
def get_household_aggregate_sips(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return get_aggregate_sips(db, user.id)


@router.get("/household/aggregate/cash-flow", response_model=AggregateCashFlowResponse)
def get_household_aggregate_cash_flow(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return get_aggregate_cash_flow(db, user.id)


@router.get("/household/aggregate/snapshots", response_model=AggregateSnapshotsResponse)
async def get_household_aggregate_snapshots(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_snapshots(db, user.id)
