import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock


def test_market_cap_job_commits_and_logs_result(db_session, monkeypatch, caplog):
    from scripts.jobs import refresh_market_cap_half_yearly as job
    refresh = AsyncMock(return_value=SimpleNamespace(success=True, rows_written=5427, periods_loaded=[1], periods_failed=[], seconds=1.2))
    monkeypatch.setattr(job, "refresh_market_cap", refresh)
    with caplog.at_level("INFO"):
        asyncio.run(job.main_async(db_session))
    refresh.assert_awaited_once_with(db_session)
    assert "rows=5427" in caplog.text


def test_market_cap_schedule_before_recompute():
    text = (Path(__file__).resolve().parents[3] / "infra/modules/scheduler/main.tf").read_text()
    assert 'market_cap_half_yearly = {' in text
    section = text.split('market_cap_half_yearly = {')[1].split('}')[0]
    assert 'cron(45 5 1-15 1,7 ? *)' in section
    assert 'scripts/jobs/refresh_market_cap_half_yearly.py' in section


def test_market_cap_job_exit_code_reflects_failure(db_session, monkeypatch):
    """A failed period must make the task exit non-zero so a task-failure signal exists, not only a log line."""
    from scripts.jobs import refresh_market_cap_half_yearly as job
    for success, code in ((True, 0), (False, 1)):
        refresh = AsyncMock(return_value=SimpleNamespace(success=success, rows_written=0, periods_loaded=[], periods_failed=[] if success else [1], seconds=0.1))
        monkeypatch.setattr(job, "refresh_market_cap", refresh)
        assert asyncio.run(job.main_async(db_session)) == code
