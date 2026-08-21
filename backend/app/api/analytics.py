import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db
from app.models.reference import Scheme
from app.models.user import User
from app.services.analytics.allocation import (
    compute_category_allocation,
    get_aggregate_category_allocation,
)
from app.services.analytics.benchmark import (
    compute_fund_vs_benchmark,
    compute_portfolio_vs_benchmarks,
    get_aggregate_fund_vs_benchmark,
    get_aggregate_portfolio_vs_benchmarks,
)
from app.services.analytics.category_ranking import (
    compute_category_ranking,
    get_aggregate_category_ranking,
)
from app.services.analytics.schemas import (
    AggregateAnalyticsAllocationResponse,
    AggregateCategoryRankingResponse,
    AggregateDirectRegularTerResponse,
    AggregateFundVsBenchmarkResponse,
    AggregatePortfolioBenchmarkResponse,
    AggregatePortfolioScoreResponse,
    AggregateWeightedTerResponse,
    AnalyticsAllocationSummary,
    CategoryRankingSummary,
    DirectRegularTerComparison,
    FundScoreRow,
    FundVsBenchmarkSummary,
    PortfolioBenchmarkSummary,
    PortfolioScoreSummary,
    WeightedTerSummary,
)
from app.services.analytics.pdf_export import (
    consume_export_payload,
    render_analytics_pdf,
    store_export_payload,
)
from app.services.analytics.scorer import (
    compute_fund_score,
    compute_portfolio_score,
    get_aggregate_portfolio_score,
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


class AnalyticsExportRequest(BaseModel):
    scope: str  # "aggregate" | "member"
    member_id: uuid.UUID | None
    payload: dict


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


@router.get("/household-members/{member_id}/benchmark", response_model=PortfolioBenchmarkSummary)
async def get_member_portfolio_benchmark(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_portfolio_vs_benchmarks(db, [member_id])


@router.get("/household/aggregate/benchmark", response_model=AggregatePortfolioBenchmarkResponse)
async def get_household_aggregate_portfolio_benchmark(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_portfolio_vs_benchmarks(db, user.id)


@router.get("/household-members/{member_id}/benchmark/funds", response_model=FundVsBenchmarkSummary)
async def get_member_fund_benchmark(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_fund_vs_benchmark(db, [member_id])


@router.get("/household/aggregate/benchmark/funds", response_model=AggregateFundVsBenchmarkResponse)
async def get_household_aggregate_fund_benchmark(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_fund_vs_benchmark(db, user.id)


@router.get("/household-members/{member_id}/category-ranking", response_model=CategoryRankingSummary)
async def get_member_category_ranking(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_category_ranking(db, [member_id])


@router.get("/household/aggregate/category-ranking", response_model=AggregateCategoryRankingResponse)
async def get_household_aggregate_category_ranking(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_category_ranking(db, user.id)


@router.get("/funds/{scheme_id}/score", response_model=FundScoreRow)
async def get_fund_score(
    scheme_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    scheme = db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=404, detail="Scheme not found.")
    return await compute_fund_score(db, scheme)


@router.get("/household-members/{member_id}/score", response_model=PortfolioScoreSummary)
async def get_member_portfolio_score(
    member_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if get_household_member_for_user(db, user.id, member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return await compute_portfolio_score(db, [member_id])


@router.get("/household/aggregate/score", response_model=AggregatePortfolioScoreResponse)
async def get_household_aggregate_portfolio_score(
    user: User = Depends(get_current_user), db: DbSession = Depends(get_db)
):
    return await get_aggregate_portfolio_score(db, user.id)


@router.post("/export/pdf")
async def export_analytics_pdf(
    body: AnalyticsExportRequest,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if body.scope == "member":
        if body.member_id is None or get_household_member_for_user(db, user.id, body.member_id) is None:
            raise HTTPException(status_code=404, detail="Household member not found.")

    token = store_export_payload(body.payload)
    try:
        pdf_bytes = await render_analytics_pdf(token)
    except Exception:
        raise HTTPException(
            status_code=500, detail="Failed to generate PDF export."
        ) from None
    finally:
        # finally, not except Exception: asyncio.CancelledError derives from
        # BaseException (client disconnect / request timeout while awaiting
        # Playwright), and the spec requires cleanup regardless of outcome.
        # consume_export_payload is an idempotent pop — a no-op if the print
        # page's own payload fetch already consumed it on the success path.
        consume_export_payload(token)
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.get("/export/payload/{token}")
async def get_export_payload(token: str):
    payload = consume_export_payload(token)
    if payload is None:
        raise HTTPException(status_code=404, detail="Export token not found or expired.")
    return payload
