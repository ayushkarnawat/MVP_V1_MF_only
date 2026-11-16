"""Held-fund NAV refresh driven by AMFI's own per-scheme date (Nov 2026 fix).

Background: nav-daily used the peers' "a row within 3 days is fresh" rule for the
funds people actually hold, so held funds sat 1-3 days behind on stored-only pages.
These tests pin the replacement: compare each held fund with the date AMFI lists for it.
"""
import asyncio
import uuid
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from app.models.reference import NavHistory, Scheme
from app.services.analytics.scheme_universe import UniverseRow
from app.services.dashboard import held_nav_refresh as mod
from app.services.dashboard.held_nav_refresh import (
    alert_problems,
    last_weekday_before,
    refresh_held_navs,
)


def _scheme(db, code, name="Fund A"):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=code, isin=f"INF{code}", name=name,
                    amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    return scheme


def _amfi(code, nav, on):
    return UniverseRow(amfi_code=code, isin=None, name="x", amc_name="AMC", sebi_category="c",
                       nav=Decimal(nav), nav_date=on)


def _stored(db, scheme, on, nav="50", rows=30):
    """A realistic stored history: `rows` consecutive days ending on `on` (fewer than 30 rows would, by
    design, look like a never-filled history and trigger a full mfapi.in fetch)."""
    for back in range(rows):
        db.add(NavHistory(scheme_id=scheme.id, date=on - timedelta(days=back), nav=Decimal(nav)))
    db.commit()


def _latest(db, scheme):
    row = db.query(NavHistory).filter_by(scheme_id=scheme.id).order_by(NavHistory.date.desc()).first()
    return (row.date, row.nav) if row else None


def _run(db, schemes, rows):
    return asyncio.run(refresh_held_navs(db, schemes, rows, today=date(2026, 11, 16)))


def test_fund_one_day_behind_is_filled_from_the_amfi_row_without_calling_mfapi(db_session):
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 12))
    with patch.object(mod, "_fetch_nav_history", new=AsyncMock()) as fetch:
        result = _run(db_session, [scheme], [_amfi("111", "52.5", date(2026, 11, 13))])
    fetch.assert_not_awaited()
    assert _latest(db_session, scheme) == (date(2026, 11, 13), Decimal("52.5"))
    assert (result.held, result.behind, result.filled_amfi, result.filled_mfapi, result.still_behind) == (1, 1, 1, 0, 0)


def test_fund_inside_the_old_three_day_window_is_still_refreshed(db_session):
    """The bug: stored 11 Nov, AMFI has 13 Nov, and 'a row within 3 days' used to mean skip."""
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 11))
    _run(db_session, [scheme], [_amfi("111", "53", date(2026, 11, 13))])
    assert _latest(db_session, scheme)[0] == date(2026, 11, 13)


def test_fund_already_on_the_amfi_date_is_left_alone(db_session):
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 13), "50")
    with patch.object(mod, "_fetch_nav_history", new=AsyncMock()) as fetch:
        result = _run(db_session, [scheme], [_amfi("111", "99", date(2026, 11, 13))])
    fetch.assert_not_awaited()
    assert _latest(db_session, scheme) == (date(2026, 11, 13), Decimal("50"))
    assert result.behind == 0 and result.still_behind == 0


def test_weekend_liquid_fund_uses_its_own_amfi_date_not_a_weekday_rule(db_session):
    scheme = _scheme(db_session, "222", "Liquid")
    _stored(db_session, scheme, date(2026, 11, 14))
    _run(db_session, [scheme], [_amfi("222", "1587.3", date(2026, 11, 15))])
    assert _latest(db_session, scheme)[0] == date(2026, 11, 15)


def test_big_gap_fetches_full_history_from_mfapi_then_adds_the_amfi_row(db_session):
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 2))
    history = [(date(2026, 11, 3), Decimal("51")), (date(2026, 11, 4), Decimal("52"))]
    with patch.object(mod, "_fetch_nav_history", new=AsyncMock(return_value=history)) as fetch:
        result = _run(db_session, [scheme], [_amfi("111", "55", date(2026, 11, 13))])
    fetch.assert_awaited_once_with("111")
    assert db_session.query(NavHistory).filter_by(scheme_id=scheme.id).count() == 30 + 3  # + 2 repaired days + AMFI row
    assert _latest(db_session, scheme) == (date(2026, 11, 13), Decimal("55"))
    assert result.filled_mfapi == 1 and result.filled_amfi == 0


def test_a_malformed_mfapi_payload_does_not_crash_the_run_and_amfi_still_fills_the_fund(db_session):
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 2))
    with patch.object(mod, "_fetch_nav_history", new=AsyncMock(side_effect=TypeError("'NoneType' is not iterable"))):
        result = _run(db_session, [scheme], [_amfi("111", "55", date(2026, 11, 13))])
    assert _latest(db_session, scheme) == (date(2026, 11, 13), Decimal("55"))
    assert result.filled_amfi == 1


def test_a_fund_with_a_barely_filled_history_is_re_fetched_even_when_only_one_day_behind(db_session):
    """An earlier mfapi.in failure leaves one row; the 4-day rule alone would never retry it."""
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 12), rows=1)
    with patch.object(mod, "_fetch_nav_history", new=AsyncMock(return_value=[(date(2026, 11, 11), Decimal("49"))])) as fetch:
        result = _run(db_session, [scheme], [_amfi("111", "52", date(2026, 11, 13))])
    fetch.assert_awaited_once_with("111")
    assert result.filled_mfapi == 1


def test_big_gap_when_mfapi_fails_still_gets_the_amfi_row(db_session):
    import httpx
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 2))
    with patch.object(mod, "_fetch_nav_history", new=AsyncMock(side_effect=httpx.ConnectError("down"))):
        result = _run(db_session, [scheme], [_amfi("111", "55", date(2026, 11, 13))])
    assert _latest(db_session, scheme) == (date(2026, 11, 13), Decimal("55"))
    assert result.filled_amfi == 1 and result.still_behind == 0


def test_fund_with_no_rows_at_all_gets_history(db_session):
    scheme = _scheme(db_session, "111")
    with patch.object(mod, "_fetch_nav_history", new=AsyncMock(return_value=[(date(2026, 11, 12), Decimal("51"))])) as fetch:
        _run(db_session, [scheme], [_amfi("111", "55", date(2026, 11, 13))])
    fetch.assert_awaited_once()
    assert _latest(db_session, scheme)[0] == date(2026, 11, 13)


def test_fund_missing_from_the_amfi_file_is_listed_not_failed(db_session):
    scheme = _scheme(db_session, "333", "Closed Fund")
    _stored(db_session, scheme, date(2026, 6, 1))
    result = _run(db_session, [scheme], [_amfi("111", "1", date(2026, 11, 13))])
    assert result.missing_from_amfi == ["Closed Fund"]
    assert result.missing_schemes == [scheme]  # the job still gives these the old mfapi.in refresh
    assert result.behind == 0
    assert alert_problems(result, today=date(2026, 11, 16)) == []


def test_cas_only_fund_without_an_amfi_code_is_ignored(db_session):
    scheme = _scheme(db_session, None, "CAS only")
    result = _run(db_session, [scheme], [_amfi("111", "1", date(2026, 11, 13))])
    assert result.held == 0


def test_amfi_row_without_a_usable_nav_is_not_written(db_session):
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 12))
    row = UniverseRow(amfi_code="111", isin=None, name="x", amc_name="AMC", sebi_category="c", nav=None, nav_date=date(2026, 11, 13))
    result = _run(db_session, [scheme], [row])
    assert _latest(db_session, scheme)[0] == date(2026, 11, 12)
    assert result.missing_from_amfi == [scheme.name]


def test_newest_amfi_date_ignores_dates_in_the_future(db_session):
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 12))
    rows = [_amfi("111", "52", date(2026, 11, 13)), _amfi("999", "1", date(2030, 1, 1))]
    result = _run(db_session, [scheme], rows)
    assert result.amfi_newest == date(2026, 11, 13)


def test_last_weekday_before_each_weekday():
    assert last_weekday_before(date(2026, 11, 16)) == date(2026, 11, 13)  # Mon -> Fri
    assert last_weekday_before(date(2026, 11, 15)) == date(2026, 11, 13)  # Sun -> Fri
    assert last_weekday_before(date(2026, 11, 14)) == date(2026, 11, 13)  # Sat -> Fri
    assert last_weekday_before(date(2026, 11, 17)) == date(2026, 11, 16)  # Tue -> Mon
    assert last_weekday_before(date(2026, 11, 20)) == date(2026, 11, 19)  # Fri -> Thu


def test_alarm_when_the_whole_amfi_file_is_older_than_the_last_working_day(db_session):
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 11))
    result = _run(db_session, [scheme], [_amfi("111", "52", date(2026, 11, 12))])
    problems = alert_problems(result, today=date(2026, 11, 16))  # last weekday = Fri 13 Nov
    assert any("AMFI file is late" in p for p in problems)


def test_alarm_names_a_held_fund_more_than_four_days_older_than_the_file(db_session):
    fresh, dormant = _scheme(db_session, "111", "Fresh"), _scheme(db_session, "444", "Dormant Fund")
    _stored(db_session, fresh, date(2026, 11, 12))
    _stored(db_session, dormant, date(2026, 11, 2))
    rows = [_amfi("111", "52", date(2026, 11, 13)), _amfi("444", "9", date(2026, 11, 6))]
    with patch.object(mod, "_fetch_nav_history", new=AsyncMock(return_value=[])):
        result = _run(db_session, [fresh, dormant], rows)
    problems = alert_problems(result, today=date(2026, 11, 16))
    assert result.very_stale == ["Dormant Fund"]
    assert any("Dormant Fund" in p for p in problems)
    assert not any("Fresh" in p for p in problems)


def test_exactly_four_days_older_is_not_an_alarm(db_session):
    scheme = _scheme(db_session, "444", "Edge Fund")
    _stored(db_session, scheme, date(2026, 11, 8))
    rows = [_amfi("444", "9", date(2026, 11, 9)), _amfi("111", "1", date(2026, 11, 13))]
    result = _run(db_session, [scheme], rows)
    assert result.very_stale == []


def test_no_problems_on_a_healthy_day(db_session):
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 12))
    result = _run(db_session, [scheme], [_amfi("111", "52", date(2026, 11, 13))])
    assert alert_problems(result, today=date(2026, 11, 16)) == []


def test_summary_line_is_one_greppable_line(db_session):
    scheme = _scheme(db_session, "111")
    _stored(db_session, scheme, date(2026, 11, 12))
    result = _run(db_session, [scheme], [_amfi("111", "52", date(2026, 11, 13))])
    line = result.summary_line(mode="held-only", stamp="2026-11-16T10:30:00+05:30")
    assert "\n" not in line
    assert line == ("NAV_SUMMARY ts=2026-11-16T10:30:00+05:30 mode=held-only held=1 behind=1 filled_amfi=1 "
                    "filled_mfapi=0 still_behind=0 missing_from_amfi=0 very_stale=0 amfi_newest=2026-11-13")
