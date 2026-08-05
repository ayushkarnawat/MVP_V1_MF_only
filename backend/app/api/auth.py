from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db
from app.models.auth import Session as SessionModel
from app.models.user import User
from app.services.auth.otp import OtpVerificationError, create_otp_request, verify_otp
from app.services.auth.schemas import (
    MeResponse,
    OtpRequestBody,
    OtpRequestResponse,
    OtpVerifyBody,
    OtpVerifyResponse,
    SessionRefreshResponse,
    UpdateMeBody,
)
from app.services.auth.session import create_session, get_current_session, get_current_user, refresh_session

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/otp/request", response_model=OtpRequestResponse)
def request_otp(body: OtpRequestBody, db: DbSession = Depends(get_db)):
    _, raw_otp = create_otp_request(db, body.phone_number)
    return OtpRequestResponse(message="OTP sent.", otp=raw_otp)


@router.post("/otp/verify", response_model=OtpVerifyResponse)
def verify_otp_route(body: OtpVerifyBody, db: DbSession = Depends(get_db)):
    try:
        verify_otp(db, body.phone_number, body.otp)
    except OtpVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    user = db.query(User).filter_by(phone_number=body.phone_number).first()
    if not user:
        user = User(phone_number=body.phone_number, created_at=datetime.now(timezone.utc))
        db.add(user)
        db.flush()
        db.commit()

    _, raw_token = create_session(db, user.id)

    return OtpVerifyResponse(
        session_token=raw_token,
        user_id=str(user.id),
        onboarding_step=user.onboarding_step,
        onboarding_completed=user.onboarding_completed_at is not None,
    )


@router.post("/session/refresh", response_model=SessionRefreshResponse)
def refresh_session_route(
    session: SessionModel = Depends(get_current_session),
    db: DbSession = Depends(get_db),
):
    refreshed = refresh_session(db, session)
    return SessionRefreshResponse(expires_at=refreshed.expires_at.isoformat())


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
    db.commit()

    return MeResponse(
        user_id=str(user.id),
        phone_number=user.phone_number,
        email=user.email,
        onboarding_step=user.onboarding_step,
        onboarding_completed=user.onboarding_completed_at is not None,
        investor_type=user.investor_type,
        primary_goal=user.primary_goal,
    )
