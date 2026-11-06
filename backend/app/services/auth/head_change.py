from __future__ import annotations

import hashlib
import hmac
import logging
import math
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import quote

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.models.auth import (
    AuthIdentity,
    HeadChangeRequest,
    OtpRequest,
    PendingIdentityVerification,
    Session as SessionModel,
)
from app.models.enums import AuthIdentityProvider, ConsentAction, Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.contact_change_events import contact_changed_recently_until
from app.services.auth.email_provider import EmailSendError, get_email_provider
from app.services.auth.email_templates import (
    head_change_reversed_email,
    head_change_undo_email,
    head_changed_for_new_head_email,
    head_changed_for_old_head_email,
)
from app.services.auth.head_eligibility import (
    EligibilityReason,
    _email_key,
    _phone_key,
    member_eligibility,
)
from app.services.auth.head_labels import LabelPlan, MemberLabel, flip_labels
from app.services.auth.identity import record_identity
from app.services.auth.otp import (
    EmailContent,
    OtpRequestThrottledError,
    OtpVerificationError,
    create_otp_request,
    verify_otp,
)
from app.services.dashboard.member_details import MemberNotFoundError
from app.services.legal.consent import (
    SIGNUP_DOCUMENTS,
    ConsentEvidence,
    record_consent,
)
from app.services.legal.registry import current_document


HEAD_CHANGE_TTL_MINUTES = 10
UNDO_TTL_HOURS = 24
CHANGE_AGAIN_AFTER_DAYS = 7

logger = logging.getLogger(__name__)

START_CODE_ELIGIBILITY_REASONS = {
    "no_email",
    "no_phone",
    "no_pan",
    "label_missing",
    "same_email_as_head",
    "same_phone_as_head",
    "head_change_already_open",
    "import_in_progress",
    "account_pending_deletion",
}

Party = Literal["current", "new"]
Channel = Literal["email", "phone"]


@dataclass(frozen=True)
class HeadChangeCode:
    party: Party
    channel: Channel
    verified: bool
    otp: str | None


@dataclass(frozen=True)
class HeadChangeStatus:
    request_id: uuid.UUID
    status: str
    expires_in_seconds: int
    verified_count: int
    ready: bool
    current_email_verified: bool
    current_phone_verified: bool
    new_email_verified: bool
    new_phone_verified: bool


@dataclass(frozen=True)
class HeadChangeStartResult:
    request: HeadChangeRequest
    status: HeadChangeStatus
    codes: list[HeadChangeCode]


@dataclass(frozen=True)
class HeadChangeResendResult:
    status: HeadChangeStatus
    code: HeadChangeCode


@dataclass(frozen=True)
class HeadChangeResult:
    request_id: uuid.UUID
    user_id: uuid.UUID
    from_member_id: uuid.UUID
    to_member_id: uuid.UUID
    status: str


@dataclass(frozen=True)
class HeadChangePreviewOldHead:
    member_id: uuid.UUID
    name: str


@dataclass(frozen=True)
class HeadChangePreviewNewHead:
    member_id: uuid.UUID
    name: str
    email: str
    phone_number: str


@dataclass(frozen=True)
class HeadChangePreviewMember:
    member_id: uuid.UUID
    name: str
    label_before: str | None
    label_before_other: str | None
    label_after: str | None
    label_after_other: str | None
    review_recommended: bool
    cleared: bool


@dataclass(frozen=True)
class HeadChangePreviewResult:
    request_id: uuid.UUID
    old_head: HeadChangePreviewOldHead
    new_head: HeadChangePreviewNewHead
    old_head_new_label: str | None
    members: list[HeadChangePreviewMember]
    everyone_signed_out: bool = True



class HeadChangeError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _error(status_code: int, code: str, message: str) -> HeadChangeError:
    return HeadChangeError(status_code, code, message)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _current_head(db: DbSession, user: User) -> HouseholdMember:
    head = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.user_id == user.id,
            HouseholdMember.is_head.is_(True),
        )
        .first()
    )
    if head is None:
        raise _error(409, "member_not_eligible", "The current Head of Family could not be found.")
    return head


def _otp_error(exc: OtpVerificationError) -> HeadChangeError:
    message = str(exc)
    if message == "Too many incorrect attempts. Request a new OTP.":
        return _error(401, "code_locked", "Too many incorrect attempts. Ask for another code.")
    if message == "OTP has expired. Request a new one.":
        return _error(410, "code_expired", "This code has expired. Ask for another one.")
    return _error(401, "wrong_code", "That code is not right.")


def _delivery_error(exc: Exception) -> HeadChangeError:
    if isinstance(exc, OtpRequestThrottledError):
        return _error(429, "otp_throttled", str(exc))
    return _error(
        502,
        "email_send_failed",
        "We could not send the email just now. Try again in a minute.",
    )


def _email_content(*, party: Party, current_name: str, new_name: str) -> EmailContent:
    if party == "current":
        subject = "Confirm a change of Head of Family."
        headline = "Your confirmation code to change the Head of Family on Unifolio is below."
        note = (
            f"This code expires in 10 minutes. It will make {new_name} the Head of Family "
            "and move sign-in to them. If you did not ask for this, do not share the code "
            "and contact support@unifolio.in."
        )
    else:
        subject = "Confirm you are becoming Head of Family."
        headline = "Your confirmation code to become Head of Family on Unifolio is below."
        note = (
            f"This code expires in 10 minutes. {current_name} asked to hand this family's "
            "account to you. After you both confirm, you will sign in with this email and "
            "phone number. If this is unexpected, ignore this email."
        )
    return EmailContent(
        subject=subject,
        text=f"{headline}\n\n{{otp}}\n\n{note}",
        headline=headline,
        note=note,
    )


def _completed_at(request: HeadChangeRequest) -> datetime | None:
    """There is no completed-at column: the undo window is 24 hours long, so the change was made
    24 hours before `undo_expires_at`."""
    if request.undo_expires_at is None:
        return None
    return _aware(request.undo_expires_at) - timedelta(hours=UNDO_TTL_HOURS)


def undo_window_open_until(db: DbSession, user: User) -> datetime | None:
    """When the 24-hour undo window of the account's latest Head of Family change closes, or None
    when no window is open. Scheduling account deletion is refused until then: undo refuses an
    account that is pending deletion, so the new head could otherwise schedule deletion, wait out
    the window and reactivate, leaving the previous head with no way back."""
    now = datetime.now(timezone.utc)
    open_windows = [
        _aware(item.undo_expires_at)
        for item in db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.user_id == user.id,
            HeadChangeRequest.status == "completed",
            HeadChangeRequest.undo_expires_at.is_not(None),
        )
        .all()
        if _aware(item.undo_expires_at) > now
    ]
    return max(open_windows) if open_windows else None


def member_head_change_lock_until(db: DbSession, member_id: uuid.UUID) -> datetime | None:
    """The moment (timezone-aware UTC) the member may be removed again, or None when they are not
    locked: 7 days after the latest completed or undone Head of Family change they took part in."""
    requests = (
        db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.status.in_(("completed", "undone")),
            (HeadChangeRequest.from_member_id == member_id)
            | (HeadChangeRequest.to_member_id == member_id),
        )
        .all()
    )
    completed = [value for value in (_completed_at(item) for item in requests) if value is not None]
    if not completed:
        return None
    lock_until = max(completed) + timedelta(days=CHANGE_AGAIN_AFTER_DAYS)
    return lock_until if lock_until > datetime.now(timezone.utc) else None


def member_in_recent_head_change(db: DbSession, member_id: uuid.UUID) -> bool:
    """True while the member is the old or the new head of a change made in the last 7 days.

    The request row is deleted by the database when either member row is deleted. Removing the
    old head right after a swap would therefore erase the undo link and the 7-day rule, so such a
    member cannot be removed until the 7 days are over (7, not 1: the rule reads the same row)."""
    return member_head_change_lock_until(db, member_id) is not None


def _refuse_if_changed_recently(db: DbSession, user: User) -> None:
    """Changing the head, or changing it back, is limited to once every 7 days. A change that was
    undone still counts (the clock starts when the change was made). Undo itself is exempt.

    It is also refused for 7 days after the account's sign-in email or phone was changed: a stolen
    session could otherwise change the contact to the thief's and then receive all four codes."""
    contact_cooling_off_ends = contact_changed_recently_until(db, user.id)
    if contact_cooling_off_ends is not None:
        raise _error(
            409,
            "head_change_after_contact_change",
            "The sign-in email or phone was changed recently, so the Head of Family cannot be "
            f"changed until {contact_cooling_off_ends.day} {contact_cooling_off_ends:%B %Y}. "
            "This protects your account.",
        )
    requests = (
        db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.user_id == user.id,
            HeadChangeRequest.status.in_(("completed", "undone")),
        )
        .all()
    )
    completed = [value for value in (_completed_at(item) for item in requests) if value is not None]
    if not completed:
        return
    allowed_at = max(completed) + timedelta(days=CHANGE_AGAIN_AFTER_DAYS)
    if datetime.now(timezone.utc) < allowed_at:
        raise _error(
            409,
            "head_change_too_soon",
            "The Head of Family was changed recently. "
            f"You can change it again on {allowed_at.day} {allowed_at:%B %Y}.",
        )


def _start_purpose(to_member_id: uuid.UUID) -> str:
    """The start code's email names one member ("It will make X the Head of Family"), so the code
    is only good for starting a change to that member. It also cannot be mixed up with the
    "current head, email" code of a request (purpose `head_change`): a resent request code is not
    a start code."""
    return f"head_change_start:{to_member_id}"


def request_head_change_start_code(
    db: DbSession, user: User, to_member_id: uuid.UUID
) -> tuple[OtpRequest, str | None]:
    _expire_stale_request(db, user)
    head = _current_head(db, user)
    _refuse_if_changed_recently(db, user)
    if not user.email:
        raise _error(
            409,
            "current_email_missing",
            "Add and verify an email address on your account first.",
        )
    try:
        reasons = member_eligibility(db, user, to_member_id)
    except MemberNotFoundError as exc:
        raise _error(404, exc.code, exc.message) from exc
    reason = next(
        (item for item in reasons if item in START_CODE_ELIGIBILITY_REASONS),
        None,
    )
    if reason is not None:
        raise _reason_error(reason)
    candidate = db.get(HouseholdMember, to_member_id)
    assert candidate is not None
    try:
        return create_otp_request(
            db,
            user.email,
            channel="email",
            purpose=_start_purpose(to_member_id),
            ttl_minutes=HEAD_CHANGE_TTL_MINUTES,
            email_content=_email_content(
                party="current",
                current_name=head.name,
                new_name=candidate.name,
            ),
        )
    except (OtpRequestThrottledError, EmailSendError) as exc:
        db.rollback()
        raise _delivery_error(exc) from exc


def _reason_error(reason: EligibilityReason) -> HeadChangeError:
    if reason in {"no_email", "no_phone"}:
        return _error(409, "member_not_eligible", "Add an email address and a phone number first.")
    if reason == "same_email_as_head":
        return _error(
            409,
            "contact_same_as_head",
            "This email is the same as yours, so a code to it proves nothing. Use a different one.",
        )
    if reason == "same_phone_as_head":
        return _error(
            409,
            "contact_same_as_head",
            "This phone is the same as yours, so a code to it proves nothing. Use a different one.",
        )
    if reason == "email_in_use":
        return _error(
            409,
            "contact_in_use",
            "This email already belongs to another Unifolio account. They would need to use a different one. Contact support if you think this is a mistake.",
        )
    if reason == "phone_in_use":
        return _error(
            409,
            "contact_in_use",
            "This phone already belongs to another Unifolio account. They would need to use a different one. Contact support if you think this is a mistake.",
        )
    if reason == "pan_registered_elsewhere":
        return _error(
            409,
            "pan_registered_elsewhere",
            "This person's PAN is already on another Unifolio account, so they cannot become head.",
        )
    if reason == "no_pan":
        return _error(409, "member_not_eligible", "Add their PAN in their profile first.")
    if reason == "label_missing":
        return _error(
            409,
            "member_not_eligible",
            "The change cannot start until the new head's label is set.",
        )
    if reason == "account_pending_deletion":
        return _error(
            403,
            "account_pending_deletion",
            "This account is scheduled for deletion. Reactivate it first.",
        )
    if reason == "import_in_progress":
        return _error(
            409,
            "import_in_progress",
            "Finish or cancel the statement you are importing, then try again.",
        )
    return _error(
        409,
        "head_change_already_open",
        "A change is already waiting for codes. Cancel it or wait for it to expire.",
    )


def _destinations(request: HeadChangeRequest) -> dict:
    snapshot = request.snapshot or {}
    destinations = snapshot.get("destinations")
    if not isinstance(destinations, dict):
        raise _error(410, "request_expired", "The codes expired. Nothing has changed. Start again.")
    return destinations


def _destination(request: HeadChangeRequest, party: Party, channel: Channel) -> str:
    value = _destinations(request).get(party, {}).get(channel)
    if not isinstance(value, str) or not value:
        raise _error(410, "request_expired", "The codes expired. Nothing has changed. Start again.")
    return value


def _verified_attr(party: Party, channel: Channel) -> str:
    return f"{'current' if party == 'current' else 'new'}_{channel}_verified_at"


def head_change_status(request: HeadChangeRequest) -> HeadChangeStatus:
    flags = {
        "current_email_verified": request.current_email_verified_at is not None,
        "current_phone_verified": request.current_phone_verified_at is not None,
        "new_email_verified": request.new_email_verified_at is not None,
        "new_phone_verified": request.new_phone_verified_at is not None,
    }
    verified_count = sum(flags.values())
    ready = request.status == "pending" and verified_count == 4
    seconds = max(
        0,
        math.ceil((_aware(request.expires_at) - datetime.now(timezone.utc)).total_seconds()),
    )
    return HeadChangeStatus(
        request_id=request.id,
        status="ready" if ready else request.status,
        expires_in_seconds=seconds,
        verified_count=verified_count,
        ready=ready,
        **flags,
    )


def _delete_request_otps(
    db: DbSession,
    request: HeadChangeRequest,
    *,
    preserve_current_email: bool = False,
) -> None:
    destinations = _destinations(request)
    for party in ("current", "new"):
        for channel in ("email", "phone"):
            if preserve_current_email and party == "current" and channel == "email":
                continue
            identifier = destinations.get(party, {}).get(channel)
            if not identifier:
                continue
            column = OtpRequest.email if channel == "email" else OtpRequest.phone_number
            db.query(OtpRequest).filter(
                column == identifier,
                OtpRequest.purpose == "head_change",
            ).delete(synchronize_session=False)


def _expire_request(db: DbSession, request: HeadChangeRequest) -> None:
    request.status = "expired"
    _delete_request_otps(db, request)
    db.commit()


def _expire_stale_request(
    db: DbSession,
    user: User,
    *,
    preserve_current_email_otp: bool = False,
) -> None:
    now = datetime.now(timezone.utc)
    # Locked for the same reason as in cancel_head_change: marking a request that a swap is
    # completing right now as "expired" would hide the completed swap from undo and the 7-day rule.
    requests = (
        db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.user_id == user.id,
            HeadChangeRequest.status == "pending",
        )
        .populate_existing()
        .with_for_update()
        .all()
    )
    stale = [request for request in requests if _aware(request.expires_at) <= now]
    if not stale:
        return
    for request in stale:
        request.status = "expired"
        _delete_request_otps(
            db,
            request,
            preserve_current_email=preserve_current_email_otp,
        )
    db.commit()


def _owned_request(
    db: DbSession, user: User, request_id: uuid.UUID
) -> HeadChangeRequest:
    request = (
        db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.id == request_id,
            HeadChangeRequest.user_id == user.id,
        )
        .first()
    )
    if request is None:
        raise _error(404, "request_not_found", "Head change request not found.")
    if request.status == "expired" or (
        request.status == "pending"
        and _aware(request.expires_at) <= datetime.now(timezone.utc)
    ):
        if request.status == "pending":
            _expire_request(db, request)
        raise _error(410, "request_expired", "The codes expired. Nothing has changed. Start again.")
    if request.status != "pending":
        raise _error(404, "request_not_found", "Head change request not found.")
    return request


def start_head_change(
    db: DbSession,
    user: User,
    to_member_id: uuid.UUID,
    current_head_code: str,
) -> HeadChangeStartResult:
    _expire_stale_request(db, user, preserve_current_email_otp=True)
    _refuse_if_changed_recently(db, user)
    if not user.email:
        raise _error(
            409,
            "current_email_missing",
            "Add and verify an email address on your account first.",
        )
    try:
        verify_otp(
            db,
            user.email,
            current_head_code,
            channel="email",
            purpose=_start_purpose(to_member_id),
        )
    except OtpVerificationError as exc:
        raise _otp_error(exc) from exc

    try:
        reasons = member_eligibility(db, user, to_member_id)
    except MemberNotFoundError as exc:
        raise _error(404, exc.code, exc.message) from exc
    if reasons:
        raise _reason_error(reasons[0])

    head = _current_head(db, user)
    candidate = db.get(HouseholdMember, to_member_id)
    assert candidate is not None
    destinations = {
        "current": {"email": user.email, "phone": user.phone_number},
        "new": {"email": candidate.email, "phone": candidate.phone_number},
    }
    now = datetime.now(timezone.utc)
    request = HeadChangeRequest(
        user_id=user.id,
        from_member_id=head.id,
        to_member_id=candidate.id,
        current_email_verified_at=now,
        status="pending",
        expires_at=now + timedelta(minutes=HEAD_CHANGE_TTL_MINUTES),
        snapshot={"destinations": destinations},
    )
    codes = [HeadChangeCode("current", "email", True, None)]
    try:
        # The flush is where the one-open-request index fires when two starts race, so it
        # belongs inside this try: it must answer 409, never a server error.
        db.add(request)
        db.flush()
        for party, channel in [
            ("current", "phone"),
            ("new", "email"),
            ("new", "phone"),
        ]:
            identifier = destinations[party][channel]
            _, raw_otp = create_otp_request(
                db,
                identifier,
                channel="email" if channel == "email" else "sms",
                purpose="head_change",
                ttl_minutes=HEAD_CHANGE_TTL_MINUTES,
                commit=False,
                email_content=(
                    _email_content(
                        party="new",
                        current_name=head.name,
                        new_name=candidate.name,
                    )
                    if party == "new" and channel == "email"
                    else None
                ),
            )
            codes.append(HeadChangeCode(party, channel, False, raw_otp))
        db.commit()
    except (OtpRequestThrottledError, EmailSendError) as exc:
        db.rollback()
        raise _delivery_error(exc) from exc
    except IntegrityError as exc:
        db.rollback()
        raise _reason_error("head_change_already_open") from exc

    return HeadChangeStartResult(
        request=request,
        status=head_change_status(request),
        codes=codes,
    )


def verify_head_change_code(
    db: DbSession,
    user: User,
    request_id: uuid.UUID,
    party: Party,
    channel: Channel,
    code: str,
) -> HeadChangeStatus:
    request = _owned_request(db, user, request_id)
    attr = _verified_attr(party, channel)
    if getattr(request, attr) is not None:
        return head_change_status(request)
    identifier = _destination(request, party, channel)
    try:
        verify_otp(
            db,
            identifier,
            code,
            channel="email" if channel == "email" else "sms",
            purpose="head_change",
        )
    except OtpVerificationError as exc:
        raise _otp_error(exc) from exc
    setattr(request, attr, datetime.now(timezone.utc))
    db.commit()
    return head_change_status(request)


def resend_head_change_code(
    db: DbSession,
    user: User,
    request_id: uuid.UUID,
    party: Party,
    channel: Channel,
) -> HeadChangeResendResult:
    request = _owned_request(db, user, request_id)
    identifier = _destination(request, party, channel)
    current_head = db.get(HouseholdMember, request.from_member_id)
    new_head = db.get(HouseholdMember, request.to_member_id)
    assert current_head is not None and new_head is not None
    try:
        _, raw_otp = create_otp_request(
            db,
            identifier,
            channel="email" if channel == "email" else "sms",
            purpose="head_change",
            ttl_minutes=HEAD_CHANGE_TTL_MINUTES,
            email_content=(
                _email_content(
                    party=party,
                    current_name=current_head.name,
                    new_name=new_head.name,
                )
                if channel == "email"
                else None
            ),
        )
    except (OtpRequestThrottledError, EmailSendError) as exc:
        db.rollback()
        raise _delivery_error(exc) from exc
    verified = getattr(request, _verified_attr(party, channel)) is not None
    return HeadChangeResendResult(
        status=head_change_status(request),
        code=HeadChangeCode(party, channel, verified, raw_otp),
    )


def cancel_head_change(db: DbSession, user: User) -> HeadChangeStatus:
    _current_head(db, user)
    _expire_stale_request(db, user)
    # Locked: a cancel that read the row as pending and then waited behind a swap's lock would
    # otherwise write "cancelled" over the swap's "completed" once the swap commits (Postgres
    # re-checks only the primary key for a plain UPDATE; FOR UPDATE re-checks the status).
    request = (
        db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.user_id == user.id,
            HeadChangeRequest.status == "pending",
        )
        .populate_existing()
        .with_for_update()
        .first()
    )
    if request is None:
        raise _error(404, "request_not_found", "Head change request not found.")
    request.status = "cancelled"
    _delete_request_otps(db, request)
    db.commit()
    return head_change_status(request)


def get_pending_head_change(
    db: DbSession, user: User
) -> HeadChangeStatus | None:
    _expire_stale_request(db, user)
    request = (
        db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.user_id == user.id,
            HeadChangeRequest.status == "pending",
        )
        .first()
    )
    return head_change_status(request) if request is not None else None


def peek_pending_head_change(
    db: DbSession, user: User
) -> HeadChangeStatus | None:
    """Read-only twin of `get_pending_head_change` for `GET /auth/me`, which runs often and must
    never write: a row past `expires_at` is ignored here, not marked expired."""
    request = (
        db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.user_id == user.id,
            HeadChangeRequest.status == "pending",
        )
        .first()
    )
    if request is None or _aware(request.expires_at) <= datetime.now(timezone.utc):
        return None
    return head_change_status(request)


@dataclass(frozen=True)
class MemberEligibility:
    member_id: uuid.UUID
    reasons: list[str]


def list_member_eligibility(db: DbSession, user: User) -> list[MemberEligibility]:
    """Each non-head member with ONLY the reasons that come from the account's own data. The
    reasons that would reveal another account (`email_in_use`, `phone_in_use`,
    `pan_registered_elsewhere`) are dropped here and stay behind the verified start code."""
    _expire_stale_request(db, user)
    _current_head(db, user)
    members = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.user_id == user.id,
            HouseholdMember.is_head.is_(False),
        )
        .order_by(HouseholdMember.created_at, HouseholdMember.id)
        .all()
    )
    rows: list[MemberEligibility] = []
    for member in members:
        try:
            reasons = member_eligibility(db, user, member.id)
        except MemberNotFoundError:
            continue
        rows.append(
            MemberEligibility(
                member_id=member.id,
                reasons=[reason for reason in reasons if reason in START_CODE_ELIGIBILITY_REASONS],
            )
        )
    return rows


def _iso(value: datetime) -> str:
    return _aware(value).isoformat()


def _relationship_value(value: Relationship | None) -> str | None:
    return value.value if value is not None else None


def _identity_snapshot(identity: AuthIdentity) -> dict[str, str | None]:
    return {
        "provider": identity.provider.value,
        "provider_subject": identity.provider_subject,
        "email": identity.email,
        "identifier_verified_at": _iso(identity.identifier_verified_at),
        "created_at": _iso(identity.created_at),
        "last_used_at": _iso(identity.last_used_at),
    }


def _member_state(
    member: HouseholdMember,
    *,
    is_head: bool,
    relationship: Relationship | None,
    relationship_other_label: str | None,
    email: str | None = None,
    phone_number: str | None = None,
) -> dict[str, str | bool | None]:
    return {
        "is_head": is_head,
        "relationship": _relationship_value(relationship),
        "relationship_other_label": relationship_other_label,
        "email": member.email if email is None else email,
        "phone_number": member.phone_number if phone_number is None else phone_number,
    }


def _changed_request_error() -> HeadChangeError:
    return _error(
        409,
        "request_changed",
        "Something changed since you started. Nothing has changed. Start again.",
    )


def _not_ready_error() -> HeadChangeError:
    return _error(
        409,
        "request_not_ready",
        "Enter all four codes before confirming the change.",
    )


def _contact_in_use_after_integrity(
    db: DbSession, user: User, member_id: uuid.UUID | None
) -> HeadChangeError:
    if member_id is None:
        return _reason_error("email_in_use")
    try:
        reasons = member_eligibility(db, user, member_id)
    except MemberNotFoundError:
        reasons = []
    if "phone_in_use" in reasons:
        return _reason_error("phone_in_use")
    return _reason_error("email_in_use")


def _old_head_email_addresses(
    old_account_email: str | None, identities: list[AuthIdentity]
) -> list[str]:
    addresses: dict[str, str] = {}

    def add(value: str | None) -> None:
        if value and value.strip():
            addresses.setdefault(value.strip().casefold(), value.strip())

    add(old_account_email)
    for identity in identities:
        add(identity.email)
        if identity.provider in {
            AuthIdentityProvider.EMAIL_OTP,
            AuthIdentityProvider.EMAIL_PASSWORD,
        }:
            add(identity.provider_subject)
    return list(addresses.values())


def _send_completion_notices(
    db: DbSession,
    request: HeadChangeRequest,
    *,
    new_head_name: str,
    old_head_name: str,
    new_head_email: str,
    old_head_emails: list[str],
    undo_token: str,
) -> None:
    # The token is in the fragment, not the query string: a fragment is never sent to the web
    # server or proxy, so it stays out of their access logs. The page reads it and POSTs it.
    undo_url = (
        f"{settings.frontend_base_url.rstrip('/')}"
        f"/undo-head-change#token={quote(undo_token, safe='')}"
    )
    # The swap is already committed: no failure to find or use a provider may surface as an error.
    try:
        provider = get_email_provider()
    except Exception as exc:
        provider = None
        logger.error(
            "Head change notices not sent, email provider unavailable error=%s", type(exc).__name__
        )
    failed_roles: set[str] = set()

    new_subject, new_text, new_html = head_changed_for_new_head_email(
        new_head_name=new_head_name,
        old_head_name=old_head_name,
    )
    old_subject, old_text, old_html = head_changed_for_old_head_email(
        new_head_name=new_head_name,
        old_head_name=old_head_name,
    )
    undo_valid_until = _aware(request.undo_expires_at)
    deliveries = [("new_head_changed", new_head_email, new_subject, new_text, new_html)]
    for address in old_head_emails:
        deliveries.append(("old_head_changed", address, old_subject, old_text, old_html))
        undo_subject, undo_text, undo_html = head_change_undo_email(
            undo_url=undo_url, valid_until=undo_valid_until
        )
        deliveries.append(("old_head_undo", address, undo_subject, undo_text, undo_html))

    for role, address, subject, text, html in deliveries:
        if provider is None:
            failed_roles.add(role)
            continue
        try:
            provider.send_email(address, subject, text, html)
        except Exception as exc:
            failed_roles.add(role)
            logger.error(
                "Head change notice failed for role=%s error=%s",
                role,
                type(exc).__name__,
            )

    if not failed_roles:
        return
    try:
        snapshot = dict(request.snapshot or {})
        snapshot["notices"] = {"failed_roles": sorted(failed_roles)}
        request.snapshot = snapshot
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(
            "Could not record head change notice failures error=%s",
            type(exc).__name__,
        )


def _build_label_plan(
    members: list[HouseholdMember],
    old_head_id: uuid.UUID,
    new_head: HouseholdMember,
) -> LabelPlan:
    return flip_labels(
        new_head.relationship,
        [
            MemberLabel(
                member_id=member.id,
                relationship=member.relationship,
                relationship_other_label=member.relationship_other_label,
                is_new_head=member.id == new_head.id,
            )
            for member in members
            if member.id != old_head_id
        ],
    )


def preview_head_change(
    db: DbSession, user: User, request_id: uuid.UUID
) -> HeadChangePreviewResult:
    """Compute the label and contact preview for a pending change request.

    Read-only: writes nothing to the database and sends no email/SMS.
    Unknown, foreign, expired, or non-pending request IDs all answer 404 request_not_found.
    """
    if bool(user.pending_deletion) or user.deletion_scheduled_at is not None:
        raise _reason_error("account_pending_deletion")

    now = datetime.now(timezone.utc)
    request = (
        db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.id == request_id,
            HeadChangeRequest.user_id == user.id,
        )
        .first()
    )
    if (
        request is None
        or request.status != "pending"
        or _aware(request.expires_at) <= now
    ):
        raise _error(404, "request_not_found", "Head change request not found.")

    members = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user.id)
        .order_by(HouseholdMember.created_at, HouseholdMember.id)
        .all()
    )
    members_by_id = {member.id: member for member in members}
    old_head = members_by_id.get(request.from_member_id)
    new_head = members_by_id.get(request.to_member_id)
    if (
        old_head is None
        or new_head is None
        or not old_head.is_head
        or old_head.relationship != Relationship.SELF
        or new_head.is_head
    ):
        raise _changed_request_error()

    label_plan = _build_label_plan(members, old_head.id, new_head)
    if label_plan.old_head_new_label is None:
        # The same refusal as the final step, so the person hears it here and not after pressing
        # "Confirm" (the new head's label was changed to "other" or cleared after the request began).
        raise _reason_error("label_missing")
    old_head_new_label = _relationship_value(label_plan.old_head_new_label)

    preview_members: list[HeadChangePreviewMember] = []
    for member in members:
        if member.id == old_head.id:
            continue
        label_before = _relationship_value(member.relationship)
        label_before_other = member.relationship_other_label
        if member.id == new_head.id:
            label_after = Relationship.SELF.value
            label_after_other = None
            review_rec = False
        else:
            after_rel = label_plan.member_labels.get(member.id, member.relationship)
            label_after = _relationship_value(after_rel)
            label_after_other = (
                label_plan.member_other_labels.get(member.id)
                if after_rel == Relationship.OTHER
                else None
            )
            review_rec = member.id in label_plan.review_recommended

        had_other_wording = bool(
            label_before_other and label_before_other.strip()
        )
        cleared = had_other_wording and not bool(
            label_after_other
            and label_after_other.strip() == label_before_other.strip()
        )

        preview_members.append(
            HeadChangePreviewMember(
                member_id=member.id,
                name=member.name,
                label_before=label_before,
                label_before_other=label_before_other,
                label_after=label_after,
                label_after_other=label_after_other,
                review_recommended=review_rec,
                cleared=cleared,
            )
        )

    return HeadChangePreviewResult(
        request_id=request.id,
        old_head=HeadChangePreviewOldHead(
            member_id=old_head.id,
            name=old_head.name,
        ),
        new_head=HeadChangePreviewNewHead(
            member_id=new_head.id,
            name=new_head.name,
            email=new_head.email or "",
            phone_number=new_head.phone_number or "",
        ),
        old_head_new_label=old_head_new_label,
        members=preview_members,
        everyone_signed_out=True,
    )


def complete_head_change(
    db: DbSession,
    user: User,
    request_id: uuid.UUID,
    evidence: ConsentEvidence,
) -> HeadChangeResult:
    """Atomically move account sign-in and the Self/head markers to a member."""
    now = datetime.now(timezone.utc)
    old_head_emails: list[str] = []
    raw_undo_token = ""
    locked_request: HeadChangeRequest | None = None
    locked_user: User | None = None
    old_head: HouseholdMember | None = None
    new_head: HouseholdMember | None = None

    try:
        # Lock order is a cross-database contract: account, members by id, request.
        locked_user = (
            db.query(User)
            .filter(User.id == user.id)
            .populate_existing()
            .with_for_update()
            .one_or_none()
        )
        if locked_user is None:
            raise _error(404, "request_not_found", "Head change request not found.")
        members = (
            db.query(HouseholdMember)
            .filter(HouseholdMember.user_id == locked_user.id)
            .order_by(HouseholdMember.id)
            .populate_existing()
            .with_for_update()
            .all()
        )
        locked_request = (
            db.query(HeadChangeRequest)
            .filter(
                HeadChangeRequest.id == request_id,
                HeadChangeRequest.user_id == locked_user.id,
            )
            .populate_existing()
            .with_for_update()
            .one_or_none()
        )
        if locked_request is None or locked_request.status != "pending":
            raise _error(404, "request_not_found", "Head change request not found.")
        if _aware(locked_request.expires_at) <= now:
            locked_request.status = "expired"
            _delete_request_otps(db, locked_request)
            db.commit()
            raise _error(
                410,
                "request_expired",
                "The codes expired. Nothing has changed. Start again.",
            )
        if any(
            value is None
            for value in (
                locked_request.current_email_verified_at,
                locked_request.current_phone_verified_at,
                locked_request.new_email_verified_at,
                locked_request.new_phone_verified_at,
            )
        ):
            raise _not_ready_error()

        members_by_id = {member.id: member for member in members}
        old_head = members_by_id.get(locked_request.from_member_id)
        new_head = members_by_id.get(locked_request.to_member_id)
        if (
            old_head is None
            or new_head is None
            or not old_head.is_head
            or old_head.relationship != Relationship.SELF
            or new_head.is_head
        ):
            raise _changed_request_error()
        if bool(locked_user.pending_deletion) or locked_user.deletion_scheduled_at is not None:
            raise _reason_error("account_pending_deletion")

        destinations = _destinations(locked_request)
        current_destinations = destinations.get("current", {})
        new_destinations = destinations.get("new", {})
        if (
            current_destinations.get("email") != locked_user.email
            or current_destinations.get("phone") != locked_user.phone_number
            or new_destinations.get("email") != new_head.email
            or new_destinations.get("phone") != new_head.phone_number
        ):
            raise _changed_request_error()

        try:
            reasons = member_eligibility(db, locked_user, new_head.id)
        except MemberNotFoundError as exc:
            raise _error(404, exc.code, exc.message) from exc
        reasons = [reason for reason in reasons if reason != "head_change_already_open"]
        if reasons:
            raise _reason_error(reasons[0])

        label_plan = _build_label_plan(members, old_head.id, new_head)
        if label_plan.old_head_new_label is None:
            raise _reason_error("label_missing")

        identities = (
            db.query(AuthIdentity)
            .filter(AuthIdentity.user_id == locked_user.id)
            .order_by(AuthIdentity.id)
            .all()
        )
        old_account_email = locked_user.email
        old_account_phone = locked_user.phone_number
        old_head_emails = _old_head_email_addresses(old_account_email, identities)
        session_count = (
            db.query(SessionModel).filter(SessionModel.user_id == locked_user.id).count()
        )

        member_changes = []
        for member in members:
            old_state = _member_state(
                member,
                is_head=member.is_head,
                relationship=member.relationship,
                relationship_other_label=member.relationship_other_label,
            )
            if member.id == old_head.id:
                new_state = _member_state(
                    member,
                    is_head=False,
                    relationship=label_plan.old_head_new_label,
                    relationship_other_label=None,
                    email=old_account_email,
                    phone_number=old_account_phone,
                )
            elif member.id == new_head.id:
                new_state = _member_state(
                    member,
                    is_head=True,
                    relationship=Relationship.SELF,
                    relationship_other_label=None,
                )
            else:
                relationship = label_plan.member_labels.get(
                    member.id, member.relationship
                )
                new_state = _member_state(
                    member,
                    is_head=member.is_head,
                    relationship=relationship,
                    relationship_other_label=(
                        label_plan.member_other_labels.get(member.id)
                        if relationship == Relationship.OTHER
                        else None
                    ),
                )
            member_changes.append(
                {"member_id": str(member.id), "old": old_state, "new": new_state}
            )

        raw_undo_token = secrets.token_urlsafe(32)
        undo_token_hash = hashlib.sha256(raw_undo_token.encode()).hexdigest()
        undo_expires_at = now + timedelta(hours=UNDO_TTL_HOURS)
        snapshot = dict(locked_request.snapshot or {})
        snapshot.update(
            {
                "identities": [_identity_snapshot(identity) for identity in identities],
                "account_contact": {
                    "email": old_account_email,
                    "phone_number": old_account_phone,
                },
                "member_changes": member_changes,
                "session_count": session_count,
                "undo_token_hash": undo_token_hash,
                "undo_expires_at": undo_expires_at.isoformat(),
                "notices": {"failed_roles": []},
            }
        )
        locked_request.snapshot = snapshot

        db.query(AuthIdentity).filter(AuthIdentity.user_id == locked_user.id).delete(
            synchronize_session=False
        )
        db.flush()

        locked_user.phone_number = new_head.phone_number
        locked_user.email = new_head.email
        db.flush()

        record_identity(
            db,
            locked_user.id,
            AuthIdentityProvider.PHONE_OTP,
            new_head.phone_number,
            None,
            now,
            commit=False,
        )
        record_identity(
            db,
            locked_user.id,
            AuthIdentityProvider.EMAIL_OTP,
            new_head.email,
            new_head.email,
            now,
            commit=False,
        )
        db.flush()

        old_head.is_head = False
        old_head.relationship = label_plan.old_head_new_label
        old_head.relationship_other_label = None
        old_head.email = old_account_email
        old_head.phone_number = old_account_phone
        db.flush()

        new_head.is_head = True
        new_head.relationship = Relationship.SELF
        new_head.relationship_other_label = None
        for member in members:
            if member.id in {old_head.id, new_head.id}:
                continue
            relationship = label_plan.member_labels.get(member.id, member.relationship)
            member.relationship = relationship
            member.relationship_other_label = (
                label_plan.member_other_labels.get(member.id)
                if relationship == Relationship.OTHER
                else None
            )

        db.query(SessionModel).filter(SessionModel.user_id == locked_user.id).delete(
            synchronize_session=False
        )
        db.query(PendingIdentityVerification).filter(
            PendingIdentityVerification.matched_user_id == locked_user.id
        ).delete(synchronize_session=False)
        _delete_request_otps(db, locked_request)

        record_consent(
            db,
            user_id=locked_user.id,
            documents=[current_document(document) for document in SIGNUP_DOCUMENTS],
            action=ConsentAction.WITHDRAWN,
            surface="head_change",
            evidence=evidence,
            recorded_at=now,
        )
        locked_request.status = "completed"
        locked_request.undo_token_hash = undo_token_hash
        locked_request.undo_expires_at = undo_expires_at
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _contact_in_use_after_integrity(
            db, user, new_head.id if new_head is not None else None
        ) from exc
    except HeadChangeError:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    assert locked_user is not None
    assert locked_request is not None
    assert old_head is not None
    assert new_head is not None
    _send_completion_notices(
        db,
        locked_request,
        new_head_name=new_head.name,
        old_head_name=old_head.name,
        new_head_email=new_head.email,
        old_head_emails=old_head_emails,
        undo_token=raw_undo_token,
    )
    return HeadChangeResult(
        request_id=locked_request.id,
        user_id=locked_user.id,
        from_member_id=old_head.id,
        to_member_id=new_head.id,
        status="completed",
    )


def _undo_not_found_error() -> HeadChangeError:
    # One answer for an unknown, used or wrong token: nothing says which.
    return _error(404, "undo_not_found", "This undo link is not valid.")


def _undo_expired_error() -> HeadChangeError:
    return _error(410, "undo_expired", "The 24-hour undo window has closed.")


def _undo_contact_taken_error() -> HeadChangeError:
    return _error(
        409,
        "undo_contact_taken",
        "The old phone or email has been taken since the change, so it cannot be undone.",
    )


def _restored_identity(user_id: uuid.UUID, item: dict) -> AuthIdentity:
    """Rebuild a deleted identity from the swap's snapshot, with its original times."""
    return AuthIdentity(
        user_id=user_id,
        provider=AuthIdentityProvider(item["provider"]),
        provider_subject=item["provider_subject"],
        email=item.get("email"),
        identifier_verified_at=datetime.fromisoformat(item["identifier_verified_at"]),
        created_at=datetime.fromisoformat(item["created_at"]),
        last_used_at=datetime.fromisoformat(item["last_used_at"]),
    )


def _old_contact_is_taken(
    db: DbSession,
    user_id: uuid.UUID,
    *,
    old_email: str | None,
    old_phone: str | None,
    restored: list[AuthIdentity],
) -> bool:
    """True when the old email or phone, or any restored identity's subject or email, now belongs
    to another account (users, identities and the identity `email` column, normalised exactly as
    the eligibility check does)."""
    emails = {_email_key(old_email)}
    phones = {_phone_key(old_phone)}
    exact = set()
    for identity in restored:
        exact.add((identity.provider, identity.provider_subject))
        emails.add(_email_key(identity.email))
        if identity.provider == AuthIdentityProvider.PHONE_OTP:
            phones.add(_phone_key(identity.provider_subject))
        elif identity.provider in {
            AuthIdentityProvider.EMAIL_OTP,
            AuthIdentityProvider.EMAIL_PASSWORD,
        }:
            emails.add(_email_key(identity.provider_subject))
    emails.discard(None)
    phones.discard(None)

    for row in db.query(User.email, User.phone_number).filter(User.id != user_id).all():
        if _email_key(row.email) in emails or _phone_key(row.phone_number) in phones:
            return True
    for row in (
        db.query(AuthIdentity.provider, AuthIdentity.provider_subject, AuthIdentity.email)
        .filter(AuthIdentity.user_id != user_id)
        .all()
    ):
        if (row.provider, row.provider_subject) in exact:
            return True
        if (
            _email_key(row.email) in emails
            or _email_key(row.provider_subject) in emails
            or _phone_key(row.provider_subject) in phones
            or _phone_key(row.email) in phones
        ):
            return True
    return False


def _relationship_from(value: str | None) -> Relationship | None:
    return Relationship(value) if value else None


def _restore_contact(member: HouseholdMember, change: dict | None) -> None:
    """Email and phone go back only if they still hold what the swap put there."""
    if change is None:
        return
    old, new = change["old"], change["new"]
    if member.email == new.get("email"):
        member.email = old.get("email")
    if member.phone_number == new.get("phone_number"):
        member.phone_number = old.get("phone_number")


def _restore_label(member: HouseholdMember, change: dict | None) -> None:
    """The label and its free text go back together, and only if neither was touched since the
    swap. A later edit to either keeps both exactly as the user left them."""
    if change is None:
        return
    old, new = change["old"], change["new"]
    current = (_relationship_value(member.relationship), member.relationship_other_label)
    if current == (new.get("relationship"), new.get("relationship_other_label")):
        member.relationship = _relationship_from(old.get("relationship"))
        member.relationship_other_label = old.get("relationship_other_label")


def _unique_addresses(*values: str | None) -> list[str]:
    addresses: dict[str, str] = {}
    for value in values:
        if value and value.strip():
            addresses.setdefault(value.strip().casefold(), value.strip())
    return list(addresses.values())


def _send_reversal_notices(
    db: DbSession,
    request: HeadChangeRequest,
    *,
    restored_head_name: str,
    other_head_name: str,
    new_head_emails: list[str],
    old_head_emails: list[str],
) -> None:
    # The undo is already committed: no failure to find or use a provider may surface as an error.
    try:
        provider = get_email_provider()
    except Exception as exc:
        provider = None
        logger.error(
            "Head change reversal notices not sent, email provider unavailable error=%s",
            type(exc).__name__,
        )
    subject, text, html = head_change_reversed_email(
        restored_head_name=restored_head_name, other_head_name=other_head_name
    )
    failed_roles: set[str] = set()
    sent_to: set[str] = set()
    deliveries = [("new_head_reversed", address) for address in new_head_emails] + [
        ("old_head_reversed", address) for address in old_head_emails
    ]
    for role, address in deliveries:
        key = address.casefold()
        if key in sent_to:
            continue
        sent_to.add(key)
        if provider is None:
            failed_roles.add(role)
            continue
        try:
            provider.send_email(address, subject, text, html)
        except Exception as exc:
            failed_roles.add(role)
            logger.error(
                "Head change reversal notice failed for role=%s error=%s",
                role,
                type(exc).__name__,
            )

    if not failed_roles:
        return
    try:
        snapshot = dict(request.snapshot or {})
        snapshot["undo_notices"] = {"failed_roles": sorted(failed_roles)}
        request.snapshot = snapshot
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(
            "Could not record head change reversal notice failures error=%s",
            type(exc).__name__,
        )


def undo_head_change(
    db: DbSession,
    token: str,
    evidence: ConsentEvidence,
) -> HeadChangeResult:
    """Atomically reverse a completed Head of Family change with its undo token.

    The caller cannot sign in (the old head's identities are gone), so there is no user argument:
    the request is found by the SHA-256 of the token. One transaction, the swap's lock order, and
    nothing commits before the end."""
    now = datetime.now(timezone.utc)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    locked_request: HeadChangeRequest | None = None
    locked_user: User | None = None
    result_ids: tuple[uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID] | None = None
    restored_head_name = other_head_name = ""
    new_head_emails: list[str] = []
    old_head_emails: list[str] = []

    try:
        # An unlocked read that only tells us which account to lock. Everything is re-checked
        # under the lock, so two callers with the same token cannot both succeed.
        located = (
            db.query(HeadChangeRequest.id, HeadChangeRequest.user_id)
            .filter(HeadChangeRequest.undo_token_hash == token_hash)
            .first()
        )
        if located is None:
            raise _undo_not_found_error()

        # Lock order is a cross-database contract: account, members by id, request.
        locked_user = (
            db.query(User)
            .filter(User.id == located.user_id)
            .populate_existing()
            .with_for_update()
            .one_or_none()
        )
        if locked_user is None:
            raise _undo_not_found_error()
        members = (
            db.query(HouseholdMember)
            .filter(HouseholdMember.user_id == locked_user.id)
            .order_by(HouseholdMember.id)
            .populate_existing()
            .with_for_update()
            .all()
        )
        locked_request = (
            db.query(HeadChangeRequest)
            .filter(
                HeadChangeRequest.id == located.id,
                HeadChangeRequest.user_id == locked_user.id,
            )
            .populate_existing()
            .with_for_update()
            .one_or_none()
        )
        if (
            locked_request is None
            or locked_request.status != "completed"
            or locked_request.undo_token_hash is None
            or not hmac.compare_digest(locked_request.undo_token_hash, token_hash)
        ):
            raise _undo_not_found_error()
        if locked_request.undo_expires_at is None or _aware(locked_request.undo_expires_at) <= now:
            raise _undo_expired_error()
        if bool(locked_user.pending_deletion) or locked_user.deletion_scheduled_at is not None:
            raise _reason_error("account_pending_deletion")

        later_changes = (
            db.query(HeadChangeRequest)
            .filter(
                HeadChangeRequest.user_id == locked_user.id,
                HeadChangeRequest.id != locked_request.id,
                HeadChangeRequest.status.in_(("completed", "undone")),
            )
            .all()
        )
        if any(
            item.undo_expires_at is not None
            and _aware(item.undo_expires_at) > _aware(locked_request.undo_expires_at)
            for item in later_changes
        ):
            raise _changed_request_error()

        members_by_id = {member.id: member for member in members}
        # `old_head` is the head the swap removed (to be restored); `new_head` is the head now.
        old_head = members_by_id.get(locked_request.from_member_id)
        new_head = members_by_id.get(locked_request.to_member_id)
        if old_head is None or new_head is None or not new_head.is_head or old_head.is_head:
            raise _changed_request_error()

        snapshot = dict(locked_request.snapshot or {})
        identity_items = snapshot.get("identities")
        contact = snapshot.get("account_contact")
        member_changes = snapshot.get("member_changes")
        if (
            not isinstance(identity_items, list)
            or not isinstance(contact, dict)
            or not isinstance(member_changes, list)
            or not contact.get("phone_number")
        ):
            raise _changed_request_error()
        try:
            restored = [_restored_identity(locked_user.id, item) for item in identity_items]
        except (KeyError, ValueError, TypeError) as exc:
            raise _changed_request_error() from exc

        old_email = contact.get("email")
        old_phone = contact["phone_number"]
        if _old_contact_is_taken(
            db,
            locked_user.id,
            old_email=old_email,
            old_phone=old_phone,
            restored=restored,
        ):
            raise _undo_contact_taken_error()

        changes = {
            item.get("member_id"): item for item in member_changes if isinstance(item, dict)
        }
        restored_head_name = old_head.name
        other_head_name = new_head.name
        new_head_emails = _unique_addresses(locked_user.email, new_head.email)
        old_head_emails = _old_head_email_addresses(old_email, restored)
        result_ids = (
            locked_request.id,
            locked_user.id,
            locked_request.from_member_id,
            locked_request.to_member_id,
        )

        db.query(AuthIdentity).filter(AuthIdentity.user_id == locked_user.id).delete(
            synchronize_session=False
        )
        db.flush()

        locked_user.phone_number = old_phone
        locked_user.email = old_email
        db.flush()

        db.add_all(restored)
        db.flush()

        # The one-head and one-Self rules are checked per statement: clear the current head
        # first, flush, then set the old head.
        new_head.is_head = False
        _restore_contact(new_head, changes.get(str(new_head.id)))
        _restore_label(new_head, changes.get(str(new_head.id)))
        if new_head.relationship == Relationship.SELF:
            new_change = changes.get(str(new_head.id))
            new_head.relationship = _relationship_from(
                new_change["old"].get("relationship") if new_change else None
            )
            new_head.relationship_other_label = (
                new_change["old"].get("relationship_other_label") if new_change else None
            )
        db.flush()

        old_head.is_head = True
        old_head.relationship = Relationship.SELF
        old_head.relationship_other_label = None
        _restore_contact(old_head, changes.get(str(old_head.id)))
        for member in members:
            if member.id in {old_head.id, new_head.id}:
                continue
            _restore_label(member, changes.get(str(member.id)))
            _restore_contact(member, changes.get(str(member.id)))
        db.flush()

        db.query(SessionModel).filter(SessionModel.user_id == locked_user.id).delete(
            synchronize_session=False
        )
        db.query(PendingIdentityVerification).filter(
            PendingIdentityVerification.matched_user_id == locked_user.id
        ).delete(synchronize_session=False)
        destinations = snapshot.get("destinations")
        if isinstance(destinations, dict):
            _delete_request_otps(db, locked_request)

        record_consent(
            db,
            user_id=locked_user.id,
            documents=[current_document(document) for document in SIGNUP_DOCUMENTS],
            action=ConsentAction.WITHDRAWN,
            surface="head_change_undo",
            evidence=evidence,
            recorded_at=now,
        )
        snapshot.pop("undo_token_hash", None)
        snapshot["undone_at"] = now.isoformat()
        snapshot["undo_notices"] = {"failed_roles": []}
        locked_request.snapshot = snapshot
        locked_request.status = "undone"
        locked_request.undo_token_hash = None
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _undo_contact_taken_error() from exc
    except HeadChangeError:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    assert locked_request is not None and result_ids is not None
    _send_reversal_notices(
        db,
        locked_request,
        restored_head_name=restored_head_name,
        other_head_name=other_head_name,
        new_head_emails=new_head_emails,
        old_head_emails=old_head_emails,
    )
    request_id, user_id, from_member_id, to_member_id = result_ids
    return HeadChangeResult(
        request_id=request_id,
        user_id=user_id,
        from_member_id=from_member_id,
        to_member_id=to_member_id,
        status="undone",
    )
