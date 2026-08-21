def test_otp_request_returns_otp_in_stub_mode(client):
    response = client.post("/auth/otp/request", json={"phone_number": "+919999999999"})

    assert response.status_code == 200
    assert response.json()["otp"] is not None
    assert len(response.json()["otp"]) == 6


def test_otp_request_returns_429_when_throttled(client):
    client.post("/auth/otp/request", json={"phone_number": "+919000011111"})

    response = client.post("/auth/otp/request", json={"phone_number": "+919000011111"})

    assert response.status_code == 429


def test_otp_verify_creates_user_and_session_for_new_phone(client):
    phone = "+919888888888"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]

    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp})

    assert response.status_code == 200
    body = response.json()
    assert body["session_token"]
    assert body["onboarding_step"] is None
    assert body["onboarding_completed"] is False


def test_otp_verify_reuses_existing_user_for_known_phone(client):
    phone = "+919777777777"
    otp1 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    first = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp1}).json()

    otp2 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    second = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp2}).json()

    assert first["user_id"] == second["user_id"]


def test_otp_verify_rejects_wrong_code(client):
    phone = "+919666666666"
    client.post("/auth/otp/request", json={"phone_number": phone})

    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": "000000"})

    assert response.status_code == 401


def test_me_requires_auth(client):
    response = client.patch("/auth/me", json={"onboarding_step": "q1"})
    assert response.status_code == 401


def test_me_updates_onboarding_fields_with_valid_session(client):
    phone = "+919555555555"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]

    response = client.patch(
        "/auth/me",
        json={"onboarding_step": "q2", "investor_type": "self_directed"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["onboarding_step"] == "q2"
    assert body["investor_type"] == "self_directed"


def test_get_me_requires_auth(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_get_me_returns_current_user_state(client):
    phone = "+919333333333"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    client.patch(
        "/auth/me",
        json={"onboarding_step": "q3"},
        headers={"Authorization": f"Bearer {token}"},
    )

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["phone_number"] == phone
    assert body["onboarding_step"] == "q3"
    assert body["onboarding_completed"] is False


def test_me_can_mark_onboarding_completed(client):
    phone = "+919222222222"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]

    response = client.patch(
        "/auth/me",
        json={"onboarding_completed": True},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["onboarding_completed"] is True


def test_session_refresh_requires_auth(client):
    response = client.post("/auth/session/refresh")
    assert response.status_code == 401


def test_session_refresh_extends_expiry_with_valid_session(client):
    phone = "+919444444444"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]

    response = client.post("/auth/session/refresh", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert "expires_at" in response.json()



def _mock_google_claims(monkeypatch, sub, email=None, email_verified=True):
    import app.api.auth as auth_module
    from app.services.auth.google_oauth import GoogleClaims

    monkeypatch.setattr(
        auth_module, "verify_google_id_token", lambda token: GoogleClaims(sub=sub, email=email, email_verified=email_verified)
    )


def test_google_signup_with_no_collision_returns_phone_required(client, monkeypatch):
    _mock_google_claims(monkeypatch, "g-sub-new", "newgoogle@example.com")

    response = client.post("/auth/oauth/google", json={"id_token": "fake"})

    assert response.status_code == 200
    body = response.json()
    assert body["phone_required"]["prefill_email"] == "newgoogle@example.com"


def test_google_login_for_already_linked_account(client, monkeypatch):
    _mock_google_claims(monkeypatch, "g-sub-returning", "returning-google@example.com")
    gate = client.post("/auth/oauth/google", json={"id_token": "fake"}).json()
    phone = "+919887766554"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    first = client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": phone_otp, "pending_token": gate["phone_required"]["token"]},
    ).json()

    response = client.post("/auth/oauth/google", json={"id_token": "fake"})

    assert response.status_code == 200
    assert response.json()["user_id"] == first["user_id"]


def test_google_unverified_email_never_auto_links(client, monkeypatch):
    from app.db.session import get_db
    from app.models.user import User

    phone = "+919776655443"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    client.post("/auth/otp/verify", json={"phone_number": phone, "otp": phone_otp})
    db = next(client.app.dependency_overrides[get_db]())
    db.query(User).filter_by(phone_number=phone).update({"email": "spoofable@example.com"})
    db.commit()
    db.close()

    _mock_google_claims(monkeypatch, "g-sub-unverified", "spoofable@example.com", email_verified=False)
    response = client.post("/auth/oauth/google", json={"id_token": "fake"})

    body = response.json()
    assert "phone_required" in body  # treated as brand-new, not linked, per Design Spec §2


def test_google_verification_failure_returns_401(client, monkeypatch):
    import app.api.auth as auth_module
    from app.services.auth.google_oauth import GoogleTokenVerificationError

    def _raise(token):
        raise GoogleTokenVerificationError("bad token")

    monkeypatch.setattr(auth_module, "verify_google_id_token", _raise)

    response = client.post("/auth/oauth/google", json={"id_token": "garbage"})

    assert response.status_code == 401


def _mock_google_id_token(monkeypatch, sub, email=None, email_verified=True):
    """Patches Google's own JWT verification, NOT app.api.auth's reference to
    verify_google_id_token — so the real verify_google_id_token body runs,
    including its email normalization (Finding 4). Use this instead of
    _mock_google_claims whenever the claim-processing layer is what's under
    test; _mock_google_claims bypasses it by constructing GoogleClaims directly.
    """
    import app.services.auth.google_oauth as google_oauth_module

    monkeypatch.setattr(google_oauth_module.settings, "google_oauth_client_id", "test-client-id")
    claims = {"sub": sub, "email_verified": email_verified}
    if email is not None:
        claims["email"] = email
    monkeypatch.setattr(
        google_oauth_module.id_token, "verify_oauth2_token", lambda token, request, audience: claims
    )


def _db(client):
    from app.db.session import get_db

    return next(client.app.dependency_overrides[get_db]())


def _signup_via_phone(client, phone):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    return client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()




def _signup_via_google_then_phone_gate(client, monkeypatch, sub, email, phone):
    _mock_google_claims(monkeypatch, sub, email)
    gate = client.post("/auth/oauth/google", json={"id_token": "fake"}).json()
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    return client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": phone_otp, "pending_token": gate["phone_required"]["token"]},
    ).json()


def _set_denormalized_email(client, phone, email):
    """Puts an email on `users.email` only, with no matching auth_identities
    row — the exact shape §4 calls `link_required` (case 2)."""
    from app.models.user import User

    db = _db(client)
    db.query(User).filter_by(phone_number=phone).update({"email": email})
    db.commit()
    db.close()


# ---------------------------------------------------------------------------
# Finding 1 — an unverified Google email must never become a verified
# auto-link credential.
# ---------------------------------------------------------------------------


def test_phone_gate_signup_does_not_persist_an_unverified_google_email(client, monkeypatch):
    from app.models.auth import AuthIdentity
    from app.models.enums import AuthIdentityProvider
    from app.models.user import User

    _mock_google_claims(monkeypatch, "g-sub-unverified-gate", "victim@example.com", email_verified=False)
    gate = client.post("/auth/oauth/google", json={"id_token": "fake"}).json()
    assert "phone_required" in gate
    # The prefill is derived from the *verified* email only, so it stays empty.
    assert gate["phone_required"]["prefill_email"] is None

    phone = "+919600000001"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    response = client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": phone_otp, "pending_token": gate["phone_required"]["token"]},
    )
    assert response.status_code == 200

    db = _db(client)
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.GOOGLE, provider_subject="g-sub-unverified-gate")
        .one()
    )
    assert identity.email is None
    assert db.get(User, identity.user_id).email is None
    db.close()




# ---------------------------------------------------------------------------
# Finding 2 — a pre-existing user with no backfilled auth_identities row must
# still be able to log in (no users.phone_number UNIQUE violation / 500).
# ---------------------------------------------------------------------------


def test_preexisting_user_without_an_identity_row_can_still_log_in(client):
    """The un-backfilled state migration 0005 fixes, simulated via direct ORM
    creation because the `client` fixture builds its schema with
    Base.metadata.create_all() rather than running Alembic."""
    import uuid
    from datetime import datetime, timezone

    from app.models.auth import AuthIdentity
    from app.models.enums import AuthIdentityProvider
    from app.models.user import User

    phone = "+919600000004"
    legacy_id = uuid.uuid4()
    created_at = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    db = _db(client)
    db.add(User(id=legacy_id, phone_number=phone, created_at=created_at))
    db.commit()
    db.close()

    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp})

    assert response.status_code == 200, response.text
    assert response.json()["user_id"] == str(legacy_id)  # existing account, not a second User

    db = _db(client)
    assert db.query(User).filter_by(phone_number=phone).count() == 1
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.PHONE_OTP, provider_subject=phone)
        .one()
    )
    assert identity.user_id == legacy_id
    db.close()


def test_preexisting_user_without_an_identity_row_can_complete_a_link(client, monkeypatch):
    """Same un-backfilled row, but reached through the pending-token branch —
    a Google sign-in whose phone gate lands on the legacy account."""
    import uuid
    from datetime import datetime, timezone

    from app.models.user import User

    phone = "+919600000005"
    legacy_id = uuid.uuid4()
    db = _db(client)
    db.add(User(id=legacy_id, phone_number=phone, created_at=datetime(2026, 1, 2, tzinfo=timezone.utc)))
    db.commit()
    db.close()

    _mock_google_claims(monkeypatch, "g-sub-legacy", "legacy-google@example.com")
    gate = client.post("/auth/oauth/google", json={"id_token": "fake"}).json()
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    response = client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": phone_otp, "pending_token": gate["phone_required"]["token"]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["user_id"] == str(legacy_id)


# ---------------------------------------------------------------------------
# Finding 3 — an existing phone-only user's first Google sign-in must land on
# their existing account, not dead-end.
# ---------------------------------------------------------------------------


def test_existing_phone_only_user_can_add_google_via_the_phone_gate(client, monkeypatch):
    from app.models.auth import AuthIdentity
    from app.models.enums import AuthIdentityProvider

    phone = "+919600000006"
    first = _signup_via_phone(client, phone)

    # A non-colliding email: §4 can't detect the existing account up front,
    # because the collision check only ever matches on email and this account
    # has none. So this correctly returns phone_required, not link_required.
    _mock_google_claims(monkeypatch, "g-sub-phone-only", "brand-new-google@example.com")
    gate = client.post("/auth/oauth/google", json={"id_token": "fake"}).json()
    assert "phone_required" in gate

    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    response = client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": phone_otp, "pending_token": gate["phone_required"]["token"]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["user_id"] == first["user_id"]

    db = _db(client)
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.GOOGLE, provider_subject="g-sub-phone-only")
        .one()
    )
    assert str(identity.user_id) == first["user_id"]
    db.close()

    # And the newly-verified Google email is now denormalized onto the profile.
    token = response.json()["session_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "brand-new-google@example.com"


def test_existing_phone_only_user_adding_google_creates_no_second_account(client, monkeypatch):
    from app.models.user import User

    phone = "+919600000007"
    _signup_via_phone(client, phone)
    _mock_google_claims(monkeypatch, "g-sub-no-dupe", "no-dupe@example.com")
    gate = client.post("/auth/oauth/google", json={"id_token": "fake"}).json()
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": phone_otp, "pending_token": gate["phone_required"]["token"]},
    )

    db = _db(client)
    assert db.query(User).count() == 1
    db.close()




def test_phone_gated_signup_session_records_phone_otp_as_the_auth_method(client, monkeypatch):
    """Design Spec §5: auth_method is whichever method's verification directly
    produced the session. For a phone-gated signup that is phone_otp — the
    completing method — not the originating Google identity."""
    import uuid

    from app.models.auth import Session as SessionModel
    from app.models.enums import AuthIdentityProvider

    body = _signup_via_google_then_phone_gate(
        client, monkeypatch, "g-sub-authmethod", "authmethod@example.com", "+919600000014"
    )
    assert body["session_token"]

    db = _db(client)
    sessions = db.query(SessionModel).filter_by(user_id=uuid.UUID(body["user_id"])).all()
    db.close()

    assert len(sessions) == 1
    assert sessions[0].auth_method == AuthIdentityProvider.PHONE_OTP
