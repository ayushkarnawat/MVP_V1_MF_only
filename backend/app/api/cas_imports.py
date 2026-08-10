"""API routes for CAS Import lifecycle management per Updated-CAS-PRD & Updated-CAS-App-Flow."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.imports import Import
from app.models.user import User
from app.services.auth.session import get_current_user
from app.services.dashboard.household_members import get_household_member_for_user
from app.services.import_.lifecycle_service import (
    FileTooLargeError,
    InvalidFileFormatError,
    SessionExpiredError,
    create_cas_import,
    retry_cas_import_password,
)

router = APIRouter(tags=["cas-imports"])


class PasswordRetryRequest(BaseModel):
    password: str


class AttributionUpdateRequest(BaseModel):
    household_member_id: str


class CASImportStatusResponse(BaseModel):
    import_id: str
    household_member_id: str
    status: str
    error_code: str | None = None
    error_message: str | None = None
    new_transactions_count: int | None = None
    duplicate_transactions_count: int | None = None
    statement_from_date: str | None = None
    statement_to_date: str | None = None
    source_cas_type: str | None = None
    uploaded_at: str
    confirmed_at: str | None = None


class CAMSInitiateRequest(BaseModel):
    household_member_id: str


class CAMSInitiateResponse(BaseModel):
    import_id: str
    household_member_id: str
    status: str
    cams_url: str
    expires_at: str



def _serialize_import_response(rec: Import) -> dict[str, Any]:
    return {
        "import_id": str(rec.id),
        "household_member_id": str(rec.household_member_id),
        "status": rec.status.value,
        "error_code": rec.error_code,
        "error_message": rec.error_message,
        "new_transactions_count": rec.new_transactions_count,
        "duplicate_transactions_count": rec.duplicate_transactions_count,
        "statement_from_date": rec.statement_from_date.isoformat() if rec.statement_from_date else None,
        "statement_to_date": rec.statement_to_date.isoformat() if rec.statement_to_date else None,
        "source_cas_type": rec.source_cas_type.value if rec.source_cas_type else None,
        "uploaded_at": rec.uploaded_at.isoformat(),
        "confirmed_at": rec.confirmed_at.isoformat() if rec.confirmed_at else None,
    }


@router.post("/cas-imports", status_code=status.HTTP_202_ACCEPTED, response_model=CASImportStatusResponse)
async def upload_cas_import(
    file: UploadFile = File(...),
    password: str = Form(...),
    household_member_id: str = Form(...),
    source_tab: str = Form("upload"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        member_uuid = uuid.UUID(household_member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "invalid_id", "message": "Invalid household_member_id."}) from exc

    if get_household_member_for_user(db, user.id, member_uuid) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")

    pdf_bytes = await file.read()
    try:
        import_rec = create_cas_import(
            db=db,
            user_id=user.id,
            household_member_id=member_uuid,
            file_bytes=pdf_bytes,
            filename=file.filename or "statement.pdf",
            password=password,
            source_tab=source_tab,
        )
    except InvalidFileFormatError as exc:
        raise HTTPException(status_code=400, detail={"code": "invalid_file", "message": str(exc)}) from exc
    except FileTooLargeError as exc:
        raise HTTPException(status_code=413, detail={"code": "file_too_large", "message": str(exc)}) from exc

    return _serialize_import_response(import_rec)


@router.get("/cas-imports/{import_id}", response_model=CASImportStatusResponse)
def get_cas_import_status(
    import_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        import_uuid = uuid.UUID(import_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid import_id.") from exc

    import_rec = db.query(Import).filter_by(id=import_uuid).first()
    if not import_rec:
        raise HTTPException(status_code=404, detail="Import not found.")

    if get_household_member_for_user(db, user.id, import_rec.household_member_id) is None:
        raise HTTPException(status_code=403, detail="Access denied to this import record.")

    return _serialize_import_response(import_rec)


@router.patch("/cas-imports/{import_id}/password", response_model=CASImportStatusResponse)
def retry_password(
    import_id: str,
    body: PasswordRetryRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        import_uuid = uuid.UUID(import_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid import_id.") from exc

    import_rec = db.query(Import).filter_by(id=import_uuid).first()
    if not import_rec:
        raise HTTPException(status_code=404, detail="Import not found.")

    if get_household_member_for_user(db, user.id, import_rec.household_member_id) is None:
        raise HTTPException(status_code=403, detail="Access denied to this import record.")

    try:
        updated_rec = retry_cas_import_password(
            db=db,
            import_id=import_uuid,
            user_id=user.id,
            new_password=body.password,
        )
    except SessionExpiredError as exc:
        raise HTTPException(status_code=410, detail={"code": "session_expired", "message": str(exc)}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _serialize_import_response(updated_rec)


@router.get("/household-members/{member_id}/cas-imports", response_model=list[CASImportStatusResponse])
def list_member_import_history(
    member_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        member_uuid = uuid.UUID(member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid member_id.") from exc

    if get_household_member_for_user(db, user.id, member_uuid) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")

    history = (
        db.query(Import)
        .filter_by(household_member_id=member_uuid)
        .order_by(Import.uploaded_at.desc())
        .all()
    )
    return [_serialize_import_response(rec) for rec in history]


class CoverageGapItemResponse(BaseModel):
    folio_id: str
    folio_number: str
    scheme_id: str
    scheme_name: str
    deficit_units: str
    first_deficit_date: str


class OpeningBalanceRequest(BaseModel):
    units: str
    date: str
    amount: str | None = None
    nav: str | None = None


class OpeningBalanceResponse(BaseModel):
    transaction_id: str
    folio_id: str
    type: str
    date: str
    units: str
    amount: str
    nav: str
    has_coverage_gap: bool


@router.get("/household-members/{member_id}/coverage-gaps", response_model=list[CoverageGapItemResponse])
def list_member_coverage_gaps(
    member_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        member_uuid = uuid.UUID(member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid member_id.") from exc

    if get_household_member_for_user(db, user.id, member_uuid) is None:
        raise HTTPException(status_code=404, detail="Household member not found.")

    from app.models.folio import Folio
    from app.models.reference import Scheme

    folios = (
        db.query(Folio, Scheme)
        .join(Scheme, Folio.scheme_id == Scheme.id)
        .filter(Folio.household_member_id == member_uuid, Folio.has_coverage_gap.is_(True))
        .all()
    )

    results = []
    for folio, scheme in folios:
        details = folio.coverage_gap_details or {}
        results.append(
            CoverageGapItemResponse(
                folio_id=str(folio.id),
                folio_number=folio.folio_number,
                scheme_id=str(scheme.id),
                scheme_name=scheme.name,
                deficit_units=details.get("deficit_units", "0.000"),
                first_deficit_date=details.get("first_deficit_date", ""),
            )
        )
    return results


@router.post("/folios/{folio_id}/opening-balance", status_code=status.HTTP_201_CREATED, response_model=OpeningBalanceResponse)
def post_opening_balance(
    folio_id: str,
    body: OpeningBalanceRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        folio_uuid = uuid.UUID(folio_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid folio_id.") from exc

    from datetime import date as date_
    from decimal import Decimal
    from app.models.folio import Folio
    from app.services.import_.coverage_gap import create_opening_balance

    try:
        units_dec = Decimal(body.units)
        date_val = date_.fromisoformat(body.date)
        amount_dec = Decimal(body.amount) if body.amount else None
        nav_dec = Decimal(body.nav) if body.nav else None
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid payload format: {exc}") from exc

    try:
        txn = create_opening_balance(
            db=db,
            folio_id=folio_uuid,
            user_id=user.id,
            units=units_dec,
            date_=date_val,
            amount=amount_dec,
            nav=nav_dec,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    folio = db.get(Folio, folio_uuid)
    assert folio is not None

    return OpeningBalanceResponse(
        transaction_id=str(txn.id),
        folio_id=str(txn.folio_id),
        type=txn.type.value,
        date=txn.date.isoformat(),
        units=str(txn.units),
        amount=str(txn.amount),
        nav=str(txn.nav),
        has_coverage_gap=bool(folio.has_coverage_gap),
    )


@router.post("/cas-imports/request", status_code=status.HTTP_201_CREATED, response_model=CAMSInitiateResponse)
def request_cams_statement(
    body: CAMSInitiateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        member_uuid = uuid.UUID(body.household_member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid household_member_id.") from exc

    from app.services.import_.cams_portal import initiate_cams_request

    try:
        import_rec, cams_url = initiate_cams_request(db, user.id, member_uuid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return CAMSInitiateResponse(
        import_id=str(import_rec.id),
        household_member_id=str(import_rec.household_member_id),
        status=import_rec.status.value,
        cams_url=cams_url,
        expires_at=import_rec.expires_at.isoformat() if import_rec.expires_at else "",
    )


@router.post("/cas-imports/{import_id}/cancel", response_model=CASImportStatusResponse)
def cancel_import_request(
    import_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        import_uuid = uuid.UUID(import_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid import_id.") from exc

    from app.services.import_.cams_portal import cancel_pending_request

    try:
        cancelled_rec = cancel_pending_request(db, import_uuid, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _serialize_import_response(cancelled_rec)


