"""API routes for CAS Import lifecycle management per Updated-CAS-PRD & Updated-CAS-App-Flow."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.imports import validate_pan_disclaimer
from app.db.session import get_db
from app.models.enums import ConsentAction
from app.models.imports import Import
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user
from app.services.dashboard.household_members import get_household_member_for_user
from app.services.dashboard.member_details import require_unlocked_member
from app.services.legal.consent import evidence_from_request, record_consent

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
    parse_warnings: list[str] = Field(default_factory=list)


class CAMSInitiateRequest(BaseModel):
    household_member_id: str
    # Optional in the schema so a missing value is the 422 consent_required
    # (with the disclaimer copy), not a generic pydantic validation error.
    pan_disclaimer_version: str | None = None


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
        "parse_warnings": list(getattr(rec, "parse_warnings", [])),
    }


_REVIEW_REQUIRED = {
    "code": "review_required",
    "message": "Upload this statement through the review screen.",
}


# M18: no path may import a CAS without people detection. The route stays (rather
# than 404) so old clients get a clear answer; it never reads the upload.
@router.post("/cas-imports", status_code=status.HTTP_409_CONFLICT)
async def upload_cas_import(user: User = Depends(get_active_user)):
    raise HTTPException(status_code=409, detail=_REVIEW_REQUIRED)


@router.get("/cas-imports/{import_id}", response_model=CASImportStatusResponse)
def get_cas_import_status(
    import_id: str,
    user: User = Depends(get_active_user),
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
    user: User = Depends(get_active_user),
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

    # M18: password retry parsed and committed without people detection.
    raise HTTPException(status_code=409, detail=_REVIEW_REQUIRED)


@router.get("/household-members/{member_id}/cas-imports", response_model=list[CASImportStatusResponse])
def list_member_import_history(
    member_id: str,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    try:
        member_uuid = uuid.UUID(member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid member_id.") from exc

    require_unlocked_member(db, user.id, member_uuid)

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
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    try:
        member_uuid = uuid.UUID(member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid member_id.") from exc

    require_unlocked_member(db, user.id, member_uuid)

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
    user: User = Depends(get_active_user),
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

    # A locked member's folio is not writable from a side door (same gate as the
    # member-scope reads). Unknown/foreign folios fall through to the existing 400.
    owned = (
        db.query(Folio.household_member_id)
        .join(HouseholdMember, Folio.household_member_id == HouseholdMember.id)
        .filter(Folio.id == folio_uuid, HouseholdMember.user_id == user.id)
        .first()
    )
    if owned is not None:
        require_unlocked_member(db, user.id, owned[0])

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
    request: Request,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    try:
        member_uuid = uuid.UUID(body.household_member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid household_member_id.") from exc

    from app.services.import_.cams_portal import initiate_cams_request

    require_unlocked_member(db, user.id, member_uuid)
    # Validated before any import row exists; recorded after, so the row can
    # carry the import id.
    documents = validate_pan_disclaimer(body.pan_disclaimer_version)

    try:
        import_rec, cams_url = initiate_cams_request(db, user.id, member_uuid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # initiate_cams_request commits on its own, so this is a second commit
    # right after it (plain `def` route: a direct commit is fine here).
    record_consent(
        db,
        user_id=user.id,
        documents=documents,
        action=ConsentAction.GIVEN,
        surface="cams_request",
        evidence=evidence_from_request(request),
        related_import_id=import_rec.id,
    )
    db.commit()

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
    user: User = Depends(get_active_user),
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
