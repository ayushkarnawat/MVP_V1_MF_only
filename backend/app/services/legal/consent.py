"""Consent recorder: validates which legal documents a client says the user
accepted, writes append-only ``consent_records`` rows, and answers "which
documents does this user still need to (re-)agree to".

Raw IPs never reach ``consent_records`` -- only a truncated network address
and a keyed HMAC of the full IP (see global constraints / ADR-004 spirit).
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.consent import ConsentRecord
from app.models.enums import ConsentAction, ConsentDocumentType, ConsentPurpose
from app.services.auth.device_info import capture_request_metadata
from app.services.import_.crypto import default_key_provider
from app.services.legal.registry import LegalDocument, current_document

SIGNUP_DOCUMENTS = (ConsentDocumentType.TERMS_OF_SERVICE, ConsentDocumentType.PRIVACY_POLICY)
UPLOAD_DOCUMENTS = (ConsentDocumentType.PAN_DISCLAIMER,)


class AcceptedDocument(BaseModel):
    document_type: ConsentDocumentType
    document_version: str


class ConsentRequiredError(Exception):
    code = "consent_required"

    def __init__(self, missing: list[str]):
        self.missing = missing
        self.message = "Please agree to the latest version of: " + ", ".join(missing) + "."
        super().__init__(self.message)


@dataclass(frozen=True)
class ConsentEvidence:
    ip_truncated: str | None
    ip_hmac: str | None
    user_agent: str | None
    device_id: str | None


def truncate_ip(ip: str | None) -> str | None:
    """IPv4 -> its /24 network address, IPv6 -> its /48. Invalid -> None."""
    if not ip:
        return None
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    prefix = 24 if addr.version == 4 else 48
    return str(ipaddress.ip_network(f"{addr}/{prefix}", strict=False).network_address)


# The IP-hash key is derived from PAN_LOOKUP_PEPPER instead of being its own
# secret (decision 2026-10-01), so deploying consent records needs no new
# secret or Terraform change. The fixed label domain-separates it: these hashes
# can never collide with, or be compared against, PAN lookup hashes made with
# the same pepper. Rotating the pepper changes future IP hashes only; matching
# an old row's IP in a dispute then needs the old pepper.
_CONSENT_IP_KEY_LABEL = b"unifolio/consent-ip-hmac/v1"


def _consent_ip_key() -> bytes:
    pepper = default_key_provider.lookup_pepper()
    return hmac.new(pepper, _CONSENT_IP_KEY_LABEL, hashlib.sha256).digest()


def ip_hmac(ip: str | None) -> str | None:
    """HMAC-SHA256 of the full IP under a key derived from PAN_LOOKUP_PEPPER:
    lets a dispute check "was it this IP?" without the table ever holding the
    raw value."""
    if not ip:
        return None
    if not settings.pan_lookup_pepper and settings.environment == "development":
        # Dev convenience: a missing pepper must not break every consent-writing
        # request locally. Staging/prod fail fast at startup instead.
        return None
    return hmac.new(_consent_ip_key(), ip.encode(), hashlib.sha256).hexdigest()


def evidence_from_request(request: Request) -> ConsentEvidence:
    meta = capture_request_metadata(request)
    return ConsentEvidence(
        ip_truncated=truncate_ip(meta.ip_address),
        ip_hmac=ip_hmac(meta.ip_address),
        user_agent=meta.user_agent,
        device_id=meta.device_id,
    )


def validate_accepted(
    accepted: list[AcceptedDocument] | None,
    required: tuple[ConsentDocumentType, ...],
) -> list[LegalDocument]:
    """Every required type present at its CURRENT version; else
    ConsentRequiredError(missing types). Returns the documents in ``required``
    order. A stale version counts as missing -- the user saw old text."""
    accepted_pairs = {(a.document_type, a.document_version) for a in (accepted or [])}
    documents: list[LegalDocument] = []
    missing: list[str] = []
    for t in required:
        doc = current_document(t)
        if (t, doc.version) in accepted_pairs:
            documents.append(doc)
        else:
            missing.append(t.value)
    if missing:
        raise ConsentRequiredError(missing)
    return documents


def snapshot_for_signup(
    accepted: list[AcceptedDocument] | None,
    surface: str,
    evidence: ConsentEvidence,
) -> dict:
    """Validates the sign-up documents (T&C + Privacy) and returns the
    JSON-safe snapshot stored on the pending-identity record until
    complete_gated_signup creates the account and records it. Raises
    ConsentRequiredError exactly like validate_accepted."""
    documents = validate_accepted(accepted, SIGNUP_DOCUMENTS)
    return {
        "documents": [
            {"document_type": doc.document_type.value, "document_version": doc.version} for doc in documents
        ],
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "surface": surface,
        "evidence": {
            "ip_truncated": evidence.ip_truncated,
            "ip_hmac": evidence.ip_hmac,
            "user_agent": evidence.user_agent,
            "device_id": evidence.device_id,
        },
    }


def record_consent(
    db: Session,
    *,
    user_id: uuid.UUID,
    documents: list[LegalDocument],
    action: ConsentAction,
    surface: str,
    evidence: ConsentEvidence,
    recorded_at: datetime | None = None,
    related_import_id: uuid.UUID | None = None,
    related_file_sha256: str | None = None,
) -> list[ConsentRecord]:
    """Adds one row per (document, purpose). Never commits -- the caller's
    transaction decides, so consent lands atomically with what it covers."""
    when = recorded_at or datetime.now(timezone.utc)
    rows = [
        ConsentRecord(
            user_id=user_id,
            action=action,
            purpose_code=purpose,
            document_type=doc.document_type,
            document_version=doc.version,
            document_sha256=doc.sha256,
            recorded_at=when,
            surface=surface,
            ip_truncated=evidence.ip_truncated,
            ip_hmac=evidence.ip_hmac,
            user_agent=evidence.user_agent,
            device_id=evidence.device_id,
            related_import_id=related_import_id,
            related_file_sha256=related_file_sha256,
        )
        for doc in documents
        for purpose in doc.purposes
    ]
    db.add_all(rows)
    return rows


def latest_state(db: Session, user_id: uuid.UUID) -> dict[ConsentPurpose, ConsentRecord]:
    """Latest row per purpose for the user."""
    rows = db.scalars(
        select(ConsentRecord).where(ConsentRecord.user_id == user_id).order_by(ConsentRecord.recorded_at)
    ).all()
    # Tie-break on identical recorded_at (coarse clocks, e.g. Windows): a
    # WITHDRAWN row sorts after a GIVEN one, so a same-instant withdrawal is
    # never masked -- the conservative reading. sorted() is stable otherwise.
    rows = sorted(rows, key=lambda r: (r.recorded_at, r.action == ConsentAction.WITHDRAWN))
    state: dict[ConsentPurpose, ConsentRecord] = {}
    for row in rows:
        state[row.purpose_code] = row
    return state


def outdated_documents(
    db: Session,
    user_id: uuid.UUID,
    types: tuple[ConsentDocumentType, ...],
) -> list[ConsentDocumentType]:
    """Types whose latest GIVEN row (per purpose) isn't the current version,
    or has none. A purpose whose latest row is WITHDRAWN counts as none."""
    state = latest_state(db, user_id)
    outdated: list[ConsentDocumentType] = []
    for t in types:
        doc = current_document(t)
        for purpose in doc.purposes:
            row = state.get(purpose)
            if (
                row is None
                or row.action != ConsentAction.GIVEN
                or row.document_type != t
                or row.document_version != doc.version
            ):
                outdated.append(t)
                break
    return outdated
