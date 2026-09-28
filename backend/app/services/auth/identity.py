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
from app.services.auth.otp import delete_otp_requests_for_identifiers

# Lower value = higher precedence. Design Spec §1: "Identity precedence:
# Google > Email > Phone" — applied wherever only one identity can be
# shown or selected.
PROVIDER_PRECEDENCE: dict[AuthIdentityProvider, int] = {
    AuthIdentityProvider.GOOGLE: 0,
    AuthIdentityProvider.EMAIL_OTP: 1,  # active again — see EMAIL_PASSWORD below
    AuthIdentityProvider.EMAIL_PASSWORD: 1,  # kept, unused going forward — Postgres enums can't cheaply drop a value; occupies EMAIL_OTP's precedence slot (same concept, an email-based method) in case it's ever reactivated
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
) -> tuple[PendingIdentityVerification, str]:
    raw_token = secrets.token_urlsafe(PENDING_VERIFICATION_TOKEN_BYTES)
    now = datetime.now(timezone.utc)
    pending = PendingIdentityVerification(
        provider=provider,
        provider_subject=provider_subject,
        email=email,
        email_verified=email_verified,
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


class EmailCollisionError(Exception):
    """Raised by complete_gated_signup's phone-first collision guard (final
    review, 2026-09-28): the email/Google-first direction always runs
    resolve_email_collision BEFORE a pending token is even minted
    (resolve_new_verified_identity), so by the time complete_gated_signup
    sees that pending record, "no collision" is already guaranteed. The
    phone-first direction has no equivalent earlier checkpoint -- the email
    is only attached (attach_email_to_pending) and never independently
    verified until the email OTP succeeds right here -- so this function
    must run the same check itself, for phone-first only, before creating a
    second account under an email another account already owns."""


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


class PendingLinkInfo(NamedTuple):
    matched_user_id: uuid.UUID | None
    email: str | None
    provider: AuthIdentityProvider


def peek_pending_link_info(db: DbSession, raw_token: str) -> PendingLinkInfo:
    """Read-only lookup of a pending token's matched_user_id AND the email
    it actually claims. Callers use both together, BEFORE calling
    attach_pending_identity/mark_pending_email_verified/
    complete_gated_signup (whichever actually consumes the token),
    to decide:

    1. Which completion path is even eligible: matched_user_id set means
       a genuine account-collision link (created by
       resolve_new_verified_identity against an email that was ALREADY
       independently verified -- e.g. by Google); matched_user_id None
       means a fresh-signup token (created by signup_email for a
       self-chosen email nobody has proven control of yet), consumed by
       complete_gated_signup. Unlike phone/Google, an EMAIL_OTP pending
       token's own provider_subject is self-chosen with no ownership check
       at creation time (proof comes later, via OTP) -- a matched_user_id
       IS NULL token must never be attachable to an existing account found
       by looking up the email the caller just separately proved control
       of: an attacker could mint such a token for a victim's email, then
       attach it to their OWN account by verifying their OWN unrelated
       OTP, pre-claiming the victim's email before the victim ever proves
       mailbox control.

    2. For a matched_user_id-set link token specifically: whether the
       email the caller just OTP-verified is actually THE SAME email the
       collision was raised against. Without this check, any OTP the
       caller can genuinely pass -- for ANY email they happen to control
       -- would satisfy the step-up re-auth, defeating the point of
       asking for a second factor tied to the SPECIFIC contested address
       (matched_user_id itself can't be forged, but that only proves
       *an* email collided with *some* account -- not that this request
       is proving control of that exact address).

    3. For the phone-gate route specifically (verify_otp_route): whether a
       phone number that already belongs to an existing account should be
       attached to it (Google/other-provider pending records -- proving
       ownership of an existing account's phone is a legitimate way to
       link a second login method) or rejected as "already exists, log in
       instead" (EMAIL_OTP pending records -- signup_email already proved
       the typed email is brand-new, so a phone gate collision here means
       the phone belongs to a DIFFERENT, unrelated account, not the
       caller's own -- silently attaching would merge two unrelated
       identities and surprise the caller with someone else's account).

    Does not mutate anything -- _consume_pending_verification only
    validates existence/expiry, it doesn't delete."""
    pending = _consume_pending_verification(db, raw_token)
    return PendingLinkInfo(matched_user_id=pending.matched_user_id, email=pending.email, provider=pending.provider)


def mark_pending_email_verified(
    db: DbSession, raw_token: str, verified_email: str
) -> PendingIdentityVerification:
    """After email-OTP verification succeeds for an EMAIL_OTP pending
    record, flips
    email_verified to True. Deliberately does NOT delete/consume the
    pending row -- it stays alive for the phone gate step that follows,
    exactly like the rest of the pending-token lifecycle where only
    complete_gated_signup/attach_pending_identity ever delete it.

    `verified_email` MUST be the email the OTP was actually just verified
    for -- otherwise a caller who owns a valid OTP for their OWN email
    could apply that verification to an unrelated pending_token (e.g. a
    victim's signup) purely by knowing/guessing that token, flipping
    email_verified without ever proving control of the pending record's
    email. This is the same ownership binding attach_pending_identity
    already enforces via matched_user_id -- verify_otp proves control of
    an identifier, this call must confirm it's the SAME identifier the
    pending record claims."""
    pending = _consume_pending_verification(db, raw_token)
    if pending.email != verified_email:
        raise PendingVerificationError("This verification code doesn't match this signup.")
    pending.email_verified = True
    db.commit()
    return pending


def attach_email_to_pending(db: DbSession, raw_token: str, email: str) -> PendingIdentityVerification:
    """Phone-first signup's email step (FR-4): records which email the
    caller is about to verify against an already-phone-verified pending
    record, so complete_gated_signup can use it once the email OTP
    succeeds. Only valid for a fresh phone-first pending record — never a
    step-up link (matched_user_id set) or an email/Google-first record
    (those set `email` at creation time via create_pending_verification,
    not here). Overwrites any previously-attached email, so an abandon-
    and-retry with a corrected address always reflects the last one
    entered."""
    pending = _consume_pending_verification(db, raw_token)
    if pending.matched_user_id is not None:
        raise PendingVerificationError(
            "This verification is for linking to an existing account, not creating a new one."
        )
    if pending.provider != AuthIdentityProvider.PHONE_OTP:
        raise PendingVerificationError("This verification token isn't for a phone-first signup.")
    pending.email = email
    db.commit()
    return pending


def complete_gated_signup(
    db: DbSession,
    raw_token: str,
    second_provider: AuthIdentityProvider,
    second_provider_subject: str,
) -> uuid.UUID:
    """Only for a brand-new-signup pending record (matched_user_id IS
    NULL) — atomically creates the User plus both identities, whichever
    order they were verified in. Design Spec §1's mandatory second-step
    gate, generalized (auth-flow-redesign, 2026-09-28) to work symmetrically
    in either direction: email/Google-first (pending.provider is
    EMAIL_OTP/GOOGLE, second_provider is PHONE_OTP — today's existing
    shape) or phone-first (pending.provider is PHONE_OTP, second_provider
    is EMAIL_OTP — the new shape). `second_provider`/`second_provider_subject`
    identify whichever identity is being verified RIGHT NOW to complete
    signup; the pending record's own (provider, provider_subject) is
    whichever identity was verified FIRST. Replaces the old
    complete_phone_gate_signup, which hardcoded phone as the second
    identity and email/Google as the pending one — safe only because
    pending.provider was never PHONE_OTP under the old flow."""
    pending = _consume_pending_verification(db, raw_token)
    if pending.matched_user_id is not None:
        raise PendingVerificationError(
            "This verification is for linking to an existing account, not creating a new one."
        )
    if second_provider == pending.provider:
        # I1 fix (final review, 2026-09-28): belt-and-braces -- the routes
        # already reject a same-provider pending_token before calling this
        # (e.g. a phone-first token reused against a second phone number),
        # but this function has its own callers and must not rely on that
        # alone. Two identities of the same provider on one brand-new
        # signup is never a valid shape here.
        raise PendingVerificationError("Invalid or already-used verification token.")

    # An UNVERIFIED email claim (a Google account whose `email_verified` is
    # false) must never be persisted into either `users.email` or
    # `auth_identities.email`: resolve_email_collision treats ANY matching
    # AuthIdentity.email as proof of independent verified ownership
    # (kind="auto_link"), so storing an unverified claim here would let this
    # signup silently capture the real owner's later, genuinely-verified
    # email-OTP signup. Design Spec §2 step 5 / §4.
    #
    # If the identity verified just now (second_provider) is itself the
    # email leg, that email IS verified by definition — its own OTP just
    # succeeded. This only matters for phone-first: pending.email_verified
    # is never flipped for a PHONE_OTP pending record (mark_pending_email_verified
    # is only ever called for the email/Google-first direction).
    if second_provider == AuthIdentityProvider.EMAIL_OTP:
        verified_email = second_provider_subject
    else:
        verified_email = pending.email if pending.email_verified else None

    if pending.provider == AuthIdentityProvider.PHONE_OTP and second_provider == AuthIdentityProvider.EMAIL_OTP:
        # C2 fix (final review, 2026-09-28): see EmailCollisionError's
        # docstring for why only this direction needs the check run here.
        if resolve_email_collision(db, verified_email).kind != "none":
            raise EmailCollisionError("An account with this email already exists.")

    phone_number = (
        second_provider_subject
        if second_provider == AuthIdentityProvider.PHONE_OTP
        else pending.provider_subject
    )
    second_identity_email = second_provider_subject if second_provider == AuthIdentityProvider.EMAIL_OTP else None
    # The pending identity's own `email` column mirrors verified_email
    # whenever that identity is even capable of carrying an email claim
    # (EMAIL_OTP or GOOGLE) — this matches the ORIGINAL complete_phone_gate_signup,
    # which unconditionally wrote `record_identity(..., pending.provider,
    # pending.provider_subject, verified_email, ...)` for BOTH EMAIL_OTP and
    # GOOGLE pending records (safe there because pending.provider was never
    # PHONE_OTP). A narrower `verified_email if pending.provider == EMAIL_OTP
    # else None` would silently regress the GOOGLE case: a verified Google
    # identity's own `email` column would go from `verified_email` to
    # always-None, breaking resolve_email_collision's auto_link detection
    # for that identity later (see
    # test_complete_gated_signup_sets_google_identity_email_when_verified).
    # PHONE_OTP is excluded because a phone identity never carries an email
    # claim by design (Design Spec §1/§4) — it's the only genuinely new
    # value pending.provider can take now that phone-first signups exist.
    pending_identity_email = None if pending.provider == AuthIdentityProvider.PHONE_OTP else verified_email

    now = datetime.now(timezone.utc)
    user = User(phone_number=phone_number, email=verified_email, created_at=now)
    db.add(user)
    db.flush()
    record_identity(db, user.id, second_provider, second_provider_subject, second_identity_email, now, commit=False)
    record_identity(
        db, user.id, pending.provider, pending.provider_subject, pending_identity_email, now, commit=False
    )
    db.delete(pending)
    delete_otp_requests_for_identifiers(db, phone_number=phone_number, email=verified_email, commit=False)
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

    # Same guard as complete_gated_signup: an unverified email claim is
    # never denormalized onto an identity row, because that row would then
    # read as independently-verified ownership to resolve_email_collision.
    # (A §4 link_required record always carries email_verified=True, so this
    # only ever bites the now-reachable phone-gate-record path above.)
    verified_email = pending.email if pending.email_verified else None

    now = datetime.now(timezone.utc)
    record_identity(
        db, resolved_user_id, pending.provider, pending.provider_subject, verified_email, now, commit=False
    )
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
