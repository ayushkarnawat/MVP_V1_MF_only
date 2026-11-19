import asyncio
import subprocess
import sys
from contextlib import ExitStack
from datetime import date, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile

import pytest

from app.models.reference import Scheme
from scripts.recount_category_pool import parse_navall, recount_all_periods, recount_pool


CATEGORY = "Equity Scheme - Flexi Cap Fund"
TODAY = date(2026, 11, 19)
SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "recount_category_pool.py"
REASONS = (
    "not_live",
    "idcw",
    "other_plan_type",
    "second_option_of_fund",
    "index_or_etf",
    "no_history_for_period",
    "closed_or_merged",
)


def _section(category=CATEGORY, amc="Fable Grove Mutual Fund"):
    return f"Open Ended Schemes({category})\n\n{amc}\n"


def _row(code, name, *, plan="Direct Plan", option="Growth", age=0, dated=True, today=TODAY):
    nav_date = (today - timedelta(days=age)).strftime("%d-%b-%Y") if dated else "bad-date"
    return f"{code};-;-;{name};{plan};{option};100.00;{nav_date}\n"


@pytest.fixture
def sample_text():
    spruce = "Storybook Spruce Fund"
    return "".join([
        "Scheme Code;ISIN Growth;ISIN Reinvestment;Scheme Name;Plan;Option;NAV;Date\n",
        _section("Equity Schemes - Flexi Cap Fund"),
        _row("900002", spruce),
        _row("900001", spruce),
        _row("900003", "Storybook Cedarbloom Fund", age=5),
        _row("900004", "Storybook Quill Fund", age=4),
        _row("900005", "Storybook Larch Fund", age=30),
        _row("900006", "Storybook Stale Fund", option="Dividend", age=31),
        _row("900007", "Storybook Undated Fund", dated=False),
        _row("900008", "Storybook Future Fund", age=-1),
        _row("900009", spruce, option="IDCW"),
        _row("900010", "Storybook Dividend Fund", option="Dividend"),
        _row("900011", "Storybook Payout Fund", option="Payout"),
        _row("900012", "Storybook Reinvestment Fund", option="Reinvestment"),
        _row("900013", "Storybook Bonus Fund", option="Bonus Option"),
        _row("900014", spruce, plan="Regular Plan"),
        _row("900015", "Storybook Unlabelled Plan Fund", plan=""),
        _row("900016", "Storybook Index Fund"),
        _row("900017", "Storybook ETFs Fund"),
        _row("900018", "Storybook Short History Fund"),
        _row("900019", "Storybook Missing History Fund"),
        _row("900020", "Storybook Orchard Fund (Merged)"),
        _row("900021", "Storybook Birch Fund - Closed"),
        _row("900022", "Storybook Indexation Fund"),
        _row("900023", "Storybook Fern Fund - Regular Plan"),
        _row("900025", "Storybook Hazel Fund - Growth", option="IDCW"),
        "\nPaper Kite Mutual Fund\n",
        _row("900024", spruce),
        _section("Debt Scheme - Liquid Fund", "Paper Kite Mutual Fund"),
        _row("900026", "Storybook Brook Fund"),
        _row("900027", "Storybook Pond Fund"),
    ])


def _history(rows):
    history_days = {row.scheme_code: 2000 for row in rows}
    history_days["900018"] = 1094
    history_days["900022"] = 1095
    history_days.pop("900019")
    return history_days


@pytest.fixture
def ledger(sample_text):
    rows = parse_navall(sample_text)
    return recount_pool(rows, CATEGORY, "direct", TODAY, _history(rows))


def _excluded(result, reason):
    step = next(step for step in result.steps if step.name == reason)
    return {entry.scheme_code for entry in step.set_aside}


def _flagged(result, flag):
    return {entry.scheme_code for entry in result.flags if entry.flag == flag}


def test_ledger_counts_each_step(ledger):
    assert [(step.name, step.remaining) for step in ledger.steps] == [
        ("category_match", 25),
        ("not_live", 22),
        ("idcw", 16),
        ("other_plan_type", 14),
        ("second_option_of_fund", 13),
        ("index_or_etf", 11),
        ("no_history_for_period", 9),
        ("closed_or_merged", 7),
    ]
    assert ledger.steps[0].set_aside == []
    assert set(ledger.final_pool) == {
        "900001", "900003", "900004", "900005", "900022", "900023", "900024",
    }


def test_idcw_series_set_aside_and_never_in_pool(ledger):
    assert _excluded(ledger, "idcw") == {
        "900009", "900010", "900011", "900012", "900013", "900025",
    }
    assert set(ledger.final_pool).isdisjoint(_excluded(ledger, "idcw"))


def test_peer_without_history_is_listed(ledger):
    assert _excluded(ledger, "no_history_for_period") == {"900018", "900019"}
    assert "900022" in ledger.final_pool  # exactly 3 * 365 days is sufficient


def test_duplicate_base_name_is_listed(ledger):
    assert _excluded(ledger, "second_option_of_fund") == {"900002"}
    assert {"900001", "900024"} <= set(ledger.final_pool)  # same name, separate fund houses


def test_mixed_end_dates_listed(ledger):
    assert _flagged(ledger, "mixed_end_dates") == {"900003", "900005"}


def test_mis_named_scheme_is_flagged(ledger):
    assert _flagged(ledger, "mis_named") == {"900023", "900025"}
    assert "900023" in ledger.final_pool  # explicit Plan column says Direct
    assert "900025" in _excluded(ledger, "idcw")


def test_each_scheme_is_set_aside_at_most_once(ledger):
    codes = [entry.scheme_code for step in ledger.steps for entry in step.set_aside]
    assert len(codes) == len(set(codes)) == 18
    assert "900006" in _excluded(ledger, "not_live")
    assert "900006" not in _excluded(ledger, "idcw")
    assert set(codes).isdisjoint(ledger.final_pool)


def test_reasons_come_from_the_fixed_list_only(ledger):
    assert {entry.reason for step in ledger.steps for entry in step.set_aside} == set(REASONS)
    assert all(entry.reason == step.name for step in ledger.steps for entry in step.set_aside)


def _run_cli(text, category=CATEGORY, *, periods=(), history=None):
    # Use individual temporary files so the tests never clean a shared pytest temp tree.
    with ExitStack() as files:
        def temp_file(suffix, content=""):
            handle = files.enter_context(NamedTemporaryFile(
                mode="w", encoding="utf-8", prefix=".rk3-", suffix=suffix,
                dir=SCRIPT.parents[1], delete_on_close=False,
            ))
            handle.write(content)
            handle.close()
            return Path(handle.name)

        nav_file = temp_file(".txt", text)
        out_file = temp_file(".txt")
        args = [
            sys.executable, str(SCRIPT), "--category", category, "--plan", "direct",
            "--navall", str(nav_file), "--out", str(out_file), *periods,
        ]
        if history is not None:
            args.extend(["--history", str(temp_file(".csv", history))])
        completed = subprocess.run(args, capture_output=True, text=True, check=True, timeout=15)
        return completed.stdout, out_file.read_text(encoding="utf-8")


def test_cli_writes_the_ledger_and_prints_no_ids():
    text = _section() + _row("900041", "Storybook Rowan Fund", today=date.today())
    text += _row("900042", "Storybook Lantern Fund", option="IDCW", today=date.today())
    stdout, output = _run_cli(text, history="scheme_code,history_days\n900041,1200\n")

    assert "idcw | 900042 | Storybook Lantern Fund - Direct Plan - IDCW" in output
    assert "idcw_only_fund | 900042 | Storybook Lantern Fund" in output
    assert "category_match | 2" in output
    assert "no_history_for_period | 900041 | Storybook Rowan Fund" in output
    assert output.count("\n900041\n") == 2
    assert output.index("category_match | 2") < output.index("idcw | 900042")
    assert output.index("idcw | 900042") < output.index("idcw_only_fund | 900042")
    assert "900041" not in stdout and "900042" not in stdout
    assert "Storybook Rowan Fund" in stdout


def test_ledger_equals_app_pool_for_clean_synthetic_category(monkeypatch, db_session):
    from app.models.enums import SchemePlanType
    from app.services.analytics.scheme_master import plan_type_for
    from app.services.analytics.scheme_universe import (
        _parse_nav_all,
        get_category_peers,
        scheme_universe_client,
    )

    today = date.today()
    text = _section() + "".join([
        _row("900041", "Storybook Rowan Fund", today=today),
        _row("900044", "Storybook Rowan Fund", today=today),
        _row("900045", "Storybook Rowan Fund", option="IDCW", today=today),
        _row("900046", "Storybook Rowan Fund", plan="Regular Plan", today=today),
        _row("900047", "Storybook Reed Fund", today=today),
        _section("Equity Schemes - Flexi Cap Fund", "Paper Kite Mutual Fund"),
        _row("900048", "Storybook Tanager Fund", today=today),
    ])
    app_rows = _parse_nav_all(text)
    db_session.add_all([
        Scheme(
            amfi_code=row.amfi_code,
            name=row.name,
            base_name=row.base_name,
            amc_name=row.amc_name,
            sebi_category=row.sebi_category,
            plan_type=plan_type_for(row),
        )
        for row in app_rows
    ])
    db_session.commit()
    monkeypatch.setattr(scheme_universe_client, "_rows", app_rows)
    peers = asyncio.run(get_category_peers(db_session, CATEGORY, SchemePlanType.DIRECT))
    result = recount_pool(parse_navall(text), CATEGORY, "direct", today)

    assert db_session.query(Scheme).count() == 6
    assert set(result.final_pool) == {scheme.amfi_code for scheme in peers.schemes} == {
        "900041", "900047", "900048",
    }


def test_unknown_plan_is_set_aside_and_flagged(ledger):
    assert _excluded(ledger, "other_plan_type") == {"900014", "900015"}
    assert _flagged(ledger, "plan_unknown") == {"900015"}


def test_unparseable_nav_date_is_not_live_and_flagged(ledger):
    assert _excluded(ledger, "not_live") == {"900006", "900007", "900008"}
    assert _flagged(ledger, "unparseable_nav_date") == {"900007"}


def test_idcw_only_fund_is_flagged(ledger):
    flagged = _flagged(ledger, "idcw_only_fund")
    assert "900010" in flagged
    assert "900009" not in flagged  # Growth exists for the same fund


def test_each_period_has_its_own_history_step():
    rows = parse_navall(_section() + "".join([
        _row("900041", "Storybook Rowan Fund"),
        _row("900042", "Storybook Lantern Fund"),
        _row("900043", "Storybook Tanager Fund"),
    ]))
    results = recount_all_periods(rows, CATEGORY, "direct", TODAY, {
        "900041": 400, "900042": 1200, "900043": 2000,
    })

    assert {years: result.final_pool for years, result in results.items()} == {
        1: ["900041", "900042", "900043"],
        3: ["900042", "900043"],
        5: ["900043"],
    }
    assert _excluded(results[1], "no_history_for_period") == set()
    assert _excluded(results[3], "no_history_for_period") == {"900041"}
    assert _excluded(results[5], "no_history_for_period") == {"900041", "900042"}


def test_exchange_traded_category_counts_as_passive():
    category = "Other Scheme - Exchange Traded Funds"
    text = _section(category) + _row("900041", "Storybook Rowan Fund", today=date.today())
    result = recount_pool(parse_navall(text), category, "direct", date.today())
    _, output = _run_cli(text, category, periods=("--period", "1"))

    assert _excluded(result, "index_or_etf") == {"900041"}
    assert result.final_pool == []
    assert "index_or_etf | 900041 | Storybook Rowan Fund - Direct Plan - Growth (exchange traded category)" in output
    assert output.count("category_match | 1") == 1


def test_parser_reads_six_and_eight_field_rows_and_skips_a_malformed_line():
    text = "\ufeff" + _section() + (
        "900041;-;-;Storybook Rowan Fund - Direct Plan - Growth;100.00;19-Nov-2026\n"
        "900082;-;-;Storybook Malformed Fund;100.00\n"
        + _row("900042", "Storybook Rowan Fund")
    )
    rows = parse_navall(text)

    assert [(row.scheme_code, row.name, row.category, row.nav_date) for row in rows] == [
        ("900041", "Storybook Rowan Fund - Direct Plan - Growth", CATEGORY, TODAY),
        ("900042", "Storybook Rowan Fund - Direct Plan - Growth", CATEGORY, TODAY),
    ]
    assert recount_pool(rows, CATEGORY, "direct", TODAY).final_pool == ["900041"]


def test_ledger_header_states_the_database_inactive_gap():
    text = _section() + _row("900041", "Storybook Rowan Fund", today=date.today())
    _, output = _run_cli(text)

    header = output.split("category_match", 1)[0]
    assert "database" in header.lower() and "inactive" in header.lower()
