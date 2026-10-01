"""Legal documents and re-consent.

GET  /legal/documents -- public: the exact text, version and hash the client
     shows (and later echoes back as accepted) at signup and upload.
POST /legal/consents  -- authenticated: an existing user agrees to the current
     sign-up documents (T&C + Privacy) after a version bump, or for the first
     time if their account predates consent recording.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.enums import ConsentAction, ConsentDocumentType, ConsentPurpose
from app.models.user import User
from app.services.auth.session import get_active_user
from app.services.legal.consent import (
    SIGNUP_DOCUMENTS,
    AcceptedDocument,
    ConsentRequiredError,
    evidence_from_request,
    latest_state,
    outdated_documents,
    record_consent,
    validate_accepted,
)
from app.services.legal.registry import current_documents

router = APIRouter(prefix="/legal", tags=["legal"])

CONSENT_CONTINUE_MESSAGE = "Agree to the latest Terms & Conditions and Privacy Policy to continue."


class LegalDocumentOut(BaseModel):
    document_type: ConsentDocumentType
    version: str
    title: str
    sha256: str
    content: str
    purposes: list[ConsentPurpose]


class ReconsentBody(BaseModel):
    accepted_documents: list[AcceptedDocument]


class ReconsentResponse(BaseModel):
    consent_outdated: list[str]


class MyConsentOut(BaseModel):
    document_type: ConsentDocumentType
    document_version: str
    recorded_at: datetime


@router.get("/documents", response_model=list[LegalDocumentOut])
def list_documents() -> list[LegalDocumentOut]:
    # Public on purpose: shown before any account exists (signup screen).
    return [
        LegalDocumentOut(
            document_type=d.document_type,
            version=d.version,
            title=d.title,
            sha256=d.sha256,
            content=d.content,
            purposes=list(d.purposes),
        )
        for d in current_documents().values()
    ]


@router.post("/consents", response_model=ReconsentResponse)
def reconsent(
    body: ReconsentBody,
    request: Request,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
) -> ReconsentResponse:
    # Validated against the OUTDATED set only: each document the user still
    # owes must be listed at its current version. Re-agreeing to a document
    # that's already current isn't required (and isn't re-recorded).
    outdated = tuple(outdated_documents(db, user.id, SIGNUP_DOCUMENTS))
    try:
        documents = validate_accepted(body.accepted_documents, outdated)
    except ConsentRequiredError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": exc.code, "message": CONSENT_CONTINUE_MESSAGE, "missing": exc.missing},
        ) from exc
    if documents:
        record_consent(
            db,
            user_id=user.id,
            documents=documents,
            action=ConsentAction.GIVEN,
            surface="reconsent",
            evidence=evidence_from_request(request),
        )
        db.commit()
    return ReconsentResponse(
        consent_outdated=[t.value for t in outdated_documents(db, user.id, SIGNUP_DOCUMENTS)]
    )


@router.get("/consents/me", response_model=list[MyConsentOut])
def my_consents(user: User = Depends(get_active_user), db: Session = Depends(get_db)) -> list[MyConsentOut]:
    """What the user has agreed to, for the Profile "Terms of Service" section.
    A document is listed only while every one of its purposes is still GIVEN
    against that same document (a withdrawal on any purpose omits it)."""
    state = latest_state(db, user.id)
    out: list[MyConsentOut] = []
    for doc_type, doc in current_documents().items():
        rows = [state.get(p) for p in doc.purposes]
        if any(r is None or r.action != ConsentAction.GIVEN or r.document_type != doc_type for r in rows):
            continue
        latest = max(rows, key=lambda r: r.recorded_at)
        out.append(
            MyConsentOut(
                document_type=doc_type,
                document_version=latest.document_version,
                recorded_at=latest.recorded_at,
            )
        )
    return out
