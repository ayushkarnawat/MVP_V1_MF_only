"""One request, one mailbox. Independent Codex review of B-2, finding 2: the shared SES sender splits its address on commas (for the ops
alert list), so `a@example.com,b@example.org` used to be one recipient for the guard and the 60-second rule but two inboxes for SES."""

import pytest
from pydantic import ValidationError

from app.services.auth.schemas import (
    ContactChangeRequestBody, EmailOtpRequestBody, EmailOtpVerifyBody, SignupEmailBody, single_mailbox,
)

MANY = [
    "a@example.com,b@example.org",
    "a@example.com, b@example.org",
    "a@example.com;b@example.org",
    "a@example.com b@example.org",
    "a@example.com\nb@example.org",
    "Name <a@example.com>",
    '"a,b"@example.com',
    "a@@example.com",
    "@example.com",
    "a@",
    "",
]
FINE = ["a@example.com", "first.last+tag@sub.example.co.in", "o'brien@example.com", "a_b-c@example.com"]


@pytest.mark.parametrize("value", MANY)
def test_more_than_one_mailbox_or_a_malformed_one_is_rejected(value):
    with pytest.raises(ValueError):
        single_mailbox(value)


@pytest.mark.parametrize("value", FINE)
def test_one_ordinary_mailbox_passes_unchanged(value):
    assert single_mailbox(value) == value


@pytest.mark.parametrize("model,extra", [
    (EmailOtpRequestBody, {}), (SignupEmailBody, {}), (EmailOtpVerifyBody, {"otp": "123456"}),
])
def test_the_email_request_bodies_reject_several_recipients(model, extra):
    with pytest.raises(ValidationError):
        model(email="a@example.com,b@example.org", **extra)
    assert model(email=" A@Example.com ", **extra).email == "a@example.com"


def test_a_contact_change_to_several_emails_is_rejected():
    with pytest.raises(ValidationError):
        ContactChangeRequestBody(channel="email", identifier="a@example.com,b@example.org")


@pytest.mark.parametrize("path,body", [
    ("/auth/email-otp/request", {"email": "a@example.com,b@example.org", "flow": "login"}),
    ("/auth/signup/email", {"email": "a@example.com,b@example.org"}),
])
def test_the_routes_answer_422(client, path, body):
    assert client.post(path, json=body).status_code == 422
