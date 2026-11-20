"""Export the category averages from a local NAVAll snapshot and stored fund data."""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter, quote_sheetname
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.workbook.properties import CalcProperties
from openpyxl.worksheet.hyperlink import Hyperlink
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy.orm import Session

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.enums import SchemePlanType
from app.models.reference import Scheme, SchemeAaum
from app.services.analytics import category_ranking, scheme_universe
from app.services.analytics.scheme_master import plan_type_for
from scripts.export_rank_reference_workbook import _no_warming, _option, _SnapshotUniverse, _stored_history
from scripts.workbook_common import CellValue, append_values, formula_cell, freeze_and_filter


PERIODS = ("1Y", "3Y", "5Y")
POOL_KEY = ("Category", "Plan", "Pool kind")
INDEX_EXCLUSION = "index or ETF (average is over index funds in a separate row)"
INDEX_MISMATCH = "not an index or ETF"
LEGACY_NOTE = "40% of 3Y plus 60% of 5Y. If 5Y is blank, use 3Y alone. If 3Y is blank, leave the blend blank."
PERCENT = "0.00%"
SIZE = "#,##0.00"
DIFFERENCE = "0.0000"
DATE = "dd mmm yyyy"


@dataclass
class Table:
    sheet: Worksheet
    columns: dict[str, str]
    last_row: int = 1

    def add(self, *values: CellValue) -> int:
        append_values(self.sheet, (*values, *([None] * (len(self.columns) - len(values)))))
        self.last_row += 1
        return self.last_row

    def cell(self, header: str, row: int) -> str:
        return f"{self.columns[header]}{row}"

    def linked(self, header: str, row: int) -> str:
        sheet = self.sheet.title
        return f"{sheet if sheet.isidentifier() else quote_sheetname(sheet)}!{self.cell(header, row)}"

    def span(self, header: str, start: int, end: int) -> str:
        column = self.columns[header]
        return f"${column}${start}:${column}${end}"

    def formula(self, header: str, row: int, expression: str, format: str | None = None) -> None:
        cell = formula_cell(self.sheet, self.cell(header, row), f"={expression}")
        if format is not None:
            cell.number_format = format

    def format(self, header: str, row: int, number_format: str) -> None:
        self.sheet[self.cell(header, row)].number_format = number_format


# Blank ranges use the header only. The coverage flags there cannot match "Y".
@dataclass(frozen=True)
class PoolRows:
    table: Table
    first: int
    last: int

    def span(self, header: str, *, local: bool = False) -> str:
        start, end = (self.first, self.last) if self.first <= self.last else (1, 1)
        area = self.table.span(header, start, end)
        return area if local else f"Pool!{area}"


def _tables(wb: Workbook) -> dict[str, Table]:
    wb.active.title = "Contents"
    headers = {
        "Contents": ("Sheet", "Purpose", "Rows"),
        "Read me": ("Topic", "Detail"),
        "Summary": (*POOL_KEY, "As of", "Funds in pool", "Thin?", *(
            f"{label} {period}" for period in PERIODS for label in (
                "Covered", "Average", "Plain average", "Without size", "Weighting", "App", "Difference",
            )
        )),
        "Pool": (*POOL_KEY, "Fund", "Fund house", "Scheme code", "Option", "Size (₹ crore)", "Size month",
                 *(f"{period} return" for period in PERIODS), "Counts (3Y floor)", "NAVAll price date",
                 "Return end date", "As of", *(
                     f"{label} {period}" for period in PERIODS for label in ("Counts", "Weight", "Contribution")
                 )),
        "Weights audit": (*POOL_KEY, "Period", "As of", "Sum of weights", "Largest weight",
                          "Fund with largest weight", "Share of top three"),
        "Sizes": (*POOL_KEY, "Fund", "Scheme code", "Size (₹ crore)", "Size month", "As of", "Age in days", "Flag"),
        "Legacy figure": (*POOL_KEY, "As of", "Average 3Y", "Average 5Y", "40/60 blend", "App legacy",
                          "Difference", "Note"),
        "Excluded": (*POOL_KEY, "Scheme", "Fund house", "Scheme code", "Scheme plan", "Option",
                     "NAVAll price date", "As of", "Reason", "Effect"),
        "Worked examples": (*POOL_KEY, "Fund", "Scheme code", "Return end date", "As of", *(
            f"{label} {period}" for period in PERIODS for label in ("Fund return", "Category average", "Gap")
        ), "How to reproduce"),
        "Checks": (*POOL_KEY, "As of", *(f"{label} {period}" for period in PERIODS for label in (
            "Recomputed", "App", "Difference", "App covered", "Coverage OK?", "Weight sum", "Weights OK?",
        )), "Largest difference", "Legacy difference", "Excluded rows", "Exclusions OK?", "IDCW exclusions",
                   "Options OK?", "Oldest return end date", "Newest return end date", "Dates OK?", "Result"),
        "Glossary": ("Term", "Meaning"),
    }
    tables = {}
    for name, columns in headers.items():
        ws = wb[name] if name in wb.sheetnames else wb.create_sheet(name)
        append_values(ws, columns)
        tables[name] = Table(ws, {label: get_column_letter(i) for i, label in enumerate(columns, 1)})
    return tables


def _fixed_text(tables: dict[str, Table], today: date, latest_list_price: date | None, app_version: str) -> None:
    read_me = tables["Read me"]
    for row in (
        ("Stakeholder note", "[Placeholder for the stakeholder introduction and sign-off]"),
        ("How to read the card", "Each row shows a period. The fund dot is the fund’s return, the category dot "
         "is the category average, and the gap is the fund’s return minus that average."),
        ("1. Find the pool", "Use one Growth series per live, active fund in the category and plan. Active pools "
         "exclude index funds and ETFs. Index pools contain only index funds and ETFs."),
        ("Options", "IDCW options are not included. Dividend and bonus options are also excluded."),
        ("2. Check the history", "Summary counts a fund in the pool if it has a 3Y return. A fund also needs a return "
         "for the period being averaged. Fewer than five funds with a 3Y return makes the category thin."),
        ("3. Apply the sizes", "Weight each return by the fund’s latest usable average assets. A fund without a "
         "size still counts in coverage. If none of the funds in a period has a usable size, use equal weights."),
        ("4. Check the arithmetic", "Work on a copy. Filter Pool by category, plan and pool kind. Check the weights and "
         "add the contributions for the period. Compare Summary with the app value and see Checks for the result. "
         "Summary’s plain average is for comparison only."),
        ("Legacy figure", LEGACY_NOTE),
        ("Dates", "The supplied fund list can contain several price dates. The return ends on each fund’s own "
         "latest stored price on or before the comparison date. The latest AAUM snapshot has a reporting month "
         "for each fund. See the size month and price dates for each fund. The figures can use different dates."),
        ("Most recent price date in the fund list", latest_list_price),
        ("Comparison as of", today), ("Export date", date.today()), ("App version", app_version),
    ):
        row_number = read_me.add(*row)
        if row[0] == "Export date":
            read_me.sheet.parent.defined_names.add(DefinedName("ExportDate", attr_text=f"'Read me'!$B${row_number}"))
    for row in (
        ("AAUM", "Average assets under management. The fund’s average size during the reporting period."),
        ("CAGR", "Compound annual growth rate. The annual rate that turns the starting value into the ending value."),
        ("Category", "A group of funds that follow a similar investment approach."),
        ("Plan", "The fund’s Direct or Regular plan. Each plan has its own comparison pool."),
        ("Growth", "An option that keeps the income earned inside the fund."),
        ("IDCW", "Income Distribution cum Capital Withdrawal. It can pay money out of the fund. IDCW options are not included."),
        ("Thin category", "A category and plan with fewer than five funds that have a 3Y return in this pool."),
        ("Eligibility floor", "The minimum history needed for a fund to count. In this workbook it is a 3Y return."),
        ("Crore", "Ten million. The workbook shows fund sizes in crore rupees."),
    ):
        tables["Glossary"].add(*row)


def _latest_sizes(db: Session, schemes: Sequence[Scheme]) -> dict[str, tuple[Decimal | None, date]]:
    codes = {scheme.id: scheme.amfi_code for scheme in schemes}
    latest = {}
    rows = (db.query(SchemeAaum).filter(SchemeAaum.scheme_id.in_(codes))
            .order_by(SchemeAaum.reference_period.desc()).all())
    for row in rows:
        value = row.aaum_value if row.aaum_value.is_finite() else None
        latest.setdefault(codes[row.scheme_id], (value, row.reference_period))
    return latest


def _exclusion(source: scheme_universe.UniverseRow, scheme: Scheme | None, today: date,
               category: str, plan: SchemePlanType, kind: str, peer_ids: set[UUID]) -> str | None:
    if source.nav_date is not None and source.nav_date < today - scheme_universe._LIVE_WITHIN:
        return "not live"
    if scheme is None:
        return "not live"
    is_index = scheme_universe.is_index_fund(scheme.name, scheme.sebi_category)
    if is_index != (kind == "index"):
        return INDEX_EXCLUSION if is_index else INDEX_MISMATCH
    if scheme.plan_type != plan:
        return "another plan type"
    if scheme_universe.canonical_category(scheme.sebi_category) != category:
        return "another category in stored data"
    if not scheme.is_active:
        return "inactive"
    if scheme.id in peer_ids:
        return None
    option = _option(source)
    option_words = set(scheme_universe._OPTION_WORDS.findall((option or "").lower()))
    non_growth = option_words - scheme_universe._GROWTH_WORDS
    if non_growth:
        return "bonus option" if non_growth == {"bonus"} else "IDCW (not included)"
    base = source.base_name or scheme.base_name or scheme.name
    if not scheme_universe._is_growth_option(scheme, source, " ".join(base.lower().split())):
        return "no Growth option"
    return "second option of the same fund"



def _excluded(table: Table, key: tuple[str, str, str], source: scheme_universe.UniverseRow,
              scheme: Scheme | None, today: date, reason: str) -> None:
    plan = (scheme.plan_type if scheme is not None else None) or plan_type_for(source)
    effect = "Excluded from size weighting when sizes are used" if reason == "no size" else "Excluded from all periods"
    table.add(*key, scheme.name if scheme is not None else source.name, source.amc_name, source.amfi_code,
              plan.value.title() if plan else None, _option(source), source.nav_date, today, reason, effect)


def _weight_rows(pool: PoolRows) -> None:
    table = pool.table
    size_span = pool.span("Size (₹ crore)", local=True)
    for row in range(pool.first, pool.last + 1):
        floor = table.cell("Counts (3Y floor)", row)
        size = table.cell("Size (₹ crore)", row)
        table.formula("Counts (3Y floor)", row, f'IF(ISNUMBER({table.cell("3Y return", row)}),"Y","N")')
        for period in PERIODS:
            ret = table.cell(f"{period} return", row)
            counts = table.cell(f"Counts {period}", row)
            weight = table.cell(f"Weight {period}", row)
            flags = pool.span(f"Counts {period}", local=True)
            total = f'SUMIFS({size_span},{flags},"Y",{size_span},">0")'
            table.format(f"{period} return", row, PERCENT)
            table.formula(f"Counts {period}", row, f'IF(AND({floor}="Y",ISNUMBER({ret})),"Y","N")')
            table.formula(f"Weight {period}", row,
                          f'IF({counts}="Y",IF({total}>0,MAX(0,{size})/{total},1/COUNTIF({flags},"Y")),0)', PERCENT)
            table.formula(f"Contribution {period}", row, f'IF({counts}="Y",{weight}*{ret},0)', PERCENT)


def _display_ref(ref: str) -> str:
    return f'IF(ISNUMBER({ref}),{ref},"")'


def _difference(recomputed: str, app: str) -> str:
    return (f'IF(AND(ISNUMBER({recomputed}),ISNUMBER({app})),ROUND({recomputed}-{app},4),'
            f'IF(OR(ISNUMBER({recomputed}),ISNUMBER({app})),"Missing value",""))')


def _summary(table: Table, key: tuple[str, str, str], today: date, pool: PoolRows,
             app: category_ranking.CategoryRankRow) -> int:
    row = table.add(*key, today)
    floor = pool.span("Counts (3Y floor)")
    table.formula("Funds in pool", row, f'COUNTIFS({floor},"Y")')
    table.formula("Thin?", row, f'IF({table.cell("Funds in pool", row)}<5,"yes","no")')
    sizes = pool.span("Size (₹ crore)")
    for period in PERIODS:
        flags = pool.span(f"Counts {period}")
        returns = pool.span(f"{period} return")
        weights = pool.span(f"Weight {period}")
        covered = table.cell(f"Covered {period}", row)
        average = table.cell(f"Average {period}", row)
        app_cell = table.cell(f"App {period}", row)
        table.formula(f"Covered {period}", row, f'COUNTIFS({flags},"Y")')
        table.formula(f"Average {period}", row, f'IF({covered}=0,"",SUMPRODUCT({weights},{returns})/SUM({weights}))',
                      PERCENT)
        table.formula(f"Plain average {period}", row, f'IF({covered}=0,"",AVERAGEIFS({returns},{flags},"Y"))', PERCENT)
        table.formula(f"Without size {period}", row, f'{covered}-COUNTIFS({flags},"Y",{sizes},">0")')
        missing = table.cell(f"Without size {period}", row)
        table.formula(f"Weighting {period}", row,
                      f'IF({covered}=0,"",IF({missing}={covered},"plain (no sizes)","size"))')
        app_period = app.periods.get(period.lower())
        if app_period is not None and app_period.category_avg is not None:
            table.sheet[app_cell].value = Decimal(app_period.category_avg)
        table.format(f"App {period}", row, PERCENT)
        table.formula(f"Difference {period}", row, _difference(average, app_cell), DIFFERENCE)
    return row


def _size_audit(table: Table, key: tuple[str, str, str], name: str, code: str,
                size: Decimal | None, month: date | None, today: date) -> None:
    row = table.add(*key, name, code, size, month, today)
    month_ref, size_ref = (table.cell(label, row) for label in ("Size month", "Size (₹ crore)"))
    age = table.cell("Age in days", row)
    table.format("Size (₹ crore)", row, SIZE)
    table.formula("Age in days", row, f'IF(ISNUMBER({month_ref}),ExportDate-{month_ref},"")')
    table.formula("Flag", row, f'IF(OR(NOT(ISNUMBER({size_ref})),{size_ref}<=0),"missing",'
                  f'IF({age}>45,"older than 45 days","current"))')


def _weight_audit(table: Table, key: tuple[str, str, str], today: date, pool: PoolRows) -> dict[str, int]:
    rows = {}
    for period in PERIODS:
        row = table.add(*key, period, today)
        rows[period] = row
        flags, weights, names = (pool.span(label) for label in (f"Counts {period}", f"Weight {period}", "Fund"))
        largest = table.cell("Largest weight", row)
        count = f'COUNTIF({flags},"Y")'
        table.formula("Sum of weights", row, f'SUMIFS({weights},{flags},"Y")', PERCENT)
        table.formula("Largest weight", row, f"MAX({weights})", PERCENT)
        table.formula("Fund with largest weight", row, f'IF({largest}=0,"",INDEX({names},MATCH({largest},{weights},0)))')
        table.formula("Share of top three", row, f'{largest}+IF({count}>1,LARGE({weights},2),0)'
                      f'+IF({count}>2,LARGE({weights},3),0)', PERCENT)
    return rows


def _legacy(table: Table, key: tuple[str, str, str], today: date, summary: Table, summary_row: int,
            app: str | None) -> int:
    row = table.add(*key, today, None, None, None, Decimal(app) if app is not None else None, None, LEGACY_NOTE)
    three, five, blend, app_ref = (table.cell(label, row) for label in ("Average 3Y", "Average 5Y", "40/60 blend", "App legacy"))
    for period in ("3Y", "5Y"):
        table.formula(f"Average {period}", row, _display_ref(summary.linked(f"Average {period}", summary_row)), PERCENT)
    table.formula("40/60 blend", row, f'IF(NOT(ISNUMBER({three})),"",IF(ISNUMBER({five}),0.4*{three}+0.6*{five},{three}))',
                  PERCENT)
    table.format("App legacy", row, PERCENT)
    table.formula("Difference", row, _difference(blend, app_ref), DIFFERENCE)
    return row


def _checks(tables: dict[str, Table], key: tuple[str, str, str], today: date, pool: PoolRows, summary_row: int,
            audit_rows: dict[str, int], legacy_row: int, excluded_first: int, excluded_last: int,
            app_row: category_ranking.CategoryRankRow) -> None:
    table, summary, audit = (tables[name] for name in ("Checks", "Summary", "Weights audit"))
    row = table.add(*key, today)
    findings = []
    diffs = []
    for period in PERIODS:
        for label, source in (("Recomputed", "Average"), ("App", "App")):
            table.formula(f"{label} {period}", row, _display_ref(summary.linked(f"{source} {period}", summary_row)), PERCENT)
        actual = table.cell(f"Recomputed {period}", row)
        app = table.cell(f"App {period}", row)
        diff = table.cell(f"Difference {period}", row)
        diffs.append(diff)
        table.formula(f"Difference {period}", row, _difference(actual, app), DIFFERENCE)
        table.formula(f"Weight sum {period}", row, audit.linked("Sum of weights", audit_rows[period]), PERCENT)
        covered = summary.linked(f"Covered {period}", summary_row)
        app_period = app_row.periods.get(period.lower())
        app_covered = table.cell(f"App covered {period}", row)
        table.sheet[app_covered].value = app_period.peers if app_period is not None else 0
        table.formula(f"Coverage OK? {period}", row, f'IF({covered}={app_covered},"PASS","FAIL")')
        weight_sum = table.cell(f"Weight sum {period}", row)
        table.formula(f"Weights OK? {period}", row, f'IF({covered}=0,IF({weight_sum}=0,"N/A","FAIL"),'
                      f'IF(ROUND({weight_sum},10)=1,"PASS","FAIL"))')
        findings.append(f'{table.cell(f"Weights OK? {period}", row)}<>"FAIL"')
        findings.append(f'{table.cell(f"Coverage OK? {period}", row)}="PASS"')

    legacy = tables["Legacy figure"]
    table.formula("Legacy difference", row, _difference(legacy.linked("40/60 blend", legacy_row),
                  legacy.linked("App legacy", legacy_row)), DIFFERENCE)
    diffs.append(table.cell("Legacy difference", row))
    checks = [f'IF(ISNUMBER({ref}),{ref}=0,{ref}="")' for ref in diffs]
    absolute = ",".join(f"IF(ISNUMBER({ref}),ABS({ref}),0)" for ref in diffs)
    table.formula("Largest difference", row, f"MAX({absolute})", DIFFERENCE)
    excluded = tables["Excluded"]
    first, last = (excluded_first, excluded_last) if excluded_first <= excluded_last else (1, 1)
    reason = f'Excluded!{excluded.span("Reason", first, last)}'
    codes = f'Excluded!{excluded.span("Scheme code", first, last)}'
    table.formula("Excluded rows", row, f'COUNTA({codes})' if first > 1 else "0")
    missing_reasons = f'COUNTIFS({codes},"<>",{reason},"")'
    table.formula("Exclusions OK?", row, f'IF({missing_reasons}=0,"PASS","FAIL")')
    findings.append(f'{table.cell("Exclusions OK?", row)}="PASS"')
    table.formula("IDCW exclusions", row, f'COUNTIF({reason},"IDCW (not included)")')

    options = pool.span("Option")
    wrong_options = "+".join(f'COUNTIF({options},"*{option}*")' for option in ("IDCW", "IDWC", "Dividend", "Bonus"))
    table.formula("Options OK?", row, f'IF({wrong_options}=0,"PASS","FAIL")')
    findings.append(f'{table.cell("Options OK?", row)}="PASS"')

    end_dates = pool.span("Return end date")
    covered_3y = summary.linked("Covered 3Y", summary_row)
    floor = pool.span("Counts (3Y floor)")
    # AGGREGATE ignores the divide-by-zero entries for funds below the floor.
    date_present = f'COUNTIFS({floor},"Y",{end_dates},">0")'
    as_of = table.cell("As of", row)
    future = f'COUNTIFS({floor},"Y",{end_dates},">"&{as_of})'
    for label, function_code in (("Oldest return end date", 15), ("Newest return end date", 14)):
        table.formula(label, row, f'IF({date_present}=0,"",_xlfn.AGGREGATE({function_code},6,{end_dates}/'
                      f'(({floor}="Y")*({end_dates}>0)),1))', DATE)
    table.formula("Dates OK?", row, f'IF({covered_3y}=0,"N/A",IF(AND({date_present}={covered_3y},{future}=0),"PASS","FAIL"))')
    findings.append(f'{table.cell("Dates OK?", row)}<>"FAIL"')
    table.formula("Result", row, f'IF(AND({",".join((*checks, *findings))}),"PASS","FAIL")')


async def _write_group(tables: dict[str, Table], db: Session, today: date, category: str, plan: SchemePlanType,
                       kind: str, source: dict[str, scheme_universe.UniverseRow], live: dict[str, Scheme],
                       stored: dict[str, Scheme], reference: Scheme, sizes: dict[str, tuple[Decimal | None, date]],
                       nav_ends: dict[str, date]) -> list[tuple[int, int]]:
    pool = await category_ranking.load_category_pool(db, reference, today)
    anchor = next((scheme for scheme in pool.peers.schemes if scheme.id in pool.detailed), reference)
    app = category_ranking.category_rank_row(anchor, pool)
    short_history = await category_ranking._category_returns_detailed(
        db, pool.peers.schemes, today, cache_key=("peers", category, plan), include_short_history=True,
    )
    key = category, plan.value.title(), kind
    pool_table, excluded = tables["Pool"], tables["Excluded"]
    pool_first, excluded_first = pool_table.last_row + 1, excluded.last_row + 1
    peer_ids = {scheme.id for scheme in pool.peers.schemes}
    examples = []
    for code, entry in sorted(source.items()):
        scheme = live.get(code)
        reason = _exclusion(entry, scheme, today, category, plan, kind, peer_ids)
        if reason is not None:
            _excluded(excluded, key, entry, scheme or stored.get(code), today, reason)
            continue
        assert scheme is not None  # Only app-selected live peers reach the pool rows.
        values = pool.detailed.get(scheme.id)  # Final, app-selected category and plan.
        returns = (values or short_history.get(scheme.id, (None, None, None, None)))[:3]
        size, month = sizes.get(code, (None, None))
        row = pool_table.add(*key, scheme.name, scheme.amc_name, code, "Growth", size, month, *returns, None,
                             entry.nav_date, nav_ends.get(code), today)
        pool_table.format("Size (₹ crore)", row, SIZE)
        _size_audit(tables["Sizes"], key, scheme.name, code, size, month, today)
        if values is None:
            _excluded(excluded, key, entry, scheme, today, "no 3-year history")
        else:
            examples.append(row)
            if not category_ranking._has_usable_size(size):
                _excluded(excluded, key, entry, scheme, today, "no size")

    pool_rows = PoolRows(pool_table, pool_first, pool_table.last_row)
    _weight_rows(pool_rows)
    summary = tables["Summary"]
    summary_row = _summary(summary, key, today, pool_rows, app)
    audit_rows = _weight_audit(tables["Weights audit"], key, today, pool_rows)
    legacy_row = _legacy(tables["Legacy figure"], key, today, summary, summary_row, app.category_avg_return)
    _checks(tables, key, today, pool_rows, summary_row, audit_rows, legacy_row, excluded_first, excluded.last_row, app)
    return [(row, summary_row) for row in examples]


def _examples(tables: dict[str, Table], candidates: list[tuple[int, int]]) -> None:
    table, pool, summary = (tables[name] for name in ("Worked examples", "Pool", "Summary"))
    fields = (*POOL_KEY, "Fund", "Scheme code", "Return end date", "As of")
    used = set()
    for pool_row, summary_row in candidates:
        values = [pool.sheet[pool.cell(label, pool_row)].value for label in fields]
        if values[3] in used:
            continue
        used.add(values[3])
        row = table.add(*values)
        for period in PERIODS:
            table.formula(f"Fund return {period}", row, _display_ref(pool.linked(f"{period} return", pool_row)), PERCENT)
            table.formula(f"Category average {period}", row,
                          _display_ref(summary.linked(f"Average {period}", summary_row)), PERCENT)
            fund = table.cell(f"Fund return {period}", row)
            average = table.cell(f"Category average {period}", row)
            table.formula(f"Gap {period}", row, f'IF(AND(ISNUMBER({fund}),ISNUMBER({average})),{fund}-{average},"")',
                          "+0.00%;-0.00%;0.00%")
        table.sheet[table.cell("How to reproduce", row)].value = (
            "Follow the Pool and Summary cell references for each period. Subtract the category return from the fund return."
        )
        if len(used) == 3:
            break


async def _populate(tables: dict[str, Table], db: Session, client: _SnapshotUniverse, today: date) -> None:
    examples_by_category = {}
    with (db.no_autoflush,
          patch.object(category_ranking, "get_category_peers", client.get_category_peers),
          patch.object(category_ranking, "warm_nav_history", _no_warming),
          patch.object(category_ranking, "_category_returns_cache", {}),
          patch.object(category_ranking, "_category_short_history_cache", {})):
        for category, entries in sorted(client.categories.items()):
            source = {entry.amfi_code: entry for entry in reversed(entries)}
            stored = {scheme.amfi_code: scheme for scheme in db.query(Scheme).filter(Scheme.amfi_code.in_(source)).all()}
            client.stored = stored.copy()
            live = {scheme.amfi_code: scheme for scheme in await client.get_category_universe(db, category)}
            # The snapshot client can now reuse the same transient objects during app peer selection.
            client.stored.update(live)
            _, nav_ends = _stored_history(db, stored, today)
            sizes = _latest_sizes(db, list(stored.values())) if stored else {}
            category_examples = []
            for plan in SchemePlanType:
                index_reference = None
                active_reference = None
                for code, entry in source.items():
                    candidate = client.stored.get(code)
                    if candidate is not None and scheme_universe.canonical_category(candidate.sebi_category) != category:
                        continue
                    label = candidate.name if candidate is not None else entry.name
                    candidate_category = candidate.sebi_category if candidate is not None else entry.sebi_category
                    candidate_plan = candidate.plan_type if candidate is not None else plan_type_for(entry)
                    if candidate_plan != plan:
                        continue
                    if scheme_universe.is_index_fund(label, candidate_category):
                        if index_reference is None:
                            index_reference = candidate or Scheme(name=label, sebi_category=category, plan_type=plan)
                    elif code in live and active_reference is None:
                        active_reference = candidate
                references = []
                if not scheme_universe.is_index_fund("Category reference", category):
                    references.append(("active", active_reference or Scheme(name="Category reference", sebi_category=category,
                                                                             plan_type=plan)))
                if index_reference is not None:
                    references.append(("index", index_reference))
                for kind, reference in references:
                    category_examples.extend(await _write_group(tables, db, today, category, plan, kind, source, live,
                                                                 stored, reference, sizes, nav_ends))
            examples_by_category[category] = category_examples
    examples = [rows[0] for rows in examples_by_category.values() if rows]
    examples.extend(example for rows in examples_by_category.values() for example in rows[1:])
    _examples(tables, examples)


def _finish(tables: dict[str, Table]) -> None:
    purposes = (
        "Find sheets and see their row counts", "Read the method, the card and the dates",
        "Compare recalculated and app averages", "See every fund, return, weight and contribution",
        "Check each period’s weights and concentration", "See the size, reporting month and age of each fund size",
        "Reproduce the legacy 3Y and 5Y blend", "See schemes left out and why",
        "Recreate three fund cards from the underlying cells", "Check app values, weights, exclusions and dates",
        "Look up the terms used in this workbook",
    )
    contents = tables["Contents"]
    for (name, table), purpose in zip(tables.items(), purposes, strict=True):
        count = len(tables) if table is contents else table.last_row - 1
        row = contents.add(name, purpose, count)
        cell = contents.sheet[contents.cell("Sheet", row)]
        cell.hyperlink = Hyperlink(ref=cell.coordinate, location=f"'{name}'!A1", display=name)
        cell.font = Font(color="0563C1", underline="single")
    for table in tables.values():
        freeze_and_filter(table.sheet)
    for name in ("Pool", "Summary", "Excluded"):
        table = tables[name]
        last_column = get_column_letter(len(table.columns))
        area = f"{quote_sheetname(name)}!$A$1:${last_column}${table.last_row}"
        table.sheet.parent.defined_names.add(DefinedName(f"{name}Data", attr_text=area))
    checks = tables["Checks"]
    if checks.last_row > 1:
        red_text = Font(color="9C0006")
        for header in ("Largest difference", "Legacy difference", *(f"Difference {period}" for period in PERIODS)):
            cell = checks.cell(header, 2)
            failure = f'OR(AND(ISNUMBER({cell}),{cell}<>0),{cell}="Missing value")'
            checks.sheet.conditional_formatting.add(checks.span(header, 2, checks.last_row),
                                                    FormulaRule(formula=[failure], font=red_text))
        result = checks.cell("Result", 2)
        checks.sheet.conditional_formatting.add(checks.span("Result", 2, checks.last_row),
                                                FormulaRule(formula=[f'{result}="FAIL"'], font=red_text))
    for name in ("Read me", "Glossary"):
        sheet = tables[name].sheet
        sheet.column_dimensions["B"].width = 88
        for (cell,) in sheet.iter_rows(min_row=2, min_col=2, max_col=2):
            if isinstance(cell.value, str) and len(cell.value) > 83:
                cell.alignment = Alignment(wrap_text=True, vertical="top")
                sheet.row_dimensions[cell.row].height = 15 * (1 + len(cell.value) // 83)


def write_workbook(db: Session, out_path: Path, *, today: date, app_version: str,
                   navall_text: str | None = None) -> None:
    """Write an editable workbook using stored reference rows and a local fund list."""
    if navall_text is None:
        navall_text = (scheme_universe.DEFAULT_CACHE_DIR / "nav_all.txt").read_text(encoding="utf-8-sig")
    client = _SnapshotUniverse(navall_text, today)
    latest_list_price = max((row.nav_date for rows in client.categories.values() for row in rows
                             if row.nav_date is not None), default=None)
    wb = Workbook()
    wb.calculation = CalcProperties(calcMode="auto", fullCalcOnLoad=True)
    tables = _tables(wb)
    _fixed_text(tables, today, latest_list_price, app_version)
    asyncio.run(_populate(tables, db, client, today))
    _finish(tables)
    wb.save(out_path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--navall", type=Path, required=True, help="Local AMFI NAVAll text file")
    parser.add_argument("--today", type=date.fromisoformat, default=date.today())
    parser.add_argument("--app-version", required=True)
    args = parser.parse_args(argv)

    from app.db.session import SessionLocal

    with SessionLocal() as db:
        write_workbook(db, args.out, today=args.today, app_version=args.app_version,
                       navall_text=args.navall.read_text(encoding="utf-8-sig"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
