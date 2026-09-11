import logging
import uuid
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, get_db
from app.models.folio import Folio
from app.models.imports import Import
from app.models.transaction import Transaction
from app.models.analytics import AnalyticsSection
from app.models.reference import NavHistory, Scheme
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user
from app.services.analytics.dispatch import dispatcher
from app.services.analytics.recompute import (
    bump_recompute_generation,
    release_recompute_claim,
    try_claim_recompute,
)
from app.services.dashboard.household_members import get_household_member_for_user
from app.services.dashboard.nav import get_navs_on_or_before
from app.services.dashboard.holdings import invalidate_holdings_cache
from app.services.import_.attribution import AttributionConfirmationRequiredError
from app.services.import_.coverage_gap import evaluate_folio_coverage_gaps
from app.services.import_.lifecycle_service import (
    FileTooLargeError,
    InvalidFileFormatError,
    validate_file_payload,
)
from app.services.import_.parser import ParseError, parse_cas_pdf_bytes #parsing logic
from app.services.import_.schemas import (
    DeleteImportResponse,
    HouseholdImportHistoryItem,
    ImportConfirmRequest,
    ImportConfirmResponse,
    ImportPreviewResponse,
)
from app.services.import_.service import SchemeConfidenceError, build_import_preview, confirm_import #logic to process & confirm import

router = APIRouter(prefix="/imports", tags=["imports"])
logger = logging.getLogger(__name__)


def _history_item(import_record: Import) -> HouseholdImportHistoryItem:
    return HouseholdImportHistoryItem(
        import_id=str(import_record.id),
        household_member_id=str(import_record.household_member_id),
        uploaded_at=import_record.uploaded_at.isoformat(),
        statement_from_date=(import_record.statement_from_date.isoformat() if import_record.statement_from_date else None),
        statement_to_date=(import_record.statement_to_date.isoformat() if import_record.statement_to_date else None),
        status=import_record.status.value,
        new_transactions_count=import_record.new_transactions_count,
    )


@router.get("/history", response_model=list[HouseholdImportHistoryItem])
def list_household_import_history(
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    imports = (
        db.query(Import)
        .join(HouseholdMember, HouseholdMember.id == Import.household_member_id)
        .filter(HouseholdMember.user_id == user.id)
        .order_by(Import.uploaded_at.desc())
        .all()
    )
    return [_history_item(import_record) for import_record in imports]


@router.delete("/{import_id}", response_model=DeleteImportResponse)
def delete_household_import(
    import_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    import_record = (
        db.query(Import)
        .join(HouseholdMember, HouseholdMember.id == Import.household_member_id)
        .filter(Import.id == import_id, HouseholdMember.user_id == user.id)
        .first()
    )
    if import_record is None:
        raise HTTPException(status_code=404, detail="Import not found.")

    member_id = import_record.household_member_id
    affected_folio_ids = [
        folio_id
        for (folio_id,) in (
            db.query(Transaction.folio_id)
            .filter(Transaction.import_id == import_record.id)
            .distinct()
            .all()
        )
    ]
    deleted_count = (
        db.query(Transaction)
        .filter(Transaction.import_id == import_record.id)
        .delete(synchronize_session=False)
    )
    for folio_id in affected_folio_ids:
        folio = db.get(Folio, folio_id)
        if folio is None:
            continue
        has_transactions = (
            db.query(Transaction.id).filter(Transaction.folio_id == folio_id).first()
            is not None
        )
        if not has_transactions:
            db.delete(folio)
        else:
            evaluate_folio_coverage_gaps(db, folio_id)
    db.delete(import_record)
    # Bump generation first: on PostgreSQL the upsert takes a row lock on
    # analytics_recompute_status immediately, before commit. A concurrent
    # worker's _locked_generation() FOR UPDATE either blocks until this
    # transaction commits (then sees the bumped generation and abandons its
    # write) or already holds the lock (then this delete waits and removes
    # whatever stale section it just inserted). Bumping after the delete
    # left a window where the worker could insert a section between the
    # delete and the bump, surviving both.
    bump_recompute_generation(db, user.id)
    db.query(AnalyticsSection).filter(AnalyticsSection.user_id == user.id).delete(synchronize_session=False)
    db.commit()
    # Invalidate the cache only after commit -- otherwise a request racing
    # the delete could capture the bumped generation while still reading
    # the pre-delete transactions, then publish that stale read under the
    # new generation with nothing left to invalidate it.
    invalidate_holdings_cache(member_id)
    return DeleteImportResponse(deleted_transactions_count=deleted_count)


def _latest_nav_dates(db: Session, scheme_ids: list[uuid.UUID]) -> dict[uuid.UUID, date]:
    if not scheme_ids:
        return {}
    return dict(
        db.query(NavHistory.scheme_id, func.max(NavHistory.date))
        .filter(NavHistory.scheme_id.in_(scheme_ids))
        .group_by(NavHistory.scheme_id)
        .all()
    )


def _dispatch_recompute_and_release_claim_on_failure(user_id: uuid.UUID) -> None:
    """Runs as a background task, after confirm_import_route already
    committed the claim via try_claim_recompute -- if dispatch never
    actually places the ECS task (unconfigured, or RunTask failures), a
    fresh session releases that claim rather than leaving it orphaned for
    up to the 2-hour staleness ceiling."""
    try:
        if dispatcher.dispatch(user_id):
            return
    except Exception:
        logger.exception("Analytics recompute dispatch failed for user %s", user_id)
    db: Session | None = None
    try:
        db = SessionLocal()
        release_recompute_claim(db, user_id)
    except Exception:
        logger.exception("Failed to release analytics recompute claim for user %s", user_id)
    finally:
        if db is not None:
            db.close()


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
    user: User = Depends(get_active_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail={"code": "invalid_file", "message": "Please upload a PDF file."})

    pdf_bytes = await file.read()
    try:
        validate_file_payload(pdf_bytes)
    except InvalidFileFormatError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_file", "message": str(exc)},
        ) from exc
    except FileTooLargeError as exc:
        raise HTTPException(
            status_code=413,
            detail={"code": "file_too_large", "message": str(exc)},
        ) from exc

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
    user: User = Depends(get_active_user),
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
        response = confirm_import(
            db,
            body.session_id,
            household_member_id,
            body.scheme_confirmations,
            user_id=user.id,
            confirmed_member_override=body.confirmed_member_override,
        )
        background_tasks.add_task(_prefetch_member_nav_history, household_member_id)
        if try_claim_recompute(db, user.id):
            background_tasks.add_task(_dispatch_recompute_and_release_claim_on_failure, user.id)
        return response
    except AttributionConfirmationRequiredError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "member_mismatch",
                "message": str(exc),
                "matched_member_id": (
                    str(exc.attribution.resolved_member_id)
                    if exc.attribution.resolved_member_id
                    else None
                ),
                "matched_member_name": exc.attribution.matched_member_name,
            },
        ) from exc
    except SchemeConfidenceError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
