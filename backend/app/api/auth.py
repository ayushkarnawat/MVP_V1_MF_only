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
    find_identity_by_subject,
    record_identity,
    resolve_new_verified_identity,
)
from app.services.auth.google_oauth import GoogleTokenVerificationError, verify_google_id_token
from app.services.auth.otp import OtpRequestThrottledError, OtpVerificationError, create_otp_request, verify_otp
from app.services.auth.schemas import (
    GoogleAuthBody,
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
    try:
        _, raw_otp = create_otp_request(db, identifier, channel=channel)
    except OtpRequestThrottledError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
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
    resolution = resolve_new_verified_identity(db, provider, identifier, identifier, True)
    if resolution.kind == "login":
        return _session_response(resolution.user_id, provider, db)
    if resolution.kind == "link_required":
        return LinkRequiredResponse(
            link_required=LinkRequiredDetail(
                token=resolution.pending_token,
                matched_email=resolution.matched_email,
                existing_method=PROVIDER_TO_METHOD_LABEL[resolution.existing_method],
            )
        )
    return PhoneRequiredResponse(
        phone_required=PhoneRequiredDetail(token=resolution.pending_token, prefill_email=resolution.prefill_email)
    )


@router.post("/oauth/google", response_model=OtpVerifyResponse | LinkRequiredResponse | PhoneRequiredResponse)
def google_oauth_route(body: GoogleAuthBody, db: DbSession = Depends(get_db)):
    try:
        claims = verify_google_id_token(body.id_token)
    except GoogleTokenVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    if body.pending_token:
        existing = find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, claims.sub)
        if existing is None:
            raise HTTPException(status_code=401, detail="This Google account isn't linked yet.")
        try:
            user_id = attach_pending_identity(db, body.pending_token, existing.user_id)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        return _session_response(user_id, AuthIdentityProvider.GOOGLE, db)

    existing = find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, claims.sub)
    if existing is not None:
        return _session_response(existing.user_id, AuthIdentityProvider.GOOGLE, db)

    resolution = resolve_new_verified_identity(db, AuthIdentityProvider.GOOGLE, claims.sub, claims.email, claims.email_verified)
    if resolution.kind == "login":
        return _session_response(resolution.user_id, AuthIdentityProvider.GOOGLE, db)
    if resolution.kind == "link_required":
        return LinkRequiredResponse(
            link_required=LinkRequiredDetail(
                token=resolution.pending_token,
                matched_email=resolution.matched_email,
                existing_method=PROVIDER_TO_METHOD_LABEL[resolution.existing_method],
            )
        )
    return PhoneRequiredResponse(
        phone_required=PhoneRequiredDetail(token=resolution.pending_token, prefill_email=resolution.prefill_email)
    )


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
