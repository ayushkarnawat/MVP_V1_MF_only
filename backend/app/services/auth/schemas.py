from pydantic import BaseModel, field_validator

from app.models.enums import AuthIdentityProvider, InvestorType, PrimaryGoal

PROVIDER_TO_METHOD_LABEL: dict[AuthIdentityProvider, str] = {
    AuthIdentityProvider.PHONE_OTP: "phone",
    AuthIdentityProvider.EMAIL_OTP: "email",
    AuthIdentityProvider.GOOGLE: "google",
    AuthIdentityProvider.EMAIL_PASSWORD: "email",
}


def normalize_email(value: object) -> object:
    """Canonicalizes an email identifier to strip+lowercase form.

    Email is an identity key here (`otp_requests.email`,
    `auth_identities.provider_subject`/`email`, and the Design Spec §4
    collision lookup), and all of those compare as plain strings — so
    `Victim@Example.com` and `victim@example.com` would otherwise be two
    distinct identities and the collision/linking system would never fire.
    Normalizing at the request boundary means every downstream comparison
    already operates on one canonical form. Non-string input (including
    `None`) is passed through untouched so Pydantic's own type errors, and
    the exactly-one-identifier check, still behave as before.
    """
    if isinstance(value, str):
        return value.strip().lower()
    return value


class OtpRequestBody(BaseModel):
    phone_number: str


class OtpRequestResponse(BaseModel):
    message: str
    otp: str | None = None  # only populated in dev-stub delivery mode


class OtpVerifyBody(BaseModel):
    phone_number: str
    otp: str
    pending_token: str | None = None


class SignupEmailBody(BaseModel):
    email: str
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: object) -> object:
        return normalize_email(value)

    @field_validator("password")
    @classmethod
    def _min_length(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return value


class LoginEmailBody(BaseModel):
    email: str
    password: str
    pending_token: str | None = None

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: object) -> object:
        return normalize_email(value)


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


class ForgotPasswordBody(BaseModel):
    email: str

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: object) -> object:
        return normalize_email(value)


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _min_length(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return value


class ResetPasswordResponse(BaseModel):
    message: str
