import asyncio
import importlib.util
import logging
from datetime import date, datetime, timezone
from pathlib import Path

from app.db.session import commit_off_loop
from app.models.enums import BenchmarkIndex, Relationship
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


def test_refresh_nav_daily_passes_only_held_schemes(db_session, monkeypatch, caplog):
    job = _load_job("refresh_nav_daily")
    user = User(phone_number="+910000000101", created_at=datetime.now(timezone.utc))
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(
        user_id=user.id,
        name="Job Test User",
        relationship=Relationship.SELF,
        created_at=datetime.now(timezone.utc),
    )
    held_a, held_b, unheld = _scheme("JOB-NAV-1"), _scheme("JOB-NAV-2"), _scheme("JOB-NAV-3")
    db_session.add_all([member, held_a, held_b, unheld])
    db_session.flush()
    db_session.add_all(
        [
            Folio(household_member_id=member.id, scheme_id=held_a.id, folio_number="NAV-1"),
            Folio(household_member_id=member.id, scheme_id=held_b.id, folio_number="NAV-2"),
            Folio(household_member_id=member.id, scheme_id=held_a.id, folio_number="NAV-3"),
        ]
    )
    db_session.flush()

    received_scheme_ids = []

    async def fake_warm_nav_history(db, schemes):
        assert asyncio.get_running_loop().is_running()
        received_scheme_ids.extend(scheme.id for scheme in schemes)

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "warm_nav_history", fake_warm_nav_history)
    caplog.set_level(logging.INFO)

    job.main()

    assert set(received_scheme_ids) == {held_a.id, held_b.id}
    assert len(received_scheme_ids) == 2
    assert "refresh_nav_daily: held_schemes=2 success=True" in caplog.messages


def test_refresh_ter_monthly_runs_refresh_inside_fresh_event_loop(db_session, monkeypatch, caplog):
    job = _load_job("refresh_ter_monthly")
    calls = []

    async def fake_refresh_ter_data(db):
        assert asyncio.get_running_loop().is_running()
        await commit_off_loop(db)
        calls.append(db)
        return True

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "refresh_ter_data", fake_refresh_ter_data)
    caplog.set_level(logging.INFO)

    job.main()

    assert calls == [db_session]
    assert "refresh_ter_monthly: success=True" in caplog.messages


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


def test_refresh_benchmark_daily_uses_ten_calendar_years_for_every_index(
    db_session, monkeypatch, caplog
):
    job = _load_job("refresh_benchmark_daily")
    calls = []

    class LeapDay(date):
        @classmethod
        def today(cls):
            return cls(2024, 2, 29)

    async def fake_ensure_index_history_fresh(db, index, start_date, end_date):
        assert asyncio.get_running_loop().is_running()
        calls.append((db, index, start_date, end_date))
        return index is not BenchmarkIndex.NIFTY_500

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "date", LeapDay)
    monkeypatch.setattr(job, "ensure_index_history_fresh", fake_ensure_index_history_fresh)
    caplog.set_level(logging.INFO)

    job.main()

    assert [call[1] for call in calls] == list(BenchmarkIndex)
    assert all(call[0] is db_session for call in calls)
    assert all(call[2] == date(2014, 2, 28) for call in calls)
    assert all(call[3] == date(2024, 2, 29) for call in calls)
    assert "refresh_benchmark_daily: indexes=4 succeeded=3 success=False" in caplog.messages


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
