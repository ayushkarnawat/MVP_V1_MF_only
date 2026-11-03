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


# ---- W8: the 56 indices verified on 3 Nov 2026 -------------------------------------------------

# NSE spelling exactly as in Docs/orchestration/2026-11-03-benchmark-index-verification.md.
NEWLY_VERIFIED = (
    "NIFTY AUTO", "NIFTY FMCG", "NIFTY METAL", "NIFTY REALTY", "NIFTY MEDIA", "NIFTY PSU BANK", "NIFTY MNC",
    "NIFTY PHARMA", "NIFTY COMMODITIES", "NIFTY INDIA DEFENCE", "NIFTY CAPITAL MARKETS", "NIFTY HOUSING",
    "NIFTY CORE HOUSING", "NIFTY TRANSPORTATION & LOGISTICS", "NIFTY MIDSMALL INDIA CONSUMPTION",
    "NIFTY INDIA NEW AGE CONSUMPTION", "NIFTY EV & NEW AGE AUTOMOTIVE", "NIFTY REITS & REALTY",
    "NIFTY INDIA RAILWAYS PSU", "NIFTY500 HEALTHCARE", "NIFTY MIDSMALL HEALTHCARE",
    "NIFTY200 QUALITY 30", "NIFTY100 QUALITY 30", "NIFTY500 QUALITY 50", "NIFTY MIDCAP150 QUALITY 50",
    "NIFTY SMALLCAP250 QUALITY 50", "NIFTY500 VALUE 50", "NIFTY200 VALUE 30", "NIFTY50 VALUE 20",
    "NIFTY200 MOMENTUM 30", "NIFTY500 MOMENTUM 50", "NIFTY MIDCAP150 MOMENTUM 50", "NIFTY ALPHA 50",
    "NIFTY100 ALPHA 30", "NIFTY200 ALPHA 30", "NIFTY LOW VOLATILITY 50", "NIFTY100 LOW VOLATILITY 30",
    "NIFTY500 LOW VOLATILITY 50", "NIFTY DIVIDEND OPPORTUNITIES 50", "NIFTY500 FLEXICAP QUALITY 30",
    "NIFTY500 MULTIFACTOR MQVLV 50", "NIFTY500 MULTICAP MOMENTUM QUALITY 50",
    "NIFTY TOTAL MARKET MOMENTUM QUALITY 50", "NIFTY MIDSMALLCAP400 MOMENTUM QUALITY 100",
    "NIFTY50 EQUAL WEIGHT", "NIFTY100 EQUAL WEIGHT", "NIFTY500 EQUAL WEIGHT", "NIFTY TOP 20 EQUAL WEIGHT",
    "NIFTY500 LARGEMIDSMALL EQUAL-CAP WEIGHTED", "NIFTY SMALLCAP 500",
    "NIFTY500 MULTICAP INDIA MANUFACTURING 50:30:20", "NIFTY500 MULTICAP INFRASTRUCTURE 50:30:20",
    "NIFTY100 ESG", "NIFTY100 ENHANCED ESG", "NIFTY100 ESG SECTOR LEADERS", "NIFTY500 SHARIAH",
)
EXISTING_23 = (
    "nifty_50", "nifty_500", "nifty_largemidcap_250", "nifty_midcap_150", "nifty_next_50", "nifty_smallcap_250",
    "nifty_100", "nifty_200", "nifty_bank", "nifty_it", "nifty_financial_services", "nifty_india_consumption",
    "nifty_india_manufacturing", "nifty_energy", "nifty_total_market", "nifty_private_bank", "nifty_infrastructure",
    "nifty_midcap_100", "nifty_smallcap_100", "nifty_smallcap_50", "nifty500_multicap_50_25_25",
    "nifty_50_arbitrage", "nifty_1d_rate",
)


def test_registry_counts_23_existing_plus_56_new_all_unique():
    from app.services.analytics.benchmark_names import canonical_index_name
    indices = registry().INDICES
    assert len(NEWLY_VERIFIED) == 56 and len(EXISTING_23) == 23
    assert len(indices) == 23 + 56
    assert [s.key for s in indices[:23]] == list(EXISTING_23)   # the existing rows keep their place and values
    assert len({s.key for s in indices}) == len(indices)
    assert len({s.nse_name.casefold() for s in indices}) == len(indices)
    # Two names that differ only by spacing, case or punctuation would resolve to one printed-name key.
    assert len({canonical_index_name(s.nse_name) for s in indices}) == len(indices)


def test_the_56_new_rows_are_active_equity_total_return_with_nses_exact_names():
    new = registry().INDICES[23:]
    assert [s.nse_name for s in new] == list(NEWLY_VERIFIED)
    assert all((s.family, s.source, s.return_type, s.active) == ("equity", "tri_endpoint", "tri", True) for s in new)
    assert all(s.key == s.key.lower() and s.key.replace("_", "").isalnum() for s in new)
    # Active registered indices: the 22 active existing rows (all but the 1D Rate) plus the 56 new ones.
    assert sum(s.active for s in registry().INDICES) == 22 + 56
    assert sum(s.family == "equity" and s.active for s in registry().INDICES) == 21 + 56


def test_the_legacy_eight_enum_keys_and_their_rows_are_untouched():
    legacy = {k.value: registry().get_index(k.value) for k in BenchmarkIndex}
    assert len(legacy) == 8 and all(s.family == "equity" and s.active for s in legacy.values())
    assert registry().index_label("nifty_largemidcap_250") == "Nifty LargeMidcap 250"


def test_a_new_index_is_fetched_by_its_exact_name_from_the_total_return_endpoint(db_session, monkeypatch):
    import json
    import httpx
    bodies = []

    def answer(request):
        bodies.append((str(request.url), json.loads(json.loads(request.content)["cinfo"])))
        return httpx.Response(200, json=[{"Index Name": "nifty200 quality 30", "Date": "30 Oct 2026", "TotalReturnsIndex": "1234.5"}])
    original = httpx.AsyncClient
    transport = httpx.MockTransport(answer)
    monkeypatch.setattr(client.httpx, "AsyncClient", lambda **kw: original(transport=transport, **kw))
    assert asyncio.run(client.ensure_index_history_fresh(
        db_session, "nifty200_quality_30", date(2026, 10, 1), date(2026, 10, 30), return_type=BenchmarkReturnType.TRI))
    url, cinfo = bodies[0]
    assert url == client.NSE_TRI_URL and cinfo["name"] == cinfo["indexName"] == "NIFTY200 QUALITY 30"
    row = db_session.query(BenchmarkIndexHistory).one()
    assert (row.index_name, row.return_type, row.value) == ("nifty200_quality_30", BenchmarkReturnType.TRI, Decimal("1234.5"))


def test_daily_job_fetches_every_registry_row_once_the_56_are_added(db_session, monkeypatch):
    job = _load_job("refresh_benchmark_daily")
    fetch = AsyncMock(return_value=True)
    monkeypatch.setattr(job, "ensure_index_history_fresh", fetch)
    asyncio.run(job.main_async(db_session))
    calls = [(c.args[1], c.kwargs["return_type"]) for c in fetch.await_args_list]
    enum_calls = [c for c in calls if c[0] in set(BenchmarkIndex)]
    other = [c for c in calls if c[0] not in set(BenchmarkIndex)]
    assert len(enum_calls) == 16                      # price and TRI for the eight enum indices, as before
    assert len(other) == 23 + 56 - 8                  # one TRI fetch per remaining registry row, the 56 included
    assert all(kind is BenchmarkReturnType.TRI for _, kind in other)
    assert len(calls) == 87
    assert {key for key, _ in other} >= {s.key for s in registry().INDICES[23:]}


def test_one_new_index_with_an_empty_or_failed_fetch_alerts_and_never_stops_the_others(db_session, monkeypatch, caplog):
    import json
    import logging
    import httpx
    job = _load_job("refresh_benchmark_daily")
    monkeypatch.setattr(client, "_fetched_from", {})
    today = date.today().strftime("%d %b %Y")

    def answer(request):
        name = json.loads(json.loads(request.content)["cinfo"])["name"]
        if name == "NIFTY AUTO":
            return httpx.Response(200, json=[])                  # empty: alert empty_response
        if name == "NIFTY FMCG":
            return httpx.Response(500)                           # broken: alert fetch_failed
        if str(request.url) == client.NSE_TRI_URL:
            return httpx.Response(200, json=[{"Index Name": name, "Date": today, "TotalReturnsIndex": "100.5"}])
        return httpx.Response(200, json=[{"INDEX_NAME": name, "HistoricalDate": today, "CLOSE": "100.5"}])
    original = httpx.AsyncClient
    transport = httpx.MockTransport(answer)
    monkeypatch.setattr(client.httpx, "AsyncClient", lambda **kw: original(transport=transport, **kw))
    caplog.set_level(logging.INFO)
    asyncio.run(job.main_async(db_session))
    assert "BENCHMARK_ALERT index=nifty_auto reason=empty_response" in caplog.text
    assert "BENCHMARK_ALERT index=nifty_fmcg reason=fetch_failed" in caplog.text
    assert caplog.text.count("BENCHMARK_ALERT") == 2             # nothing else alerted
    stored = {getattr(v, "value", v) for (v,) in db_session.query(BenchmarkIndexHistory.index_name).distinct()}
    assert not stored & {"nifty_auto", "nifty_fmcg"}
    assert {"nifty_pharma", "nifty200_quality_30", "nifty500_shariah", "nifty_bank", "nifty_50"} <= stored
    assert len(stored) == 23 + 56 - 2                             # every registry row except the two broken ones
    assert "refresh_benchmark_daily: fetches=87 succeeded=85 success=False" in caplog.messages
