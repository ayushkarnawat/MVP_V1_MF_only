from __future__ import annotations

from pydantic import BaseModel, model_validator

from app.models.enums import AuthIdentityProvider, InvestorType, PrimaryGoal

PROVIDER_TO_METHOD_LABEL: dict[AuthIdentityProvider, str] = {
    AuthIdentityProvider.PHONE_OTP: "phone",
    AuthIdentityProvider.EMAIL_OTP: "email",
    AuthIdentityProvider.GOOGLE: "google",
}


class OtpRequestBody(BaseModel):
    phone_number: str | None = None
    email: str | None = None

    @model_validator(mode="after")
    def _exactly_one_identifier(self) -> "OtpRequestBody":
        if (self.phone_number is None) == (self.email is None):
            raise ValueError("Provide exactly one of phone_number or email.")
        return self


class OtpRequestResponse(BaseModel):
    message: str
    otp: str | None = None  # only populated in dev-stub delivery mode


class OtpVerifyBody(BaseModel):
    phone_number: str | None = None
    email: str | None = None
    otp: str
    pending_token: str | None = None

    @model_validator(mode="after")
    def _exactly_one_identifier(self) -> "OtpVerifyBody":
        if (self.phone_number is None) == (self.email is None):
            raise ValueError("Provide exactly one of phone_number or email.")
        return self


class OtpVerifyResponse(BaseModel):
    session_token: str
    user_id: str
    onboarding_step: str | None
    onboarding_completed: bool


class LinkRequiredDetail(BaseModel):
    token: str
    matched_email: str
    existing_method: str  # "phone" | "email" | "google"


class LinkRequiredResponse(BaseModel):
    link_required: LinkRequiredDetail


class PhoneRequiredDetail(BaseModel):
    token: str
    prefill_email: str | None


class PhoneRequiredResponse(BaseModel):
    phone_required: PhoneRequiredDetail


class GoogleAuthBody(BaseModel):
    id_token: str
    pending_token: str | None = None


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
