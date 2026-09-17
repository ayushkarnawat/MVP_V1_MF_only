"""Email-sending abstraction for email OTP — Design Spec §3.

StubEmailProvider logs instead of sending (dev default). PostmarkEmailProvider
sends real email via Postmark's transactional Email API
(https://postmarkapp.com/developer/api/email-api) once OTP_DELIVERY_MODE is
set to "postmark" and POSTMARK_API_TOKEN/POSTMARK_FROM_EMAIL are configured.
get_email_provider() selects between them.
"""

from __future__ import annotations

import logging
from typing import Protocol

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

POSTMARK_SEND_URL = "https://api.postmarkapp.com/email"


class EmailProvider(Protocol):
    def send_email(self, to: str, subject: str, body: str) -> None: ...


class StubEmailProvider:
    """Logs instead of sending — mirrors how phone OTP already behaves in
    stub mode (see otp.py's otp_delivery_mode='stub' gate)."""

    def send_email(self, to: str, subject: str, body: str) -> None:
        logger.info("StubEmailProvider: would send to=%s subject=%r body=%r", to, subject, body)


class PostmarkEmailProvider:
    """Sends real email via Postmark's transactional Email API. Requires a
    confirmed Sender Signature for settings.postmark_from_email in the
    Postmark dashboard — Postmark rejects the send otherwise, at the account
    level, not something this class validates itself."""

    def send_email(self, to: str, subject: str, body: str) -> None:
        response = httpx.post(
            POSTMARK_SEND_URL,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Postmark-Server-Token": settings.postmark_api_token,
            },
            json={
                "From": settings.postmark_from_email,
                "To": to,
                "Subject": subject,
                "TextBody": body,
            },
            timeout=10.0,
        )
        response.raise_for_status()


class NoEmailProviderConfiguredError(RuntimeError):
    pass


def get_email_provider() -> EmailProvider:
    if settings.otp_delivery_mode == "stub":
        return StubEmailProvider()
    if settings.otp_delivery_mode == "postmark":
        return PostmarkEmailProvider()
    raise NoEmailProviderConfiguredError(
        f"No real EmailProvider is configured for OTP_DELIVERY_MODE={settings.otp_delivery_mode!r}. "
        "Set OTP_DELIVERY_MODE to 'postmark' (with POSTMARK_API_TOKEN and "
        "POSTMARK_FROM_EMAIL set) to send real email via Postmark, or back "
        "to 'stub' for local development."
    )
