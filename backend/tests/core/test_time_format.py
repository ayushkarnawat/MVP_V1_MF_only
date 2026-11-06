from __future__ import annotations

from datetime import datetime, timezone

from app.core.time_format import format_ist_date, format_ist_datetime


def test_format_ist_datetime_converts_utc_to_india_time():
    value = datetime(2026, 11, 6, 10, 3, tzinfo=timezone.utc)

    assert format_ist_datetime(value) == "6 Nov 2026, 3:33 PM IST"


def test_format_ist_datetime_uses_a_twelve_hour_clock_without_a_padded_hour():
    value = datetime(2026, 11, 6, 20, 5, tzinfo=timezone.utc)  # 1:35 AM next day in India

    assert format_ist_datetime(value) == "7 Nov 2026, 1:35 AM IST"


def test_format_ist_date_rolls_to_the_next_india_day():
    value = datetime(2026, 11, 11, 19, 0, tzinfo=timezone.utc)  # 00:30 on the 12th in India

    assert format_ist_date(value) == "12 Nov 2026"


def test_a_naive_datetime_is_read_as_utc():
    assert format_ist_date(datetime(2026, 11, 11, 19, 0)) == "12 Nov 2026"
    assert format_ist_datetime(datetime(2026, 11, 6, 10, 3)) == "6 Nov 2026, 3:33 PM IST"
