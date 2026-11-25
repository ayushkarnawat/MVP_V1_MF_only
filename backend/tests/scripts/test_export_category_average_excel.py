from __future__ import annotations

import asyncio
import re
import shutil
import socket
import subprocess
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from tempfile import NamedTemporaryFile, mkdtemp
from time import perf_counter
from unittest.mock import patch
from zipfile import ZipFile

import httpx
import pytest
from openpyxl import load_workbook
from sqlalchemy import event

from app.models.enums import SchemePlanType
from app.models.reference import NavHistory, Scheme, SchemeAaum
from app.services.analytics import category_ranking
from app.services.analytics.risk_metrics import years_ago
from scripts.export_rank_reference_workbook import _no_warming, _SnapshotUniverse


TODAY = date(2026, 11, 19)
VERSION = "invented-ca6"
LARGE = "Equity Scheme - Flexi Cap Fund"
THIN = "Debt Scheme - Liquid Fund"
MIXED = "Equity Scheme - Large Cap Fund"
HOUSE = "Paper Kite Mutual Fund"
PERIODS = ("1Y", "3Y", "5Y")
SHEETS = ["Contents", "Read me", "Summary", "Pool", "Weights audit", "Sizes", "Legacy figure",
          "Excluded", "Worked examples", "Checks", "Glossary"]
KEY = ("Category", "Plan", "Pool kind")


@pytest.fixture
def world(db_session):
    sections = []
    schemes = {}

    def category(name):
        sections.append(f"Open Ended Schemes({name})\n{HOUSE}\n")

    def add(code, name, *, group=LARGE, plan=SchemePlanType.DIRECT, option="Growth", years=(1, 3, 5),
            size=None, nav=120, source_age=0, end_age=0, active=True, catalogued=True):
        label = f"{plan.value.title()} Plan"
        source_date = TODAY - timedelta(days=source_age)
        sections.append(f"{code};-;-;{name};{label};{option};{nav};{source_date:%d-%b-%Y}\n")
        if not catalogued:
            return
        scheme = Scheme(amfi_code=code, name=f"{name} - {label} - {option}", base_name=name,
                        amc_name=HOUSE, sebi_category=group, plan_type=plan, is_active=active)
        db_session.add(scheme)
        db_session.flush()
        schemes[code] = scheme
        prices = {years_ago(TODAY, year): Decimal("100") for year in years}
        prices[TODAY - timedelta(days=end_age)] = Decimal(nav)
        db_session.add_all(NavHistory(scheme_id=scheme.id, date=day, nav=value) for day, value in prices.items())
        if size is not None:
            db_session.add_all((
                SchemeAaum(scheme_id=scheme.id, reference_period=date(2026, 6, 30), aaum_value=Decimal("999")),
                SchemeAaum(scheme_id=scheme.id, reference_period=date(2026, 9, 30), aaum_value=Decimal(size)),
            ))

    category(LARGE)
    for number in range(1, 6):
        add(f"91010{number}", f"Storybook Tree {number} Fund", size=number * 100, nav=110 + number * 3,
            years=(1, 3) if number == 5 else (1, 3, 5), end_age=number - 1)
    add("910106", "Storybook Tree 1 Fund", size=9999, nav=200)  # second Growth series
    add("910107", "Storybook Tree 1 Fund", option="IDCW", size=9999)
    add("910108", "Storybook Index Fund", size=400, nav=180)
    add("910109", "Storybook Seed Fund", years=(1,), size=9999)
    add("910110", "Storybook Dormant Fund", active=False, size=9999)
    add("910111", "Storybook Stale Fund", source_age=31, end_age=31, size=9999)
    add("910112", "Storybook Tree 1 Fund", plan=SchemePlanType.REGULAR, size=100, nav=116)
    add("910113", "Storybook Uncatalogued Fund", catalogued=False)
    category(THIN)
    add("910201", "Storybook Reed Fund", group=THIN, years=(1, 3), nav=125)
    add("910202", "Storybook Rush Fund", group=THIN, years=(1, 3), size=0, nav=144)
    category(MIXED)
    add("910301", "Storybook Moon Fund", group=MIXED, years=(1, 3), size=300, nav=133)
    add("910302", "=Storybook Star Fund", group=MIXED, nav=158)
    db_session.commit()
    return "".join(sections), schemes


@pytest.fixture
def workbook_path():
    with NamedTemporaryFile(suffix=".xlsx", delete_on_close=False) as file:
        file.close()
        yield Path(file.name)


def _write(db, path, navall):
    from scripts.export_category_average_excel import write_workbook

    write_workbook(db, path, navall_text=navall, today=TODAY, app_version=VERSION)


@pytest.fixture
def workbook(db_session, world, workbook_path):
    _write(db_session, workbook_path, world[0])
    return load_workbook(workbook_path)


def _rows(sheet):
    headers = [cell.value for cell in sheet[1]]
    return [dict(zip(headers, row, strict=True)) for row in sheet.iter_rows(min_row=2)]


def _key(row):
    return tuple(row[column].value for column in KEY)


def _select(sheet, category, plan="Direct", kind="active"):
    return [row for row in _rows(sheet) if _key(row) == (category, plan, kind)]


def _decimal(value):
    return Decimal(str(value))


def _rounded(value):
    return _decimal(value).quantize(Decimal("0.0001"))


def _period_rows(pool, period):
    return [row for row in pool if row[f"{period} return"].value is not None]


def _weights(rows):
    sizes = [_decimal(row["Size (₹ crore)"].value or 0) for row in rows]
    sizes = [max(Decimal(0), size) for size in sizes]
    total = sum(sizes)
    return ([size / total for size in sizes] if total else [Decimal(1) / len(rows) for _ in rows])


def _app_row(db, world, code):
    navall, schemes = world
    client = _SnapshotUniverse(navall, TODAY)
    client.stored = schemes
    reference = schemes[code]
    with (patch.object(category_ranking, "get_category_peers", client.get_category_peers),
          patch.object(category_ranking, "warm_nav_history", _no_warming),
          patch.object(category_ranking, "_category_returns_cache", {}),
          patch.object(category_ranking, "_category_short_history_cache", {})):
        pool = asyncio.run(category_ranking.load_category_pool(db, reference, TODAY))
    return category_ranking.category_rank_row(reference, pool)


def test_every_summary_average_is_a_formula_and_equals_the_app_value_to_four_places(workbook, db_session, world):
    reference_codes = {(LARGE, "Direct"): "910101", (LARGE, "Regular"): "910112", (THIN, "Direct"): "910201",
                       (MIXED, "Direct"): "910301"}
    for summary in _rows(workbook["Summary"]):
        category, plan, kind = _key(summary)
        if kind == "index":
            continue
        pool = _select(workbook["Pool"], category, plan)
        code = reference_codes.get((category, plan))
        app = _app_row(db_session, world, code) if code else None
        for period in PERIODS:
            formula = summary[f"Average {period}"]
            assert formula.data_type == "f" and "SUMPRODUCT(" in formula.value
            assert formula.fill.fgColor.rgb[-6:] == "E2F0D9"
            assert summary[f"Difference {period}"].data_type == "f"
            app_cell = summary[f"App {period}"]
            assert app_cell.fill.fgColor.rgb[-6:] == "FFFFFF"
            rows = _period_rows(pool, period)
            expected = app.periods[period.lower()].category_avg if app else None
            if not rows:
                assert app_cell.value is None and expected is None
                continue
            recomputed = sum(weight * _decimal(row[f"{period} return"].value)
                             for row, weight in zip(rows, _weights(rows), strict=True))
            assert _rounded(recomputed) == _rounded(app_cell.value) == _rounded(expected)


def test_weights_add_to_100_percent_for_every_category_and_period(workbook):
    for audit in _rows(workbook["Weights audit"]):
        period = audit["Period"].value
        rows = _period_rows(_select(workbook["Pool"], *_key(audit)), period)
        assert "SUMIFS(" in audit["Sum of weights"].value
        assert audit["Largest weight"].data_type == "f"
        assert audit["Fund with largest weight"].data_type == "f"
        assert audit["Share of top three"].data_type == "f"
        assert _rounded(sum(_weights(rows))) == Decimal(int(bool(rows)))


def test_weight_and_contribution_are_formulas(workbook):
    for row in _rows(workbook["Pool"]):
        assert row["Counts (has a return)"].data_type == "f"
        for period in PERIODS:
            assert row[f"Weight {period}"].data_type == "f"
            assert "SUMIFS(" in row[f"Weight {period}"].value
            assert row[f"Contribution {period}"].data_type == "f"


def test_short_history_peer_is_in_the_1y_pool_and_excluded_from_3y_and_5y_with_reasons(workbook):
    pool = _select(workbook["Pool"], LARGE)
    short = next(row for row in pool if row["Scheme code"].value == "910109")
    assert short in _period_rows(pool, "1Y")
    assert all(short not in _period_rows(pool, period) for period in ("3Y", "5Y"))
    excluded = [row for row in _select(workbook["Excluded"], LARGE) if row["Scheme code"].value == "910109"]
    assert {(row["Reason"].value, row["Effect"].value) for row in excluded} == {
        ("No 3Y return", "Excluded from 3Y"), ("No 5Y return", "Excluded from 5Y"),
    }
    assert "ISNUMBER" in short["Counts 1Y"].value
    assert short["3Y return"].coordinate not in short["Counts 1Y"].value
    reasons = {row["Scheme code"].value: row["Reason"].value for row in _select(workbook["Excluded"], LARGE)}
    assert reasons["910106"] == "second option of the same fund"
    assert reasons["910110"] == "inactive"
    assert reasons["910111"] == "not live"
    assert reasons["910112"] == "another plan type"


def test_missing_sizes_are_counted_unweighted_and_flagged(workbook, db_session, world):
    pool = _select(workbook["Pool"], MIXED)
    rows = _period_rows(pool, "3Y")
    assert {row["Scheme code"].value: weight for row, weight in zip(rows, _weights(rows), strict=True)} == {
        "910301": Decimal(1), "910302": Decimal(0),
    }
    app = _app_row(db_session, world, "910301")
    assert app.periods["3y"].funds_without_size == 1 and app.periods["3y"].peers == 2
    assert app.periods["5y"].weighting == "equal"  # fallback per period, even with a size elsewhere
    assert any(row["Scheme code"].value == "910302" and row["Reason"].value == "no size"
               for row in _select(workbook["Excluded"], MIXED))
    sizes = {row["Scheme code"].value: row for row in _select(workbook["Sizes"], MIXED)}
    assert sizes["910301"]["Size (₹ crore)"].value == 300
    assert sizes["910301"]["Size month"].value.date() == date(2026, 9, 30)
    assert '"older than 45 days"' in sizes["910301"]["Flag"].value
    assert sizes["910302"]["Size (₹ crore)"].value is None
    assert '"missing"' in sizes["910302"]["Flag"].value


def test_plain_fallback_when_no_fund_has_a_size_is_labelled(workbook):
    summary, = _select(workbook["Summary"], THIN)
    rows = _period_rows(_select(workbook["Pool"], THIN), "3Y")
    assert len(rows) == 2 and _weights(rows) == [Decimal("0.5"), Decimal("0.5")]
    assert '"plain (no sizes)"' in summary["Weighting 3Y"].value
    mean = sum(_decimal(row["3Y return"].value) for row in rows) / len(rows)
    assert _rounded(summary["App 3Y"].value) == _rounded(mean)


def test_thin_category_flag_under_five(workbook, db_session, world):
    for category, code, expected, expected_count in ((LARGE, "910101", False, 5), (THIN, "910201", True, 2)):
        summary, = _select(workbook["Summary"], category)
        app = _app_row(db_session, world, code)
        assert summary["Thin?"].data_type == "f" and "<5" in summary["Thin?"].value
        assert app.thin_category is expected
        assert len(_period_rows(_select(workbook["Pool"], category), "3Y")) == expected_count


def test_legacy_figure_is_40_percent_of_3y_plus_60_percent_of_5y(workbook, db_session, world):
    for category, code in ((LARGE, "910101"), (THIN, "910201")):
        legacy, = _select(workbook["Legacy figure"], category)
        summary, = _select(workbook["Summary"], category)
        formula = legacy["40/60 blend"].value
        assert formula.startswith("=IF(") and "0.4" in formula and "0.6" in formula
        assert "blank" in legacy["Note"].value
        three, five = (summary[f"App {period}"].value for period in ("3Y", "5Y"))
        expected = _decimal(three) if five is None else Decimal("0.4") * _decimal(three) + Decimal("0.6") * _decimal(five)
        assert _rounded(legacy["App legacy"].value) == _rounded(expected)
        assert _rounded(expected) == _rounded(_app_row(db_session, world, code).category_avg_return)


def test_no_idcw_and_no_index_series_in_any_pool_and_both_are_on_the_excluded_sheet(workbook):
    # Index series are absent from active pools and have their own index pool per the addendum.
    active = _select(workbook["Pool"], LARGE)
    assert not {"910107", "910108"} & {row["Scheme code"].value for row in active}
    assert "910107" not in {row["Scheme code"].value for row in _rows(workbook["Pool"])}
    reasons = {row["Scheme code"].value: row["Reason"].value for row in _select(workbook["Excluded"], LARGE)}
    assert reasons["910107"] == "IDCW (not included)"
    assert reasons["910108"] == "index or ETF (average is over index funds in a separate row)"


def test_index_pool_rows_equal_the_app_for_an_index_reference_fund(workbook, db_session, world):
    index, = [row for row in _rows(workbook["Summary"]) if row["Pool kind"].value == "index"]
    assert _key(index) == (LARGE, "Direct", "index")
    rows = _select(workbook["Pool"], LARGE, kind="index")
    assert [row["Scheme code"].value for row in rows] == ["910108"]
    app = _app_row(db_session, world, "910108")
    for period in PERIODS:
        assert _rounded(index[f"App {period}"].value) == _rounded(app.periods[period.lower()].category_avg)
    assert any(row["Scheme code"].value == "910101" and row["Reason"].value == "not an index or ETF"
               for row in _select(workbook["Excluded"], LARGE, kind="index"))


def test_worked_examples_reproduce_the_summary_figures(workbook):
    rows = _rows(workbook["Worked examples"])
    assert len(rows) == len({row["Fund"].value for row in rows}) == 3
    for row in rows:
        pool = next(fund for fund in _select(workbook["Pool"], *_key(row))
                    if fund["Scheme code"].value == row["Scheme code"].value)
        summary, = _select(workbook["Summary"], *_key(row))
        for period in PERIODS:
            assert f"Pool!{pool[f'{period} return'].coordinate}" in row[f"Fund return {period}"].value
            assert f"Summary!{summary[f'Average {period}'].coordinate}" in row[f"Category average {period}"].value
            gap = row[f"Gap {period}"].value
            assert row[f"Fund return {period}"].coordinate in gap and row[f"Category average {period}"].coordinate in gap


def test_no_household_or_internal_ids_in_any_cell(workbook, workbook_path, world):
    ids = {str(scheme.id) for scheme in world[1].values()}
    for sheet in workbook:
        assert not {"household", "folio", "account", "member", "scheme id"} & {
            str(cell.value).casefold() for cell in sheet[1]
        }
        for row in sheet.values:
            for value in row:
                if isinstance(value, str):
                    assert all(scheme_id not in value for scheme_id in ids)
                    assert not re.search(r"\b[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\b", value, re.I)
    with ZipFile(workbook_path) as archive:
        assert all("vbaproject" not in name.lower() for name in archive.namelist())
    star = next(row["Fund"] for row in _select(workbook["Pool"], MIXED) if row["Scheme code"].value == "910302")
    assert star.data_type == "s" and star.value.startswith("=")


def test_runs_read_only_and_offline(db_session, world, workbook_path, monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("The workbook attempted a database write, commit or network call")

    def only_select(conn, cursor, statement, params, context, executemany):
        assert statement.lstrip().upper().startswith("SELECT"), statement
        assert not re.search(r"\b(households|household_members|folios|transactions|users)\b", statement, re.I)

    original_connect = socket.socket.connect

    def only_loopback(sock, address):
        if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1"}:
            return original_connect(sock, address)  # Windows asyncio wakeup pipe
        return forbidden()

    bind = db_session.get_bind()
    event.listen(bind, "before_cursor_execute", only_select)
    event.listen(db_session, "before_flush", forbidden)
    event.listen(db_session, "before_commit", forbidden)
    monkeypatch.setattr(httpx.Client, "send", forbidden)
    monkeypatch.setattr(httpx.AsyncClient, "send", forbidden)
    monkeypatch.setattr(socket, "getaddrinfo", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket.socket, "connect", only_loopback)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)
    try:
        _write(db_session, workbook_path, world[0])
        assert db_session.query(Scheme).filter_by(amfi_code="910113").one_or_none() is None
    finally:
        event.remove(bind, "before_cursor_execute", only_select)
        event.remove(db_session, "before_flush", forbidden)
        event.remove(db_session, "before_commit", forbidden)


def test_all_eleven_sheets_exist_in_order(workbook):
    assert workbook.sheetnames == SHEETS
    for sheet in workbook:
        assert sheet.freeze_panes == "A2" and sheet.auto_filter.ref == sheet.dimensions
    for row in _rows(workbook["Contents"]):
        sheet = row["Sheet"]
        assert sheet.hyperlink.location == f"'{sheet.value}'!A1"
        assert row["Rows"].value == workbook[sheet.value].max_row - 1
    notes = {row["Topic"].value: row["Detail"].value for row in _rows(workbook["Read me"])}
    assert "IDCW options are not included" in notes["Options"]
    assert "[" in notes["Stakeholder note"] and notes["App version"] == VERSION


def test_workbook_recalculates_without_errors_and_summary_equals_app(
    db_session, world, workbook_path, record_property, capsys,
):
    start = perf_counter()
    _write(db_session, workbook_path, world[0])
    elapsed = perf_counter() - start
    measurement = f"{workbook_path.stat().st_size} bytes, {elapsed:.3f}s"
    record_property("invented_export", measurement)
    with capsys.disabled():
        print(f"Invented CA-6 export: {measurement}")
    workbook = load_workbook(workbook_path)
    assert workbook.calculation.calcMode == "auto" and workbook.calculation.fullCalcOnLoad
    formulas = [(ws.title, cell.coordinate) for ws in workbook for row in ws for cell in row if cell.data_type == "f"]
    assert formulas
    windows_engine = Path(r"C:\Program Files\LibreOffice\program\soffice.exe")
    engine = shutil.which("soffice") or shutil.which("libreoffice")
    if engine is None and windows_engine.is_file():
        engine = str(windows_engine)
    if engine is None:
        pytest.skip(f"LibreOffice unavailable for headless recalculation (invented export: {measurement})")
    destination = Path(mkdtemp(prefix="ca6-recalculation-"))
    subprocess.run([
        engine, f"-env:UserInstallation={(destination / 'profile').as_uri()}", "--headless", "--convert-to", "xlsx",
        "--outdir", str(destination), str(workbook_path),
    ], check=True, capture_output=True, timeout=45)
    recalculated = load_workbook(destination / workbook_path.name, data_only=True)
    assert all(recalculated[sheet][ref].data_type != "e" for sheet, ref in formulas)
    for row in _rows(recalculated["Summary"]):
        for period in PERIODS:
            value, app = (row[f"{label} {period}"].value for label in ("Average", "App"))
            difference = row[f"Difference {period}"].value
            if app is None:
                assert value in (None, "") and difference in (None, "")
            else:
                assert _rounded(value) == _rounded(app) and difference == 0
            audit, = [result for result in _select(recalculated["Weights audit"], *_key(row))
                      if result["Period"].value == period]
            assert _rounded(audit["Sum of weights"].value) == Decimal(int(app is not None))
        assert row["Thin?"].value == ("yes" if row["Covered 3Y"].value < 5 else "no")
    for row in _rows(recalculated["Legacy figure"]):
        app = row["App legacy"].value
        value = row["40/60 blend"].value
        assert value in (None, "") if app is None else _rounded(value) == _rounded(app)
    for row in _rows(recalculated["Worked examples"]):
        for period in PERIODS:
            fund, average, gap = (row[f"{label} {period}"].value for label in ("Fund return", "Category average", "Gap"))
            if fund in (None, "") or average in (None, ""):
                assert gap in (None, "")
            else:
                assert _rounded(gap) == _rounded(_decimal(fund) - _decimal(average))
    assert {row["Result"].value for row in _rows(recalculated["Checks"])} == {"PASS"}
