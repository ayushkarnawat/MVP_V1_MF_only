"""Registry contract and isolation from the stored legacy benchmark section."""
import asyncio
import importlib
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.models.enums import BenchmarkIndex, BenchmarkReturnType, LEGACY_BENCHMARK_INDICES
from app.models.reference import BenchmarkIndexHistory
from app.services.analytics import nse_indices_client as client
from tests.scripts.test_background_jobs import _load_job


def registry():
    return importlib.import_module("app.services.analytics.benchmark_registry")


def test_legacy_tuple_still_drives_the_old_benchmark_tab_output(db_session):
    from app.services.analytics.benchmark import compute_portfolio_vs_benchmarks
    # Golden old empty-household payload: neither registry growth nor text keys
    # adds a row or changes a field in the stored old section.
    assert asyncio.run(compute_portfolio_vs_benchmarks(db_session, [])).model_dump(mode="json") == {
        "portfolio_xirr": None,
        "benchmarks": [{"index": k.value, "xirr": None} for k in LEGACY_BENCHMARK_INDICES],
        "windows": [],
    }
    assert {k.value for k in BenchmarkIndex} <= {s.key for s in registry().INDICES}


def test_new_index_with_empty_response_is_a_failure_not_zero_rows(db_session, monkeypatch, caplog):
    spec = registry().get_index("nifty500_multicap_50_25_25")
    monkeypatch.setattr(client, "_fetch_tri_history", AsyncMock(return_value=[]))
    assert not asyncio.run(client.ensure_index_history_fresh(
        db_session, spec.key, date(2020, 1, 1), date(2026, 10, 30), return_type=BenchmarkReturnType.TRI))
    assert "BENCHMARK_ALERT index=nifty500_multicap_50_25_25 reason=empty_response" in caplog.text
    assert db_session.query(BenchmarkIndexHistory).count() == 0


@pytest.mark.parametrize("endpoint,field", [("tri", "Index Name"), ("price", "INDEX_NAME")])
def test_echoed_index_name_is_validated(db_session, monkeypatch, endpoint, field):
    import httpx
    key = "nifty500_multicap_50_25_25"
    spec = registry().get_index(key)
    entry = {"Index Name": "", "INDEX_NAME": "", field: "Nifty 50", "Date": "30 Oct 2026",
             "HistoricalDate": "30 Oct 2026", "TotalReturnsIndex": "123.45", "CLOSE": "123.45"}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=[entry]))
    original = httpx.AsyncClient
    monkeypatch.setattr(client.httpx, "AsyncClient", lambda **kw: original(transport=transport, **kw))
    fetch = client._fetch_tri_history if endpoint == "tri" else client._fetch_index_history
    with pytest.raises(ValueError, match="index name"):
        asyncio.run(fetch(key, date(2026, 10, 1), date(2026, 10, 31)))
    entry[field] = spec.nse_name
    assert asyncio.run(fetch(key, date(2026, 10, 1), date(2026, 10, 31))) == [(date(2026, 10, 30), Decimal("123.45"))]


def test_daily_job_fetches_tri_only_for_new_keys(db_session, monkeypatch):
    from app.models.reference import BenchmarkIndexMaster
    spec = registry().get_index("nifty500_multicap_50_25_25")
    db_session.add(BenchmarkIndexMaster(**spec.__dict__))
    db_session.commit()
    job = _load_job("refresh_benchmark_daily")
    fetch = AsyncMock(return_value=True)
    monkeypatch.setattr(job, "ensure_index_history_fresh", fetch)
    asyncio.run(job.main_async(db_session))
    calls = fetch.await_args_list
    assert [(c.args[1], c.kwargs["return_type"]) for c in calls if c.args[1] == spec.key] == [(spec.key, BenchmarkReturnType.TRI)]
    assert sum(c.args[1] in set(BenchmarkIndex) for c in calls) == 16


def test_arbitrage_price_endpoint_is_stored_as_tri(db_session, monkeypatch):
    key = "nifty_50_arbitrage"
    assert registry().get_index(key).source == "price_endpoint_verified"
    price = AsyncMock(return_value=[(date(2026, 10, 30), Decimal("2745.420123"))])
    tri = AsyncMock(side_effect=AssertionError("wrong endpoint"))
    monkeypatch.setattr(client, "_fetch_index_history", price)
    monkeypatch.setattr(client, "_fetch_tri_history", tri)
    assert asyncio.run(client.ensure_index_history_fresh(db_session, key, date(2026, 10, 1), date(2026, 10, 30), return_type=BenchmarkReturnType.TRI))
    row = db_session.query(BenchmarkIndexHistory).one()
    assert (row.index_name, row.return_type, row.value) == (key, BenchmarkReturnType.TRI, Decimal("2745.420123"))


def test_index_with_no_history_gives_null_xirr_for_that_row_only(db_session):
    from app.services.fund_page.returns import _benchmark_xirr, _tri_levels
    from app.services.analytics.schemas import FundBenchmarkRow, ValuationIndex
    registry().get_index("nifty500_multicap_50_25_25")
    db_session.add_all([BenchmarkIndexHistory(index_name="nifty_50", date=date(y, 10, 30),
        return_type=BenchmarkReturnType.TRI, value=Decimal(v)) for y, v in [(2025, "100"), (2026, "110")]])
    db_session.commit()
    flows = [(date(2025, 10, 30), Decimal("-1000"))]
    assert _benchmark_xirr(_tri_levels(db_session, "nifty500_multicap_50_25_25", date(2026, 10, 30)), flows, date(2026, 10, 30)) is None
    assert abs(_benchmark_xirr(_tri_levels(db_session, "nifty_50", date(2026, 10, 30)), flows, date(2026, 10, 30)) - Decimal("0.1")) < Decimal("0.000001")
    assert FundBenchmarkRow(scheme_id="a", scheme_name="Fund", fund_xirr=None, benchmark_xirr=None).benchmark_index is None
    assert ValuationIndex(index_name="nifty500_multicap_50_25_25", pe_ratio=None, pb_ratio=None, pe_as_of=None, pb_as_of=None, pe_delta_pct=None, pb_delta_pct=None).index_name == "nifty500_multicap_50_25_25"


def test_daily_job_uses_the_master_endpoint_name_and_source(db_session, monkeypatch):
    import httpx
    from app.models.reference import BenchmarkIndexMaster
    # A registry row can be added/corrected without another migration. Fetch
    # identity and endpoint must both come from that row, not a stale map.
    db_session.add(BenchmarkIndexMaster(key="reviewed_new_series", nse_name="Reviewed Index",
        family="money_market", source="price_endpoint_verified", active=False))
    db_session.commit()
    calls = []
    def response(request):
        calls.append(request)
        return httpx.Response(200, json=[{"INDEX_NAME": "Reviewed Index", "Index Name": "",
            "HistoricalDate": "30 Oct 2026", "CLOSE": "100.123456"}])
    original = httpx.AsyncClient
    transport = httpx.MockTransport(response)
    monkeypatch.setattr(client.httpx, "AsyncClient", lambda **kw: original(transport=transport, **kw))
    assert asyncio.run(client.ensure_index_history_fresh(db_session, "reviewed_new_series", date(2026, 10, 1), date(2026, 10, 30), return_type=BenchmarkReturnType.TRI))
    assert str(calls[0].url) == client.NSE_INDICES_URL
    assert db_session.query(BenchmarkIndexHistory).one().return_type == BenchmarkReturnType.TRI


@pytest.mark.parametrize("level", ["0", "-1", "NaN", "Infinity", 1.25, True])
def test_unusable_level_never_reaches_history(db_session, monkeypatch, level):
    import httpx
    key = "nifty500_multicap_50_25_25"
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=[{
        "Index Name": registry().get_index(key).nse_name, "Date": "30 Oct 2026", "TotalReturnsIndex": level}]))
    original = httpx.AsyncClient
    monkeypatch.setattr(client.httpx, "AsyncClient", lambda **kw: original(transport=transport, **kw))
    assert not asyncio.run(client.ensure_index_history_fresh(db_session, key, date(2026, 10, 1), date(2026, 10, 30), return_type=BenchmarkReturnType.TRI))
    assert db_session.query(BenchmarkIndexHistory).count() == 0
