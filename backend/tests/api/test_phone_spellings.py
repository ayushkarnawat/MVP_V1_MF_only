"""One phone number, one identity: every accepted spelling is turned into the same stored form at the API boundary.

Independent review of B-2, finding 1 (owner decision 18 Nov 2026: fix it completely now, not when a real text-message provider
arrives). The browser always sends `+91XXXXXXXXXX`; these tests cover callers that do not (a script, an old client, a typo).
"""

import pytest

from app.models.user import User
from app.services.auth.schemas import (
    ContactChangeRequestBody,
    OtpRequestBody,
    OtpVerifyBody,
    normalize_phone,
)

SPELLINGS = [
    "+919000000001",
    " +91 90000 00001 ",
    "+91-(90000)-00001",
    "00919000000001",
    "919000000001",
    "09000000001",
    "9000000001",
    "90000 00001",
]


@pytest.mark.parametrize("spelling", SPELLINGS)
def test_every_spelling_becomes_one_stored_form(spelling):
    assert normalize_phone(spelling) == "+919000000001"


@pytest.mark.parametrize(
    "value",
    [
        "+15551234567",          # not an Indian number: left exactly as sent, the existing checks decide
        "12345",                 # too short
        "+9190000000012",        # too long
        "5000000001",            # an Indian mobile starts with 6, 7, 8 or 9
        "+91 9000O00001",        # a letter
        "",
    ],
)
def test_values_that_are_not_an_indian_mobile_are_left_alone(value):
    assert normalize_phone(value) == value


def test_non_text_passes_through_untouched():
    assert normalize_phone(None) is None
    assert normalize_phone(12345) == 12345


def test_ninety_one_prefix_needs_twelve_digits_like_the_browser():
    # "9123456789" is a ten-digit number that happens to start with 91; it must not lose its first two digits.
    assert normalize_phone("9123456789") == "+919123456789"
    assert normalize_phone("919123456789") == "+919123456789"


@pytest.mark.parametrize("model", [OtpRequestBody, OtpVerifyBody])
def test_request_bodies_store_the_canonical_form(model):
    extra = {"otp": "123456"} if model is OtpVerifyBody else {}
    assert model(phone_number="09000000001", **extra).phone_number == "+919000000001"


def test_contact_change_phone_identifier_is_canonical_and_email_is_unchanged():
    assert ContactChangeRequestBody(channel="phone", identifier=" 9000000001").identifier == "+919000000001"
    assert ContactChangeRequestBody(channel="email", identifier=" A@Example.com ").identifier == "a@example.com"


def test_eight_spellings_get_one_code_in_the_sixty_second_window(client):
    statuses = [client.post("/auth/otp/request", json={"phone_number": s}).status_code for s in SPELLINGS]

    assert statuses == [200] + [429] * (len(SPELLINGS) - 1)


def test_any_spelling_signs_in_to_the_same_account(client):
    from app.db.session import get_db

    db_session = next(client.app.dependency_overrides[get_db]())
    first = SPELLINGS[0]
    otp = client.post("/auth/otp/request", json={"phone_number": first}).json()["otp"]
    created = client.post("/auth/otp/verify", json={"phone_number": first, "otp": otp}).json()

    # Wait out the 60 seconds by ageing the open request, then sign in with another spelling.
    from datetime import timedelta
    from app.models.auth import OtpRequest
    for row in db_session.query(OtpRequest).all():
        row.created_at = row.created_at - timedelta(minutes=5)
    db_session.commit()
    again = SPELLINGS[6]
    otp = client.post("/auth/otp/request", json={"phone_number": again, "flow": "login"}).json()["otp"]
    second = client.post("/auth/otp/verify", json={"phone_number": again, "otp": otp, "flow": "login"}).json()

    assert second["user_id"] == created["user_id"]
    assert [u.phone_number for u in db_session.query(User).all()] == ["+919000000001"]


# ---- Independent Codex review of B-2, finding 8: the same whitespace as the browser's `\s`, no more and no less.
@pytest.mark.parametrize("space", ["\u00a0", "\ufeff", "\u2003", "\u3000", "\n", "\t"])
def test_whitespace_the_browser_folds_is_folded_here_too(space):
    assert normalize_phone(f"90000{space}00001") == "+919000000001"


@pytest.mark.parametrize("not_a_space", ["\u0085", "\u001c", "\u001f"])
def test_characters_the_browser_rejects_are_not_folded_here(not_a_space):
    value = f"90000{not_a_space}00001"
    assert normalize_phone(value) == value
