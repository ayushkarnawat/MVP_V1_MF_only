"""Email-sending abstraction for email OTP — Design Spec §3.

v1 ships with StubEmailProvider only. A real provider (Postmark, per the
spec's decision) is a later, separate task: one new class implementing this
same protocol, plus a config value. Do not build that class here.
"""

from __future__ import annotations

import logging
from typing import Protocol

from app.config import settings

logger = logging.getLogger(__name__)


class EmailProvider(Protocol):
    def send_email(self, to: str, subject: str, body: str) -> None: ...


class StubEmailProvider:
    """Logs instead of sending — mirrors how phone OTP already behaves in
    stub mode (see otp.py's otp_delivery_mode='stub' gate)."""

    def send_email(self, to: str, subject: str, body: str) -> None:
        logger.info("StubEmailProvider: would send to=%s subject=%r body=%r", to, subject, body)


class NoEmailProviderConfiguredError(RuntimeError):
    pass


def get_email_provider() -> EmailProvider:
    if settings.otp_delivery_mode == "stub":
        return StubEmailProvider()
    raise NoEmailProviderConfiguredError(
        "No real EmailProvider is configured — Postmark integration is a "
        "later, separate task (Design Spec §3/§8). Set OTP_DELIVERY_MODE "
        "back to 'stub' for local development."
    )
