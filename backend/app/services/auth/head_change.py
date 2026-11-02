from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.models.auth import HeadChangeRequest, OtpRequest
from app.models.user import HouseholdMember, User
from app.services.auth.email_provider import EmailSendError
from app.services.auth.head_eligibility import EligibilityReason, member_eligibility
from app.services.auth.otp import (
    EmailContent,
    OtpRequestThrottledError,
    OtpVerificationError,
    create_otp_request,
    verify_otp,
)
from app.services.dashboard.member_details import MemberNotFoundError


HEAD_CHANGE_TTL_MINUTES = 10

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


def request_head_change_start_code(
    db: DbSession, user: User, to_member_id: uuid.UUID
) -> tuple[OtpRequest, str | None]:
    _expire_stale_request(db, user)
    head = _current_head(db, user)
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
            purpose="head_change",
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
    requests = (
        db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.user_id == user.id,
            HeadChangeRequest.status == "pending",
        )
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
            purpose="head_change",
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
    request = (
        db.query(HeadChangeRequest)
        .filter(
            HeadChangeRequest.user_id == user.id,
            HeadChangeRequest.status == "pending",
        )
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
