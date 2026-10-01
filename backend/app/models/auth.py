import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import AuthIdentityProvider, enum_column


class OtpRequest(Base):
    __tablename__ = "otp_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Exactly one of phone_number/email is set (ck_otp_requests_exactly_one_identifier,
    # migration 0007) -- phone and email OTPs share this one table/code path.
    phone_number: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    otp_hash: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Auth-flow-redesign FR-2/FR-9 (migration 0017): device/platform
    # analytics, not fraud prevention -- see the schema doc's §1 purpose
    # note for why these fields, not IP/MAC, answer "what device."
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(Text)
    device_type: Mapped[str | None] = mapped_column(String)
    os_family: Mapped[str | None] = mapped_column(String)
    os_version: Mapped[str | None] = mapped_column(String)
    browser_family: Mapped[str | None] = mapped_column(String)
    browser_version: Mapped[str | None] = mapped_column(String)
    device_id: Mapped[str | None] = mapped_column(String)


class AuthIdentity(Base):
    """One row per external identity (phone/email/Google) that can log a
    user in — many rows per user. Design Spec §1: `users` is a
    provider-agnostic anchor; this table is the verification source of
    truth."""

    __tablename__ = "auth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_auth_identities_provider_subject"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    provider: Mapped[AuthIdentityProvider] = mapped_column(enum_column(AuthIdentityProvider), nullable=False)
    # Phone number (phone_otp), email address (email_otp), or Google `sub` claim.
    provider_subject: Mapped[str] = mapped_column(String, nullable=False)
    # Denormalized from the identity's own claim — used only for the
    # collision lookup (Design Spec §4), never as a credential itself.
    email: Mapped[str | None] = mapped_column(String)
    identifier_verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PendingIdentityVerification(Base):
    """Holds a just-verified Google/email identity that can't yet be
    attached to a session — either a brand-new signup still missing its
    mandatory phone step (`matched_user_id` NULL), or a collision needing
    step-up re-auth (`matched_user_id` set). Design Spec §1/§4 — one
    mechanism, two triggers, one shared TTL."""

    __tablename__ = "pending_identity_verifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Never PHONE_OTP — a phone-first verification never produces a
    # pending record, it completes signup on its own.
    provider: Mapped[AuthIdentityProvider] = mapped_column(enum_column(AuthIdentityProvider), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str | None] = mapped_column(String)
    email_verified: Mapped[bool] = mapped_column(nullable=False)
    matched_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Consent core (Task 8, migration 0022): the T&C + Privacy agreement
    # captured at the FIRST sign-up step -- {"documents": [{document_type,
    # document_version}], "captured_at": iso, "surface": str, "evidence":
    # {ip_truncated, ip_hmac, user_agent, device_id}}. complete_gated_signup
    # turns it into consent_records rows in the same transaction that creates
    # the user. NULL on link/step-up records, which never create an account.
    consent_snapshot: Mapped[dict | None] = mapped_column(
        JSON(none_as_null=True).with_variant(JSONB(none_as_null=True), "postgresql")
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    session_token_hash: Mapped[str] = mapped_column(String, nullable=False)
    # Whichever method's verification directly produced this session — for
    # a phone-gated signup, that's phone_otp (the completing method), not
    # the originating Google/email identity (Design Spec §5).
    auth_method: Mapped[AuthIdentityProvider] = mapped_column(enum_column(AuthIdentityProvider), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    device_info: Mapped[str | None] = mapped_column(String)
