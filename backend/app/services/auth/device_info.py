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

import ipaddress
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
    """Read the last X-Forwarded-For entry and validate it as an IP address.

    The AWS load balancer appends the real address after any caller-supplied
    entries. Caddy on LeapSwitch replaces the header with the real address.
    The last entry is trustworthy only when the app is never reachable
    except through one of these proxies with that header handling in place.
    Without a forwarded header, use the socket address. Return None if the
    selected address is missing or malformed.
    """
    getlist = getattr(request.headers, "getlist", None)
    # Two separate header lines: a proxy that keeps them separate appends its own line last, so the last line is the one to read
    # (Starlette's headers.get returns the first, which the caller controls).
    lines = getlist("x-forwarded-for") if getlist else [request.headers.get("x-forwarded-for")]
    forwarded = lines[-1] if lines else None
    candidate = forwarded.split(",")[-1].strip() if forwarded else (request.client.host if request.client else None)
    if candidate is None:
        return None
    try:
        ipaddress.ip_address(candidate)
    except ValueError:
        return None
    return candidate


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
