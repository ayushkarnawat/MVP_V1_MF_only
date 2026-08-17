"""Auth schema tests."""

import pytest
from pydantic import ValidationError

from app.services.auth.schemas import OtpRequestBody, OtpVerifyBody, normalize_email


def test_normalize_email_strips_and_lowercases():
    assert normalize_email("  Victim@Example.COM ") == "victim@example.com"


def test_normalize_email_passes_non_strings_through_untouched():
    assert normalize_email(None) is None
    assert normalize_email(123) == 123


def test_otp_request_body_accepts_phone_number():
    body = OtpRequestBody(phone_number="+919999999999")
    assert body.phone_number == "+919999999999"


def test_otp_request_body_requires_phone_number():
    with pytest.raises(ValidationError):
        OtpRequestBody()


def test_otp_verify_body_accepts_phone_number_and_otp():
    body = OtpVerifyBody(phone_number="+919999999999", otp="123456")
    assert body.phone_number == "+919999999999"
    assert body.otp == "123456"
    assert body.pending_token is None


def test_otp_verify_body_requires_phone_number_and_otp():
    with pytest.raises(ValidationError):
        OtpVerifyBody(phone_number="+919999999999")
    with pytest.raises(ValidationError):
        OtpVerifyBody(otp="123456")
