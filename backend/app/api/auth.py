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
    find_or_backfill_phone_identity,
    record_identity,
    resolve_new_verified_identity,
)
from app.services.auth.email_provider import get_email_provider
from app.services.auth.google_oauth import GoogleTokenVerificationError, verify_google_id_token
from app.services.auth.otp import OtpRequestThrottledError, OtpVerificationError, create_otp_request, verify_otp
from app.services.auth.password import hash_password, verify_password
from app.services.auth.password_reset import (
    PasswordResetTokenError,
    consume_password_reset_token,
    create_password_reset_token,
)
from app.services.auth.schemas import (
    ForgotPasswordBody,
    ForgotPasswordResponse,
    GoogleAuthBody,
    LinkRequiredDetail,
    LinkRequiredResponse,
    LoginEmailBody,
    MeResponse,
    OtpRequestBody,
    OtpRequestResponse,
    OtpVerifyBody,
    OtpVerifyResponse,
    PhoneRequiredDetail,
    PhoneRequiredResponse,
    PROVIDER_TO_METHOD_LABEL,
    ResetPasswordBody,
    ResetPasswordResponse,
    SessionRefreshResponse,
    SignupEmailBody,
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


@router.post("/signup/email", response_model=PhoneRequiredResponse)
def signup_email(body: SignupEmailBody, db: DbSession = Depends(get_db)):
    existing = find_identity_by_subject(db, AuthIdentityProvider.EMAIL_PASSWORD, body.email)
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists — log in instead.")

    # email_verified=False unconditionally: nothing cryptographically proves
    # mailbox control at signup time (Design Spec §4a) — same reasoning that
    # fixed Critical Finding 1 for Google's unverified-email case. Called
    # directly rather than through resolve_new_verified_identity, since that
    # function's collision-check branch can never fire when email_verified is
    # False (§4).
    _, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_PASSWORD,
        body.email,
        body.email,
        False,
        matched_user_id=None,
        password_hash=hash_password(body.password),
    )
    return PhoneRequiredResponse(phone_required=PhoneRequiredDetail(token=raw_token, prefill_email=body.email))


@router.post("/login/email", response_model=OtpVerifyResponse)
def login_email(body: LoginEmailBody, db: DbSession = Depends(get_db)):
    existing = find_identity_by_subject(db, AuthIdentityProvider.EMAIL_PASSWORD, body.email)
    if existing is None or existing.password_hash is None or not verify_password(body.password, existing.password_hash):
        # Same generic message either way — don't leak whether the email
        # exists (Design Spec §4, anti-enumeration).
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if existing.email_confirmed_at is None:
        # 403, not 401: the password already matched, so this is safe to
        # disclose distinctly (Design Spec §4c) — only someone who already
        # knows the correct password ever reaches this branch.
        raise HTTPException(
            status_code=403,
            detail="Please confirm your email before signing in with a password — check your inbox, or resend the link.",
        )

    if body.pending_token:
        # Step-up re-authentication: LinkAccountPrompt's email branch calls
        # this route with a pending token when an existing account's
        # highest-precedence method is email+password, exactly matching how
        # verify_otp_route/google_oauth_route already handle their own
        # pending_token branches. Without this, a password re-auth would log
        # the user into their existing account but never attach the new
        # Google/phone-gate-originating identity that triggered the
        # collision in the first place.
        try:
            user_id = attach_pending_identity(db, body.pending_token, existing.user_id)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        return _session_response(user_id, AuthIdentityProvider.EMAIL_PASSWORD, db)

    return _session_response(existing.user_id, AuthIdentityProvider.EMAIL_PASSWORD, db)


@router.post("/password/forgot", response_model=ForgotPasswordResponse)
def forgot_password(body: ForgotPasswordBody, db: DbSession = Depends(get_db)):
    # Always 200 regardless of whether the email matches an account —
    # anti-enumeration (Design Spec §3).
    identity = find_identity_by_subject(db, AuthIdentityProvider.EMAIL_PASSWORD, body.email)
    if identity is not None:
        _, raw_token = create_password_reset_token(db, identity.user_id)
        reset_link = f"https://app.unifolio.in/reset-password?token={raw_token}"
        get_email_provider().send_email(
            to=body.email,
            subject="Reset your Unifolio password",
            body=f"Click this link to reset your password: {reset_link}. It expires in 30 minutes.",
        )
    return ForgotPasswordResponse(message="If that email is registered, a reset link has been sent.")


@router.post("/password/reset", response_model=ResetPasswordResponse)
def reset_password(body: ResetPasswordBody, db: DbSession = Depends(get_db)):
    try:
        consume_password_reset_token(db, body.token, body.new_password)
    except PasswordResetTokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return ResetPasswordResponse(message="Your password has been reset.")


#otp authentication
@router.post("/otp/request", response_model=OtpRequestResponse)
def request_otp(body: OtpRequestBody, db: DbSession = Depends(get_db)):
    try:
        _, raw_otp = create_otp_request(db, body.phone_number)
    except OtpRequestThrottledError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    return OtpRequestResponse(message="OTP sent.", otp=raw_otp)


@router.post("/otp/verify", response_model=OtpVerifyResponse | LinkRequiredResponse | PhoneRequiredResponse)
def verify_otp_route(body: OtpVerifyBody, db: DbSession = Depends(get_db)):
    try:
        verify_otp(db, body.phone_number, body.otp)
    except OtpVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    if body.pending_token:
        try:
            existing = find_or_backfill_phone_identity(db, body.phone_number)
            if existing is not None:
                user_id = attach_pending_identity(db, body.pending_token, existing.user_id)
            else:
                user_id = complete_phone_gate_signup(db, body.pending_token, body.phone_number)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        return _session_response(user_id, AuthIdentityProvider.PHONE_OTP, db)

    # Phone uses find_or_backfill_phone_identity so a pre-0005-backfill `users`
    # row (identity row missing) logs in normally instead of falling through to
    # the brand-new-signup INSERT below and violating users.phone_number UNIQUE.
    existing = find_or_backfill_phone_identity(db, body.phone_number)
    if existing is not None:
        return _session_response(existing.user_id, AuthIdentityProvider.PHONE_OTP, db)

    # Phone never collision-checks (no email claim to collide with) —
    # brand-new phone number always completes signup immediately.
    now = datetime.now(timezone.utc)
    user = User(phone_number=body.phone_number, created_at=now)
    db.add(user)
    db.flush()
    record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, body.phone_number, None, now)
    db.commit()
    return _session_response(user.id, AuthIdentityProvider.PHONE_OTP, db)


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
