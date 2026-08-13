import logging
import uuid
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, get_db
from app.models.folio import Folio
from app.models.reference import NavHistory, Scheme
from app.models.user import User
from app.services.auth.session import get_current_user
from app.services.dashboard.household_members import get_household_member_for_user
from app.services.dashboard.nav import get_navs_on_or_before
from app.services.dashboard.holdings import invalidate_holdings_cache
from app.services.import_.parser import ParseError, parse_cas_pdf_bytes #parsing logic
from app.services.import_.schemas import ImportConfirmRequest, ImportConfirmResponse, ImportPreviewResponse
from app.services.import_.service import SchemeConfidenceError, build_import_preview, confirm_import #logic to process & confirm import

router = APIRouter(prefix="/imports", tags=["imports"])
logger = logging.getLogger(__name__)


def _latest_nav_dates(db: Session, scheme_ids: list[uuid.UUID]) -> dict[uuid.UUID, date]:
    if not scheme_ids:
        return {}
    return dict(
        db.query(NavHistory.scheme_id, func.max(NavHistory.date))
        .filter(NavHistory.scheme_id.in_(scheme_ids))
        .group_by(NavHistory.scheme_id)
        .all()
    )


async def _prefetch_member_nav_history(household_member_id: uuid.UUID) -> None:
    db: Session | None = None
    try:
        db = SessionLocal()
        schemes = (
            db.query(Scheme)
            .join(Folio, Folio.scheme_id == Scheme.id)
            .filter(Folio.household_member_id == household_member_id)
            .all()
        )
        unique_schemes = {scheme.id: scheme for scheme in schemes}
        previous_dates = _latest_nav_dates(db, list(unique_schemes))
        await get_navs_on_or_before(
            db, [(scheme, date.today()) for scheme in unique_schemes.values()]
        )
        refreshed_dates = _latest_nav_dates(db, list(unique_schemes))
        if any(
            previous_dates.get(scheme_id) is None or refreshed_date > previous_dates[scheme_id]
            for scheme_id, refreshed_date in refreshed_dates.items()
        ):
            invalidate_holdings_cache(household_member_id)
    except Exception:
        logger.exception("NAV prefetch failed for household member %s", household_member_id)
    finally:
        if db is not None:
            db.close()

#parsing & review
@router.post("/parse", response_model=ImportPreviewResponse)
async def parse_import(
    file: UploadFile = File(...),
    password: str = Form(...),
    user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail={"code": "invalid_file", "message": "Please upload a PDF file."})

    pdf_bytes = await file.read()
    try:
        parse_result = parse_cas_pdf_bytes(pdf_bytes, password)
    except ParseError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc

    return await build_import_preview(parse_result, file.filename)

#import confirmation
@router.post("/confirm", response_model=ImportConfirmResponse)
def confirm_import_route(
    body: ImportConfirmRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        household_member_id = uuid.UUID(body.household_member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="household_member_id must be a valid UUID.") from exc

    # Ownership gate: household_member_id is client-supplied, so without this a
    # caller could confirm an import against any user's household member (IDOR).
    if get_household_member_for_user(db, user.id, household_member_id) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")

    try:
        response = confirm_import(db, body.session_id, household_member_id, body.scheme_confirmations)
        background_tasks.add_task(_prefetch_member_nav_history, household_member_id)
        return response
    except SchemeConfidenceError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
