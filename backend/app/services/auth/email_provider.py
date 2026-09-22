"""Email-sending abstraction for email OTP — Design Spec §3.

StubEmailProvider logs instead of sending (dev default). PostmarkEmailProvider
sends real email via Postmark's transactional Email API
(https://postmarkapp.com/developer/api/email-api) once EMAIL_DELIVERY_MODE is
set to "postmark" and POSTMARK_API_TOKEN/POSTMARK_FROM_EMAIL are configured.
get_email_provider() selects between them. EMAIL_DELIVERY_MODE is independent
of OTP_DELIVERY_MODE (the phone/SMS channel's own setting) -- see otp.py's
_delivery_mode() helper.
"""

from __future__ import annotations

import logging
from typing import Protocol

import boto3
import httpx
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings

logger = logging.getLogger(__name__)

POSTMARK_SEND_URL = "https://api.postmarkapp.com/email"


class EmailSendError(RuntimeError):
    """Raised when an email provider rejects or fails to send an OTP email.
    Callers (otp.py, auth.py) catch this and return a clean error to the
    caller instead of letting the underlying provider exception (an httpx or
    boto3 error) escape uncaught -- an uncaught exception here crashes past
    CORSMiddleware's normal response path, so the browser sees a stripped,
    CORS-header-less 500 and misreports it as a network/CORS failure instead
    of the real cause."""


class EmailProvider(Protocol):
    def send_email(self, to: str, subject: str, body: str) -> None: ...


class StubEmailProvider:
    """Logs instead of sending — mirrors how phone OTP behaves in stub mode
    (see otp.py's per-channel _delivery_mode() helper)."""

    def send_email(self, to: str, subject: str, body: str) -> None:
        logger.info("StubEmailProvider: would send to=%s subject=%r body=%r", to, subject, body)


class PostmarkEmailProvider:
    """Sends real email via Postmark's transactional Email API. Requires a
    confirmed Sender Signature for settings.postmark_from_email in the
    Postmark dashboard — Postmark rejects the send otherwise, at the account
    level, not something this class validates itself."""

    def send_email(self, to: str, subject: str, body: str) -> None:
        try:
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
        except httpx.HTTPError as exc:
            logger.error("PostmarkEmailProvider: send to %s failed: %s", to, exc)
            raise EmailSendError("We couldn't send that email right now.") from exc


class SesEmailProvider:
    """Sends real email via Amazon SES's SendEmail API. Requires the sending
    domain to be a verified SES identity (see
    Docs/superpowers/plans/2026-09-21-ses-email-provider-migration.md Part 1)
    -- SES rejects the send otherwise, at the account level, same as
    PostmarkEmailProvider's Sender Signature requirement. Uses the ECS task's
    IAM role for credentials (boto3's default credential chain) -- no static
    access key, matching this codebase's existing boto3 usage in
    services/analytics/dispatch.py and services/import_/file_storage.py."""

    def send_email(self, to: str, subject: str, body: str) -> None:
        if not settings.aws_region:
            raise EmailSendError("Email delivery is not configured (missing AWS region).")

        client = boto3.client("ses", region_name=settings.aws_region)
        try:
            client.send_email(
                Source=settings.ses_from_email,
                Destination={"ToAddresses": [to]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
                },
            )
        except (BotoCoreError, ClientError) as exc:
            logger.error("SesEmailProvider: send to %s failed: %s", to, exc)
            raise EmailSendError("We couldn't send that email right now.") from exc


class NoEmailProviderConfiguredError(RuntimeError):
    pass


def get_email_provider() -> EmailProvider:
    if settings.email_delivery_mode == "stub":
        return StubEmailProvider()
    if settings.email_delivery_mode == "postmark":
        return PostmarkEmailProvider()
    if settings.email_delivery_mode == "ses":
        return SesEmailProvider()
    raise NoEmailProviderConfiguredError(
        f"No real EmailProvider is configured for EMAIL_DELIVERY_MODE={settings.email_delivery_mode!r}. "
        "Set EMAIL_DELIVERY_MODE to 'postmark' or 'ses' (with the matching "
        "provider settings configured) to send real email via Postmark or "
        "Amazon SES, or back to 'stub' for local development."
    )
