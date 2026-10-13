import asyncio
import importlib.util
import logging
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.models.reference import Scheme


def _load_job():
    path = Path(__file__).resolve().parents[2] / "scripts/jobs/refresh_portfolio_disclosures_daily.py"
    assert path.is_file(), "portfolio-disclosure job entrypoint is missing"
    spec = importlib.util.spec_from_file_location("portfolio_disclosure_job", path)
    job = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(job)
    return job


@pytest.mark.parametrize("day", [9, 10, 20])
def test_job_commits_steps_logs_counts_and_gates_alerts(db_session, monkeypatch, caplog, day):
    job = _load_job()
    calls = []
    today = date(2026, 10, day)

    class Today(date):
        @classmethod
        def today(cls):
            return today

    commit = db_session.commit

    def recorded_commit():
        calls.append("commit")
        commit()

    def queue(db, when):
        assert db is db_session and when == today
        calls.append("queue")

    async def refresh(db, when):
        assert db is db_session and when == today
        assert asyncio.get_running_loop().is_running()
        calls.append("refresh")
        return SimpleNamespace(success=False, amcs_processed=41, amcs_failed=1,
                               amcs_not_onboarded=0, schemes_written=123, seconds=0.4)

    def prune(db, when):
        assert db is db_session and when == today
        calls.append("prune")
        return 7

    def summary(db, when):
        assert when == today
        calls.append("manual_summary")
        return {"B AMC": 2, "A AMC": 1, "Empty AMC": 0}

    def missing(db, when):
        assert when == today
        calls.append("monthly_summary")
        return ["Missing AMC"]

    alerts = []
    monkeypatch.setattr(job, "date", Today)
    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(db_session, "commit", recorded_commit)
    monkeypatch.setattr(job, "ensure_manual_queue_rows", queue)
    monkeypatch.setattr(job, "refresh_portfolio_disclosures", refresh)
    monkeypatch.setattr(job, "prune_old_batches", prune)
    monkeypatch.setattr(job, "manual_queue_summary", summary)
    monkeypatch.setattr(job, "monthly_zero_batch_summary", missing)
    monkeypatch.setattr(job, "_alert", lambda *args: alerts.append(args))
    caplog.set_level(logging.INFO)
    job.main()  # An AMC failure is reported, but does not crash the job.
    expected = ["queue", "commit", "refresh", "commit", "prune", "commit"]
    if day in (10, 20):
        expected.append("manual_summary")
        assert alerts[0] == ("ALL", "manual_upload_pending", "A AMC=1, B AMC=2")
    if day == 20:
        expected.append("monthly_summary")
        assert alerts[-1] == ("ALL", "monthly_zero_batch_summary", "Missing AMC")
    assert calls == expected
    assert len(alerts) == (2 if day == 20 else 1 if day == 10 else 0)
    assert "refresh_portfolio_disclosures_daily: success=False amcs_processed=41 amcs_failed=1 amcs_not_onboarded=0 schemes_written=123 pruned=7 seconds=0.4" in caplog.messages


@pytest.mark.parametrize("crash", ["refresh", "prune"])
def test_job_crash_preserves_completed_steps_and_refresh_crash_still_prunes(db_session, monkeypatch, crash):
    job = _load_job()
    calls = []

    def add(code):
        db_session.add(Scheme(amfi_code=code, name=code, amc_name="Job AMC",
                              sebi_category="Equity Scheme - Flexi Cap Fund"))
        db_session.flush()

    def queue(db, today):
        add("QUEUE")

    async def refresh(db, today):
        add("REFRESH")
        if crash == "refresh":
            raise RuntimeError("refresh crash")
        return SimpleNamespace(success=True)

    def prune(db, today):
        calls.append("prune")
        assert db.query(Scheme).filter_by(amfi_code="QUEUE").one()
        add("PRUNE")
        if crash == "prune":
            raise RuntimeError("prune crash")
        return 1

    monkeypatch.setattr(job, "ensure_manual_queue_rows", queue)
    monkeypatch.setattr(job, "refresh_portfolio_disclosures", refresh)
    monkeypatch.setattr(job, "prune_old_batches", prune)
    with pytest.raises(RuntimeError, match=f"{crash} crash"):
        asyncio.run(job.main_async(db_session))
    db_session.rollback()
    assert calls == ["prune"]
    codes = {s.amfi_code for s in db_session.query(Scheme)}
    assert codes == ({"QUEUE", "PRUNE"} if crash == "refresh" else {"QUEUE", "REFRESH"})
