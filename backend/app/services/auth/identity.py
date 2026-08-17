"""Identity lookup, denormalized-email refresh, and email-collision
resolution — Design Spec §1/§4. Phone-first verification never calls
resolve_email_collision (phone carries no email claim, so it can't
collide) — see identity_flow.py (Task 6) for where phone stays on its own
simpler path.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, NamedTuple

from sqlalchemy.orm import Session as DbSession

from app.models.auth import AuthIdentity, PendingIdentityVerification
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from app.services.auth.email_confirmation import send_confirmation_email

# Lower value = higher precedence. Design Spec §1: "Identity precedence:
# Google > Email > Phone" — applied wherever only one identity can be
# shown or selected.
PROVIDER_PRECEDENCE: dict[AuthIdentityProvider, int] = {
    AuthIdentityProvider.GOOGLE: 0,
    AuthIdentityProvider.EMAIL_OTP: 1,  # kept, unused going forward — see EMAIL_PASSWORD below
    AuthIdentityProvider.EMAIL_PASSWORD: 1,  # occupies EMAIL_OTP's old precedence slot — same concept (an email-based method), just password- instead of OTP-verified
    AuthIdentityProvider.PHONE_OTP: 2,
}


def find_identity_by_subject(
    db: DbSession, provider: AuthIdentityProvider, provider_subject: str
) -> AuthIdentity | None:
    return db.query(AuthIdentity).filter_by(provider=provider, provider_subject=provider_subject).first()


def record_identity(
    db: DbSession,
    user_id: uuid.UUID,
    provider: AuthIdentityProvider,
    provider_subject: str,
    email: str | None,
    verified_at: datetime,
    commit: bool = True,
) -> AuthIdentity:
    identity = AuthIdentity(
        user_id=user_id,
        provider=provider,
        provider_subject=provider_subject,
        email=email,
        identifier_verified_at=verified_at,
        created_at=verified_at,
        last_used_at=verified_at,
    )
    db.add(identity)
    if commit:
        db.commit()
    return identity


def find_or_backfill_phone_identity(db: DbSession, phone_number: str) -> AuthIdentity | None:
    """Returns the `phone_otp` identity for phone_number, self-healing the
    pre-multi-method-auth case where a `users` row exists with no matching
    `auth_identities` row.

    Migration 0005 backfills those rows once, at deploy time — this is the
    belt-and-braces runtime guard for a row that slipped through anyway (a
    database restored from a pre-0005 dump, a user created by a script, a
    partially-applied migration). Without it, the phone login path sees "no
    identity" and tries to INSERT a second `User` for an already-taken,
    UNIQUE phone number, which surfaces to the user as an unhandled 500 on a
    perfectly ordinary login.

    Backfilling from `users.created_at` (not `now`) matches migration 0005 and
    the Design Spec §1 Migration note exactly: a verified phone has always
    been a precondition for a `User` row existing at all, so `created_at` is
    the accurate proof-of-verification timestamp. Returns None when the phone
    number is genuinely unknown — a real brand-new signup.
    """
    identity = find_identity_by_subject(db, AuthIdentityProvider.PHONE_OTP, phone_number)
    if identity is not None:
        return identity

    user = db.query(User).filter_by(phone_number=phone_number).first()
    if user is None:
        return None

    return record_identity(
        db, user.id, AuthIdentityProvider.PHONE_OTP, phone_number, None, user.created_at, commit=True
    )


def pick_primary_identity(identities: list[AuthIdentity]) -> AuthIdentity:
    return min(identities, key=lambda i: PROVIDER_PRECEDENCE[i.provider])


def refresh_denormalized_email(db: DbSession, user: User, commit: bool = True) -> None:
    """Sets user.email from the highest-precedence identity that has one.
    No-op if the account has no email-bearing identity at all."""
    identities = db.query(AuthIdentity).filter_by(user_id=user.id).all()
    with_email = [i for i in identities if i.email]
    if not with_email:
        return
    user.email = pick_primary_identity(with_email).email
    if commit:
        db.commit()


class EmailCollisionResult(NamedTuple):
    kind: Literal["auto_link", "link_required", "none"]
    matched_user_id: uuid.UUID | None


def resolve_email_collision(db: DbSession, email: str) -> EmailCollisionResult:
    """Design Spec §4's three-way collision check, on a new identity's
    verified email:
    1. Matches another verified AuthIdentity's email (any provider, any
       user) -> auto_link.
    2. Matches only a User's denormalized, never-separately-verified
       `email` field -> link_required.
    3. No match -> none.
    """
    verified_match = db.query(AuthIdentity).filter_by(email=email).first()
    if verified_match is not None:
        return EmailCollisionResult(kind="auto_link", matched_user_id=verified_match.user_id)

    denormalized_match = db.query(User).filter_by(email=email).first()
    if denormalized_match is not None:
        return EmailCollisionResult(kind="link_required", matched_user_id=denormalized_match.id)

    return EmailCollisionResult(kind="none", matched_user_id=None)


PENDING_VERIFICATION_TOKEN_BYTES = 32
PENDING_VERIFICATION_TTL_MINUTES = 10


def _hash_pending_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_pending_verification(
    db: DbSession,
    provider: AuthIdentityProvider,
    provider_subject: str,
    email: str | None,
    email_verified: bool,
    matched_user_id: uuid.UUID | None,
    password_hash: str | None = None,
) -> tuple[PendingIdentityVerification, str]:
    raw_token = secrets.token_urlsafe(PENDING_VERIFICATION_TOKEN_BYTES)
    now = datetime.now(timezone.utc)
    pending = PendingIdentityVerification(
        provider=provider,
        provider_subject=provider_subject,
        email=email,
        email_verified=email_verified,
        password_hash=password_hash,
        matched_user_id=matched_user_id,
        token_hash=_hash_pending_token(raw_token),
        expires_at=now + timedelta(minutes=PENDING_VERIFICATION_TTL_MINUTES),
        created_at=now,
    )
    db.add(pending)
    db.commit()
    return pending, raw_token


class PendingVerificationError(Exception):
    """Any failure consuming a pending_identity_verifications token —
    not found, expired, or used for the wrong completion path."""


def _consume_pending_verification(db: DbSession, raw_token: str) -> PendingIdentityVerification:
    token_hash = _hash_pending_token(raw_token)
    pending = db.query(PendingIdentityVerification).filter_by(token_hash=token_hash).first()
    if not pending:
        raise PendingVerificationError("Invalid or already-used verification token.")
    expires_at = pending.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise PendingVerificationError("This verification has expired. Please start over.")
    return pending


def complete_phone_gate_signup(db: DbSession, raw_token: str, phone_number: str) -> uuid.UUID:
    """Only for a brand-new-signup pending record (matched_user_id IS
    NULL) — atomically creates the User plus both identities. Design Spec
    §1's mandatory phone gate."""
    pending = _consume_pending_verification(db, raw_token)
    if pending.matched_user_id is not None:
        raise PendingVerificationError(
            "This verification is for linking to an existing account, not creating a new one."
        )

    # An UNVERIFIED email claim (a Google account whose `email_verified` is
    # false) must never be persisted into either `users.email` or
    # `auth_identities.email`: resolve_email_collision treats ANY matching
    # AuthIdentity.email as proof of independent verified ownership
    # (kind="auto_link"), so storing an unverified claim here would let this
    # signup silently capture the real owner's later, genuinely-verified
    # email-OTP signup. The pending record's own provider/provider_subject
    # (the Google `sub`) is still recorded as-is — it isn't used by the
    # email-based collision check at all. Design Spec §2 step 5 / §4.
    verified_email = pending.email if pending.email_verified else None

    now = datetime.now(timezone.utc)
    user = User(phone_number=phone_number, email=verified_email, created_at=now)
    db.add(user)
    db.flush()
    record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, phone_number, None, now, commit=False)
    new_identity = record_identity(
        db, user.id, pending.provider, pending.provider_subject, verified_email, now, commit=False
    )
    # password_hash is only ever non-None on an EMAIL_PASSWORD pending
    # record (2026-08-17 email-password design spec §4b); harmless no-op
    # for every other provider.
    new_identity.password_hash = pending.password_hash
    if pending.provider == AuthIdentityProvider.EMAIL_PASSWORD:
        # Sent after the identity row is fully written but before the
        # final commit below — if send_confirmation_email's own internal
        # commit (it creates+commits an EmailConfirmationToken) succeeds
        # but something later in this function failed, the token would
        # still be valid for an account that technically doesn't exist yet
        # in a fully-committed sense. This is an accepted, narrow edge case
        # matching this codebase's existing tolerance for equivalent races
        # elsewhere (see decisions.md's FundScore/backfill-identity race
        # entries) — not worth a two-phase-commit for an email send.
        send_confirmation_email(db, user.id, pending.provider_subject)
    db.delete(pending)
    db.commit()
    return user.id


def attach_pending_identity(db: DbSession, raw_token: str, resolved_user_id: uuid.UUID) -> uuid.UUID:
    """After ANY re-auth method (phone/email/Google) resolves to
    resolved_user_id, attaches the pending record's identity to that
    user. Only an actual *mismatch* is rejected: if the pending record
    named a specific account (a §4 link_required collision), the caller
    must have resolved to that same account.

    A pending record with matched_user_id IS NULL (a §1 phone-gate
    record) is allowed to attach to whatever account the caller already
    independently verified. That case is legitimate and previously dead-
    ended: §4's collision check only ever matches on EMAIL, never phone,
    so an existing phone-only account whose phone number is entered at
    the phone gate is never detected earlier — the route discovers it
    only when find_identity_by_subject succeeds after a fresh phone-OTP
    verification, which is itself proof of control over that exact
    account."""
    pending = _consume_pending_verification(db, raw_token)
    if pending.matched_user_id is not None and pending.matched_user_id != resolved_user_id:
        raise PendingVerificationError("This verification token doesn't match the account you're linking to.")

    # Same guard as complete_phone_gate_signup: an unverified email claim is
    # never denormalized onto an identity row, because that row would then
    # read as independently-verified ownership to resolve_email_collision.
    # (A §4 link_required record always carries email_verified=True, so this
    # only ever bites the now-reachable phone-gate-record path above.)
    verified_email = pending.email if pending.email_verified else None

    now = datetime.now(timezone.utc)
    new_identity = record_identity(
        db, resolved_user_id, pending.provider, pending.provider_subject, verified_email, now, commit=False
    )
    new_identity.password_hash = pending.password_hash
    if pending.provider == AuthIdentityProvider.EMAIL_PASSWORD:
        send_confirmation_email(db, resolved_user_id, pending.provider_subject)
    # Explicit flush: production and test sessions are both autoflush=False, so
    # without this the identity we just added is invisible to
    # refresh_denormalized_email's own query and users.email is silently never
    # updated — the account would gain a verified Google/email identity while
    # /auth/me kept reporting email=None. Still one transaction: the single
    # db.commit() below covers the flush, the delete, and the email update.
    db.flush()
    user = db.get(User, resolved_user_id)
    refresh_denormalized_email(db, user, commit=False)
    db.delete(pending)
    db.commit()
    return resolved_user_id


class IdentityResolution(NamedTuple):
    kind: Literal["login", "link_required", "phone_required"]
    user_id: uuid.UUID | None
    pending_token: str | None
    matched_email: str | None
    existing_method: AuthIdentityProvider | None
    prefill_email: str | None


def resolve_new_verified_identity(
    db: DbSession,
    provider: AuthIdentityProvider,
    provider_subject: str,
    email: str | None,
    email_verified: bool,
) -> IdentityResolution:
    """For a Google or email-OTP identity with NO existing auth_identities
    row yet (caller has already checked find_identity_by_subject returns
    None). Runs the Design Spec §4 collision check and returns exactly
    what the route needs to respond."""
    email_for_collision = email if email_verified else None

    if email_for_collision is not None:
        collision = resolve_email_collision(db, email_for_collision)
        if collision.kind == "auto_link":
            now = datetime.now(timezone.utc)
            record_identity(db, collision.matched_user_id, provider, provider_subject, email, now)
            refresh_denormalized_email(db, db.get(User, collision.matched_user_id))
            return IdentityResolution("login", collision.matched_user_id, None, None, None, None)

        if collision.kind == "link_required":
            matched_identities = db.query(AuthIdentity).filter_by(user_id=collision.matched_user_id).all()
            existing_method = (
                pick_primary_identity(matched_identities).provider if matched_identities else AuthIdentityProvider.PHONE_OTP
            )
            _, raw_token = create_pending_verification(
                db, provider, provider_subject, email, True, matched_user_id=collision.matched_user_id
            )
            return IdentityResolution(
                "link_required", None, raw_token, email_for_collision, existing_method, None
            )

    _, raw_token = create_pending_verification(
        db, provider, provider_subject, email, email_verified, matched_user_id=None
    )
    return IdentityResolution("phone_required", None, raw_token, None, None, email_for_collision)
