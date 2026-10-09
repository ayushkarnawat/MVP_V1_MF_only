import asyncio
from unittest.mock import AsyncMock

from app.services.analytics.amfi_factsheet_client import FundManagerRefreshResult


def test_monthly_job_reports_refresh_outcome(monkeypatch, caplog, db_session):
    from scripts.jobs import refresh_fund_managers_monthly as job
    monkeypatch.setattr(job, "refresh_fund_managers", AsyncMock(return_value=FundManagerRefreshResult(
        success=True, amcs_processed=1, amcs_failed=1, schemes_matched=75, schemes_unmatched=1,
    )))
    caplog.set_level("INFO")
    asyncio.run(job.main_async(db_session))
    assert "success=True amcs_processed=1 amcs_failed=1 schemes_matched=75 schemes_unmatched=1" in caplog.text
