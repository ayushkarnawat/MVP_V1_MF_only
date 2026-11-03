"""A stolen session could change the account's email and phone to the thief's and then receive all
four Head of Family codes. After every contact change the previous address gets a "this wasn't me"
link, and for 7 days the Head of Family cannot be changed."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.auth import AuthIdentity, ContactChangeEvent, HeadChangeRequest
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from tests.api.test_head_change_routes import _db, _household, _signup, _start


class Mailbox:
    def __init__(self):
        self.sent = []

    def send_email(self, to, subject, body, html_body=None):
        self.sent.append({"to": to, "subject": subject, "body": body, "html": html_body})


@pytest.fixture()
def mailbox(monkeypatch):
    box = Mailbox()
    monkeypatch.setattr(
        "app.services.auth.contact_change_events.get_email_provider", lambda: box
    )
    return box


def _change(client, household, channel, identifier):
    requested = client.post(
        "/auth/contact-change/request",
        json={"channel": channel, "identifier": identifier},
        headers=household["headers"],
    )
    assert requested.status_code == 200, requested.text
    return client.post(
        "/auth/contact-change/verify",
        json={"channel": channel, "identifier": identifier, "otp": requested.json()["otp"]},
        headers=household["headers"],
    )


def _token_from(mailbox_entry) -> str:
    # The link ends "#token=<token>&channel=<email|phone>"; only the token is a credential.
    return mailbox_entry["body"].split("/reverse-contact-change#token=")[1].split("&channel=")[0].strip()


def _reverse(client, token):
    return client.post("/auth/contact-change/reverse", json={"token": token})


def test_an_email_change_sends_the_notice_to_the_old_address_only(client, mailbox):
    household = _household(client, suffix="r01")
    old_email = "head-route-r01@example.com"

    changed = _change(client, household, "email", "thief@example.com")

    assert changed.status_code == 200
    assert [m["to"] for m in mailbox.sent] == [old_email]
    notice = mailbox.sent[0]
    assert notice["subject"] == "The sign-in email address on your Unifolio account was changed."
    assert "t***@example.com" in notice["body"] and "thief@example.com" not in notice["body"]
    assert "/reverse-contact-change#token=" in notice["body"]
    db = _db(client)
    event = db.query(ContactChangeEvent).one()
    assert (event.channel, event.old_value, event.new_value) == ("email", old_email, "thief@example.com")
    assert _token_from(notice) not in (event.token_hash, event.old_value, event.new_value)
    db.close()


def test_a_phone_change_sends_the_notice_to_the_account_email(client, mailbox):
    household = _household(client, suffix="r02")

    changed = _change(client, household, "phone", "+919400000002")

    assert changed.status_code == 200
    assert [m["to"] for m in mailbox.sent] == ["head-route-r02@example.com"]
    assert "phone number" in mailbox.sent[0]["subject"]
    assert "+919400000002" not in mailbox.sent[0]["body"]


def test_the_first_email_added_has_nowhere_to_send_a_notice_but_still_starts_the_cooling_off(
    client, mailbox
):
    token, user_id = _signup(client, "+919400000003")
    household = {"headers": {"Authorization": f"Bearer {token}"}, "user_id": user_id}

    assert _change(client, household, "email", "first@example.com").status_code == 200

    assert mailbox.sent == []
    db = _db(client)
    assert db.query(ContactChangeEvent).filter_by(user_id=uuid.UUID(user_id)).count() == 1
    db.close()


def test_verifying_the_same_value_again_records_nothing(client, mailbox):
    household = _household(client, suffix="r04")

    _change(client, household, "email", "head-route-r04@example.com")

    assert mailbox.sent == []
    db = _db(client)
    assert db.query(ContactChangeEvent).count() == 0
    db.close()


def test_a_failing_email_provider_does_not_fail_the_contact_change(client, monkeypatch):
    household = _household(client, suffix="r05")

    def broken():
        raise RuntimeError("mail down")

    monkeypatch.setattr("app.services.auth.contact_change_events.get_email_provider", broken)

    assert _change(client, household, "email", "new-r05@example.com").status_code == 200


def test_the_link_puts_the_old_email_back_and_signs_everyone_out(client, mailbox):
    household = _household(client, suffix="r06")
    old_email = "head-route-r06@example.com"
    _change(client, household, "email", "thief@example.com")
    token = _token_from(mailbox.sent[0])

    reversed_ = _reverse(client, token)

    assert reversed_.status_code == 200 and reversed_.json() == {"status": "reversed"}
    db = _db(client)
    user = db.get(User, uuid.UUID(household["user_id"]))
    assert user.email == old_email
    subjects = {
        i.provider_subject
        for i in db.query(AuthIdentity).filter_by(
            user_id=user.id, provider=AuthIdentityProvider.EMAIL_OTP
        )
    }
    assert subjects == {old_email}
    assert db.query(ContactChangeEvent).one().reversed_at is not None
    db.close()
    # The thief's session is gone.
    assert client.get("/auth/me", headers=household["headers"]).status_code == 401


def test_the_link_works_once_and_a_used_or_unknown_token_answers_alike(client, mailbox):
    household = _household(client, suffix="r07")
    _change(client, household, "email", "thief@example.com")
    token = _token_from(mailbox.sent[0])
    assert _reverse(client, token).status_code == 200

    used = _reverse(client, token)
    unknown = _reverse(client, "a-token-nobody-was-ever-given")

    assert used.status_code == unknown.status_code == 404
    assert used.json() == unknown.json()
    assert used.json()["detail"] == {"code": "reverse_not_found", "message": "This link is not valid."}


def test_the_link_is_good_for_7_days(client, mailbox):
    household = _household(client, suffix="r08")
    _change(client, household, "email", "thief@example.com")
    token = _token_from(mailbox.sent[0])
    db = _db(client)
    db.query(ContactChangeEvent).update(
        {"expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)}
    )
    db.commit()
    db.close()

    response = _reverse(client, token)

    assert response.status_code == 410
    assert response.json()["detail"]["code"] == "reverse_expired"


def test_the_link_refuses_when_the_contact_was_changed_again(client, mailbox):
    household = _household(client, suffix="r09")
    _change(client, household, "email", "thief@example.com")
    first = _token_from(mailbox.sent[0])
    _change(client, household, "email", "thief-two@example.com")

    response = _reverse(client, first)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "reverse_changed"


def test_the_link_refuses_when_the_old_email_was_taken_since(client, mailbox):
    household = _household(client, suffix="r10")
    _change(client, household, "email", "thief@example.com")
    token = _token_from(mailbox.sent[0])
    db = _db(client)
    db.add(
        User(
            id=uuid.uuid4(),
            phone_number="+919400000010",
            email="head-route-r10@example.com",
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.close()

    response = _reverse(client, token)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "reverse_contact_taken"
    db = _db(client)
    assert db.get(User, uuid.UUID(household["user_id"])).email == "thief@example.com"
    db.close()


def test_reversing_a_phone_change_puts_the_old_phone_back(client, mailbox):
    household = _household(client, suffix="r11")
    db = _db(client)
    old_phone = db.get(User, uuid.UUID(household["user_id"])).phone_number
    db.close()
    _change(client, household, "phone", "+919400000011")

    assert _reverse(client, _token_from(mailbox.sent[0])).status_code == 200

    db = _db(client)
    user = db.get(User, uuid.UUID(household["user_id"]))
    assert user.phone_number == old_phone
    phones = {
        i.provider_subject
        for i in db.query(AuthIdentity).filter_by(
            user_id=user.id, provider=AuthIdentityProvider.PHONE_OTP
        )
    }
    assert phones == {old_phone}
    db.close()


def test_the_head_of_family_cannot_be_changed_for_7_days_after_a_contact_change(client, mailbox):
    household = _household(client, suffix="r12")
    _change(client, household, "phone", "+919400000012")
    # The change signed nobody out; the session still works.
    refused = client.post(
        "/auth/head-change/start-code",
        json={"to_member_id": household["candidate_id"]},
        headers=household["headers"],
    )

    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert detail["code"] == "head_change_after_contact_change"
    assert detail["message"].startswith(
        "The sign-in email or phone was changed recently, so the Head of Family cannot be changed until"
    )

    started = client.post(
        "/auth/head-change/start",
        json={"to_member_id": household["candidate_id"], "current_head_code": "000000"},
        headers=household["headers"],
    )
    assert started.status_code == 409
    assert started.json()["detail"]["code"] == "head_change_after_contact_change"


def test_the_cooling_off_ends_after_7_days_and_a_reversed_change_still_counts(client, mailbox):
    household = _household(client, suffix="r13")
    _change(client, household, "email", "thief@example.com")
    assert _reverse(client, _token_from(mailbox.sent[0])).status_code == 200
    from app.services.auth.contact_change_events import contact_changed_recently_until

    db = _db(client)
    user_id = uuid.UUID(household["user_id"])
    assert contact_changed_recently_until(db, user_id) is not None
    db.query(ContactChangeEvent).update(
        {"created_at": datetime.now(timezone.utc) - timedelta(days=8)}
    )
    db.commit()
    assert contact_changed_recently_until(db, user_id) is None
    db.close()


def test_reversing_cancels_an_open_head_change_request(client, mailbox):
    household = _household(client, suffix="r14")
    # Start a head change first, then the contact change (the attack order is the reverse, which
    # the cooling-off refuses; this covers a request that was already open).
    started = _start(client, household)
    assert started.status_code == 200
    _change(client, household, "email", "thief@example.com")

    assert _reverse(client, _token_from(mailbox.sent[0])).status_code == 200

    db = _db(client)
    request = db.query(HeadChangeRequest).one()
    assert request.status == "cancelled"
    db.close()


def test_the_link_names_the_changed_channel_so_the_page_can_say_which(client, mailbox):
    household = _household(client, suffix="r15")
    _change(client, household, "email", "thief-r15@example.com")
    _change(client, household, "phone", "+919400000015")

    assert mailbox.sent[0]["body"].rstrip().endswith("&channel=email")
    assert mailbox.sent[1]["body"].rstrip().endswith("&channel=phone")
    # The token is still the only secret part of the link.
    assert "&channel=" not in _token_from(mailbox.sent[0])
