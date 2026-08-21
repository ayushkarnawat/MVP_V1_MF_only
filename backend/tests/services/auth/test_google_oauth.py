import pytest

from app.services.auth.google_oauth import GoogleTokenVerificationError, verify_google_id_token


def test_verify_google_id_token_returns_claims_on_success(monkeypatch):
    import app.services.auth.google_oauth as google_oauth_module

    monkeypatch.setattr(google_oauth_module.settings, "google_oauth_client_id", "test-client-id")
    monkeypatch.setattr(
        google_oauth_module.id_token,
        "verify_oauth2_token",
        lambda token, request, audience: {
            "sub": "google-sub-123",
            "email": "a@example.com",
            "email_verified": True,
            "iss": "https://accounts.google.com",
        },
    )

    claims = verify_google_id_token("fake-jwt")

    assert claims.sub == "google-sub-123"
    assert claims.email == "a@example.com"
    assert claims.email_verified is True


def test_verify_google_id_token_wraps_verification_failures(monkeypatch):
    import app.services.auth.google_oauth as google_oauth_module
    from google.auth.exceptions import GoogleAuthError

    monkeypatch.setattr(google_oauth_module.settings, "google_oauth_client_id", "test-client-id")

    def _raise(token, request, audience):
        raise GoogleAuthError("bad signature")

    monkeypatch.setattr(google_oauth_module.id_token, "verify_oauth2_token", _raise)

    with pytest.raises(GoogleTokenVerificationError, match="bad signature"):
        verify_google_id_token("fake-jwt")


def test_verify_google_id_token_requires_client_id_configured(monkeypatch):
    import app.services.auth.google_oauth as google_oauth_module

    monkeypatch.setattr(google_oauth_module.settings, "google_oauth_client_id", "")

    with pytest.raises(GoogleTokenVerificationError, match="not configured"):
        verify_google_id_token("fake-jwt")


def test_verify_google_id_token_normalizes_email_case_and_whitespace(monkeypatch):
    # Finding 4. Google does not guarantee a canonical case for the `email`
    # claim, and every email comparison downstream (the §4 collision lookup,
    # auth_identities.email, users.email) is a plain string compare — so an
    # un-normalized claim would silently miss a genuine collision and defeat
    # the linking system.
    import app.services.auth.google_oauth as google_oauth_module

    monkeypatch.setattr(google_oauth_module.settings, "google_oauth_client_id", "test-client-id")
    monkeypatch.setattr(
        google_oauth_module.id_token,
        "verify_oauth2_token",
        lambda token, request, audience: {
            "sub": "google-sub-mixed",
            "email": "  Victim@Example.COM ",
            "email_verified": True,
        },
    )

    claims = verify_google_id_token("fake-jwt")

    assert claims.email == "victim@example.com"


def test_verify_google_id_token_leaves_a_missing_email_as_none(monkeypatch):
    # Normalization must not turn an absent claim into "" — resolve_new_verified_identity
    # branches on `email is None`, and an empty string would take the wrong path.
    import app.services.auth.google_oauth as google_oauth_module

    monkeypatch.setattr(google_oauth_module.settings, "google_oauth_client_id", "test-client-id")
    monkeypatch.setattr(
        google_oauth_module.id_token,
        "verify_oauth2_token",
        lambda token, request, audience: {"sub": "google-sub-noemail", "email_verified": True},
    )

    claims = verify_google_id_token("fake-jwt")

    assert claims.email is None


def test_verify_google_id_token_defaults_missing_email_verified_to_false(monkeypatch):
    import app.services.auth.google_oauth as google_oauth_module

    monkeypatch.setattr(google_oauth_module.settings, "google_oauth_client_id", "test-client-id")
    monkeypatch.setattr(
        google_oauth_module.id_token,
        "verify_oauth2_token",
        lambda token, request, audience: {"sub": "s", "iss": "https://accounts.google.com"},
    )

    claims = verify_google_id_token("fake-jwt")

    assert claims.email is None
    assert claims.email_verified is False
