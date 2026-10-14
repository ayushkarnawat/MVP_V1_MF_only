import asyncio
import re
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from tests.scripts.test_background_jobs import _load_job
from app.services.analytics.stock_fundamentals_client import StockFundamentalsRefreshResult


@pytest.mark.parametrize('stock_ok,index_ok,code', [(True, False, 0), (False, True, 1), (True, True, 0)])
def test_stock_job_pipelines_are_independent(db_session, monkeypatch, stock_ok, index_ok, code):
    job = _load_job('refresh_stock_fundamentals_daily')
    stocks = AsyncMock(return_value=StockFundamentalsRefreshResult(stock_ok, rows_written=int(stock_ok)))
    indices = AsyncMock(return_value=index_ok)
    monkeypatch.setattr(job, 'refresh_stock_fundamentals', stocks)
    monkeypatch.setattr(job, 'refresh_index_valuations', indices)
    assert asyncio.run(job.main_async(db_session)) == code
    stocks.assert_awaited_once_with(db_session); indices.assert_awaited_once_with(db_session)


def test_stock_job_exception_still_refreshes_indices_and_exits_nonzero(db_session, monkeypatch):
    job = _load_job('refresh_stock_fundamentals_daily')
    monkeypatch.setattr(job, 'refresh_stock_fundamentals', AsyncMock(side_effect=RuntimeError('offline failure')))
    indices = AsyncMock(return_value=True)
    monkeypatch.setattr(job, 'refresh_index_valuations', indices)
    monkeypatch.setattr(job, 'SessionLocal', lambda: db_session)
    with pytest.raises(SystemExit) as exc:
        job.main()
    assert exc.value.code == 1
    indices.assert_awaited_once()


def test_stock_scheduler_precedes_analytics_recompute():
    path = Path(__file__).resolve().parents[3] / 'infra/modules/scheduler/main.tf'
    text = path.read_text(encoding='utf-8')
    def entry(name):
        return re.search(r'\b'+name+r' = \{(.*?)\n    \}', text, re.S).group(1)
    def minutes(name):
        match = re.search(r'cron\((\d+) (\d+) ', entry(name))
        return int(match[2])*60+int(match[1])
    assert minutes('stock_fundamentals_daily') == minutes('portfolio_disclosures_daily') == 345
    assert minutes('analytics_recompute_daily') == 390
    assert 'memory              = "2048"' in entry('stock_fundamentals_daily')
