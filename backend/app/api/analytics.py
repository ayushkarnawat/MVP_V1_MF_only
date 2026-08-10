import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db
from app.models.user import User
from app.services.analytics.allocation import (
    compute_category_allocation,
    get_aggregate_category_allocation,
)
from app.services.analytics.schemas import (
    AggregateAnalyticsAllocationResponse,
    AnalyticsAllocationSummary,
)
from app.services.auth.session import get_current_user
from app.services.dashboard.household_members import get_household_member_for_user

router = APIRouter(prefix="/analytics", tags=["analytics"]) #for analytics related endpoints


@router.get(
    "/household-members/{member_id}/allocation", response_model=AnalyticsAllocationSummary
)
async def get_member_category_allocation(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_category_allocation(db, [member_id])


@router.get(
    "/household/aggregate/allocation", response_model=AggregateAnalyticsAllocationResponse
)
async def get_household_aggregate_category_allocation(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_category_allocation(db, user.id)
