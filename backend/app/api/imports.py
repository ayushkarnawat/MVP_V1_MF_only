import hashlib
import logging
import uuid
from datetime import date

from collections.abc import Callable
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, commit_off_loop, get_db
from app.models.folio import Folio
from app.models.imports import Import
from app.models.transaction import Transaction
from app.models.analytics import AnalyticsSection
from app.models.reference import NavHistory, Scheme
from app.models.enums import ConsentAction, ConsentDocumentType, ImportStatus
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
from app.services.dashboard.snapshots import rebuild_member_snapshots
from app.services.import_.coverage_gap import evaluate_folio_coverage_gaps
from app.services.import_.lifecycle_service import (
    FileTooLargeError,
    InvalidFileFormatError,
    SessionExpiredError,
    validate_file_payload,
)
from app.services.import_.preview_store import PREVIEW_STATUSES
from app.services.import_.deletion import ImportNotFoundError, delete_import
from app.services.import_.confirm_people import AlreadyImportedError, ConfirmInvalidError, confirm_people_import
from app.services.import_.name_match import InvalidPersonNameError
from app.services.import_.parser import ParseError, parse_cas_pdf_bytes #parsing logic
from app.services.import_.schemas import (
    DeleteImportResponse,
    HouseholdImportHistoryItem,
    ImportConfirmRequest,
    ImportConfirmResponse,
    AcknowledgeRequest,
    ImportPreviewResponse,
    ImportPromptDetail,
    ResolveNameRequest,
    ResolvePanRequest,
    ResolveSamePersonRequest,
    ResolveSelfRequest,
)
from app.services.import_.pan_claims import PanConflictError
from app.services.legal.consent import (
    UPLOAD_DOCUMENTS,
    AcceptedDocument,
    ConsentRequiredError,
    evidence_from_request,
    record_consent,
    validate_accepted,
)
from app.services.import_.service import (  # logic to process & confirm import
    SESSION_EXPIRED_MESSAGE,
    ImportPromptError,
    InvalidResolveChoiceError,
    NameNotOnStatementError,
    SchemeConfidenceError,
    acknowledge_prompt,
    confirm_import,
    discard_import_session,
    resolve_name,
    resolve_pan,
    resolve_same_person,
    resolve_self,
    start_import_session,
)

router = APIRouter(prefix="/imports", tags=["imports"])
logger = logging.getLogger(__name__)


def _history_item(import_record: Import, member_name: str, group_people_count: int) -> HouseholdImportHistoryItem:
    return HouseholdImportHistoryItem(
        import_id=str(import_record.id),
        household_member_id=str(import_record.household_member_id),
        uploaded_at=import_record.uploaded_at.isoformat(),
        statement_from_date=(import_record.statement_from_date.isoformat() if import_record.statement_from_date else None),
        statement_to_date=(import_record.statement_to_date.isoformat() if import_record.statement_to_date else None),
        status=import_record.status.value,
        new_transactions_count=import_record.new_transactions_count,
        upload_group_id=(str(import_record.upload_group_id) if import_record.upload_group_id else None),
        member_name=member_name,
        group_people_count=group_people_count,
    )


_CAMS_PLACEHOLDER_STATUSES = (ImportStatus.REQUESTING_CAS, ImportStatus.WAITING_FOR_USER, ImportStatus.EXPIRED)


@router.get("/history", response_model=list[HouseholdImportHistoryItem])
def list_household_import_history(
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Import, HouseholdMember.name)
        .join(HouseholdMember, HouseholdMember.id == Import.household_member_id)
        .filter(HouseholdMember.user_id == user.id)
        # A CAMS request (WAITING_FOR_USER, or EXPIRED once abandoned/cancelled) is a
        # placeholder for a statement CAMS will email later, not an import: no file,
        # no period, no transactions. It showed up as "Statement period unavailable".
        .filter(Import.status.notin_(_CAMS_PLACEHOLDER_STATUSES), Import.status.notin_(PREVIEW_STATUSES))
        .order_by(Import.uploaded_at.desc())
        .all()
    )
    people_in_group: dict[uuid.UUID, int] = {}
    for import_record, _name in rows:
        if import_record.upload_group_id is not None:
            people_in_group[import_record.upload_group_id] = people_in_group.get(import_record.upload_group_id, 0) + 1
    return [
        _history_item(import_record, name, people_in_group.get(import_record.upload_group_id, 1))
        for import_record, name in rows
    ]


def claim_and_dispatch_recompute(db: Session, user_id: uuid.UUID, background_tasks: BackgroundTasks) -> None:
    """After a data-changing commit: claim the household's recompute slot and
    dispatch it in the background (released again if dispatch fails)."""
    if try_claim_recompute(db, user_id):
        background_tasks.add_task(_dispatch_recompute_and_release_claim_on_failure, user_id)


# Plain `def` (threadpool): commits, and a db.commit() in an async def would
# freeze the event loop (bb5225f).
@router.delete("/{import_id}", response_model=DeleteImportResponse)
def delete_household_import(
    import_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    scope: Literal["person", "group"] = "person",
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    try:
        result = delete_import(db, user.id, import_id, scope, background_tasks=background_tasks)
    except ImportNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Import not found.") from exc
    claim_and_dispatch_recompute(db, user.id, background_tasks)
    return DeleteImportResponse(
        deleted_transactions_count=result.deleted_transactions_count,
        removed_member_ids=[str(m) for m in result.removed_member_ids],
        deleted_file=result.deleted_file,
    )


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

def _prompt_http(exc: ImportPromptError) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail=ImportPromptDetail(
            code=exc.code, message=exc.message, session_id=exc.session_id, details=exc.details,
        ).model_dump(),
    )


def _session_expired_http() -> HTTPException:
    return HTTPException(status_code=410, detail={"code": "session_expired", "message": SESSION_EXPIRED_MESSAGE})


def _run_resolve(call: Callable[[], ImportPreviewResponse]) -> ImportPreviewResponse:
    """Shared error mapping for the resolve routes: 200 preview, 409 next
    prompt, 410 session_expired, 422 for a bad answer."""
    try:
        return call()
    except SessionExpiredError as exc:
        raise _session_expired_http() from exc
    except ImportPromptError as exc:
        raise _prompt_http(exc) from exc
    except PanConflictError as exc:
        raise HTTPException(status_code=409, detail={"code": exc.code, "message": exc.message}) from exc
    except (InvalidPersonNameError, NameNotOnStatementError, InvalidResolveChoiceError) as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc


PAN_DISCLAIMER_CONSENT_MESSAGE = "Tick the box to confirm you’re authorised to share this statement."
_UPLOAD_SURFACES = frozenset({"onboarding_upload", "import_upload", "mobile_upload"})


def validate_pan_disclaimer(version: str | None):
    """The PAN disclaimer at its current version, else 422 consent_required.
    Shared with the CAMS-request route (cas_imports.py)."""
    accepted = (
        [AcceptedDocument(document_type=ConsentDocumentType.PAN_DISCLAIMER, document_version=version)]
        if version
        else []
    )
    try:
        return validate_accepted(accepted, UPLOAD_DOCUMENTS)
    except ConsentRequiredError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": exc.code, "message": PAN_DISCLAIMER_CONSENT_MESSAGE, "missing": exc.missing},
        ) from exc


#parsing & review
@router.post("/parse", response_model=ImportPreviewResponse)
async def parse_import(
    request: Request,
    file: UploadFile = File(...),
    password: str = Form(""),
    household_member_id: str = Form(...),
    pan_disclaimer_version: str = Form(None),
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail={"code": "invalid_file", "message": "Please upload a PDF file."})

    try:
        member_uuid = uuid.UUID(household_member_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail={"code": "invalid_id", "message": "Invalid household_member_id."}
        ) from exc
    # Ownership gate: the PAN is claimed for this member at upload, so it
    # must be one of the caller's own members (IDOR).
    member = get_household_member_for_user(db, user.id, member_uuid)
    if member is None:
        raise HTTPException(status_code=404, detail="Household member not found.")

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

    # Consent precedes processing: recorded and committed before the PDF is
    # opened, so the row stays even when parsing then fails (wrong password,
    # unsupported file) -- the user did authorise sharing this file.
    documents = validate_pan_disclaimer(pan_disclaimer_version)
    surface = request.headers.get("x-upload-surface")
    record_consent(
        db,
        user_id=user.id,
        documents=documents,
        action=ConsentAction.GIVEN,
        surface=surface if surface in _UPLOAD_SURFACES else "import_upload",
        evidence=evidence_from_request(request),
        related_file_sha256=hashlib.sha256(pdf_bytes).hexdigest(),
    )
    await commit_off_loop(db)

    try:
        parse_result = parse_cas_pdf_bytes(pdf_bytes, password)
    except ParseError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc

    try:
        return await start_import_session(db, user.id, member, parse_result, file.filename, pdf_bytes)
    except ImportPromptError as exc:
        raise _prompt_http(exc) from exc
    except PanConflictError as exc:
        raise HTTPException(status_code=409, detail={"code": exc.code, "message": exc.message}) from exc

#import confirmation
# Plain `def` (F31): it commits, so it runs in the threadpool.
@router.post("/confirm", response_model=ImportConfirmResponse)
def confirm_import_route(
    body: ImportConfirmRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    household_member_id: uuid.UUID | None = None
    if body.household_member_id is not None:
        try:
            household_member_id = uuid.UUID(body.household_member_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="household_member_id must be a valid UUID.") from exc

        # Ownership gate: household_member_id is client-supplied, so without this a
        # caller could confirm an import against any user's household member (IDOR).
        if get_household_member_for_user(db, user.id, household_member_id) is None:
            raise HTTPException(status_code=404, detail="Household member not found.")

    try:
        if body.people is not None:
            response = confirm_people_import(
                db, body.session_id, user.id, body.people, moved_funds=body.moved_funds,
            )
        elif household_member_id is not None:
            response = confirm_import(
                db,
                body.session_id,
                household_member_id,
                body.scheme_confirmations,
                user_id=user.id,
            )
        else:
            raise ConfirmInvalidError("Send people, or household_member_id for a one-person file.")
        member_ids = [uuid.UUID(p.member_id) for p in response.people] or [household_member_id]
        for member_id in dict.fromkeys(member_ids):
            background_tasks.add_task(_prefetch_member_nav_history, member_id)
            background_tasks.add_task(rebuild_member_snapshots, member_id)
        # One recompute claim for the whole household.
        if try_claim_recompute(db, user.id):
            background_tasks.add_task(_dispatch_recompute_and_release_claim_on_failure, user.id)
        return response
    except SessionExpiredError as exc:
        # C2 (Task 7): was 404 via ValueError; the frontend follows in Task 17.
        raise _session_expired_http() from exc
    except ImportPromptError as exc:
        raise _prompt_http(exc) from exc
    except PanConflictError as exc:
        raise HTTPException(status_code=409, detail={"code": exc.code, "message": exc.message}) from exc
    except AlreadyImportedError as exc:
        raise HTTPException(409, {"code": exc.code, "message": exc.message}) from exc
    except SchemeConfidenceError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (ConfirmInvalidError, InvalidPersonNameError) as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/discard", status_code=204)
def discard_import_session_route(
    session_id: str,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
) -> Response:
    discard_import_session(db, session_id, user.id)
    return Response(status_code=204)


# Upload-time prompt answers (Task 7). Plain `def` (F31): they commit, so they
# run in the threadpool rather than on the event loop.
@router.post("/sessions/{session_id}/resolve-name", response_model=ImportPreviewResponse)
def resolve_name_route(
    session_id: str,
    body: ResolveNameRequest,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    return _run_resolve(lambda: resolve_name(db, session_id, user.id, body.name))


@router.post("/sessions/{session_id}/resolve-self", response_model=ImportPreviewResponse)
def resolve_self_route(
    session_id: str,
    body: ResolveSelfRequest,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    return _run_resolve(lambda: resolve_self(db, session_id, user.id, body.person_key))


@router.post("/sessions/{session_id}/resolve-pan", response_model=ImportPreviewResponse)
def resolve_pan_route(
    session_id: str,
    body: ResolvePanRequest,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    return _run_resolve(lambda: resolve_pan(db, session_id, user.id))


@router.post("/sessions/{session_id}/resolve-same-person", response_model=ImportPreviewResponse)
def resolve_same_person_route(
    session_id: str,
    body: ResolveSamePersonRequest,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    return _run_resolve(
        lambda: resolve_same_person(db, session_id, user.id, body.person_key, body.member_id, body.same)
    )


@router.post("/sessions/{session_id}/acknowledge", response_model=ImportPreviewResponse)
def acknowledge_prompt_route(
    session_id: str,
    body: AcknowledgeRequest,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    return _run_resolve(lambda: acknowledge_prompt(db, session_id, user.id, body.code))
