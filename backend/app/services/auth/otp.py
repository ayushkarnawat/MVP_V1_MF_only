"""OTP generation, hashing, and verification -- shared by phone+OTP login
and email+OTP signup/login (remove-password-auth handoff spec). One table,
one hash/expiry/attempt-count/
throttle code path; only the identifier column and the delivery call (SMS
stub vs. `get_email_provider().send_email(...)`) branch on channel.

sha256, not bcrypt/argon2: OTPs are short-lived (5 min), low-entropy
6-digit codes, not long-lived credentials — there's nothing to gain from an
expensive hash here, and it would be a needless dependency.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.models.auth import OtpRequest
from app.services.auth.email_provider import get_email_provider

OTP_LENGTH = 6
OTP_TTL_MINUTES = 5
MAX_ATTEMPTS = 5
RESEND_THROTTLE_SECONDS = 60

Channel = Literal["sms", "email"]

__all__ = [
    "OtpVerificationError",
    "OtpRequestThrottledError",
    "create_otp_request",
    "verify_otp",
]


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


def generate_otp() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))


def _identifier_filter(channel: Channel, identifier: str) -> dict[str, str]:
    return {"phone_number": identifier} if channel == "sms" else {"email": identifier}


def create_otp_request(
    db: DbSession, identifier: str, channel: Channel = "sms"
) -> tuple[OtpRequest, str | None]:
    """Creates and persists a new OtpRequest for either channel. Returns
    (request, raw_otp) — raw_otp is only non-None in dev-stub delivery
    mode, for the API response to echo back; a real delivery mode returns
    None here and sends the code out-of-band instead (SMS provider for
    "sms", `get_email_provider().send_email(...)` for "email")."""
    if settings.otp_delivery_mode == "stub" and settings.environment == "production":
        raise RuntimeError(
            "otp_delivery_mode='stub' is not allowed in production — "
            "this would leak real OTPs in the API response. "
            "Set OTP_DELIVERY_MODE to a real delivery mode before deploying to production."
        )

    recent = (
        db.query(OtpRequest)
        .filter_by(verified_at=None, **_identifier_filter(channel, identifier))
        .order_by(OtpRequest.created_at.desc())
        .first()
    )
    if recent is not None:
        created_at = recent.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        seconds_since = (datetime.now(timezone.utc) - created_at).total_seconds()
        if seconds_since < RESEND_THROTTLE_SECONDS:
            raise OtpRequestThrottledError(
                f"Please wait {int(RESEND_THROTTLE_SECONDS - seconds_since)}s before requesting another code."
            )

    otp = generate_otp()
    request = OtpRequest(
        phone_number=identifier if channel == "sms" else None,
        email=identifier if channel == "email" else None,
        otp_hash=_hash_otp(otp),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
        created_at=datetime.now(timezone.utc),
    )
    db.add(request)
    db.commit()

    if channel == "email" and settings.otp_delivery_mode != "stub":
        get_email_provider().send_email(
            to=identifier,
            subject="Your Unifolio verification code",
            body=f"Your Unifolio verification code is {otp}. It expires in {OTP_TTL_MINUTES} minutes.",
        )

    raw_otp = otp if settings.otp_delivery_mode == "stub" else None
    return request, raw_otp


class OtpRequestThrottledError(Exception):
    """Raised when a new OTP is requested for an identifier that already
    has an unexpired, unverified request under 60 seconds old."""


class OtpVerificationError(Exception):
    """Any OTP verification failure — no pending request, expired, wrong code, or too many attempts."""


def verify_otp(db: DbSession, identifier: str, otp: str, channel: Channel = "sms") -> OtpRequest:
    """Verifies otp against the latest unverified OtpRequest for identifier
    on the given channel. Raises OtpVerificationError on any failure. On
    success, marks the request verified and returns it."""
    request = (
        db.query(OtpRequest)
        .filter_by(verified_at=None, **_identifier_filter(channel, identifier))
        .order_by(OtpRequest.created_at.desc())
        .first()
    )
    if not request:
        raise OtpVerificationError("No pending OTP request for this identifier.")
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
