"""Identity lookup, denormalized-email refresh, and email-collision
resolution — Design Spec §1/§4. Phone-first verification never calls
resolve_email_collision (phone carries no email claim, so it can't
collide) — see identity_flow.py (Task 6) for where phone stays on its own
simpler path.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, NamedTuple

from sqlalchemy.orm import Session as DbSession

from app.models.auth import AuthIdentity
from app.models.enums import AuthIdentityProvider
from app.models.user import User

# Lower value = higher precedence. Design Spec §1: "Identity precedence:
# Google > Email > Phone" — applied wherever only one identity can be
# shown or selected.
PROVIDER_PRECEDENCE: dict[AuthIdentityProvider, int] = {
    AuthIdentityProvider.GOOGLE: 0,
    AuthIdentityProvider.EMAIL_OTP: 1,
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
    db.commit()
    return identity


def pick_primary_identity(identities: list[AuthIdentity]) -> AuthIdentity:
    return min(identities, key=lambda i: PROVIDER_PRECEDENCE[i.provider])


def refresh_denormalized_email(db: DbSession, user: User) -> None:
    """Sets user.email from the highest-precedence identity that has one.
    No-op if the account has no email-bearing identity at all."""
    identities = db.query(AuthIdentity).filter_by(user_id=user.id).all()
    with_email = [i for i in identities if i.email]
    if not with_email:
        return
    user.email = pick_primary_identity(with_email).email
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
