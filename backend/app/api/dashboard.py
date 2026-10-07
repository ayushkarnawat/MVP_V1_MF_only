import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db
from app.models.reference import Scheme
from app.models.user import User #user db model
from app.services.auth.session import get_active_user
from app.services.dashboard.aggregate import (
    get_aggregate_allocation,
    get_aggregate_cash_flow,
    get_aggregate_distributor_comparison,
    get_aggregate_holdings,
    get_aggregate_sips,
    get_aggregate_sips_monthly,
    get_aggregate_snapshots,
) #for aggregated data

from app.services.dashboard.allocation import compute_allocation
from app.services.dashboard.cash_flow import compute_cash_flow #for individual
from app.services.dashboard.distributor_comparison import compute_distributor_comparison
from app.services.dashboard.holdings import compute_holdings, compute_realized_summary
from app.services.dashboard.fund_detail import get_fund_nav_history
from app.services.dashboard.xirr import calculate_dashboard_xirr

#household member related db operations
from app.services.dashboard.household_members import (
    DuplicateSelfMemberError,
    create_household_member,
    list_household_members,
    member_to_response,
)
from app.services.dashboard.member_details import (
    MemberDetailsError,
    refresh_pan_conflicts,
    require_member,
)
from app.services.dashboard.member_profile import MemberProfileRequest, save_member_profile
from app.api.imports import claim_and_dispatch_recompute
from app.services.import_.deletion import ImportNotFoundError, delete_member_portfolio
from app.services.import_.schemas import DeleteImportResponse
from app.services.dashboard.member_merge import merge_member_into
from app.services.import_.name_match import InvalidPersonNameError
from app.services.import_.pan_claims import PanConflictError

#validate requests & structure api responses
from app.services.dashboard.schemas import (
    AggregateAllocationResponse,
    AggregateCashFlowResponse,
    AggregateDistributorComparisonResponse,
    AggregateHoldingsResponse,
    AggregateSipsMonthlyResponse,
    AggregateSipsResponse,
    AggregateSnapshotsResponse,
    AllocationSummary,
    CashFlowEntry,
    DistributorPortfolioRow,
    HoldingRow,
    HouseholdMemberCreate,
    HouseholdMemberResponse,
    MemberHoldingsResponse,
    SipMonthlyRow,
    SipRow,
    SchemeNavHistoryResponse,
    SnapshotRow,
)

from app.services.dashboard.sip import compute_active_sips, compute_sips_for_month
from app.services.dashboard.snapshots import get_snapshots

router = APIRouter(tags=["dashboard"])


@router.get("/funds/{scheme_id}/nav-history", response_model=SchemeNavHistoryResponse)
async def get_fund_nav_history_route(
    scheme_id: uuid.UUID,
    period: Literal["1M", "1Y", "3Y", "5Y", "MAX"] = "1Y",
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    scheme = db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=404, detail="Scheme not found.")
    return await get_fund_nav_history(db, scheme, period)

#household member management
@router.post("/household-members", response_model=HouseholdMemberResponse)
def create_member(
    body: HouseholdMemberCreate,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    try:
        member = create_household_member(
            db, user.id, body.name, body.relationship, body.relationship_other_label
        )
    except DuplicateSelfMemberError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except InvalidPersonNameError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc
    return member_to_response(member, user)

#return household members
@router.get("/household-members", response_model=list[HouseholdMemberResponse])
def list_members(user: User = Depends(get_active_user), db: DbSession = Depends(get_db)):
    refresh_pan_conflicts(db, user.id)
    return [member_to_response(m, user) for m in list_household_members(db, user.id)]


# Plain `def` (threadpool): commits (bb5225f).
@router.put("/household-members/{member_id}/profile", response_model=HouseholdMemberResponse)
def put_member_profile(
    member_id: uuid.UUID,
    body: MemberProfileRequest,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    try:
        member = save_member_profile(db, user.id, member_id, body)
    except MemberDetailsError as exc:
        detail = {"code": exc.code, "message": exc.message}
        if exc.details:
            detail["details"] = exc.details
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc
    except PanConflictError as exc:
        raise HTTPException(status_code=409, detail={"code": exc.code, "message": exc.message}) from exc
    except InvalidPersonNameError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc
    return member_to_response(member, user)


# Plain `def` (threadpool): commits (F31 / bb5225f).
@router.post("/household-members/{member_id}/merge-into/{target_id}")
def merge_household_member(
    member_id: uuid.UUID,
    target_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    try:
        result = merge_member_into(db, user.id, member_id, target_id, background_tasks=background_tasks)
    except MemberDetailsError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}
        ) from exc
    claim_and_dispatch_recompute(db, user.id, background_tasks)
    return {"folios_moved": result.folios_moved, "transactions_dropped": result.transactions_dropped}


@router.delete("/household-members/{member_id}/portfolio", response_model=DeleteImportResponse)
def delete_household_member_portfolio(
    member_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    remove_member: bool = False,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    try:
        result = delete_member_portfolio(db, user.id, member_id, remove_member, background_tasks=background_tasks)
    except ImportNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Household member not found.") from exc
    claim_and_dispatch_recompute(db, user.id, background_tasks)
    return DeleteImportResponse(
        deleted_transactions_count=result.deleted_transactions_count,
        removed_member_ids=[str(m) for m in result.removed_member_ids],
        deleted_file=result.deleted_file,
    )


#individual member dashboard
@router.get("/household-members/{member_id}/holdings", response_model=MemberHoldingsResponse)
async def get_member_holdings(
    member_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    require_member(db, user.id, member_id)
    holdings = await compute_holdings(db, [member_id])
    xirr_summary = calculate_dashboard_xirr(db, [member_id], holdings)
    return MemberHoldingsResponse(
        realized_summary=compute_realized_summary(db, [member_id]),
        holdings=holdings,
        lifetime_xirr=xirr_summary.lifetime_xirr,
        current_holdings_xirr=xirr_summary.current_holdings_xirr,
    )


@router.get(
    "/household-members/{member_id}/distributor-comparison",
    response_model=list[DistributorPortfolioRow],
)
async def get_member_distributor_comparison(
    member_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    require_member(db, user.id, member_id)
    return await compute_distributor_comparison(db, [member_id])


@router.get("/household-members/{member_id}/allocation", response_model=AllocationSummary)
async def get_member_allocation(
    member_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    require_member(db, user.id, member_id)
    return await compute_allocation(db, [member_id])


@router.get("/household-members/{member_id}/sips", response_model=list[SipRow])
def get_member_sips(
    member_id: uuid.UUID,
    include_stopped: bool = False,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    require_member(db, user.id, member_id)
    return compute_active_sips(db, [member_id], include_stopped=include_stopped)


@router.get("/household-members/{member_id}/sips/monthly", response_model=list[SipMonthlyRow])
def get_member_sips_monthly(
    member_id: uuid.UUID,
    year: int | None = None,
    month: int | None = None,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    require_member(db, user.id, member_id)
    today = date.today()
    return compute_sips_for_month(db, [member_id], year or today.year, month or today.month)


@router.get("/household-members/{member_id}/cash-flow", response_model=list[CashFlowEntry])
def get_member_cash_flow(
    member_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    require_member(db, user.id, member_id)
    return compute_cash_flow(db, [member_id])


@router.get("/household-members/{member_id}/snapshots", response_model=list[SnapshotRow])
async def get_member_snapshots(
    member_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    require_member(db, user.id, member_id)
    return await get_snapshots(db, [member_id])

#aggregate dashboard
@router.get("/household/aggregate/holdings", response_model=AggregateHoldingsResponse)
async def get_household_aggregate_holdings(
    user: User = Depends(get_active_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_holdings(db, user.id)


@router.get(
    "/household/aggregate/distributor-comparison",
    response_model=AggregateDistributorComparisonResponse,
)
async def get_household_aggregate_distributor_comparison(
    user: User = Depends(get_active_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_distributor_comparison(db, user.id)


@router.get("/household/aggregate/allocation", response_model=AggregateAllocationResponse)
async def get_household_aggregate_allocation(
    user: User = Depends(get_active_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_allocation(db, user.id)


@router.get("/household/aggregate/sips", response_model=AggregateSipsResponse)
def get_household_aggregate_sips(
    include_stopped: bool = False,
    user: User = Depends(get_active_user), db: DbSession = Depends(get_db)
):
    return get_aggregate_sips(db, user.id, include_stopped=include_stopped)


@router.get("/household/aggregate/sips/monthly", response_model=AggregateSipsMonthlyResponse)
def get_household_aggregate_sips_monthly(
    year: int | None = None,
    month: int | None = None,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    today = date.today()
    return get_aggregate_sips_monthly(db, user.id, year or today.year, month or today.month)


@router.get("/household/aggregate/cash-flow", response_model=AggregateCashFlowResponse)
def get_household_aggregate_cash_flow(
    user: User = Depends(get_active_user), db: DbSession = Depends(get_db)
):
    return get_aggregate_cash_flow(db, user.id)


@router.get("/household/aggregate/snapshots", response_model=AggregateSnapshotsResponse)
async def get_household_aggregate_snapshots(
    user: User = Depends(get_active_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_snapshots(db, user.id)
