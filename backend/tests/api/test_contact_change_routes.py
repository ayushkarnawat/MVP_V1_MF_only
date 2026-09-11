import uuid
from datetime import datetime, timezone

from app.models.auth import AuthIdentity, OtpRequest
from app.models.enums import AuthIdentityProvider
from app.models.user import User


def _signup(client, phone: str) -> tuple[str, str]:
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    body = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()
    return body["session_token"], body["user_id"]


def _db(client):
    from app.db.session import get_db

    return next(client.app.dependency_overrides[get_db]())


def test_email_change_sends_otp_to_new_email_and_updates_only_after_verification(client):
    token, user_id = _signup(client, "+919300000001")
    headers = {"Authorization": f"Bearer {token}"}
    new_email = "new-address@example.com"

    requested = client.post(
        "/auth/contact-change/request",
        json={"channel": "email", "identifier": new_email},
        headers=headers,
    )

    db = _db(client)
    assert db.get(User, uuid.UUID(user_id)).email is None
    assert db.query(OtpRequest).filter_by(email=new_email, phone_number=None).count() == 1
    db.close()

    wrong = client.post(
        "/auth/contact-change/verify",
        json={"channel": "email", "identifier": new_email, "otp": "000000"},
        headers=headers,
    )
    verified = client.post(
        "/auth/contact-change/verify",
        json={"channel": "email", "identifier": new_email, "otp": requested.json()["otp"]},
        headers=headers,
    )

    assert wrong.status_code == 401
    assert verified.status_code == 200
    assert verified.json()["email"] == new_email
    db = _db(client)
    identity = db.query(AuthIdentity).filter_by(provider=AuthIdentityProvider.EMAIL_OTP).one()
    assert identity.provider_subject == new_email
    assert str(identity.user_id) == user_id
    db.close()


def test_phone_change_replaces_verified_phone_identity_after_new_number_otp(client):
    old_phone = "+919300000002"
    new_phone = "+919300000003"
    token, user_id = _signup(client, old_phone)
    headers = {"Authorization": f"Bearer {token}"}

    requested = client.post(
        "/auth/contact-change/request",
        json={"channel": "phone", "identifier": new_phone},
        headers=headers,
    )
    db = _db(client)
    assert db.get(User, uuid.UUID(user_id)).phone_number == old_phone
    db.close()

    verified = client.post(
        "/auth/contact-change/verify",
        json={"channel": "phone", "identifier": new_phone, "otp": requested.json()["otp"]},
        headers=headers,
    )

    assert verified.status_code == 200
    assert verified.json()["phone_number"] == new_phone
    db = _db(client)
    identity = db.query(AuthIdentity).filter_by(provider=AuthIdentityProvider.PHONE_OTP).one()
    assert identity.provider_subject == new_phone
    assert str(identity.user_id) == user_id
    db.close()


def _email_identity(user_id: str, subject: str) -> AuthIdentity:
    now = datetime.now(timezone.utc)
    return AuthIdentity(
        user_id=uuid.UUID(user_id),
        provider=AuthIdentityProvider.EMAIL_OTP,
        provider_subject=subject,
        email=subject,
        identifier_verified_at=now,
        created_at=now,
        last_used_at=now,
    )


def test_email_change_updates_identity_matching_current_user_email_not_arbitrary_row(client):
    token, user_id = _signup(client, "+919300000004")
    headers = {"Authorization": f"Bearer {token}"}
    current_email = "current@example.com"
    unrelated_email = "other-login@example.com"
    replacement_email = "replacement@example.com"
    db = _db(client)
    user = db.get(User, uuid.UUID(user_id))
    user.email = current_email
    db.add_all([
        _email_identity(user_id, unrelated_email),
        _email_identity(user_id, current_email),
    ])
    db.commit()
    db.close()

    requested = client.post(
        "/auth/contact-change/request",
        json={"channel": "email", "identifier": replacement_email},
        headers=headers,
    )
    verified = client.post(
        "/auth/contact-change/verify",
        json={
            "channel": "email",
            "identifier": replacement_email,
            "otp": requested.json()["otp"],
        },
        headers=headers,
    )

    assert verified.status_code == 200
    db = _db(client)
    subjects = {
        row.provider_subject
        for row in db.query(AuthIdentity).filter_by(
            user_id=uuid.UUID(user_id), provider=AuthIdentityProvider.EMAIL_OTP
        )
    }
    assert subjects == {unrelated_email, replacement_email}
    db.close()


def test_email_change_to_existing_same_user_identity_consolidates_current_identity(client):
    token, user_id = _signup(client, "+919300000005")
    headers = {"Authorization": f"Bearer {token}"}
    current_email = "old@example.com"
    target_email = "already-linked@example.com"
    db = _db(client)
    user = db.get(User, uuid.UUID(user_id))
    user.email = current_email
    db.add_all([
        _email_identity(user_id, current_email),
        _email_identity(user_id, target_email),
    ])
    db.commit()
    db.close()

    requested = client.post(
        "/auth/contact-change/request",
        json={"channel": "email", "identifier": target_email},
        headers=headers,
    )
    verified = client.post(
        "/auth/contact-change/verify",
        json={"channel": "email", "identifier": target_email, "otp": requested.json()["otp"]},
        headers=headers,
    )

    assert verified.status_code == 200
    assert verified.json()["email"] == target_email
    db = _db(client)
    rows = db.query(AuthIdentity).filter_by(
        user_id=uuid.UUID(user_id), provider=AuthIdentityProvider.EMAIL_OTP
    ).all()
    assert [row.provider_subject for row in rows] == [target_email]
    assert db.get(User, uuid.UUID(user_id)).email == target_email
    db.close()
