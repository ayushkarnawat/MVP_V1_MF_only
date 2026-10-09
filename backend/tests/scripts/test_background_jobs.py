import asyncio
import importlib.util
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from app.models.enums import BenchmarkIndex, BenchmarkReturnType, Relationship
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.user import HouseholdMember, User


_JOBS_DIR = Path(__file__).resolve().parents[2] / "scripts" / "jobs"


def _load_job(script_name: str):
    path = _JOBS_DIR / f"{script_name}.py"
    assert path.is_file(), f"{script_name} entrypoint is missing"
    spec = importlib.util.spec_from_file_location(script_name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _scheme(code: str) -> Scheme:
    return Scheme(
        amfi_code=code,
        name=f"Scheme {code}",
        amc_name="Test AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )


def test_refresh_nav_daily_warms_held_funds_then_their_category_peers(db_session, monkeypatch, caplog):
    job = _load_job("refresh_nav_daily")
    user = User(phone_number="+910000000101", created_at=datetime.now(timezone.utc))
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(user_id=user.id, name="Job Test User", relationship=Relationship.SELF,
                             created_at=datetime.now(timezone.utc))
    held_a, held_b, unheld, peer = _scheme("JOB-NAV-1"), _scheme("JOB-NAV-2"), _scheme("JOB-NAV-3"), _scheme("JOB-NAV-4")
    db_session.add_all([member, held_a, held_b, unheld, peer])
    db_session.flush()
    db_session.add_all([
        Folio(household_member_id=member.id, scheme_id=held_a.id, folio_number="NAV-1"),
        Folio(household_member_id=member.id, scheme_id=held_b.id, folio_number="NAV-2"),
        Folio(household_member_id=member.id, scheme_id=held_a.id, folio_number="NAV-3"),
    ])
    db_session.flush()

    warmed: list[set] = []
    categories: list[str] = []

    async def fake_warm_nav_history(db, schemes):
        assert asyncio.get_running_loop().is_running()
        warmed.append({scheme.id for scheme in schemes})

    async def fake_peers(db, sebi_category, plan_type):
        # One series per fund (9 Oct): `unheld` is another plan row of a peer fund, so it's
        # not in the peer set and isn't downloaded. A held fund is also its own peer.
        from app.services.analytics.scheme_universe import CategoryPeers
        categories.append((sebi_category, plan_type))
        return CategoryPeers(schemes=[held_a, peer], fund_count=2,
                             representative_of={held_a.id: held_a.id, peer.id: peer.id, unheld.id: peer.id})

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "warm_nav_history", fake_warm_nav_history)
    monkeypatch.setattr(job, "get_category_peers", fake_peers)
    caplog.set_level(logging.INFO)

    job.main()

    assert warmed == [{held_a.id, held_b.id}, {peer.id}]
    assert categories == [("Equity Scheme - Flexi Cap Fund", None)]
    assert "refresh_nav_daily: held_schemes=2 categories=1 peer_schemes=1 success=True" in caplog.messages


def test_refresh_ter_daily_logs_counts_from_a_fresh_event_loop(db_session, monkeypatch, caplog):
    from app.services.analytics.amfi_ter_client import TerRefreshResult

    job = _load_job("refresh_ter_daily")

    async def fake_refresh_ter(db, month=None):
        assert asyncio.get_running_loop().is_running()
        return TerRefreshResult(success=True, month="10-2026", schemes=3, matched=2, no_match=1, new_links=2, seconds=0.4)

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "refresh_ter", fake_refresh_ter)
    caplog.set_level(logging.INFO)

    job.main([])

    assert "refresh_ter_daily: success=True month=10-2026 schemes=3 matched=2 no_match=1 new_links=2 seconds=0.4" in caplog.messages


def test_refresh_aaum_quarterly_logs_expected_refresh_failure(db_session, monkeypatch, caplog):
    job = _load_job("refresh_aaum_quarterly")
    calls = []

    async def fake_refresh_aaum_data(db):
        assert asyncio.get_running_loop().is_running()
        calls.append(db)
        return False

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "refresh_aaum_data", fake_refresh_aaum_data)
    caplog.set_level(logging.INFO)

    job.main()

    assert calls == [db_session]
    assert "refresh_aaum_quarterly: success=False" in caplog.messages


def test_refresh_benchmark_daily_fetches_price_ten_years_and_tri_from_1990(
    db_session, monkeypatch, caplog
):
    job = _load_job("refresh_benchmark_daily")
    calls = []

    class LeapDay(date):
        @classmethod
        def today(cls):
            return cls(2024, 2, 29)

    async def fake_ensure_index_history_fresh(db, index, start_date, end_date, *, return_type, fresh_within):
        assert asyncio.get_running_loop().is_running()
        assert fresh_within == timedelta(0)  # the job downloads every morning (8 Oct)
        calls.append((db, index, return_type, start_date, end_date))
        return index is not BenchmarkIndex.NIFTY_500

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "date", LeapDay)
    monkeypatch.setattr(job, "ensure_index_history_fresh", fake_ensure_index_history_fresh)
    caplog.set_level(logging.INFO)

    job.main()

    assert len(calls) == len(BenchmarkIndex) * 2
    assert {(c[1], c[2]) for c in calls} == {(i, t) for i in BenchmarkIndex for t in BenchmarkReturnType}
    assert all(c[0] is db_session for c in calls)
    # PRICE stays at ten years; TRI fills the full history from 1990.
    assert all(c[3] == date(2014, 2, 28) for c in calls if c[2] is BenchmarkReturnType.PRICE)
    assert all(c[3] == date(1990, 1, 1) for c in calls if c[2] is BenchmarkReturnType.TRI)
    assert all(c[4] == date(2024, 2, 29) for c in calls)
    assert "refresh_benchmark_daily: fetches=8 succeeded=6 success=False" in caplog.messages


def test_delete_expired_accounts_daily_runs_hard_delete_service(db_session, monkeypatch, caplog):
    job = _load_job("delete_expired_accounts_daily")
    calls = []

    def fake_hard_delete_expired_accounts(db):
        calls.append(db)
        return 3

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "hard_delete_expired_accounts", fake_hard_delete_expired_accounts)
    caplog.set_level(logging.INFO)

    job.main()

    assert calls == [db_session]
    assert "delete_expired_accounts_daily: deleted_accounts=3 success=True" in caplog.messages


def test_refresh_scheme_master_daily_calls_refresh_and_logs_counts(db_session, monkeypatch, caplog):
    from types import SimpleNamespace
    job = _load_job("refresh_scheme_master_daily")
    calls = []

    async def refresh(db):
        calls.append(db)
        return SimpleNamespace(inserted=2, updated=3, deactivated=1, rows=5)

    monkeypatch.setattr(job, "refresh_scheme_master", refresh)
    caplog.set_level(logging.INFO)
    asyncio.run(job.main_async(db_session))
    assert calls == [db_session]
    assert "refresh_scheme_master_daily: rows=5 inserted=2 updated=3 deactivated=1" in caplog.messages


def test_refresh_ter_daily_month_argument_is_passed_through(db_session, monkeypatch, caplog):
    from app.services.analytics.amfi_ter_client import TerRefreshResult

    job = _load_job("refresh_ter_daily")
    seen = []

    async def fake_refresh_ter(db, month=None):
        seen.append(month)
        return TerRefreshResult(success=True, month=month or "10-2026")

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "refresh_ter", fake_refresh_ter)
    job.main(["--month", "09-2026"])
    job.main([])
    assert seen == ["09-2026", None]


def test_refresh_nav_daily_keeps_going_when_one_category_fails(db_session, monkeypatch, caplog):
    job = _load_job("refresh_nav_daily")
    user = User(phone_number="+910000000102", created_at=datetime.now(timezone.utc))
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(user_id=user.id, name="Job Test User 2", relationship=Relationship.SELF,
                             created_at=datetime.now(timezone.utc))
    held_a = _scheme("JOB-NAV-21")
    held_b = Scheme(amfi_code="JOB-NAV-22", name="Scheme JOB-NAV-22", amc_name="Test AMC",
                    sebi_category="Debt Scheme - Liquid Fund")
    peer = _scheme("JOB-NAV-23")
    db_session.add_all([member, held_a, held_b, peer])
    db_session.flush()
    db_session.add_all([Folio(household_member_id=member.id, scheme_id=held_a.id, folio_number="NAV-21"),
                        Folio(household_member_id=member.id, scheme_id=held_b.id, folio_number="NAV-22")])
    db_session.flush()
    warmed: list[set] = []

    async def fake_warm(db, schemes):
        warmed.append({s.id for s in schemes})

    rollbacks = []
    monkeypatch.setattr(db_session, "rollback", lambda: rollbacks.append(1))

    async def fake_peers(db, sebi_category, plan_type):
        from app.services.analytics.scheme_universe import CategoryPeers
        if sebi_category == "Debt Scheme - Liquid Fund":
            raise ValueError("NAVAll parse error")
        return CategoryPeers(schemes=[peer], fund_count=1, representative_of={peer.id: peer.id})

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "warm_nav_history", fake_warm)
    monkeypatch.setattr(job, "get_category_peers", fake_peers)
    caplog.set_level(logging.INFO)
    job.main()
    assert warmed[-1] == {peer.id}
    assert rollbacks == [1]  # a failed category leaves the session usable (8 Oct re-review)


def test_refresh_ter_daily_rejects_a_malformed_month():
    import pytest
    job = _load_job("refresh_ter_daily")
    with pytest.raises(SystemExit):
        job.main(["--month", "2026-09"])

