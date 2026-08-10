"""CAMS Online CAS Mailback request portal integration (FR-1, FR-2, FR-8)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import urllib.parse
import uuid

from sqlalchemy.orm import Session

from app.models.enums import ImportStatus
from app.models.imports import Import
from app.models.user import HouseholdMember
from app.services.import_.state_machine import transition_status

CAMS_MAILBACK_BASE_URL = "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement"


def build_cams_mailback_url() -> str:
    """Generates the CAMS Online mailback portal URL."""
    return CAMS_MAILBACK_BASE_URL



def initiate_cams_request(
    db: Session,
    user_id: uuid.UUID,
    household_member_id: uuid.UUID,
) -> tuple[Import, str]:
    """Initiates a CAMS mailback request lifecycle for a household member.

    Transitions to WAITING_FOR_USER with a 48-hour expiration TTL.
    """
    member = (
        db.query(HouseholdMember)
        .filter_by(id=household_member_id, user_id=user_id)
        .first()
    )
    if not member:
        raise ValueError("Household member not found or access denied.")

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=48)

    # Check for active pending request for this member
    existing = (
        db.query(Import)
        .filter(
            Import.household_member_id == household_member_id,
            Import.status.in_([ImportStatus.REQUESTING_CAS, ImportStatus.WAITING_FOR_USER]),
        )
        .first()
    )

    if existing:
        existing.status = ImportStatus.WAITING_FOR_USER
        existing.expires_at = expires_at
        existing.source_tab = "request"
        db.commit()
        db.refresh(existing)
        return existing, build_cams_mailback_url()

    import_rec = Import(
        id=uuid.uuid4(),
        household_member_id=household_member_id,
        status=ImportStatus.WAITING_FOR_USER,
        source_tab="request",
        uploaded_at=now,
        expires_at=expires_at,
    )
    db.add(import_rec)
    db.commit()
    db.refresh(import_rec)
    return import_rec, build_cams_mailback_url()


def cancel_pending_request(
    db: Session,
    import_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Import:
    """Cancels a pending import request, transitioning to EXPIRED status."""
    import_rec = (
        db.query(Import)
        .join(HouseholdMember, Import.household_member_id == HouseholdMember.id)
        .filter(Import.id == import_id, HouseholdMember.user_id == user_id)
        .first()
    )
    if not import_rec:
        raise ValueError("Import record not found or access denied.")

    import_rec.status = transition_status(import_rec.status, ImportStatus.EXPIRED)
    db.commit()
    db.refresh(import_rec)
    return import_rec
