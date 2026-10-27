"""L17: idempotent, NULL-only fill of stock_master.nse_symbol from the NSE equity list (no live network)."""
import asyncio
from datetime import date
from pathlib import Path

import httpx

from app.models.reference import StockMaster

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "nse" / "EQUITY_L.csv"


def _stock(isin, symbol=None):
    return StockMaster(isin=isin, name=isin, as_of_date=date(2026, 10, 1), source="NSE", nse_symbol=symbol)


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _run(db, handler):
    from app.services.analytics.nse_symbol_fill import fill_nse_symbols

    async def go():
        async with _client(handler) as client:
            return await fill_nse_symbols(db, url="http://nse.test/EQUITY_L.csv", client=client)
    return asyncio.run(go())


def _ok(request):
    return httpx.Response(200, content=FIXTURE.read_bytes())


def test_parse_handles_leading_space_headers_and_skips_blank_isin():
    from app.services.analytics.nse_symbol_fill import parse_equity_list

    assert parse_equity_list(FIXTURE.read_bytes()) == {
        "INE002A01018": "RELIANCE", "INE467B01029": "TCS", "INE009A01021": "INFY",
    }


def test_fills_only_null_rows_matched_on_isin_and_never_overwrites(db_session):
    db_session.add_all([_stock("INE002A01018"), _stock("INE467B01029", "TCS_OLD"), _stock("INE000000000")])
    db_session.commit()

    result = _run(db_session, _ok)

    assert result.success and result.updated == 1 and result.already_set == 1 and result.unmatched == 1
    db_session.expire_all()
    assert db_session.get(StockMaster, "INE002A01018").nse_symbol == "RELIANCE"
    assert db_session.get(StockMaster, "INE467B01029").nse_symbol == "TCS_OLD"
    assert db_session.get(StockMaster, "INE000000000").nse_symbol is None


def test_second_run_updates_nothing(db_session):
    db_session.add(_stock("INE002A01018"))
    db_session.commit()
    assert _run(db_session, _ok).updated == 1
    assert _run(db_session, _ok).updated == 0


def test_failed_fetch_leaves_rows_null_and_does_not_raise(db_session):
    db_session.add(_stock("INE002A01018"))
    db_session.commit()

    result = _run(db_session, lambda request: httpx.Response(503))

    assert not result.success and result.updated == 0
    assert db_session.get(StockMaster, "INE002A01018").nse_symbol is None


def test_unrecognised_csv_is_a_soft_failure(db_session):
    db_session.add(_stock("INE002A01018"))
    db_session.commit()
    result = _run(db_session, lambda request: httpx.Response(200, content=b"<html>blocked</html>"))
    assert not result.success and result.updated == 0


def test_settings_default_off_and_job_exits_cleanly_when_off(monkeypatch):
    import importlib.util
    from app.config import settings

    assert settings.nse_symbol_fill_enabled is False
    assert settings.nse_symbol_fill_url.endswith("EQUITY_L.csv")
    path = Path(__file__).resolve().parents[3] / "scripts" / "jobs" / "fill_nse_symbols.py"
    spec = importlib.util.spec_from_file_location("fill_nse_symbols", path)
    job = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(job)
    monkeypatch.setattr(settings, "nse_symbol_fill_enabled", False)
    assert job.run(None) == 0
