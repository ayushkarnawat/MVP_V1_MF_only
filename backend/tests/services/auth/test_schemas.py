"""Finding 4: email normalization at the request boundary.

Email is an identity key (`otp_requests.email`,
`auth_identities.provider_subject`/`email`, and the Design Spec §4 collision
lookup) compared everywhere as a plain string, so `Victim@Example.com` and
`victim@example.com` would otherwise be two distinct identities and the
collision/linking system would never fire.
"""

import pytest
from pydantic import ValidationError

from app.services.auth.schemas import OtpRequestBody, OtpVerifyBody, normalize_email


def test_normalize_email_strips_and_lowercases():
    assert normalize_email("  Victim@Example.COM ") == "victim@example.com"


def test_normalize_email_passes_non_strings_through_untouched():
    # None must stay None so the exactly-one-identifier check still sees an
    # absent email, and non-strings must reach Pydantic's own type errors.
    assert normalize_email(None) is None
    assert normalize_email(123) == 123


def test_otp_request_body_normalizes_email():
    assert OtpRequestBody(email="Foo@Example.COM").email == "foo@example.com"


def test_otp_verify_body_normalizes_email():
    assert OtpVerifyBody(email=" Foo@Example.COM ", otp="123456").email == "foo@example.com"


def test_normalization_does_not_break_the_exactly_one_identifier_rule():
    # The before-validator runs first; the after-validator must still see a
    # normalized-but-present email (and reject a second identifier alongside it).
    with pytest.raises(ValidationError):
        OtpRequestBody(phone_number="+919999999999", email="Foo@Example.COM")
    with pytest.raises(ValidationError):
        OtpRequestBody()


def test_phone_number_is_not_lowercased_by_the_email_validator():
    # Sanity: the validator is scoped to `email` only.
    assert OtpRequestBody(phone_number="+919999999999").email is None
