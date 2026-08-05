"""OTP generation, hashing, and verification — phone+OTP auth per PRD-02 FR-2.

sha256, not bcrypt/argon2: OTPs are short-lived (5 min), low-entropy
6-digit codes, not long-lived credentials — there's nothing to gain from an
expensive hash here, and it would be a needless dependency.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.models.auth import OtpRequest

OTP_LENGTH = 6
OTP_TTL_MINUTES = 5
MAX_ATTEMPTS = 5


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


def generate_otp() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))


def create_otp_request(db: DbSession, phone_number: str) -> tuple[OtpRequest, str | None]:
    """Creates and persists a new OtpRequest. Returns (request, raw_otp) —
    raw_otp is only non-None in dev-stub delivery mode, for the API
    response to echo back; a real SMS-integrated mode returns None here
    and sends the code out-of-band instead."""
    if settings.otp_delivery_mode == "stub" and not settings.database_url.startswith("sqlite"):
        raise RuntimeError(
            "otp_delivery_mode='stub' is not allowed against a non-SQLite database — "
            "this would leak real OTPs in the API response outside local dev. "
            "Set OTP_DELIVERY_MODE to a real delivery mode before deploying against Postgres."
        )

    otp = generate_otp()
    request = OtpRequest(
        phone_number=phone_number,
        otp_hash=_hash_otp(otp),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
        created_at=datetime.now(timezone.utc),
    )
    db.add(request)
    db.commit()

    raw_otp = otp if settings.otp_delivery_mode == "stub" else None
    return request, raw_otp


class OtpVerificationError(Exception):
    """Any OTP verification failure — no pending request, expired, wrong code, or too many attempts."""


def verify_otp(db: DbSession, phone_number: str, otp: str) -> OtpRequest:
    """Verifies otp against the latest unverified OtpRequest for
    phone_number. Raises OtpVerificationError on any failure. On success,
    marks the request verified and returns it."""
    request = (
        db.query(OtpRequest)
        .filter_by(phone_number=phone_number, verified_at=None)
        .order_by(OtpRequest.created_at.desc())
        .first()
    )
    if not request:
        raise OtpVerificationError("No pending OTP request for this phone number.")
    # SQLite (dev/tests) returns naive datetimes even for DateTime(timezone=True);
    # values are always written as UTC, so tag them as such. Postgres returns aware.
    expires_at = request.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise OtpVerificationError("OTP has expired. Request a new one.")
    if request.attempt_count >= MAX_ATTEMPTS:
        raise OtpVerificationError("Too many incorrect attempts. Request a new OTP.")

    if request.otp_hash != _hash_otp(otp):
        request.attempt_count += 1
        db.commit()
        raise OtpVerificationError("Incorrect OTP.")

    request.verified_at = datetime.now(timezone.utc)
    db.commit()
    return request
