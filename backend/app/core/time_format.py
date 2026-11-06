"""Dates and times shown to people, always in India time.

Every user-facing date in the Head of Family refusals and emails goes through here, so a moment
stored in UTC (for example 19:00 UTC on the 11th) reads as the India day it is (the 12th)."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

_IST = ZoneInfo("Asia/Kolkata")


def _to_ist(value: datetime) -> datetime:
    # A naive value is read as UTC: the database returns naive datetimes on SQLite.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(_IST)


def format_ist_date(value: datetime) -> str:
    """`12 Nov 2026` (no zero-padded day)."""
    ist = _to_ist(value)
    return f"{ist.day} {ist:%b %Y}"


def format_ist_datetime(value: datetime) -> str:
    """`6 Nov 2026, 3:33 PM IST` (12-hour clock, no zero-padded hour)."""
    ist = _to_ist(value)
    hour = ist.hour % 12 or 12
    return f"{ist.day} {ist:%b %Y}, {hour}:{ist:%M} {'AM' if ist.hour < 12 else 'PM'} IST"
