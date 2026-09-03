import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db
from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
from app.models.reference import Scheme
from app.models.user import User
from app.services.analytics.dispatch import dispatcher
from app.services.analytics.pdf_export import (
    consume_export_payload,
    render_analytics_pdf,
    store_export_payload,
)
from app.services.analytics.recompute import should_dispatch_recompute
from app.services.analytics.schemas import (
    AnalyticsScopeResponse,
    AnalyticsSectionState,
    FundScoreRow,
)
from app.services.analytics.scorer import compute_fund_score
from app.services.auth.session import get_current_user
from app.services.dashboard.household_members import get_household_member_for_user

router = APIRouter(prefix="/analytics", tags=["analytics"]) #for analytics related endpoints


class AnalyticsExportRequest(BaseModel):
    scope: str  # "aggregate" | "member"
    member_id: uuid.UUID | None
    payload: dict


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


@router.get("/{scope}", response_model=AnalyticsScopeResponse)
def get_analytics_scope(
    scope: str,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if scope != "combined":
        try:
            member_uuid = uuid.UUID(scope)
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail='scope must be "combined" or a household member id.'
            ) from exc
        if get_household_member_for_user(db, user.id, member_uuid) is None:
            raise HTTPException(status_code=404, detail="Household member not found.")

    rows = (
        db.query(AnalyticsSection)
        .filter(AnalyticsSection.user_id == user.id, AnalyticsSection.scope_key == scope)
        .all()
    )
    sections = {
        row.section: AnalyticsSectionState(payload=row.payload, computed_at=row.computed_at, failed_at=row.failed_at)
        for row in rows
    }

    status = db.get(AnalyticsRecomputeStatus, user.id)
    recomputing = status is not None and status.started_at is not None

    if not rows and not recomputing:
        if should_dispatch_recompute(db, user.id):
            dispatcher.dispatch(user.id)
        recomputing = True

    return AnalyticsScopeResponse(scope=scope, recomputing=recomputing, sections=sections)


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
