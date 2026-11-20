"""refresh_nav_daily: held funds first from AMFI, --held-only, --alert-if-behind, digest (Nov 2026)."""
import asyncio
import sys
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.models.folio import Folio  # noqa: F401  (table registration)
from app.models.reference import NavHistory, Scheme
from app.services.dashboard.held_nav_refresh import HeldNavResult
from scripts.jobs import refresh_nav_daily as job


def _result(**kw):
    base = dict(held=2, behind=1, filled_amfi=1, filled_mfapi=0, still_behind=0,
                missing_from_amfi=[], very_stale=[], amfi_newest=date(2026, 11, 13))
    base.update(kw)
    return HeldNavResult(**base)


def test_held_only_skips_peers_and_scenarios(db_session):
    with patch.object(job, "load_held_schemes", return_value=[]), \
         patch.object(job, "fetch_amfi_rows", new=AsyncMock(return_value=[])), \
         patch.object(job, "refresh_held_navs", new=AsyncMock(return_value=_result())), \
         patch.object(job, "refresh_peers", new=AsyncMock()) as peers, \
         patch.object(job, "recompute_ongoing_scenarios") as scenarios:
        outcome = asyncio.run(job.main_async(db_session, held_only=True))
    peers.assert_not_awaited()
    scenarios.assert_not_called()
    assert outcome.result is not None


def test_full_run_still_does_peers_and_scenarios(db_session):
    with patch.object(job, "load_held_schemes", return_value=[]), \
         patch.object(job, "fetch_amfi_rows", new=AsyncMock(return_value=[])), \
         patch.object(job, "refresh_held_navs", new=AsyncMock(return_value=_result())), \
         patch.object(job, "refresh_peers", new=AsyncMock()) as peers, \
         patch.object(job, "recompute_ongoing_scenarios") as scenarios:
        asyncio.run(job.main_async(db_session))
    peers.assert_awaited_once()
    scenarios.assert_called_once()


def test_amfi_download_failure_falls_back_to_the_old_refresh_and_is_a_problem(db_session):
    import httpx
    with patch.object(job, "load_held_schemes", return_value=[]), \
         patch.object(job, "fetch_amfi_rows", new=AsyncMock(side_effect=httpx.ConnectError("down"))), \
         patch.object(job, "warm_nav_history", new=AsyncMock()) as fallback, \
         patch.object(job, "refresh_peers", new=AsyncMock()), \
         patch.object(job, "recompute_ongoing_scenarios"):
        outcome = asyncio.run(job.main_async(db_session, held_only=True))
    fallback.assert_awaited_once()
    assert any("AMFI file could not be read" in p for p in outcome.problems)


def test_a_failed_held_refresh_is_a_problem_but_peers_and_scenarios_still_run(db_session):
    with patch.object(job, "load_held_schemes", return_value=[]), \
         patch.object(job, "fetch_amfi_rows", new=AsyncMock(return_value=[])), \
         patch.object(job, "refresh_held_navs", new=AsyncMock(side_effect=RuntimeError("db down"))), \
         patch.object(job, "refresh_peers", new=AsyncMock()) as peers, \
         patch.object(job, "recompute_ongoing_scenarios") as scenarios:
        outcome = asyncio.run(job.main_async(db_session))
    peers.assert_awaited_once()
    scenarios.assert_called_once()
    assert any("held-fund refresh from AMFI failed" in p for p in outcome.problems)
    assert "held_refresh=FAILED" in outcome.summary


def test_funds_missing_from_the_amfi_file_still_get_the_old_mfapi_refresh(db_session):
    unlisted = object()
    with patch.object(job, "load_held_schemes", return_value=[]), \
         patch.object(job, "fetch_amfi_rows", new=AsyncMock(return_value=[])), \
         patch.object(job, "refresh_held_navs", new=AsyncMock(return_value=_result(missing_schemes=[unlisted]))), \
         patch.object(job, "warm_nav_history", new=AsyncMock()) as warm:
        asyncio.run(job.main_async(db_session, held_only=True))
    warm.assert_awaited_once_with(db_session, [unlisted])


def test_exit_code_is_nonzero_only_when_alerting_and_a_problem_exists():
    ok = job.RunOutcome(problems=[], summary="s", result=_result())
    bad = job.RunOutcome(problems=["x"], summary="s", result=_result())
    assert job.exit_code(ok, alert_if_behind=True) == 0
    assert job.exit_code(bad, alert_if_behind=False) == 0
    assert job.exit_code(bad, alert_if_behind=True) == 1


def test_the_run_prints_the_summary_line_problems_and_unlisted_funds(db_session, capsys):
    result = _result(very_stale=["Dormant Fund"], missing_from_amfi=["Closed Fund"])
    with patch.object(job, "load_held_schemes", return_value=[]), \
         patch.object(job, "fetch_amfi_rows", new=AsyncMock(return_value=[])), \
         patch.object(job, "refresh_held_navs", new=AsyncMock(return_value=result)), \
         patch.object(job, "alert_problems", return_value=["Dormant Fund is 6 days behind"]):
        asyncio.run(job.main_async(db_session, held_only=True))
    out = capsys.readouterr().out
    assert "NAV_SUMMARY ts=" in out and "mode=held-only" in out
    assert "NAV_PROBLEM Dormant Fund is 6 days behind" in out
    assert "NAV_NOTE not in AMFI file: Closed Fund" in out


def test_main_returns_the_exit_code_for_the_flags(db_session):
    bad = job.RunOutcome(problems=["x"], summary="s", result=_result())
    with patch.object(job, "SessionLocal") as session_cls, \
         patch.object(job, "main_async", new=AsyncMock(return_value=bad)):
        session_cls.return_value.__enter__.return_value = db_session
        assert job.main(["--held-only", "--alert-if-behind"]) == 1
        assert job.main(["--held-only"]) == 0


def test_peer_history_line_is_printed_and_nav_summary_is_unchanged(db_session, capsys):
    from datetime import datetime

    stamp = datetime(2026, 11, 20, 6, 0, tzinfo=job._IST)
    with patch.object(job, "datetime") as clock, \
         patch.object(job, "load_held_schemes", return_value=[]), \
         patch.object(job, "fetch_amfi_rows", new=AsyncMock(return_value=[])), \
         patch.object(job, "refresh_held_navs", new=AsyncMock(return_value=_result())), \
         patch.object(job, "alert_problems", return_value=[]):
        clock.now.return_value = stamp
        outcome = asyncio.run(job.main_async(db_session))

    expected = (
        "NAV_SUMMARY ts=2026-11-20T06:00:00+05:30 mode=full held=2 behind=1 "
        "filled_amfi=1 filled_mfapi=0 still_behind=0 missing_from_amfi=0 "
        "very_stale=0 amfi_newest=2026-11-13"
    )
    assert outcome.summary == expected
    assert capsys.readouterr().out == expected + "\nPEER_HISTORY failed=0 of 0\n"
    assert job.exit_code(outcome, alert_if_behind=True) == 0


def test_full_run_writes_peer_prices_and_held_only_run_does_not_touch_peers(db_session, capsys):
    from datetime import timedelta

    from app.services.analytics.scheme_universe import CategoryPeers, UniverseRow
    from app.services.dashboard import nav

    today = date.today()
    yesterday = today - timedelta(days=1)
    category = "Equity Scheme - Flexi Cap Fund"
    held = Scheme(amfi_code="900101", name="Example Held Fund", amc_name="Example AMC", sebi_category=category)
    peer = Scheme(amfi_code="900102", name="Example Peer Fund", amc_name="Example AMC", sebi_category=category)
    db_session.add_all([held, peer])
    db_session.flush()
    db_session.add_all([
        NavHistory(scheme_id=held.id, date=today, nav=Decimal("20")),
        NavHistory(scheme_id=peer.id, date=yesterday, nav=Decimal("30")),
    ])
    db_session.commit()

    rows = [
        UniverseRow(held.amfi_code, None, held.name, held.amc_name, category, nav=Decimal("20"), nav_date=today),
        UniverseRow(peer.amfi_code, None, peer.name, peer.amc_name, category, nav=Decimal("31"), nav_date=today),
    ]
    with patch.object(job, "load_held_schemes", return_value=[held]), \
         patch.object(job, "fetch_amfi_rows", new=AsyncMock(return_value=rows)) as amfi, \
         patch.object(job, "get_category_peers", new=AsyncMock(return_value=CategoryPeers([peer], 1, {}))) as peers, \
         patch.object(nav, "_fetch_nav_history", new=AsyncMock(side_effect=AssertionError("History is already fresh"))) as history:
        asyncio.run(job.main_async(db_session, held_only=True))
        assert db_session.get(NavHistory, (peer.id, today)) is None
        assert "PEER_HISTORY " not in capsys.readouterr().out
        peers.assert_not_awaited()

        asyncio.run(job.main_async(db_session))
        assert db_session.get(NavHistory, (peer.id, today)).nav == Decimal("31")
        assert "PEER_HISTORY failed=0 of 0" in capsys.readouterr().out.splitlines()
        peers.assert_awaited_once()
        history.assert_not_awaited()
        assert amfi.await_count == 2
