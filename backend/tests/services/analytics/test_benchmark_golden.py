"""Hand spreadsheet: 1 + 1 + 1 - 1 index units, ending with two units.

All dates below are exactly 365 days apart. Levels: 100,110,121,133.10,
146.41,161.051. Purchases 100,110,121 buy one unit each; sale 133.10 sells
one. Fund closing value = 2*161.051 = 322.102 -> 322.10. Two such funds
in the portfolio close at 644.204 -> 644.20. Every valid window earns 10%.
No live data, no spreadsheet function reused as the oracle.
"""
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
import importlib
import uuid

import pytest
from app.models.enums import TransactionOrigin, TransactionType
from app.services.analytics.benchmark_windows import IndexLevels, WindowContext
from app.services.analytics.schemas import FundBenchmarkRow, FundWindowXirr
from app.services.fund_page.benchmark_select import BenchmarkChoice

D = Decimal
START = date(2020, 1, 1)
DATES = [START + timedelta(days=365*n) for n in range(6)]
LEVELS = IndexLevels(DATES, list(map(D, ["100", "110", "121", "133.10", "146.41", "161.051"])))
FLOWS = list(zip(DATES[:4], map(D, ["-100", "-110", "-121", "133.10"])))


def replay(*args, **kwargs):
    from app.services.analytics.benchmark_windows import audited_index_replay
    return audited_index_replay(*args, **kwargs)


@pytest.mark.parametrize("scale,closing", [(D("1"), D("322.10")), (D("2"), D("644.20"))])
def test_three_purchases_and_a_sale_match_the_spreadsheet_to_the_paisa_for_portfolio_and_fund_for_each_window_and_since_inception(scale, closing):
    for window, index, opening in [("SI", None, None), ("5Y", 0, D("100")), ("3Y", 2, D("363")), ("1Y", 4, D("292.82"))]:
        start = DATES[index] if index is not None else None
        flows = [(day, value*scale) for day,value in FLOWS if start is None or day > start]
        result = replay(LEVELS, flows, start, opening*scale if opening is not None else None, DATES[-1])
        assert result.reason is None
        assert result.closing_value.quantize(D("0.01")) == closing
        assert abs(result.rate - D("0.1")) < D("1e-8")


def test_legacy_and_window_solvers_agree_within_1e_8():
    from app.services.analytics.benchmark_windows import index_window_xirr
    from app.services.analytics.xirr_fast import xirr_fast
    old = index_window_xirr(LEVELS, FLOWS, None, None, DATES[-1])
    fast = index_window_xirr(LEVELS, FLOWS, None, None, DATES[-1], xirr_fast)
    result = replay(LEVELS, FLOWS, None, None, DATES[-1])
    assert abs(old-fast) < D("1e-8") and abs(old-result.rate) < D("1e-8")


def comparison(transactions, *, current="100", start=START):
    from app.services.analytics.benchmark import compute_fund_vs_declared_benchmark
    sid = uuid.uuid4()
    old = FundBenchmarkRow(scheme_id=str(sid),scheme_name="Fund",benchmark_index="nifty_500",fund_xirr="0.1",benchmark_xirr="0.1",
        windows=[FundWindowXirr(window=w, fund_xirr="0.1", benchmark_xirr="0.1") for w in ("1Y","3Y","5Y","SI")])
    ctx = WindowContext(DATES[-1], {w: start if w != "SI" else None for w in ("1Y","3Y","5Y","SI")}, {}, {w: {sid:D("100")} for w in ("1Y","3Y","5Y","SI")})
    return compute_fund_vs_declared_benchmark(ctx, {"nifty_500": LEVELS}, {sid:BenchmarkChoice("nifty_500","factsheet")}, {sid:transactions}, {str(sid):D(current)}, {sid:SimpleNamespace(name="Fund")}, [old])[0]


def test_opening_balance_inside_a_window_shows_unavailable_with_a_reason():
    txn = SimpleNamespace(date=DATES[1],type=TransactionType.PURCHASE,origin=TransactionOrigin.CAS_OPENING,amount=D("100"),stamp_duty=D("0"))
    row = comparison([txn])
    for window in row.windows[:3]:
        assert window.benchmark_xirr is None and window.reason


def test_oversold_replay_case_is_handled():
    result = replay(LEVELS, [(DATES[0],D("-100")),(DATES[1],D("999"))], None, None, DATES[-1])
    assert result.rate is None and result.reason


def test_fully_redeemed_fund_shows_no_meaningless_benchmark():
    row = comparison([], current="0")
    assert all(w.benchmark_xirr is None and w.reason for w in row.windows)


def test_purchases_before_index_history_are_reported_not_skipped_silently():
    result = replay(IndexLevels(DATES[1:], LEVELS.values[1:]), FLOWS, None, None, DATES[-1])
    assert result.rate is None and result.reason


def test_difference_report_prints_counts_and_differences_only(capsys):
    module = importlib.import_module("scripts.benchmark_diff_report")
    changes = module.compare_results({"PRIVATE_NAME": {"index_key":"old", "1Y": "0.1"}}, {"PRIVATE_NAME": {"index_key":"new", "1Y":"0.125"}})
    module.print_report(changes)
    text = capsys.readouterr().out
    assert "funds_changed=1" in text and "difference_pp=2.500000" in text
    assert "PRIVATE_NAME" not in text and "old" not in text and "new" not in text


@pytest.mark.parametrize("value", [D("0"), D("-1"), D("NaN")])
def test_nonpositive_or_nonfinite_history_never_divides(value):
    result = replay(IndexLevels([DATES[0],DATES[-1]],[value,D("100")]), [(DATES[0],D("-100"))], None,None,DATES[-1])
    assert result.rate is None and result.reason


def test_declared_windows_carry_the_actual_start_date():
    row = comparison([])
    assert all(w.start_date == START for w in row.windows[:3])


def test_diff_report_missing_database_prints_only_a_stop_count(monkeypatch, capsys):
    module = importlib.import_module("scripts.benchmark_diff_report")
    def unavailable(*args): raise ValueError("PRIVATE_PATH")
    monkeypatch.setattr(module,"read_only_engine",unavailable)
    assert module.main(["--user-id",str(uuid.uuid4())]) == 1
    output=capsys.readouterr()
    assert output.out == "report_stopped=1\n" and not output.err


def test_diff_report_stops_even_when_a_raw_write_error_is_caught(monkeypatch, capsys):
    from sqlalchemy import create_engine, text, inspect
    module=importlib.import_module("scripts.benchmark_diff_report")
    engine=create_engine("sqlite://")
    monkeypatch.setattr(module,"read_only_engine",lambda url:engine)
    monkeypatch.setattr("app.services.dashboard.household_members.list_household_members",lambda *args:[])
    async def attempted_write(db, members):
        try: db.execute(text("CREATE TABLE forbidden (id INTEGER)"))
        except RuntimeError: pass
        return SimpleNamespace(funds=[],declared_comparison=[])
    monkeypatch.setattr("app.services.analytics.benchmark.compute_fund_vs_benchmark",attempted_write)
    assert module.main(["--user-id",str(uuid.uuid4())]) == 1
    assert capsys.readouterr().out == "report_stopped=1\n"
