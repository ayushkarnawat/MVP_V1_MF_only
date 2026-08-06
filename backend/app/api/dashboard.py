import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db
from app.models.user import User
from app.services.auth.session import get_current_user
from app.services.dashboard.allocation import compute_allocation
from app.services.dashboard.cash_flow import compute_cash_flow
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import (
    create_household_member,
    get_household_member_for_user,
    list_household_members,
)
from app.services.dashboard.schemas import (
    AllocationSummary,
    CashFlowEntry,
    HoldingRow,
    HouseholdMemberCreate,
    HouseholdMemberResponse,
    SipRow,
)
from app.services.dashboard.sip import compute_active_sips

router = APIRouter(tags=["dashboard"])


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


@router.get("/household-members/{member_id}/holdings", response_model=list[HoldingRow])
async def get_member_holdings(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_holdings(db, [member_id])


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
