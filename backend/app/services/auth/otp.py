"""OTP generation, hashing, and verification — phone+OTP and email+OTP,
sharing one table and one code path per Design Spec §1: the hash/expiry/
attempt-count/verify logic is identical between channels, only delivery
differs.

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
from app.services.auth.email_provider import NoEmailProviderConfiguredError, get_email_provider

OTP_LENGTH = 6
OTP_TTL_MINUTES = 5
MAX_ATTEMPTS = 5

Channel = Literal["sms", "email"]

__all__ = [
    "OtpVerificationError",
    "OtpRequestThrottledError",
    "NoEmailProviderConfiguredError",
    "create_otp_request",
    "verify_otp",
    "get_email_provider",
]


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


def generate_otp() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))


def create_otp_request(
    db: DbSession, identifier: str, channel: Channel = "sms"
) -> tuple[OtpRequest, str | None]:
    """Creates and persists a new OtpRequest for either channel. Returns
    (request, raw_otp) — raw_otp is only non-None in dev-stub delivery
    mode, for the API response to echo back; a real delivery mode returns
    None here and sends the code out-of-band instead."""
    if settings.otp_delivery_mode == "stub" and not settings.database_url.startswith("sqlite"):
        raise RuntimeError(
            "otp_delivery_mode='stub' is not allowed against a non-SQLite database — "
            "this would leak real OTPs in the API response outside local dev. "
            "Set OTP_DELIVERY_MODE to a real delivery mode before deploying against Postgres."
        )

    filter_kwargs = {"phone_number": identifier} if channel == "sms" else {"email": identifier}
    recent = (
        db.query(OtpRequest)
        .filter_by(verified_at=None, **filter_kwargs)
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

    # Send BEFORE committing, and roll back if delivery fails. A row that is
    # persisted but never delivered is worse than no row at all: the caller
    # gets an error for a code that was never sent, AND the throttle check
    # above counts that orphaned row as a "recent unverified request", so the
    # user's immediate retry is blocked for RESEND_THROTTLE_SECONDS for a
    # failure that was entirely server-side. The explicit rollback (rather
    # than just letting the exception propagate) matters because the pending
    # db.add() would otherwise still be in the session's identity map and
    # could leak into a later implicit flush on the same session.
    if channel == "email" and settings.otp_delivery_mode != "stub":
        try:
            get_email_provider().send_email(
                to=identifier,
                subject="Your Unifolio verification code",
                body=f"Your Unifolio verification code is {otp}. It expires in {OTP_TTL_MINUTES} minutes.",
            )
        except Exception:
            db.rollback()
            raise

    db.commit()

    raw_otp = otp if settings.otp_delivery_mode == "stub" else None
    return request, raw_otp


class OtpRequestThrottledError(Exception):
    """Raised when a new OTP is requested for an identifier that already
    has an unexpired, unverified request under 60 seconds old — a cost
    control now that email sends are billed per-message (Design Spec §6)."""


RESEND_THROTTLE_SECONDS = 60


class OtpVerificationError(Exception):
    """Any OTP verification failure — no pending request, expired, wrong code, or too many attempts."""


def verify_otp(db: DbSession, identifier: str, otp: str, channel: Channel = "sms") -> OtpRequest:
    """Verifies otp against the latest unverified OtpRequest for
    identifier on the given channel. Raises OtpVerificationError on any
    failure. On success, marks the request verified and returns it."""
    filter_kwargs = {"phone_number": identifier} if channel == "sms" else {"email": identifier}
    request = (
        db.query(OtpRequest)
        .filter_by(verified_at=None, **filter_kwargs)
        .order_by(OtpRequest.created_at.desc())
        .first()
    )
    if not request:
        raise OtpVerificationError("No pending OTP request for this identifier.")
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
