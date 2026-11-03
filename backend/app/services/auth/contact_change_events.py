"""Notice, reversal and cooling-off for changes of the account's sign-in email or phone.

Why this exists: changing the contact only verifies the NEW address, so a stolen session could
swap in the thief's email and phone and then receive all four Head of Family codes. After every
change the previous address gets a "this wasn't me" link (7 days) and, for 7 days, the Head of
Family cannot be changed.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.models.auth import (
    AuthIdentity,
    ContactChangeEvent,
    HeadChangeRequest,
    PendingIdentityVerification,
    Session as SessionModel,
)
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from app.services.auth.email_provider import get_email_provider
from app.services.auth.email_templates import contact_changed_email
from app.services.auth.head_eligibility import _email_key, _phone_key

logger = logging.getLogger(__name__)

CONTACT_CHANGE_WINDOW = timedelta(days=7)


class ContactChangeError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _provider(channel: str) -> AuthIdentityProvider:
    return AuthIdentityProvider.EMAIL_OTP if channel == "email" else AuthIdentityProvider.PHONE_OTP


def _key(channel: str, value: str | None) -> str | None:
    return _email_key(value) if channel == "email" else _phone_key(value)


def mask_value(channel: str, value: str) -> str:
    if channel == "email":
        local, _, domain = value.partition("@")
        return f"{local[:1]}***@{domain}" if domain else "***"
    digits = value.strip()
    return f"{digits[:3]}******{digits[-2:]}" if len(digits) > 6 else "******"


def record_contact_change(
    db: DbSession,
    user_id: uuid.UUID,
    channel: str,
    old_value: str | None,
    new_value: str,
    *,
    now: datetime | None = None,
) -> str:
    """Adds the event row (no commit: it lands with the change itself) and returns the raw token,
    which is only ever put in the email. Only its hash is stored."""
    created_at = now or datetime.now(timezone.utc)
    raw_token = secrets.token_urlsafe(32)
    db.add(
        ContactChangeEvent(
            user_id=user_id,
            channel=channel,
            old_value=old_value,
            new_value=new_value,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            created_at=created_at,
            expires_at=created_at + CONTACT_CHANGE_WINDOW,
        )
    )
    return raw_token


def contact_changed_recently_until(db: DbSession, user_id: uuid.UUID) -> datetime | None:
    """When the cooling-off after the account's latest contact change ends, or None. A change that
    was reversed still counts: it is exactly the case the cooling-off is for."""
    now = datetime.now(timezone.utc)
    latest = (
        db.query(ContactChangeEvent.created_at)
        .filter(ContactChangeEvent.user_id == user_id)
        .order_by(ContactChangeEvent.created_at.desc())
        .first()
    )
    if latest is None:
        return None
    ends = _aware(latest.created_at) + CONTACT_CHANGE_WINDOW
    return ends if ends > now else None


def send_contact_change_notice(
    *, channel: str, old_value: str | None, account_email: str | None, new_value: str, raw_token: str
) -> None:
    """After the commit. An email change goes to the OLD email; a phone change goes to the
    account's email (no SMS is sent yet). Nothing here may fail the request."""
    recipient = old_value if channel == "email" else account_email
    if not recipient or not recipient.strip():
        return
    reverse_url = (
        f"{settings.frontend_base_url.rstrip('/')}/reverse-contact-change"
        f"#token={quote(raw_token, safe='')}&channel={channel}"
    )
    subject, text, html = contact_changed_email(
        channel=channel, new_value_masked=mask_value(channel, new_value), reverse_url=reverse_url
    )
    try:
        get_email_provider().send_email(recipient, subject, text, html)
    except Exception as exc:
        logger.error("Contact change notice not sent error=%s", type(exc).__name__)


def _not_found() -> ContactChangeError:
    return ContactChangeError(404, "reverse_not_found", "This link is not valid.")


def _taken_by_another_account(
    db: DbSession, user_id: uuid.UUID, channel: str, value: str
) -> bool:
    wanted = _key(channel, value)
    if wanted is None:
        return False
    for row in db.query(User.email, User.phone_number).filter(User.id != user_id).all():
        if _key(channel, row.email if channel == "email" else row.phone_number) == wanted:
            return True
    for row in (
        db.query(AuthIdentity.provider_subject, AuthIdentity.email)
        .filter(AuthIdentity.user_id != user_id)
        .all()
    ):
        if wanted in {_key(channel, row.provider_subject), _key(channel, row.email)}:
            return True
    return False


def reverse_contact_change(db: DbSession, token: str) -> uuid.UUID:
    """Puts the previous email or phone back, signs everyone out and cancels an open Head of Family
    change. One transaction; the account row is locked first, the lock a Head of Family swap also
    takes. Returns the account id."""
    now = datetime.now(timezone.utc)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    try:
        located = (
            db.query(ContactChangeEvent.id, ContactChangeEvent.user_id)
            .filter(ContactChangeEvent.token_hash == token_hash)
            .first()
        )
        if located is None:
            raise _not_found()
        user = (
            db.query(User)
            .filter(User.id == located.user_id)
            .populate_existing()
            .with_for_update()
            .one_or_none()
        )
        event = (
            db.query(ContactChangeEvent)
            .filter(ContactChangeEvent.id == located.id)
            .populate_existing()
            .with_for_update()
            .one_or_none()
        )
        if user is None or event is None or event.reversed_at is not None:
            raise _not_found()
        if _aware(event.expires_at) <= now:
            raise ContactChangeError(410, "reverse_expired", "The 7-day window to undo this has closed.")

        channel = event.channel
        current = user.email if channel == "email" else user.phone_number
        if _key(channel, current) != _key(channel, event.new_value):
            raise ContactChangeError(
                409,
                "reverse_changed",
                "This was changed again since. Please contact support@unifolio.in.",
            )
        if event.old_value and _taken_by_another_account(db, user.id, channel, event.old_value):
            raise ContactChangeError(
                409,
                "reverse_contact_taken",
                "The old email or phone has been taken since the change, so it cannot be put back. "
                "Please contact support@unifolio.in.",
            )

        provider = _provider(channel)
        db.query(AuthIdentity).filter(
            AuthIdentity.user_id == user.id,
            AuthIdentity.provider == provider,
            AuthIdentity.provider_subject == (current or event.new_value),
        ).delete(synchronize_session=False)
        db.flush()
        if event.old_value:
            already = (
                db.query(AuthIdentity.id)
                .filter(
                    AuthIdentity.user_id == user.id,
                    AuthIdentity.provider == provider,
                    AuthIdentity.provider_subject == event.old_value,
                )
                .first()
            )
            if already is None:
                db.add(
                    AuthIdentity(
                        user_id=user.id,
                        provider=provider,
                        provider_subject=event.old_value,
                        email=event.old_value if channel == "email" else None,
                        identifier_verified_at=now,
                        created_at=now,
                        last_used_at=now,
                    )
                )
        if channel == "email":
            user.email = event.old_value
        else:
            user.phone_number = event.old_value
        db.flush()

        db.query(SessionModel).filter(SessionModel.user_id == user.id).delete(synchronize_session=False)
        db.query(PendingIdentityVerification).filter(
            PendingIdentityVerification.matched_user_id == user.id
        ).delete(synchronize_session=False)
        db.query(HeadChangeRequest).filter(
            HeadChangeRequest.user_id == user.id, HeadChangeRequest.status == "pending"
        ).update({"status": "cancelled"}, synchronize_session=False)
        event.reversed_at = now
        db.commit()
        return user.id
    except ContactChangeError:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
