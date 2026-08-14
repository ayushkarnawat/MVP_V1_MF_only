from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db #dependency for database session
from app.models.auth import AuthIdentity, Session as SessionModel
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from app.services.auth.identity import (
    PendingVerificationError,
    attach_pending_identity,
    complete_phone_gate_signup,
    create_pending_verification,
    find_identity_by_subject,
    pick_primary_identity,
    record_identity,
    refresh_denormalized_email,
    resolve_email_collision,
)
from app.services.auth.otp import OtpVerificationError, create_otp_request, verify_otp
from app.services.auth.schemas import (
    GoogleAuthBody,  # noqa: F401 — unused until Task 10's /auth/google route lands in this file
    LinkRequiredDetail,
    LinkRequiredResponse,
    MeResponse,
    OtpRequestBody,
    OtpRequestResponse,
    OtpVerifyBody,
    OtpVerifyResponse,
    PhoneRequiredDetail,
    PhoneRequiredResponse,
    PROVIDER_TO_METHOD_LABEL,
    SessionRefreshResponse,
    UpdateMeBody,
) #to validate api requests
from app.services.auth.session import create_session, get_current_session, get_current_user, refresh_session

router = APIRouter(prefix="/auth", tags=["auth"])


def _session_response(user_id, auth_method: AuthIdentityProvider, db: DbSession) -> OtpVerifyResponse:
    user = db.get(User, user_id)
    _, raw_token = create_session(db, user_id, auth_method=auth_method)
    return OtpVerifyResponse(
        session_token=raw_token,
        user_id=str(user_id),
        onboarding_step=user.onboarding_step,
        onboarding_completed=user.onboarding_completed_at is not None,
    )


#otp authentication
@router.post("/otp/request", response_model=OtpRequestResponse)
def request_otp(body: OtpRequestBody, db: DbSession = Depends(get_db)):
    channel = "sms" if body.phone_number is not None else "email"
    identifier = body.phone_number if channel == "sms" else body.email
    _, raw_otp = create_otp_request(db, identifier, channel=channel)
    return OtpRequestResponse(message="OTP sent.", otp=raw_otp)


@router.post("/otp/verify", response_model=OtpVerifyResponse | LinkRequiredResponse | PhoneRequiredResponse)
def verify_otp_route(body: OtpVerifyBody, db: DbSession = Depends(get_db)):
    channel = "sms" if body.phone_number is not None else "email"
    identifier = body.phone_number if channel == "sms" else body.email
    provider = AuthIdentityProvider.PHONE_OTP if channel == "sms" else AuthIdentityProvider.EMAIL_OTP

    try:
        verify_otp(db, identifier, body.otp, channel=channel)
    except OtpVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    if body.pending_token:
        try:
            if channel != "sms":
                # Only phone can complete the mandatory-phone-gate case;
                # an email re-auth here can only be a link completion.
                existing = find_identity_by_subject(db, provider, identifier)
                if existing is None:
                    raise HTTPException(status_code=401, detail="This account isn't linked yet.")
                user_id = attach_pending_identity(db, body.pending_token, existing.user_id)
            else:
                existing = find_identity_by_subject(db, provider, identifier)
                if existing is not None:
                    user_id = attach_pending_identity(db, body.pending_token, existing.user_id)
                else:
                    user_id = complete_phone_gate_signup(db, body.pending_token, identifier)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        return _session_response(user_id, provider, db)

    existing = find_identity_by_subject(db, provider, identifier)
    if existing is not None:
        return _session_response(existing.user_id, provider, db)

    if channel == "sms":
        # Phone never collision-checks (no email claim to collide with) —
        # brand-new phone number always completes signup immediately.
        now = datetime.now(timezone.utc)
        user = User(phone_number=identifier, created_at=now)
        db.add(user)
        db.flush()
        record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, identifier, None, now)
        db.commit()
        return _session_response(user.id, AuthIdentityProvider.PHONE_OTP, db)

    # Email channel with no existing identity: run the collision check.
    collision = resolve_email_collision(db, identifier)
    if collision.kind == "auto_link":
        now = datetime.now(timezone.utc)
        record_identity(db, collision.matched_user_id, AuthIdentityProvider.EMAIL_OTP, identifier, identifier, now)
        user = db.get(User, collision.matched_user_id)
        refresh_denormalized_email(db, user)
        return _session_response(collision.matched_user_id, AuthIdentityProvider.EMAIL_OTP, db)

    if collision.kind == "link_required":
        matched_user = db.get(User, collision.matched_user_id)
        matched_identities = db.query(AuthIdentity).filter_by(user_id=matched_user.id).all()
        existing_method_provider = (
            pick_primary_identity(matched_identities).provider if matched_identities else AuthIdentityProvider.PHONE_OTP
        )
        pending, raw_token = create_pending_verification(
            db, AuthIdentityProvider.EMAIL_OTP, identifier, identifier, True, matched_user_id=matched_user.id
        )
        return LinkRequiredResponse(
            link_required=LinkRequiredDetail(
                token=raw_token,
                matched_email=identifier,
                existing_method=PROVIDER_TO_METHOD_LABEL[existing_method_provider],
            )
        )

    # kind == "none": brand-new signup, still needs the mandatory phone step.
    pending, raw_token = create_pending_verification(
        db, AuthIdentityProvider.EMAIL_OTP, identifier, identifier, True, matched_user_id=None
    )
    return PhoneRequiredResponse(phone_required=PhoneRequiredDetail(token=raw_token, prefill_email=identifier))


#session management
@router.post("/session/refresh", response_model=SessionRefreshResponse)
def refresh_session_route(
    session: SessionModel = Depends(get_current_session),
    db: DbSession = Depends(get_db),
):
    refreshed = refresh_session(db, session)
    return SessionRefreshResponse(expires_at=refreshed.expires_at.isoformat())

#current user endpoints
def _me_response(user: User) -> MeResponse:
    return MeResponse(
        user_id=str(user.id),
        phone_number=user.phone_number,
        email=user.email,
        onboarding_step=user.onboarding_step,
        onboarding_completed=user.onboarding_completed_at is not None,
        investor_type=user.investor_type,
        primary_goal=user.primary_goal,
    )


@router.get("/me", response_model=MeResponse)
def get_me(user: User = Depends(get_current_user)):
    return _me_response(user)


@router.patch("/me", response_model=MeResponse)
def update_me(
    body: UpdateMeBody,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if body.onboarding_step is not None:
        user.onboarding_step = body.onboarding_step
    if body.investor_type is not None:
        user.investor_type = body.investor_type
    if body.primary_goal is not None:
        user.primary_goal = body.primary_goal
    # First-completion-wins: onboarding_completed=false is not a supported
    # "un-complete" action, only forward marking is needed (PRD-02 has no
    # revert-to-onboarding flow once done).
    if body.onboarding_completed is True and user.onboarding_completed_at is None:
        user.onboarding_completed_at = datetime.now(timezone.utc)
    db.commit()

    return _me_response(user)
