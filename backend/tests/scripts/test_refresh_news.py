import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import pytest

from tests.scripts.test_background_jobs import _load_job
from app.config import settings
from app.models.news import NewsItem
from app.services.news.ingest import IngestStats, RawArticle

NOW = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)


def _article(title: str = "Sensex ends flat as investors await RBI policy", *, url: str = "https://www.moneycontrol.com/a") -> RawArticle:
    return RawArticle(url=url, title=title, domain="moneycontrol.com", source="Moneycontrol",
                       published_at=NOW, origin="indian")


@pytest.fixture(autouse=True)
def _news_enabled(monkeypatch):
    monkeypatch.setattr(settings, "news_enabled", True)
    monkeypatch.setattr(settings, "healthcheck_news_url", "https://hc-ping.com/test-uuid")
    monkeypatch.setattr(settings, "news_disabled_sources", "")


def test_kill_switch_skips_ingest_and_ping(db_session, monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(settings, "news_enabled", False)
    ingest = AsyncMock()
    ping = AsyncMock()
    monkeypatch.setattr(job, "ingest_window", ingest)
    monkeypatch.setattr(job, "_ping", ping)
    assert asyncio.run(job.main_async(db_session)) == 0
    ingest.assert_not_called()
    ping.assert_not_called()


def test_success_path_pings_exactly_once_and_inserts(db_session, monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([_article()], IngestStats(files_ok=1, rows_seen=1, rows_kept=1))))
    ping = Mock()
    monkeypatch.setattr(job, "_ping", ping)
    assert asyncio.run(job.main_async(db_session)) == 0
    ping.assert_called_once_with("https://hc-ping.com/test-uuid")
    assert db_session.query(NewsItem).count() == 1


def test_files_ok_zero_exits_1_with_no_ping(db_session, monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([], IngestStats(files_ok=0, files_missing=5))))
    ping = AsyncMock()
    monkeypatch.setattr(job, "_ping", ping)
    assert asyncio.run(job.main_async(db_session)) == 1
    ping.assert_not_called()


def test_exception_exits_1_with_no_ping_and_rolled_back_session(db_session, monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(side_effect=RuntimeError("boom")))
    ping = AsyncMock()
    monkeypatch.setattr(job, "_ping", ping)
    rollback_called = []
    monkeypatch.setattr(db_session, "rollback", lambda: rollback_called.append(True))
    assert asyncio.run(job.main_async(db_session)) == 1
    ping.assert_not_called()
    assert rollback_called == [True]


def test_partial_failure_exits_0_and_pings(db_session, monkeypatch, caplog):
    job = _load_job("refresh_news")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([_article()], IngestStats(files_ok=4, files_missing=1, files_failed=1, rows_seen=1, rows_kept=1))))
    ping = Mock()
    monkeypatch.setattr(job, "_ping", ping)
    with caplog.at_level("WARNING"):
        assert asyncio.run(job.main_async(db_session)) == 0
    ping.assert_called_once()
    assert any("partial failure" in record.message for record in caplog.records)


def test_empty_url_does_not_call_ping(db_session, monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(settings, "healthcheck_news_url", "")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([_article()], IngestStats(files_ok=1, rows_seen=1, rows_kept=1))))
    ping = AsyncMock()
    monkeypatch.setattr(job, "_ping", ping)
    assert asyncio.run(job.main_async(db_session)) == 0
    ping.assert_not_called()


def test_a_ping_that_raises_still_exits_0(db_session, monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([_article()], IngestStats(files_ok=1, rows_seen=1, rows_kept=1))))
    monkeypatch.setattr(job, "_ping", lambda url: (_ for _ in ()).throw(RuntimeError("ping down")))
    assert asyncio.run(job.main_async(db_session)) == 0


def test_purge_removes_a_15_day_old_row_and_keeps_a_13_day_old_one(db_session, monkeypatch):
    job = _load_job("refresh_news")
    import uuid
    old = NewsItem(id=uuid.uuid4(), source="Mint", title="Old item", url="https://www.livemint.com/old",
                    published_at=NOW - timedelta(days=15), ingested_at=NOW - timedelta(days=15), tier=7)
    kept = NewsItem(id=uuid.uuid4(), source="Mint", title="Kept item", url="https://www.livemint.com/kept",
                     published_at=NOW - timedelta(days=13), ingested_at=NOW - timedelta(days=13), tier=7)
    db_session.add_all([old, kept])
    db_session.commit()
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([], IngestStats(files_ok=1))))
    monkeypatch.setattr(job, "_ping", Mock())

    class _FixedNow(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW

    monkeypatch.setattr(job, "datetime", _FixedNow)
    assert asyncio.run(job.main_async(db_session)) == 0
    remaining = {item.url for item in db_session.query(NewsItem).all()}
    assert remaining == {"https://www.livemint.com/kept"}


def test_dry_run_leaves_news_items_empty(db_session, monkeypatch, capsys):
    job = _load_job("refresh_news")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([_article()], IngestStats(files_ok=1, rows_seen=1, rows_kept=1))))
    ping = Mock()
    monkeypatch.setattr(job, "_ping", ping)
    assert asyncio.run(job.main_async(db_session, dry_run=True)) == 0
    assert db_session.query(NewsItem).count() == 0
    ping.assert_not_called()
    out = capsys.readouterr().out
    assert "dry_run: articles=1" in out


def test_running_twice_inserts_each_article_once(db_session, monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([_article()], IngestStats(files_ok=1, rows_seen=1, rows_kept=1))))
    monkeypatch.setattr(job, "_ping", Mock())
    assert asyncio.run(job.main_async(db_session)) == 0
    assert asyncio.run(job.main_async(db_session)) == 0
    assert db_session.query(NewsItem).count() == 1


def test_crontab_has_exactly_the_two_news_lines_and_avoids_the_windows():
    crontab = (Path(__file__).resolve().parents[3] / "deploy" / "leapswitch" / "crontab.leapswitch").read_text()
    lines = [line for line in crontab.splitlines() if "refresh_news.py" in line]
    assert len(lines) == 2
    assert any(line.startswith("15 7,10,13,16,19,22") and "news-refresh " in line and "--hours 5" in line
               for line in lines)
    assert any(line.startswith("30 23") and "news-refresh-catchup" in line and "--hours 26" in line
               for line in lines)
    for line in lines:
        minute, hours = line.split()[:2]
        assert minute != "*"
        minute = int(minute)
        for hour in (h for h in hours.split(",") if h != "*"):
            hour = int(hour)
            in_batch_window = (hour == 5 and minute >= 40) or (hour == 6 and minute <= 35)
            assert not in_batch_window, f"{line!r} falls inside the 05:40-06:35 batch window"
            assert (hour, minute) != (8, 0), f"{line!r} collides with delete-expired-accounts-daily"
            assert (hour, minute) != (19, 0), f"{line!r} collides with cas-file-expiry-daily"


def test_disabled_sources_config_is_case_insensitive(monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(settings, "news_disabled_sources", " MoneyControl.COM , ,Reuters.com")
    assert job._disabled_sources() == {"moneycontrol.com", "reuters.com"}


def _last_success(db_session):
    from app.models.news import JobRun

    row = db_session.get(JobRun, "refresh_news")
    if row is None:
        return None
    value = row.last_success_at
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def test_duplicates_only_run_still_records_last_success(db_session, monkeypatch):
    from app.models.news import JobRun

    job = _load_job("refresh_news")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([_article()], IngestStats(files_ok=1, rows_seen=1, rows_kept=1))))
    monkeypatch.setattr(job, "_ping", Mock())
    assert asyncio.run(job.main_async(db_session)) == 0
    first = _last_success(db_session)
    assert first is not None
    # Age the stored value and re-run with the same (duplicate) article: nothing is inserted,
    # yet the success time must advance.
    db_session.get(JobRun, "refresh_news").last_success_at = first - timedelta(hours=40)
    db_session.commit()
    assert asyncio.run(job.main_async(db_session)) == 0
    assert db_session.query(NewsItem).count() == 1
    assert _last_success(db_session) > first - timedelta(hours=1)


def test_success_recorded_even_when_healthcheck_url_unset(db_session, monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(settings, "healthcheck_news_url", "")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([], IngestStats(files_ok=1))))
    assert asyncio.run(job.main_async(db_session)) == 0
    assert _last_success(db_session) is not None


def test_failed_runs_do_not_record_last_success(db_session, monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(job, "_ping", Mock())
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([], IngestStats(files_ok=0, files_missing=5))))
    assert asyncio.run(job.main_async(db_session)) == 1
    assert _last_success(db_session) is None
    monkeypatch.setattr(job, "ingest_window", AsyncMock(side_effect=RuntimeError("boom")))
    assert asyncio.run(job.main_async(db_session)) == 1
    assert _last_success(db_session) is None


def test_dry_run_and_kill_switch_do_not_record_last_success(db_session, monkeypatch):
    job = _load_job("refresh_news")
    monkeypatch.setattr(job, "ingest_window", AsyncMock(return_value=([_article()], IngestStats(files_ok=1))))
    assert asyncio.run(job.main_async(db_session, dry_run=True)) == 0
    assert _last_success(db_session) is None
    monkeypatch.setattr(settings, "news_enabled", False)
    assert asyncio.run(job.main_async(db_session)) == 0
    assert _last_success(db_session) is None
