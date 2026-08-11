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
    AggregateDirectRegularTerResponse,
    AggregateWeightedTerResponse,
    AnalyticsAllocationSummary,
    DirectRegularTerComparison,
    WeightedTerSummary,
)
from app.services.analytics.ter import (
    compute_direct_regular_ter_comparison,
    compute_weighted_ter,
    get_aggregate_direct_regular_ter_comparison,
    get_aggregate_weighted_ter,
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


@router.get("/household-members/{member_id}/ter", response_model=WeightedTerSummary)
async def get_member_weighted_ter(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_weighted_ter(db, [member_id])


@router.get("/household/aggregate/ter", response_model=AggregateWeightedTerResponse)
async def get_household_aggregate_weighted_ter(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_weighted_ter(db, user.id)


@router.get("/household-members/{member_id}/ter/direct-regular", response_model=DirectRegularTerComparison)
async def get_member_direct_regular_ter(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_direct_regular_ter_comparison(db, [member_id])


@router.get(
    "/household/aggregate/ter/direct-regular", response_model=AggregateDirectRegularTerResponse
)
async def get_household_aggregate_direct_regular_ter(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_direct_regular_ter_comparison(db, user.id)
