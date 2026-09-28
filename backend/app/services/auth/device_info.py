"""Request-metadata capture for OTP requests (auth-flow-redesign FR-2/FR-9)
-- this is for device/platform analytics ("what are our users signing up
on -- phone, tablet, Windows, Mac"), not fraud prevention. Neither MAC nor
raw IP address answers that question; the parsed User-Agent fields do. See
Docs/superpowers/specs/2026-09-28-auth-flow-redesign-database-schema-changes.md
§1 for the full reasoning.

Concurrency note: this module has no locking of its own -- it's a pure,
stateless read of the incoming request. The upsert-on-resend race documented
in otp.py is a property of the caller, not of this module.
"""

from __future__ import annotations

from typing import NamedTuple

from fastapi import Request
from user_agents import parse as parse_user_agent


class RequestMetadata(NamedTuple):
    ip_address: str | None = None
    user_agent: str | None = None
    device_type: str | None = None
    os_family: str | None = None
    os_version: str | None = None
    browser_family: str | None = None
    browser_version: str | None = None
    device_id: str | None = None


def get_client_ip(request: Request) -> str | None:
    """The backend sits behind an ALB (ADR-005) -- request.client.host is
    the ALB's own internal IP, not the caller's. The ALB puts the real
    client IP first in X-Forwarded-For (format: client, proxy1, proxy2...).
    This header is trustworthy here specifically because ECS tasks aren't
    reachable directly (all traffic is forced through the ALB) -- don't
    reuse this helper in a deployment where the app is directly
    internet-facing without re-checking that assumption."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def capture_request_metadata(request: Request) -> RequestMetadata:
    """Reads everything available from a single incoming request -- no
    external calls, no DB access. Safe to call unconditionally; every field
    degrades to None rather than raising when its source header is absent
    or unparseable."""
    ua_string = request.headers.get("user-agent")
    device_type = os_family = os_version = browser_family = browser_version = None
    if ua_string:
        parsed = parse_user_agent(ua_string)
        if parsed.is_mobile:
            device_type = "mobile"
        elif parsed.is_tablet:
            device_type = "tablet"
        elif parsed.is_pc:
            device_type = "desktop"
        else:
            device_type = "other"
        os_family = parsed.os.family or None
        os_version = parsed.os.version_string or None
        browser_family = parsed.browser.family or None
        browser_version = parsed.browser.version_string or None

    return RequestMetadata(
        ip_address=get_client_ip(request),
        user_agent=ua_string,
        device_type=device_type,
        os_family=os_family,
        os_version=os_version,
        browser_family=browser_family,
        browser_version=browser_version,
        device_id=request.headers.get("x-device-id"),
    )
