import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import AuthIdentityProvider, enum_column


class OtpRequest(Base):
    __tablename__ = "otp_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    phone_number: Mapped[str] = mapped_column(String, nullable=False)
    otp_hash: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


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
    # Only populated for EMAIL_PASSWORD rows — NULL for every other provider,
    # which are inherently verified/proven at creation time and have no
    # password concept. 2026-08-17 email-password design spec §5.
    password_hash: Mapped[str | None] = mapped_column(String)
    # Only meaningful for EMAIL_PASSWORD rows: NULL until the mailbox owner
    # clicks the confirmation link (or completes a password reset — spec
    # §4c). /auth/login/email refuses to authenticate while this is NULL.
    email_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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
    # Only set for an EMAIL_PASSWORD pending record — already hashed by the
    # route before this row is created, never the raw password. NULL for
    # every other provider. 2026-08-17 email-password design spec §4b.
    password_hash: Mapped[str | None] = mapped_column(String)
    matched_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


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


class PasswordResetToken(Base):
    """Single-use, email-delivered password-reset link — same
    hash-before-storage pattern as `pending_identity_verifications.
    token_hash`, but its own table since a reset link is a fundamentally
    different mechanism from the 10-minute pending-verification window
    (2026-08-17 email-password design spec §3)."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class EmailConfirmationToken(Base):
    """Single-use, email-delivered confirmation link sent once after an
    EMAIL_PASSWORD signup completes its phone gate. Same shape as
    `PasswordResetToken` — a separate table rather than a shared one with
    a purpose flag, so each table's meaning stays obvious from its name
    (2026-08-17 email-password design spec §4c)."""

    __tablename__ = "email_confirmation_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
