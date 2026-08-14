"""Google ID-token verification — Design Spec §2.

ID-token-only, not the authorization-code exchange: no client secret is
needed, this is pure JWT signature verification against Google's published
public keys via the `google-auth` library.
"""

from __future__ import annotations

from typing import NamedTuple

from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import settings


class GoogleTokenVerificationError(Exception):
    pass


class GoogleClaims(NamedTuple):
    sub: str
    email: str | None
    email_verified: bool


def verify_google_id_token(raw_id_token: str) -> GoogleClaims:
    if not settings.google_oauth_client_id:
        raise GoogleTokenVerificationError("Google OAuth Client ID is not configured.")

    try:
        claims = id_token.verify_oauth2_token(
            raw_id_token, google_requests.Request(), settings.google_oauth_client_id
        )
    except (GoogleAuthError, ValueError) as exc:
        raise GoogleTokenVerificationError(str(exc)) from exc

    return GoogleClaims(
        sub=claims["sub"],
        email=claims.get("email"),
        email_verified=bool(claims.get("email_verified", False)),
    )
