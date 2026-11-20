from __future__ import annotations

import asyncio
import re
import shutil
import socket
import subprocess
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from tempfile import NamedTemporaryFile, mkdtemp
from time import perf_counter

import httpx
import pytest
from openpyxl import load_workbook
from sqlalchemy import event

from app.models.enums import SchemePlanType
from app.models.reference import NavHistory, Scheme
from app.services.analytics import category_ranking, performance_ranking, scheme_universe
from app.services.analytics.risk_metrics import years_ago
from scripts.recount_category_pool import parse_navall, recount_all_periods


TODAY = date.today()
OLDER = TODAY - timedelta(days=2)
VERSION = "invented-9.0"
EQUITY = "Equity Scheme - Flexi Cap Fund"
DEBT = "Debt Scheme - Liquid Fund"
AMC = "Paper Kite Mutual Fund"
PERIODS = ("1Y", "3Y", "5Y")
REASONS = {
    "not_live", "idcw", "other_plan_type", "second_option_of_fund", "index_or_etf",
    "no_history_for_period", "closed_or_merged",
}


@pytest.fixture
def world(db_session):
    sections = []
    schemes = {}
    history_days = {}

    def add(code, name, *, category=EQUITY, plan=SchemePlanType.DIRECT, option="Growth",
            age=0, end=None, years=()):
        price_date = TODAY - timedelta(days=age)
        label = f"{plan.value.title()} Plan"
        sections.append(f"{code};-;-;{name};{label};{option};105.00;{price_date:%d-%b-%Y}\n")
        scheme = Scheme(amfi_code=code, name=f"{name} - {label} - {option}", base_name=name,
                        amc_name=AMC, sebi_category=category, plan_type=plan,
                        is_active="Closed" not in name)
        db_session.add(scheme)
        db_session.flush()
        schemes[code] = scheme
        if end is not None:
            dates = {years_ago(TODAY, year): Decimal("100") for year in years}
            dates[end] = Decimal("105")
            db_session.add_all(NavHistory(scheme_id=scheme.id, date=day, nav=nav)
                               for day, nav in dates.items())
            history_days[code] = (TODAY - min(dates)).days

    sections.append(f"Open Ended Schemes(Equity Schemes - Flexi Cap Fund)\n{AMC}\n")
    add("900101", "Storybook Elm Fund", end=TODAY, years=(1, 3, 5))
    add("900102", "Storybook Elm Fund", end=TODAY, years=(1, 3, 5))
    add("900103", "Storybook Elm Fund", option="IDCW", end=TODAY, years=(1, 3, 5))
    add("900104", "Storybook Beech Fund", age=1, end=OLDER, years=(1, 3))
    add("900105", "Storybook No History Fund")
    add("900106", "Storybook Index Fund", end=TODAY, years=(1, 3, 5))
    add("900107", "Storybook Ash Fund Closed", end=TODAY, years=(1, 3, 5))
    add("900108", "Storybook Stale Fund", age=31, end=TODAY - timedelta(days=31), years=(1, 3, 5))
    add("900109", "Storybook Elm Fund", plan=SchemePlanType.REGULAR, end=TODAY, years=(1, 3, 5))
    sections.append(f"Open Ended Schemes({DEBT})\n{AMC}\n")
    add("900110", "=Storybook Brook Fund", category=DEBT, end=TODAY, years=(1,))
    db_session.commit()
    return "".join(sections), schemes, history_days


def _write(db, path, navall):
    from scripts.export_rank_reference_workbook import write_workbook

    write_workbook(db, path, navall_text=navall, today=TODAY, app_version=VERSION)


@pytest.fixture
def workbook_path():
    # An individual file avoids pytest's shared basetemp cleanup on Windows.
    with NamedTemporaryFile(suffix=".xlsx", delete_on_close=False) as file:
        file.close()
        yield Path(file.name)


@pytest.fixture
def workbook(db_session, world, workbook_path):
    _write(db_session, workbook_path, world[0])
    return load_workbook(workbook_path)


def _rows(sheet):
    cells = sheet.values
    headers = next(cells)
    return [dict(zip(headers, values, strict=True)) for values in cells]


def _color(cell):
    return cell.fill.fgColor.rgb[-6:]


def test_every_summary_total_is_a_countifs_over_pool_and_equals_the_product_total(
    db_session, world, workbook, monkeypatch,
):
    navall, schemes, _ = world
    monkeypatch.setattr(scheme_universe.scheme_universe_client, "_rows", scheme_universe._parse_nav_all(navall))
    monkeypatch.setattr(category_ranking, "_category_returns_cache", {})
    monkeypatch.setattr(category_ranking, "_category_short_history_cache", {})

    async def no_warming(db, peers):
        pass

    monkeypatch.setattr(category_ranking, "warm_nav_history", no_warming)
    reps = {(EQUITY, "Direct"): "900101", (EQUITY, "Regular"): "900109", (DEBT, "Direct"): "900110"}
    expected = {(EQUITY, "Direct"): (2, 2, 1), (EQUITY, "Regular"): (1, 1, 1),
                (DEBT, "Direct"): (1, 0, 0), (DEBT, "Regular"): (0, 0, 0)}
    summary = workbook["Summary"]
    pool = workbook["Pool"]
    pool_rows = _rows(pool)
    pool_columns = {cell.value: cell.column_letter for cell in pool[1]}
    summary_columns = {cell.value: cell.column_letter for cell in summary[1]}
    summary_rows = _rows(summary)
    assert {(row["Category"], row["Plan"]) for row in summary_rows} == set(expected)
    for index, row in enumerate(summary_rows, 2):
        key = row["Category"], row["Plan"]
        code = reps.get(key)
        app = asyncio.run(performance_ranking.load_ranking_pools(db_session, schemes[code], TODAY)) if code else None
        for period, total in zip(PERIODS, expected[key], strict=True):
            n_col = summary_columns[f"N for {period}"]
            app_col = summary_columns[f"App {period}"]
            flag = f"Counts for {period}"
            category_col, plan_col = (summary_columns[name] for name in ("Category", "Plan"))
            ranges = [f"Pool!${pool_columns[name]}$2:${pool_columns[name]}${pool.max_row}"
                      for name in ("Category", "Plan", flag)]
            assert row[f"N for {period}"] == (
                f'=COUNTIFS({ranges[0]},${category_col}{index},{ranges[1]},${plan_col}{index},{ranges[2]},"Y")'
            )
            actual = sum((fund["Category"], fund["Plan"]) == key and fund[flag] == "Y" for fund in pool_rows)
            assert actual == row[f"App {period}"] == (len(app.pools[period]) if app else 0) == total
            assert row[f"Difference {period}"] == f"={n_col}{index}-{app_col}{index}"
            assert _color(summary[f"{n_col}{index}"]) == "E2F0D9"
            assert _color(summary[f"{app_col}{index}"]) == "FFFFFF"
    assert all(row["Result"] == "PASS" for row in _rows(workbook["Checks"]))


def test_every_excluded_scheme_has_a_reason_from_the_allowed_list(workbook):
    rows = _rows(workbook["Excluded"])
    assert {row["Reason"] for row in rows} == REASONS
    assert all(row["Step"] and row["As of"].date() == TODAY for row in rows)
    direct_1y = {row["Scheme code"]: row["Reason"] for row in rows
                 if row["Category"] == EQUITY and row["Plan"] == "Direct" and row["Period"] == "1Y"}
    assert direct_1y == {
        "900102": "second_option_of_fund", "900103": "idcw", "900105": "no_history_for_period",
        "900106": "index_or_etf", "900107": "closed_or_merged", "900108": "not_live",
        "900109": "other_plan_type",
    }


def test_every_pool_row_is_counted_in_summary(workbook):
    rows = _rows(workbook["Pool"])
    assert {row["Scheme code"] for row in rows} == {"900101", "900104", "900109", "900110"}
    for row in rows:
        assert row["Option"] == "Growth"
        assert any(row[f"Counts for {period}"] == "Y" for period in PERIODS)
    beech = next(row for row in rows if row["Scheme code"] == "900104")
    assert beech["Price date used"].date() == OLDER
    assert Decimal(str(beech["1Y return"])) == Decimal("0.05")
    assert beech["5Y return"] is None
    beech_dates = [row for row in _rows(workbook["End dates"]) if row["Scheme code"] == "900104"]
    assert {row["Period"] for row in beech_dates} == {"1Y", "3Y"}
    assert all(row["Return end date used"].date() == OLDER and row["Different date?"] == "Yes"
               for row in beech_dates)


def test_pool_and_excluded_together_equal_the_category(workbook, world):
    amfi = parse_navall(world[0])
    pool = _rows(workbook["Pool"])
    excluded = _rows(workbook["Excluded"])
    for row in _rows(workbook["Summary"]):
        category, plan = row["Category"], row["Plan"]
        codes = {scheme.scheme_code for scheme in amfi if scheme.category.replace("Schemes", "Scheme") == category}
        assert row["Schemes in category"] == len(codes)
        for period in PERIODS:
            counted = [fund["Scheme code"] for fund in pool if fund["Category"] == category
                       and fund["Plan"] == plan and fund[f"Counts for {period}"] == "Y"]
            dropped = [fund["Scheme code"] for fund in excluded if fund["Category"] == category
                       and fund["Plan"] == plan and fund["Period"] == period]
            assert Counter(counted + dropped) == Counter(codes)


def test_funnel_counts_match_the_recount_ledger_step_by_step(workbook, world):
    navall, _, history = world
    source_rows = parse_navall(navall)
    funnel = _rows(workbook["Funnel"])
    for row in _rows(workbook["Summary"]):
        category, plan = row["Category"], row["Plan"]
        ledger = recount_all_periods(source_rows, category, plan.lower(), TODAY, history)
        for period, result in ledger.items():
            actual = [(step["Step"], step["Remaining"], step["Dropped"]) for step in funnel
                      if (step["Category"], step["Plan"], step["Period"]) == (category, plan, f"{period}Y")]
            assert actual == [(step.name, step.remaining, len(step.set_aside)) for step in result.steps]
            assert all(row[f"Set aside: {step.name} ({period}Y)"] == len(step.set_aside)
                       for step in result.steps if step.name in {"no_history_for_period", "closed_or_merged"})


def test_read_me_states_growth_only_and_dates(workbook):
    read_me = dict(workbook["Read me"].values)
    assert any("Growth options only" in str(value) and "IDCW" in str(value) for value in read_me.values())
    assert any("can differ" in str(value) for value in read_me.values())
    assert any("placeholder" in str(value).lower() for value in read_me.values())
    assert read_me["Ranking as of"].date() == TODAY
    assert read_me["Export date"].date() == TODAY
    assert read_me["App version"] == VERSION
    assert len(_rows(workbook["Sources"])) == 6
    assert [row["Reference"] for row in _rows(workbook["Sources"])] == [f"S{i}" for i in range(1, 7)]


def test_no_household_or_internal_ids_in_any_cell(workbook):
    private = re.compile(r"\b(?:household|folio|account|member)\b|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b", re.I)
    for sheet in workbook:
        for row in sheet.values:
            assert all(not private.search(str(cell)) for cell in row)
    public_name = next(cell for row in workbook["Pool"] for cell in row
                       if isinstance(cell.value, str) and cell.value.startswith("=Storybook"))
    assert public_name.data_type == "s"


def test_runs_read_only(db_session, world, workbook_path, monkeypatch):
    navall, _, _ = world
    # An uncatalogued AMFI growth series normally makes the app insert and commit.
    navall += f"900111;-;-;Storybook New Fund;Direct Plan;Growth;100.00;{TODAY:%d-%b-%Y}\n"

    def forbidden(*args, **kwargs):
        pytest.fail("The workbook attempted a database write, commit or network call")

    def only_select(conn, cursor, statement, params, context, executemany):
        assert statement.lstrip().upper().startswith("SELECT"), statement

    original_connect = socket.socket.connect

    def only_loopback(sock, address):
        # Windows asyncio may open a loopback socket for its own wakeup pipe.
        if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1"}:
            return original_connect(sock, address)
        return forbidden()

    bind = db_session.get_bind()
    event.listen(bind, "before_cursor_execute", only_select)
    event.listen(db_session, "before_flush", forbidden)
    event.listen(db_session, "before_commit", forbidden)
    monkeypatch.setattr(httpx.Client, "send", forbidden)
    monkeypatch.setattr(httpx.AsyncClient, "send", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket, "getaddrinfo", forbidden)
    monkeypatch.setattr(socket.socket, "connect", only_loopback)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)
    try:
        _write(db_session, workbook_path, navall)
        assert db_session.query(Scheme).filter_by(amfi_code="900111").one_or_none() is None
        assert {row["Reason"] for row in _rows(load_workbook(workbook_path)["Excluded"])
                if row["Scheme code"] == "900111" and row["Plan"] == "Direct"} == {"no_history_for_period"}
    finally:
        event.remove(bind, "before_cursor_execute", only_select)
        event.remove(db_session, "before_flush", forbidden)
        event.remove(db_session, "before_commit", forbidden)


def test_cross_checks_sheet_exists_with_header_only(workbook):
    assert workbook.sheetnames == ["Read me", "Summary", "Funnel", "Pool", "Excluded", "Cross-checks",
                                   "End dates", "Checks", "Sources"]
    assert list(workbook["Cross-checks"].values) == [(
        "Reference", "Its figure", "Reference date", "Definition", "Our figure on its basis",
        "Difference", "Reason",
    )]
    for sheet in list(workbook)[1:]:
        assert sheet.freeze_panes == "A2"
        assert sheet.auto_filter.ref == sheet.dimensions


def test_checks_surfaces_a_difference_even_when_counts_match(db_session, world, workbook_path):
    navall, schemes, _ = world
    # The app keeps a live row with no parsed AMFI date but drops a DB-inactive peer.
    # The independent ledger drops the undated row and has no DB-inactive signal.
    navall = navall.replace(f";{TODAY - timedelta(days=31):%d-%b-%Y}\n", ";undated\n")
    schemes["900101"].is_active = False
    db_session.commit()
    _write(db_session, workbook_path, navall)
    checks = _rows(load_workbook(workbook_path)["Checks"])
    row = next(row for row in checks if (row["Category"], row["Plan"], row["Period"]) == (EQUITY, "Direct", "1Y"))
    assert row["Recount"] == row["App"] == 2
    assert row["Result"] == "FAIL"
    assert row["Recount only"] == "900101"
    assert row["App only"] == "900108"


def test_workbook_opens_and_every_formula_has_a_cached_value_or_is_recalculable(db_session, world, workbook_path):
    start = perf_counter()
    _write(db_session, workbook_path, world[0])
    elapsed = perf_counter() - start
    workbook = load_workbook(workbook_path)
    assert workbook.calculation.calcMode == "auto"
    assert workbook.calculation.fullCalcOnLoad
    formulas = [(ws.title, cell.coordinate) for ws in workbook for row in ws for cell in row if cell.data_type == "f"]
    assert formulas
    engine = shutil.which("soffice") or shutil.which("libreoffice")
    if engine is None:
        pytest.skip(f"LibreOffice unavailable for headless recalculation "
                    f"(invented export: {workbook_path.stat().st_size} bytes, {elapsed:.3f}s)")
    destination = Path(mkdtemp(prefix="rk9-recalculation-"))
    subprocess.run([
        engine, f"-env:UserInstallation={(destination / 'profile').as_uri()}", "--headless", "--convert-to", "xlsx",
        "--outdir", str(destination), str(workbook_path),
    ], check=True, capture_output=True, timeout=45)
    recalculated = load_workbook(destination / workbook_path.name, data_only=True)
    assert all(recalculated[sheet][ref].data_type != "e" and recalculated[sheet][ref].value is not None
               for sheet, ref in formulas)
    for row in _rows(recalculated["Summary"]):
        for period in PERIODS:
            assert row[f"N for {period}"] == row[f"App {period}"]
            assert row[f"Difference {period}"] == 0
