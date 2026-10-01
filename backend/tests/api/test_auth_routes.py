"""Auth routes. `_consent()` is the T&C + Privacy acceptance every fresh
sign-up must now send (Task 8, consent core B2)."""

import uuid

from app.models.consent import ConsentRecord
from app.models.enums import ConsentDocumentType as T
from app.services.legal.registry import current_document


def _consent():
    return [
        {"document_type": t.value, "document_version": current_document(t).version}
        for t in (T.TERMS_OF_SERVICE, T.PRIVACY_POLICY)
    ]


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

    response = client.post("/auth/oauth/google", json={"id_token": "fake", "accepted_documents": _consent()})

    assert response.status_code == 200
    body = response.json()
    assert body["phone_required"]["prefill_email"] == "newgoogle@example.com"


def test_google_login_for_already_linked_account(client, monkeypatch):
    _mock_google_claims(monkeypatch, "g-sub-returning", "returning-google@example.com")
    gate = client.post("/auth/oauth/google", json={"id_token": "fake", "accepted_documents": _consent()}).json()
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
    response = client.post("/auth/oauth/google", json={"id_token": "fake", "accepted_documents": _consent()})

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
    gate = client.post("/auth/oauth/google", json={"id_token": "fake", "accepted_documents": _consent()}).json()
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
    gate = client.post("/auth/oauth/google", json={"id_token": "fake", "accepted_documents": _consent()}).json()
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
    gate = client.post("/auth/oauth/google", json={"id_token": "fake", "accepted_documents": _consent()}).json()
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
    gate = client.post("/auth/oauth/google", json={"id_token": "fake", "accepted_documents": _consent()}).json()
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
    gate = client.post("/auth/oauth/google", json={"id_token": "fake", "accepted_documents": _consent()}).json()
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


def test_otp_verify_with_flow_signup_for_new_phone_returns_email_required(client):
    phone = "+919444444444"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]

    response = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": otp, "flow": "signup", "accepted_documents": _consent()}
    )

    assert response.status_code == 200
    body = response.json()
    assert "email_required" in body
    assert body["email_required"]["token"]
    assert body["email_required"]["prefill_phone"] == phone


def test_otp_verify_with_flow_login_for_unknown_phone_returns_401(client):
    phone = "+919333322222"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]

    response = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": otp, "flow": "login"}
    )

    assert response.status_code == 401
    assert "sign up instead" in response.json()["detail"]


def test_otp_verify_with_flow_login_for_known_phone_logs_in(client):
    """A phone that already completed the full phone-first flow (see
    test_email_otp_routes.py for that full path) still logs in normally
    with flow=login."""
    phone = "+919222211111"
    otp1 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    signup_result = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": otp1, "flow": "signup", "accepted_documents": _consent()}
    ).json()
    email_token = signup_result["email_required"]["token"]
    email_otp = client.post(
        "/auth/email-otp/request", json={"email": "known@example.com", "pending_token": email_token}
    ).json()["otp"]
    first_session = client.post(
        "/auth/email-otp/verify", json={"email": "known@example.com", "otp": email_otp, "pending_token": email_token}
    ).json()

    otp2 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp2, "flow": "login"})

    assert response.status_code == 200
    assert response.json()["user_id"] == first_session["user_id"]


def test_otp_verify_with_flow_signup_for_already_registered_phone_is_409(client):
    """Staging-QA fix 1 (2026-09-30) supersedes the earlier "log them in
    gracefully" behaviour: sign-up with a registered number must error, never
    silently log in. (The request step rejects first; the code is issued via
    the legacy no-flow path here to reach verify's own belt-and-braces check.)"""
    phone = "+919111133333"
    otp1 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp1})  # legacy path creates the account
    otp2 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]

    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp2, "flow": "signup", "accepted_documents": _consent()})

    assert response.status_code == 409
    assert "session_token" not in response.json()


def test_otp_request_rejects_a_phone_first_pending_token(client):
    """I1 fix (final review, 2026-09-28): a phone-first pending_token (from
    flow=signup) is only ever meant to complete via /auth/email-otp/request
    -- passing it here would let the caller attach a second, unrelated
    phone number to their own not-yet-created account, or (if the second
    number already has an account) silently add it as a second PHONE_OTP
    identity. Neither is a real vulnerability (the caller controls both
    numbers), but it creates a several-phones-per-user state nothing else
    in the system expects, and skips the mandatory email step entirely."""
    phone_a = "+919666600001"
    otp_a = client.post("/auth/otp/request", json={"phone_number": phone_a}).json()["otp"]
    pending_token = client.post(
        "/auth/otp/verify", json={"phone_number": phone_a, "otp": otp_a, "flow": "signup", "accepted_documents": _consent()}
    ).json()["email_required"]["token"]

    response = client.post(
        "/auth/otp/request", json={"phone_number": "+919666600002", "pending_token": pending_token}
    )

    assert response.status_code == 401
    assert response.json().get("otp") is None


def test_otp_verify_rejects_a_phone_first_pending_token(client):
    """Same misuse as above, at the verify step instead of the request
    step -- covers a caller that skips /auth/otp/request's own guard by
    calling /auth/otp/verify directly against an already-sent code for
    the second number."""
    phone_a = "+919666600003"
    otp_a = client.post("/auth/otp/request", json={"phone_number": phone_a}).json()["otp"]
    pending_token = client.post(
        "/auth/otp/verify", json={"phone_number": phone_a, "otp": otp_a, "flow": "signup", "accepted_documents": _consent()}
    ).json()["email_required"]["token"]

    phone_b = "+919666600004"
    otp_b = client.post("/auth/otp/request", json={"phone_number": phone_b}).json()["otp"]
    response = client.post(
        "/auth/otp/verify",
        json={"phone_number": phone_b, "otp": otp_b, "pending_token": pending_token},
    )

    assert response.status_code == 401


def test_google_oauth_rejects_a_phone_first_pending_token(client, monkeypatch):
    """Same misuse via the Google route: a phone-first pending_token must
    not be attachable to a Google identity either. Needs a genuine,
    already-linked Google identity first (otherwise the route's own
    not-linked-yet 401 would fire for an unrelated reason)."""
    _mock_google_claims(monkeypatch, "g-sub-i1", "i1@example.com")
    google_gate = client.post("/auth/oauth/google", json={"id_token": "fake", "accepted_documents": _consent()}).json()
    linking_phone = "+919666600006"
    linking_otp = client.post("/auth/otp/request", json={"phone_number": linking_phone}).json()["otp"]
    client.post(
        "/auth/otp/verify",
        json={
            "phone_number": linking_phone,
            "otp": linking_otp,
            "pending_token": google_gate["phone_required"]["token"],
        },
    )  # Google identity "g-sub-i1" now genuinely exists and is linked

    phone_a = "+919666600005"
    otp_a = client.post("/auth/otp/request", json={"phone_number": phone_a}).json()["otp"]
    pending_token = client.post(
        "/auth/otp/verify", json={"phone_number": phone_a, "otp": otp_a, "flow": "signup", "accepted_documents": _consent()}
    ).json()["email_required"]["token"]

    response = client.post(
        "/auth/oauth/google", json={"id_token": "fake", "pending_token": pending_token}
    )

    assert response.status_code == 401


def test_otp_verify_without_flow_or_pending_token_still_creates_a_user_unconditionally(client):
    """Legacy behavior, deliberately preserved — see this task's design
    note. This is NOT the redesigned frontend's behavior; it's what every
    other route test's auth-setup boilerplate (and any un-updated caller)
    still gets."""
    phone = "+919111100000"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]

    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp})

    assert response.status_code == 200
    assert "session_token" in response.json()


# --- Staging-QA fix 1 (2026-09-30): sign-up/login checks at code-request time ---

from app.models.auth import OtpRequest


def _register_phone(client, phone):
    # Flow-omitted legacy verify: creates the account directly (auth.py legacy branch).
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    assert client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).status_code == 200


def _otp_rows(phone):
    from app.db.session import get_db
    from app.main import app
    db = next(app.dependency_overrides[get_db]())
    return db.query(OtpRequest).filter(OtpRequest.phone_number == phone).count()


def test_signup_request_with_a_registered_phone_is_409_and_sends_nothing(client):
    _register_phone(client, "+919811100001")
    before = _otp_rows("+919811100001")
    r = client.post("/auth/otp/request", json={"phone_number": "+919811100001", "flow": "signup"})
    assert r.status_code == 409
    assert r.json()["detail"] == "An account with this phone number already exists."
    assert _otp_rows("+919811100001") == before


def test_signup_verify_with_a_registered_phone_is_409_not_a_login(client):
    # The number gets registered between request and verify (another tab):
    # the request passes, but verify must refuse instead of logging in.
    from datetime import datetime, timezone
    from app.db.session import get_db
    from app.main import app
    from app.models.enums import AuthIdentityProvider
    from app.models.user import User
    from app.services.auth.identity import record_identity

    otp = client.post("/auth/otp/request", json={"phone_number": "+919811100002", "flow": "signup"}).json()["otp"]
    db = next(app.dependency_overrides[get_db]())
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919811100002", created_at=now)
    db.add(user)
    db.flush()
    record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, "+919811100002", None, now)
    db.commit()
    r = client.post("/auth/otp/verify", json={"phone_number": "+919811100002", "otp": otp, "flow": "signup", "accepted_documents": _consent()})
    assert r.status_code == 409
    assert "session_token" not in r.json()


def test_login_request_with_an_unknown_phone_is_404_and_sends_nothing(client):
    r = client.post("/auth/otp/request", json={"phone_number": "+919811100004", "flow": "login"})
    assert r.status_code == 404
    assert r.json()["detail"] == "No account found for that phone number — sign up instead."
    assert _otp_rows("+919811100004") == 0


def test_login_request_with_a_registered_phone_still_sends(client):
    _register_phone(client, "+919811100005")
    r = client.post("/auth/otp/request", json={"phone_number": "+919811100005", "flow": "login"})
    assert r.status_code == 200


def test_request_without_flow_keeps_legacy_behaviour(client):
    r = client.post("/auth/otp/request", json={"phone_number": "+919811100006"})
    assert r.status_code == 200


def _goal_headers(client, phone):
    token = _signup_via_phone(client, phone)["session_token"]
    return {"Authorization": f"Bearer {token}"}


def test_patch_me_saves_goal_list_and_dual_writes_first_item(client):
    headers = _goal_headers(client, "+919811100010")
    r = client.patch("/auth/me", json={"primary_goals": ["family_management", "consolidated_view"]}, headers=headers)
    assert r.status_code == 200
    assert r.json()["primary_goals"] == ["family_management", "consolidated_view"]
    from app.models.user import User

    db = _db(client)
    user = db.query(User).filter_by(phone_number="+919811100010").one()
    assert user.primary_goal.value == "family_management"  # old tasks during a rolling deploy read this


def test_patch_me_dedupes_goals_and_rejects_bad_values(client):
    headers = _goal_headers(client, "+919811100011")
    ok = client.patch("/auth/me", json={"primary_goals": ["family_management", "family_management"]}, headers=headers)
    assert ok.json()["primary_goals"] == ["family_management"]
    assert client.patch("/auth/me", json={"primary_goals": ["foo"]}, headers=headers).status_code == 422
    assert client.patch("/auth/me", json={"primary_goals": []}, headers=headers).status_code == 422


def test_patch_me_accepts_legacy_single_primary_goal(client):
    """Go-live audit R3: an old cached frontend still sends primary_goal
    during the rollout; it must be saved, not silently dropped."""
    headers = _goal_headers(client, "+919811100012")
    r = client.patch("/auth/me", json={"primary_goal": "family_management"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["primary_goals"] == ["family_management"]


def test_user_created_without_goals_stores_sql_null(client):
    """Go-live audit R4: None must be SQL NULL, not JSON null — Postgres's
    ck_users_primary_goals_allowed rejects a JSON null."""
    from datetime import datetime, timezone

    import sqlalchemy as sa

    from app.db.session import get_db
    from app.main import app
    from app.models.user import User

    db = next(app.dependency_overrides[get_db]())
    db.add(User(phone_number="+919811100013", created_at=datetime.now(timezone.utc), primary_goals=None))
    db.commit()
    raw = db.execute(sa.text("SELECT primary_goals IS NULL FROM users WHERE phone_number = '+919811100013'")).scalar()
    assert raw == 1


def test_get_me_reports_self_name(client):
    headers = _goal_headers(client, "+919100100003")
    assert client.get("/auth/me", headers=headers).json()["self_name"] is None
    client.post("/household-members", json={"name": "Asha Rao", "relationship": "self"}, headers=headers)
    assert client.get("/auth/me", headers=headers).json()["self_name"] == "Asha Rao"


# ---------------------------------------------------------------------------
# Task 8 (consent core B2): T&C + Privacy consent captured at the first
# sign-up step, recorded atomically with the account.


def _phone_first_signup(client, phone, email, consent=True):
    otp = client.post("/auth/otp/request", json={"phone_number": phone, "flow": "signup"}).json()["otp"]
    body = {
        "phone_number": phone,
        "otp": otp,
        "flow": "signup",
        **({"accepted_documents": _consent()} if consent else {}),
    }
    return client.post("/auth/otp/verify", json=body, headers={"X-Device-Id": "dev-1", "User-Agent": "pytest-UA"})


def test_phone_signup_without_consent_is_422(client):
    r = _phone_first_signup(client, "+919100400001", "a@example.com", consent=False)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "consent_required"
    assert r.json()["detail"]["message"] == (
        "Agree to the Terms & Conditions and Privacy Policy to create your account."
    )
    assert r.json()["detail"]["missing"] == ["terms_of_service", "privacy_policy"]


def test_stale_version_is_rejected(client):
    otp = client.post("/auth/otp/request", json={"phone_number": "+919100400002", "flow": "signup"}).json()["otp"]
    bad = [{"document_type": "terms_of_service", "document_version": "old"}, _consent()[1]]
    r = client.post(
        "/auth/otp/verify",
        json={"phone_number": "+919100400002", "otp": otp, "flow": "signup", "accepted_documents": bad},
    )
    assert r.status_code == 422 and r.json()["detail"]["missing"] == ["terms_of_service"]


def test_phone_first_signup_writes_consent_rows_with_the_account(client):
    phone, email = "+919100400003", "c3@example.com"
    token = _phone_first_signup(client, phone, email).json()["email_required"]["token"]
    eotp = client.post("/auth/email-otp/request", json={"email": email, "pending_token": token}).json()["otp"]
    s = client.post("/auth/email-otp/verify", json={"email": email, "otp": eotp, "pending_token": token}).json()
    db = _db(client)
    rows = db.query(ConsentRecord).filter(ConsentRecord.user_id == uuid.UUID(s["user_id"])).all()
    assert sorted(r.purpose_code.value for r in rows) == [
        "account_and_authentication",
        "portfolio_tracking_analytics",
        "service_agreement",
    ]
    assert {r.surface for r in rows} == {"signup_phone"}
    assert all(r.device_id == "dev-1" and r.user_agent == "pytest-UA" for r in rows)
    assert all(r.ip_truncated is None or r.ip_truncated.endswith(".0") for r in rows)
    db.close()


def test_login_ignores_consent_fields(client):
    phone = "+919100400004"
    _register_phone(client, phone)
    otp = client.post("/auth/otp/request", json={"phone_number": phone, "flow": "login"}).json()["otp"]
    r = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp, "flow": "login"})
    assert r.status_code == 200 and r.json()["session_token"]


def test_google_new_account_without_consent_is_422(client, monkeypatch):
    from app.models.auth import PendingIdentityVerification

    _mock_google_claims(monkeypatch, "g-new-1", "g1@example.com")
    r = client.post("/auth/oauth/google", json={"id_token": "t"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "consent_required"
    # No orphan pending row is left behind by the refused attempt.
    db = _db(client)
    assert db.query(PendingIdentityVerification).filter_by(provider_subject="g-new-1").count() == 0
    db.close()


def test_google_new_account_with_consent_reaches_phone_gate_and_records_on_completion(client, monkeypatch):
    _mock_google_claims(monkeypatch, "g-new-2", "g2@example.com")
    r = client.post("/auth/oauth/google", json={"id_token": "t", "accepted_documents": _consent()})
    token = r.json()["phone_required"]["token"]
    otp = client.post("/auth/otp/request", json={"phone_number": "+919100400005", "pending_token": token}).json()["otp"]
    s = client.post(
        "/auth/otp/verify", json={"phone_number": "+919100400005", "otp": otp, "pending_token": token}
    ).json()
    db = _db(client)
    rows = db.query(ConsentRecord).filter(ConsentRecord.user_id == uuid.UUID(s["user_id"])).all()
    assert len(rows) == 3
    assert {r.surface for r in rows} == {"signup_google"}
    db.close()


def test_existing_google_login_needs_no_consent(client, monkeypatch):
    _mock_google_claims(monkeypatch, "g-sub-returning-2", "returning-google-2@example.com")
    gate = client.post("/auth/oauth/google", json={"id_token": "fake", "accepted_documents": _consent()}).json()
    phone = "+919100400007"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    first = client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": phone_otp, "pending_token": gate["phone_required"]["token"]},
    ).json()

    response = client.post("/auth/oauth/google", json={"id_token": "fake"})

    assert response.status_code == 200
    assert response.json()["user_id"] == first["user_id"]


def test_legacy_unflowed_signup_is_refused_when_disabled(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "legacy_unflowed_phone_signup", False)
    otp = client.post("/auth/otp/request", json={"phone_number": "+919100400006"}).json()["otp"]
    r = client.post("/auth/otp/verify", json={"phone_number": "+919100400006", "otp": otp})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "flow_required"


# ---------------------------------------------- Task 9: /me.consent_outdated + re-consent


def test_me_reports_outdated_consent_for_a_legacy_user(client):
    # The legacy flow-less verify (conftest) mints a user with no consent rows
    # -- exactly the shape of an account created before consent existed.
    headers = {"Authorization": f"Bearer {_signup_via_phone(client, '+919300000001')['session_token']}"}

    assert client.get("/auth/me", headers=headers).json()["consent_outdated"] == [
        "terms_of_service",
        "privacy_policy",
    ]

    r = client.post("/legal/consents", json={"accepted_documents": _consent()}, headers=headers)

    assert r.status_code == 200
    assert r.json() == {"consent_outdated": []}
    assert client.get("/auth/me", headers=headers).json()["consent_outdated"] == []
    user_id = uuid.UUID(client.get("/auth/me", headers=headers).json()["user_id"])
    rows = _db(client).query(ConsentRecord).filter_by(user_id=user_id).all()
    assert {row.surface for row in rows} == {"reconsent"}
    assert len(rows) == 3


def test_me_consent_outdated_is_empty_after_a_consented_signup(client, monkeypatch):
    token = _signup_via_google_then_phone_gate(
        client, monkeypatch, "g-sub-consent-me", "consentme@example.com", "+919300000002"
    )["session_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()

    assert me["consent_outdated"] == []
