from __future__ import annotations

from pydantic import BaseModel

from app.models.enums import InvestorType, PrimaryGoal


class OtpRequestBody(BaseModel):
    phone_number: str


class OtpRequestResponse(BaseModel):
    message: str
    otp: str | None = None  # only populated in dev-stub delivery mode


class OtpVerifyBody(BaseModel):
    phone_number: str
    otp: str


class OtpVerifyResponse(BaseModel):
    session_token: str
    user_id: str
    onboarding_step: str | None
    onboarding_completed: bool


class SessionRefreshResponse(BaseModel):
    expires_at: str


class UpdateMeBody(BaseModel):
    onboarding_step: str | None = None
    investor_type: InvestorType | None = None
    primary_goal: PrimaryGoal | None = None
    onboarding_completed: bool | None = None


class MeResponse(BaseModel):
    user_id: str
    phone_number: str
    email: str | None
    onboarding_step: str | None
    onboarding_completed: bool
    investor_type: InvestorType | None
    primary_goal: PrimaryGoal | None
