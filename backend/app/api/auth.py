from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session as DbSession

from app.api.legal import CONSENT_CONTINUE_MESSAGE
from app.db.session import get_db #dependency for database session
from app.models.auth import AuthIdentity, Session as SessionModel
from app.models.enums import AuthIdentityProvider, ConsentAction, ConsentDocumentType, PrimaryGoal, Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.device_info import capture_request_metadata
from app.config import settings
from app.services.auth.identity import (
    EmailCollisionError,
    PendingVerificationError,
    attach_email_to_pending,
    attach_pending_identity,
    complete_gated_signup,
    create_pending_verification,
    discard_pending_verification,
    find_identity_by_subject,
    find_or_backfill_phone_identity,
    mark_pending_email_verified,
    peek_pending_link_info,
    record_identity,
    resolve_email_collision,
    resolve_new_verified_identity,
)
from app.services.auth.account_deletion import reactivate_account, schedule_account_deletion
from app.services.auth.email_provider import EmailSendError
from app.services.auth.google_oauth import GoogleTokenVerificationError, verify_google_id_token
from app.services.auth.otp import OtpRequestThrottledError, OtpVerificationError, create_otp_request, verify_otp
from app.services.auth.schemas import (
    EmailOtpRequestBody,
    EmailOtpRequiredDetail,
    EmailOtpRequiredResponse,
    EmailOtpVerifyBody,
    EmailRequiredDetail,
    EmailRequiredResponse,
    GoogleAuthBody,
    LinkRequiredDetail,
    LinkRequiredResponse,
    MeResponse,
    OtpRequestBody,
    ReactivateBody,
    OtpRequestResponse,
    OtpVerifyBody,
    OtpVerifyResponse,
    PhoneRequiredDetail,
    PhoneRequiredResponse,
    PROVIDER_TO_METHOD_LABEL,
    SessionRefreshResponse,
    SignupEmailBody,
    UpdateMeBody,
    AccountDeletionBody,
    ContactChangeRequestBody,
    ContactChangeVerifyBody,
) #to validate api requests
from app.services.auth.session import create_session, get_active_user, get_current_session, get_current_user, refresh_session
from app.services.legal.consent import (
    SIGNUP_DOCUMENTS,
    ConsentRequiredError,
    evidence_from_request,
    outdated_documents,
    record_consent,
    snapshot_for_signup,
    validate_accepted,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_SIGNUP_CONSENT_MESSAGE = "Agree to the Terms & Conditions and Privacy Policy to create your account."


def _consent_http(exc: ConsentRequiredError, message: str = _SIGNUP_CONSENT_MESSAGE) -> HTTPException:
    # Sign-up paths use the sign-up wording (the default) rather than the
    # generic "latest version of: ..." text ConsentRequiredError carries;
    # reactivation passes the "to continue" copy. `missing` says exactly which.
    return HTTPException(
        status_code=422,
        detail={"code": exc.code, "message": message, "missing": exc.missing},
    )


def _session_response(user_id, auth_method: AuthIdentityProvider, db: DbSession) -> OtpVerifyResponse:
    user = db.get(User, user_id)
    _, raw_token = create_session(db, user_id, auth_method=auth_method)
    return OtpVerifyResponse(
        session_token=raw_token,
        user_id=str(user_id),
        onboarding_step=user.onboarding_step,
        onboarding_completed=user.onboarding_completed_at is not None,
    )


@router.post("/signup/email", response_model=EmailOtpRequiredResponse)
def signup_email(body: SignupEmailBody, request: Request, db: DbSession = Depends(get_db)):
    existing = find_identity_by_subject(db, AuthIdentityProvider.EMAIL_OTP, body.email)
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    try:
        consent_snapshot = snapshot_for_signup(
            body.accepted_documents, "signup_email", evidence_from_request(request)
        )
    except ConsentRequiredError as exc:
        raise _consent_http(exc) from exc

    _, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_OTP,
        body.email,
        body.email,
        False,
        matched_user_id=None,
        consent_snapshot=consent_snapshot,
    )
    try:
        _, raw_otp = create_otp_request(db, body.email, channel="email")
    except OtpRequestThrottledError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return EmailOtpRequiredResponse(
        email_otp_required=EmailOtpRequiredDetail(token=raw_token, prefill_email=body.email, otp=raw_otp)
    )


#email-otp signup confirmation and login (remove-password-auth handoff spec
# §4/§5) -- replaces the link-based /email/confirm route entirely, and
# /auth/login/email, not alongside either.
@router.post("/email-otp/request", response_model=OtpRequestResponse)
def request_email_otp(body: EmailOtpRequestBody, request: Request, db: DbSession = Depends(get_db)):
    if body.pending_token:
        # C2 fix (final review, 2026-09-28): same collision check
        # signup_email/request_otp already run for their own directions --
        # matches the request-time UX of the phone gate's own 409
        # (test_phone_gate_rejects_a_colliding_number_at_request_time_before_any_otp_is_sent)
        # instead of only surfacing at verify time via complete_gated_signup's
        # own defensive check.
        if resolve_email_collision(db, body.email).kind != "none":
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        # FR-4: this is the email step of a phone-first signup -- attach the
        # email to the already-phone-verified pending record before sending
        # the code, so complete_gated_signup can use it once verified.
        try:
            attach_email_to_pending(db, body.pending_token, body.email)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
    elif body.flow == "login" and find_identity_by_subject(db, AuthIdentityProvider.EMAIL_OTP, body.email) is None:
        raise HTTPException(status_code=404, detail="No account found for that email — sign up instead.")

    try:
        _, raw_otp = create_otp_request(db, body.email, channel="email", metadata=capture_request_metadata(request))
    except OtpRequestThrottledError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return OtpRequestResponse(message="OTP sent.", otp=raw_otp)


@router.post("/email-otp/verify", response_model=OtpVerifyResponse | PhoneRequiredResponse)
def verify_email_otp(body: EmailOtpVerifyBody, db: DbSession = Depends(get_db)):
    try:
        verify_otp(db, body.email, body.otp, channel="email")
    except OtpVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    if body.pending_token:
        try:
            link_info = peek_pending_link_info(db, body.pending_token)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

        if link_info.matched_user_id is not None:
            # Step-up re-auth (LinkAccountPrompt's email branch): this is a
            # genuine link_required collision token, already tied to a
            # specific account by resolve_new_verified_identity against an
            # email independently verified earlier (e.g. by Google) --
            # attach directly to that account. Deliberately NOT looked up
            # via find_identity_by_subject(body.email): an EMAIL_OTP
            # pending token's own provider_subject is self-chosen at
            # signup_email time with no ownership check, so looking up
            # "does an account already exist for this email" here would
            # let an attacker pre-claim an arbitrary victim email by
            # verifying their own unrelated, genuinely-valid OTP.
            #
            # matched_user_id itself can't be forged (it's server-derived
            # from Google's own verified claim), but that alone only
            # proves *some* email collided with *some* account -- not that
            # THIS request just verified control of the SPECIFIC contested
            # address. Require that too, or any OTP the caller can pass
            # for any email they control would satisfy this step-up.
            if link_info.email != body.email:
                raise HTTPException(status_code=401, detail="This verification code doesn't match this signup.")
            try:
                user_id = attach_pending_identity(db, body.pending_token, link_info.matched_user_id)
            except PendingVerificationError as exc:
                raise HTTPException(status_code=401, detail=str(exc)) from exc
            return _session_response(user_id, AuthIdentityProvider.EMAIL_OTP, db)

        if link_info.provider == AuthIdentityProvider.PHONE_OTP:
            # FR-5: phone-first signup's mandatory email gate -- email is
            # the final step here, so this completes signup directly
            # instead of flipping an intermediate flag and handing off to
            # another step.
            try:
                user_id = complete_gated_signup(
                    db, body.pending_token, AuthIdentityProvider.EMAIL_OTP, body.email
                )
            except PendingVerificationError as exc:
                raise HTTPException(status_code=401, detail=str(exc)) from exc
            except ConsentRequiredError as exc:
                raise _consent_http(exc) from exc
            except EmailCollisionError as exc:
                # Belt-and-braces: request_email_otp already checked this
                # before sending the code (C2 fix above) -- this only fires
                # if the email was claimed elsewhere in the few minutes
                # between that check and this verify.
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            return _session_response(user_id, AuthIdentityProvider.EMAIL_OTP, db)

        # Fresh signup (matched_user_id is None, provider is EMAIL_OTP or
        # GOOGLE): flip the pending record's verified flag, hand off to the
        # existing mandatory phone gate -- unchanged from today. Never
        # eligible to attach to an existing account, no matter whose email
        # it claims.
        try:
            pending = mark_pending_email_verified(db, body.pending_token, body.email)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        return PhoneRequiredResponse(phone_required=PhoneRequiredDetail(token=body.pending_token, prefill_email=pending.email))

    # Plain login: no pending record involved at all, just an existing identity.
    existing = find_identity_by_subject(db, AuthIdentityProvider.EMAIL_OTP, body.email)
    if existing is None:
        raise HTTPException(status_code=401, detail="No account found for that email — sign up instead.")
    return _session_response(existing.user_id, AuthIdentityProvider.EMAIL_OTP, db)


#otp authentication
@router.post("/otp/request", response_model=OtpRequestResponse)
def request_otp(body: OtpRequestBody, request: Request, db: DbSession = Depends(get_db)):
    # Same collision this route's own verify step already rejects (see
    # verify_otp_route below) -- checked here too, before an OTP is even sent,
    # so a fresh email signup's phone gate matches signup_email's own UX: the
    # "already exists" error shows immediately on the number-entry screen
    # instead of only after the caller types a code. Only applies to the
    # EMAIL_OTP phone-gate case; other pending-token providers (e.g. Google
    # linking a second method) legitimately proceed to send the OTP.
    if body.pending_token:
        try:
            link_info = peek_pending_link_info(db, body.pending_token)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

        if link_info.provider == AuthIdentityProvider.PHONE_OTP:
            # I1 fix (final review, 2026-09-28): a phone-first pending_token
            # (from flow=signup) is only ever meant to complete via
            # /auth/email-otp/request -- using it here would attach a
            # second, unrelated phone number instead of the mandatory
            # email step.
            raise HTTPException(status_code=401, detail="Invalid or already-used verification token.")

        if link_info.provider == AuthIdentityProvider.EMAIL_OTP:
            existing = find_or_backfill_phone_identity(db, body.phone_number)
            if existing is not None:
                raise HTTPException(
                    status_code=409,
                    detail="An account with this phone number already exists.",
                )
    elif body.flow is not None:
        existing = find_or_backfill_phone_identity(db, body.phone_number)
        if body.flow == "signup" and existing is not None:
            raise HTTPException(status_code=409, detail="An account with this phone number already exists.")
        if body.flow == "login" and existing is None:
            raise HTTPException(
                status_code=404, detail="No account found for that phone number — sign up instead."
            )

    try:
        _, raw_otp = create_otp_request(db, body.phone_number, metadata=capture_request_metadata(request))
    except OtpRequestThrottledError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    return OtpRequestResponse(message="OTP sent.", otp=raw_otp)


@router.post(
    "/otp/verify",
    response_model=OtpVerifyResponse | LinkRequiredResponse | PhoneRequiredResponse | EmailRequiredResponse,
)
def verify_otp_route(body: OtpVerifyBody, request: Request, db: DbSession = Depends(get_db)):
    try:
        verify_otp(db, body.phone_number, body.otp)
    except OtpVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    if body.pending_token:
        try:
            link_info = peek_pending_link_info(db, body.pending_token)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

        if link_info.provider == AuthIdentityProvider.PHONE_OTP:
            # I1 fix (final review, 2026-09-28): see request_otp's identical
            # guard above -- a phone-first pending_token must only complete
            # via the email gate, never a second phone number.
            raise HTTPException(status_code=401, detail="Invalid or already-used verification token.")

        existing = find_or_backfill_phone_identity(db, body.phone_number)
        if existing is not None:
            if link_info.provider == AuthIdentityProvider.EMAIL_OTP:
                # Fresh email signup's mandatory phone gate: signup_email
                # already proved this email is brand-new (no existing
                # identity), so a phone match here belongs to a DIFFERENT,
                # unrelated account -- attaching would silently sign the
                # caller into someone else's account. Mirrors signup_email's
                # own already-exists 409. Other providers (e.g. Google) reach
                # this same branch legitimately to link a second login
                # method to an existing account they just proved they own
                # via phone OTP -- left untouched, see peek_pending_link_info.
                raise HTTPException(
                    status_code=409,
                    detail="An account with this phone number already exists.",
                )
            try:
                user_id = attach_pending_identity(db, body.pending_token, existing.user_id)
            except PendingVerificationError as exc:
                raise HTTPException(status_code=401, detail=str(exc)) from exc
        else:
            try:
                user_id = complete_gated_signup(
                    db, body.pending_token, AuthIdentityProvider.PHONE_OTP, body.phone_number
                )
            except PendingVerificationError as exc:
                raise HTTPException(status_code=401, detail=str(exc)) from exc
            except ConsentRequiredError as exc:
                raise _consent_http(exc) from exc
        return _session_response(user_id, AuthIdentityProvider.PHONE_OTP, db)

    # Phone uses find_or_backfill_phone_identity so a pre-0005-backfill `users`
    # row (identity row missing) logs in normally instead of falling through to
    # the branches below and violating users.phone_number UNIQUE.
    existing = find_or_backfill_phone_identity(db, body.phone_number)
    if existing is not None:
        if body.flow == "signup":
            # Belt-and-braces for request_otp's own check: the number was
            # registered between request and verify. Never log in on sign-up.
            raise HTTPException(status_code=409, detail="An account with this phone number already exists.")
        return _session_response(existing.user_id, AuthIdentityProvider.PHONE_OTP, db)

    if body.flow == "login":
        raise HTTPException(status_code=401, detail="No account found for that phone number — sign up instead.")

    if body.flow == "signup":
        # FR-3 (auth-flow-redesign, 2026-09-28): phone verifies first now --
        # stage a pending record and wait for email, instead of completing
        # signup on the spot. This is what retires the old
        # unconditional-creation bug for every caller that declares its
        # flow explicitly (the redesigned frontend always does) -- see the
        # flow-omitted legacy branch below for who's still exempt.
        try:
            consent_snapshot = snapshot_for_signup(
                body.accepted_documents, "signup_phone", evidence_from_request(request)
            )
        except ConsentRequiredError as exc:
            raise _consent_http(exc) from exc
        _, raw_token = create_pending_verification(
            db, AuthIdentityProvider.PHONE_OTP, body.phone_number, None, False, matched_user_id=None,
            consent_snapshot=consent_snapshot,
        )
        return EmailRequiredResponse(
            email_required=EmailRequiredDetail(token=raw_token, prefill_phone=body.phone_number)
        )

    # Legacy path, flow omitted entirely (no pending_token either): every
    # internal test fixture that uses a bare phone-verify call purely to
    # obtain an authenticated session for unrelated tests lands here,
    # unchanged. The redesigned frontend always sends an explicit flow;
    # only an un-updated caller reaches this branch.
    if not settings.legacy_unflowed_phone_signup:
        # A deployed client always sends `flow`; this bypass (no consent, no
        # email step) exists only so test fixtures can mint sessions. Off in
        # every deployed environment, on in tests via conftest.
        raise HTTPException(
            status_code=400, detail={"code": "flow_required", "message": "Update the app and try again."}
        )
    now = datetime.now(timezone.utc)
    user = User(phone_number=body.phone_number, created_at=now)
    db.add(user)
    db.flush()
    record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, body.phone_number, None, now)
    db.commit()
    return _session_response(user.id, AuthIdentityProvider.PHONE_OTP, db)


@router.post("/oauth/google", response_model=OtpVerifyResponse | LinkRequiredResponse | PhoneRequiredResponse)
def google_oauth_route(body: GoogleAuthBody, request: Request, db: DbSession = Depends(get_db)):
    try:
        claims = verify_google_id_token(body.id_token)
    except GoogleTokenVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    if body.pending_token:
        try:
            link_info = peek_pending_link_info(db, body.pending_token)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

        if link_info.provider == AuthIdentityProvider.PHONE_OTP:
            # I1 fix (final review, 2026-09-28): see request_otp's identical
            # guard -- a phone-first pending_token must only complete via
            # the email gate, never attach to a Google identity.
            raise HTTPException(status_code=401, detail="Invalid or already-used verification token.")

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

    # Consent is only needed if this turns out to be a brand-new account
    # (phone_required), which resolve_new_verified_identity decides -- and it
    # also mints that pending token. So: build the snapshot up front when the
    # client sent documents, but defer any refusal until we know the outcome;
    # an auto-link login or a link_required step-up must not be blocked by
    # missing/stale sign-up consent.
    consent_snapshot = None
    consent_error = ConsentRequiredError(
        [ConsentDocumentType.TERMS_OF_SERVICE.value, ConsentDocumentType.PRIVACY_POLICY.value]
    )
    if body.accepted_documents is not None:
        try:
            consent_snapshot = snapshot_for_signup(
                body.accepted_documents, "signup_google", evidence_from_request(request)
            )
        except ConsentRequiredError as exc:
            consent_error = exc

    resolution = resolve_new_verified_identity(
        db, AuthIdentityProvider.GOOGLE, claims.sub, claims.email, claims.email_verified,
        consent_snapshot=consent_snapshot,
    )
    if resolution.kind == "phone_required" and consent_snapshot is None:
        # Don't leave the just-minted, never-handed-out pending row behind.
        discard_pending_verification(db, resolution.pending_token)
        raise _consent_http(consent_error)
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
def _me_response(user: User, db: DbSession) -> MeResponse:
    deletion_scheduled_at = user.deletion_scheduled_at
    if deletion_scheduled_at is not None and deletion_scheduled_at.tzinfo is None:
        deletion_scheduled_at = deletion_scheduled_at.replace(tzinfo=timezone.utc)
    self_member = (
        db.query(HouseholdMember)
        .filter_by(user_id=user.id, relationship=Relationship.SELF)
        .first()
    )
    return MeResponse(
        user_id=str(user.id),
        phone_number=user.phone_number,
        email=user.email,
        onboarding_step=user.onboarding_step,
        onboarding_completed=user.onboarding_completed_at is not None,
        investor_type=user.investor_type,
        primary_goals=user.primary_goals,
        pending_deletion=user.pending_deletion,
        deletion_scheduled_at=deletion_scheduled_at,
        self_name=self_member.name if self_member else None,
        consent_outdated=[t.value for t in outdated_documents(db, user.id, SIGNUP_DOCUMENTS)],
    )


@router.get("/me", response_model=MeResponse)
def get_me(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    return _me_response(user, db)


@router.post("/account-deletion", response_model=MeResponse)
def request_account_deletion(
    body: AccountDeletionBody,
    request: Request,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    if user.pending_deletion:
        raise HTTPException(status_code=409, detail="Account deletion is already scheduled.")
    schedule_account_deletion(
        db, user, reason=body.reason, feedback=body.feedback, evidence=evidence_from_request(request)
    )
    return _me_response(user, db)


@router.post("/reactivate", response_model=MeResponse)
def reactivate_account_route(
    body: ReactivateBody,
    request: Request,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    if not user.pending_deletion:
        raise HTTPException(status_code=409, detail="Account deletion isn’t scheduled.")
    # Scheduling deletion wrote WITHDRAWN rows for every purpose, so coming
    # back means agreeing to the current T&C + Privacy again.
    try:
        documents = validate_accepted(body.accepted_documents, SIGNUP_DOCUMENTS)
    except ConsentRequiredError as exc:
        raise _consent_http(exc, CONSENT_CONTINUE_MESSAGE) from exc
    record_consent(
        db,
        user_id=user.id,
        documents=documents,
        action=ConsentAction.GIVEN,
        surface="reactivate",
        evidence=evidence_from_request(request),
    )
    reactivate_account(db, user)  # its commit lands the GIVEN rows too
    return _me_response(user, db)


def _contact_provider(channel: str) -> AuthIdentityProvider:
    return AuthIdentityProvider.EMAIL_OTP if channel == "email" else AuthIdentityProvider.PHONE_OTP


def _assert_contact_available(
    db: DbSession,
    *,
    user: User,
    channel: str,
    identifier: str,
) -> None:
    provider = _contact_provider(channel)
    identity = find_identity_by_subject(db, provider, identifier)
    if identity is not None and identity.user_id != user.id:
        raise HTTPException(status_code=409, detail=f"That {channel} is already linked to another account.")

    user_field = User.email if channel == "email" else User.phone_number
    matched_user = db.query(User).filter(user_field == identifier, User.id != user.id).first()
    if matched_user is not None:
        raise HTTPException(status_code=409, detail=f"That {channel} is already linked to another account.")


@router.post("/contact-change/request", response_model=OtpRequestResponse)
def request_contact_change(
    body: ContactChangeRequestBody,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    _assert_contact_available(db, user=user, channel=body.channel, identifier=body.identifier)
    otp_channel = "email" if body.channel == "email" else "sms"
    try:
        _, raw_otp = create_otp_request(db, body.identifier, channel=otp_channel)
    except OtpRequestThrottledError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return OtpRequestResponse(message="OTP sent.", otp=raw_otp)


@router.post("/contact-change/verify", response_model=MeResponse)
def verify_contact_change(
    body: ContactChangeVerifyBody,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    _assert_contact_available(db, user=user, channel=body.channel, identifier=body.identifier)
    otp_channel = "email" if body.channel == "email" else "sms"
    try:
        verify_otp(db, body.identifier, body.otp, channel=otp_channel)
    except OtpVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    provider = _contact_provider(body.channel)
    current_identifier = user.email if body.channel == "email" else user.phone_number
    current_identity = None
    if current_identifier is not None:
        current_identity = (
            db.query(AuthIdentity)
            .filter_by(
                user_id=user.id,
                provider=provider,
                provider_subject=current_identifier,
            )
            .one_or_none()
        )
    target_identity = (
        db.query(AuthIdentity)
        .filter_by(
            user_id=user.id,
            provider=provider,
            provider_subject=body.identifier,
        )
        .one_or_none()
    )
    now = datetime.now(timezone.utc)
    identity_email = body.identifier if body.channel == "email" else None
    if target_identity is not None:
        identity = target_identity
        if current_identity is not None and current_identity.id != target_identity.id:
            db.delete(current_identity)
    elif current_identity is None:
        record_identity(db, user.id, provider, body.identifier, identity_email, now, commit=False)
    else:
        identity = current_identity
        identity.provider_subject = body.identifier
    if target_identity is not None or current_identity is not None:
        identity.email = identity_email
        identity.identifier_verified_at = now
        identity.last_used_at = now

    if body.channel == "email":
        user.email = body.identifier
    else:
        user.phone_number = body.identifier
    db.commit()
    return _me_response(user, db)


@router.patch("/me", response_model=MeResponse)
def update_me(
    body: UpdateMeBody,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    if body.onboarding_step is not None:
        user.onboarding_step = body.onboarding_step
    if body.investor_type is not None:
        user.investor_type = body.investor_type
    if body.primary_goals is not None:
        goals = [g.value for g in body.primary_goals]
        user.primary_goals = goals
        user.primary_goal = PrimaryGoal(goals[0])  # dual write until 0021
    # First-completion-wins: onboarding_completed=false is not a supported
    # "un-complete" action, only forward marking is needed (PRD-02 has no
    # revert-to-onboarding flow once done).
    if body.onboarding_completed is True and user.onboarding_completed_at is None:
        user.onboarding_completed_at = datetime.now(timezone.utc)
    db.commit()

    return _me_response(user, db)
