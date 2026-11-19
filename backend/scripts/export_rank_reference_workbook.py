"""Export rank denominators from a local NAVAll snapshot and stored NAV history.

Run in a standalone process, using a session with read access to reference data.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import defaultdict
from datetime import date, timedelta
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from openpyxl import Workbook
from openpyxl.styles import Alignment
from openpyxl.workbook.properties import CalcProperties
from sqlalchemy import func
from sqlalchemy.orm import Session

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.enums import SchemePlanType
from app.models.reference import NavHistory, Scheme
from app.services.analytics import category_ranking, performance_ranking, scheme_universe
from app.services.analytics.scheme_master import plan_type_for
from app.services.analytics.scheme_universe import canonical_category
from scripts.workbook_common import CheckRow, add_checks_sheet, append_values, formula_cell, freeze_and_filter


def _load_recount():
    name = "_rank_workbook_recount"
    spec = spec_from_file_location(name, Path(__file__).with_name("recount_category_pool.py"))
    if spec is None or spec.loader is None:
        raise ImportError("Cannot load recount_category_pool.py")
    module = module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


recount = _load_recount()
PERIODS = tuple(f"{years}Y" for years in recount.PERIODS)
STEPS = {
    "category_match": "Every scheme in the category in NAVAll",
    "not_live": "No usable NAV dated within the last 30 days",
    "idcw": "IDCW, dividend or bonus option",
    "other_plan_type": "Different or unknown plan",
    "second_option_of_fund": "Another series represents this fund",
    "index_or_etf": "Index fund or ETF",
    "no_history_for_period": "Insufficient stored NAV history for this period",
    "closed_or_merged": "Scheme name marks a closure or merger",
}
HISTORY_STEPS = ("no_history_for_period", "closed_or_merged")
BASE_STEPS = tuple(reason for reason in STEPS if reason != "category_match" and reason not in HISTORY_STEPS)
SOURCES = (
    ("S1", "AMFI daily price file (NAVAll.txt)", None, "Schemes, codes, names and latest prices and dates",
     "AMFI website, daily price file"),
    ("S2", "AMFI scheme data", None, "Category, plan, option and closure", "AMFI website"),
    ("S3", "AMFI monthly industry data", None, "Schemes per category", "AMFI website, monthly data"),
    ("S4", "SEBI categorisation circulars", None, "Category definitions", "SEBI website, circulars"),
    ("S5", "Fund houses’ own scheme lists, factsheets and notices", None, "Options and notices for a sample",
     "Each fund house’s website"),
    ("S6", "A second price source", None, "Dated prices for a sample", "Stored price history"),
)


class _SnapshotUniverse(scheme_universe.SchemeUniverseClient):
    """Reuse the app's peer selection with local source rows and transient missing schemes."""

    def __init__(self, navall_text: str, today: date):
        super().__init__()
        self._rows = scheme_universe._parse_nav_all(navall_text.lstrip("\ufeff"))
        self.live_since = today - scheme_universe._LIVE_WITHIN
        self.categories: dict[str, list[scheme_universe.UniverseRow]] = defaultdict(list)
        for row in self._rows:
            self.categories[canonical_category(row.sebi_category)].append(row)
        self.stored: dict[str, Scheme] = {}

    async def get_category_universe(self, db: Session, sebi_category: str) -> list[Scheme]:
        result: dict[str, Scheme] = {}
        for row in self.categories.get(canonical_category(sebi_category), ()):
            if row.nav_date is not None and row.nav_date < self.live_since:
                continue
            if row.amfi_code not in result:
                result[row.amfi_code] = self.stored.get(row.amfi_code) or Scheme(
                    id=uuid4(), amfi_code=row.amfi_code, name=row.name, amc_name=row.amc_name,
                    sebi_category=row.sebi_category, base_name=row.base_name, plan_type=plan_type_for(row),
                    is_active=True,
                )
        return list(result.values())


async def _no_warming(db: Session, schemes: list[Scheme]) -> None:
    """Ranking reads existing prices, without the app's network/cache fill step."""


def _stored_history(db: Session, schemes: dict[str, Scheme], today: date):
    ids = {scheme.id: code for code, scheme in schemes.items()}
    if not ids:
        return {}, {}
    rows = (db.query(NavHistory.scheme_id, func.min(NavHistory.date), func.max(NavHistory.date))
            .filter(NavHistory.scheme_id.in_(ids), NavHistory.date <= today)
            .group_by(NavHistory.scheme_id).all())
    return ({ids[sid]: (today - first).days for sid, first, _ in rows},
            {ids[sid]: last for sid, _, last in rows})


def _sheet(wb, name, headers):
    ws = wb.create_sheet(name)
    append_values(ws, headers)
    return ws


def _read_me(wb, today, app_version):
    ws = wb.active
    ws.title = "Read me"
    for row in (
        ("Rank reference workbook", "[Placeholder for the stakeholder introduction]"),
        ("What the total means", "Summary counts the independent NAVAll recount for each category, plan and period. "
         "The App columns show the product totals from stored NAVs. Checks flags any difference in the fund lists."),
        ("Options", "Growth options only. IDCW (dividend) options are excluded."),
        ("Check one total", "Filter Pool by category and plan, then count the Y flags for the period. "
         "Funnel shows the steps and Excluded lists the schemes set aside."),
        ("Dates", "Return end dates can differ within a pool. The End dates flag marks dates older than the latest "
         "end date observed for that category, plan and period. A blank end date means the app had no ranked return. "
         "NAVAll may contain several price dates. See Sources for reference dates."),
        ("Ranking as of", today), ("Export date", date.today()), ("App version", app_version),
    ):
        append_values(ws, row)
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 85
    for row in (2, 3, 4, 5):
        ws[f"B{row}"].alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[row].height = 56 if row == 5 else 32


def _write_summary_formulas(summary, pool) -> None:
    pool_columns = {cell.value: cell.column_letter for cell in pool[1]}
    summary_columns = {cell.value: cell.column_letter for cell in summary[1]}
    last = max(pool.max_row, 2)

    def pool_range(label):
        column = pool_columns[label]
        return f"Pool!${column}$2:${column}${last}"

    for row in range(2, summary.max_row + 1):
        category = f"$A{row}"
        label = summary[f"A{row}"].value
        if label.startswith(("=", ">", "<")) or any(mark in label for mark in "~*?"):
            category = f'"="&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({category},"~","~~"),"*","~*"),"?","~?")'
        for period in PERIODS:
            total = f"{summary_columns[f'N for {period}']}{row}"
            app = f"{summary_columns[f'App {period}']}{row}"
            diff = f"{summary_columns[f'Difference {period}']}{row}"
            formula_cell(summary, total, f'=COUNTIFS({pool_range("Category")},{category},'
                         f'{pool_range("Plan")},$B{row},{pool_range(f"Counts for {period}")},"Y")')
            formula_cell(summary, diff, f"={total}-{app}")


def _option(row) -> str | None:
    if row.option:
        return row.option
    words = recount._options(row.name)
    if words & recount._INCOME_WORDS:
        return "IDCW"
    if "bonus" in words:
        return "Bonus"
    if "growth" in words:
        return "Growth"
    if "cumulative" in scheme_universe._OPTION_WORDS.findall(row.name.lower()):
        return "Cumulative"
    return None


def _plan_evidence(summary, funnel, pool, excluded, end_dates, check_rows, *,
                   category, plan, today, source, ledger, ranking, nav_ends):
    app_returns = {period: {scheme.amfi_code: ranking.pools[period][scheme.id]
                            for scheme in ranking.peers.schemes if scheme.id in ranking.pools[period]}
                   for period in PERIODS}
    by_code = {row.scheme_code: row for row in source}
    app_names = {scheme.amfi_code: ranking.names[scheme.id] for scheme in ranking.peers.schemes}
    recount_pools = {f"{years}Y": set(result.final_pool) for years, result in ledger.items()}
    prefix = (category, plan)
    period_drops = []
    app_totals = []
    for period, result in zip(PERIODS, ledger.values(), strict=True):
        dropped = {step.name: len(step.set_aside) for step in result.steps}
        period_drops.extend(dropped[step] for step in HISTORY_STEPS)
        for step in result.steps:
            append_values(funnel, (*prefix, period, today, step.name, step.remaining, len(step.set_aside),
                                   STEPS[step.name]))
            for entry in step.set_aside:
                row = by_code[entry.scheme_code]
                append_values(excluded, (*prefix, period, today, entry.scheme_code, entry.name, row.amc_name,
                                         recount._plan_for(row), _option(row), row.nav_date, step.name, entry.reason))

        counted = recount_pools[period]
        app_codes = set(app_returns[period])
        app_totals.extend((None, len(app_codes), None))
        recount_only, app_only = counted - app_codes, app_codes - counted
        check_rows.append(CheckRow(
            *prefix, period, today, len(counted), len(app_codes), len(counted) - len(app_codes),
            "PASS" if counted == app_codes else "FAIL",
            ", ".join(sorted(recount_only)) or None, ", ".join(sorted(app_only)) or None,
        ))
        newest = max((nav_ends[code] for code in app_codes), default=None)
        for code in sorted(counted | app_codes):
            row = by_code.get(code)
            used = nav_ends[code] if code in app_codes else None
            different = None if used is None else "Yes" if used != newest else "No"
            append_values(end_dates, (*prefix, period, today, code, row.name if row else app_names[code],
                                      row.nav_date if row else None, used, different))

    first_steps = ledger[recount.PERIODS[0]].steps
    remaining = {step.name: step.remaining for step in first_steps}
    base_drops = {step.name: len(step.set_aside) for step in first_steps}
    append_values(summary, (*prefix, today, remaining["category_match"], remaining["not_live"],
                            remaining["second_option_of_fund"], *(base_drops[step] for step in BASE_STEPS),
                            *period_drops, *app_totals))

    for code in sorted(set.union(*recount_pools.values())):
        row = by_code[code]
        period_values = []
        for period in PERIODS:
            counted = code in recount_pools[period]
            period_values.extend((app_returns[period].get(code) if counted else None, "Y" if counted else "N"))
        used = nav_ends[code] if any(code in app_returns[p] for p in PERIODS if code in recount_pools[p]) else None
        append_values(pool, (*prefix, today, row.name, row.amc_name, code, _option(row), row.nav_date, used,
                         *period_values))


async def _populate(wb, db, navall_text, today):
    summary = _sheet(wb, "Summary", (
        "Category", "Plan", "As of", "Schemes in category", "Live", "Growth, one per fund",
        *(f"Set aside: {step}" for step in BASE_STEPS),
        *(f"Set aside: {step} ({p})" for p in PERIODS for step in HISTORY_STEPS),
        *(label for p in PERIODS for label in (f"N for {p}", f"App {p}", f"Difference {p}")),
    ))
    funnel = _sheet(wb, "Funnel", ("Category", "Plan", "Period", "As of", "Step", "Remaining", "Dropped", "Why"))
    pool = _sheet(wb, "Pool", (
        "Category", "Plan", "As of", "Fund", "Fund house", "Scheme code", "Option", "NAVAll price date",
        "Price date used", *(label for p in PERIODS for label in (f"{p} return", f"Counts for {p}")),
    ))
    excluded = _sheet(wb, "Excluded", ("Category", "Plan", "Period", "As of", "Scheme code", "Scheme", "Fund house",
                                       "Scheme plan", "Option", "NAVAll price date", "Step", "Reason"))
    cross = _sheet(wb, "Cross-checks", ("Reference", "Its figure", "Reference date", "Definition",
                                         "Our figure on its basis", "Difference", "Reason"))
    end_dates = _sheet(wb, "End dates", ("Category", "Plan", "Period", "As of", "Scheme code", "Fund",
                                         "NAVAll price date", "Return end date used", "Different date?"))

    source_categories = defaultdict(list)
    for row in recount.parse_navall(navall_text):
        source_categories[recount._canonical_category(row.category)].append(row)

    client = _SnapshotUniverse(navall_text, today)
    checks = []
    # The app caches returns by category and plan across requests. Isolate this snapshot
    # from those caches and leave the normal online services intact after the export.
    with (db.no_autoflush,
          patch.object(performance_ranking, "get_category_peers", client.get_category_peers),
          patch.object(category_ranking, "warm_nav_history", _no_warming),
          patch.object(category_ranking, "_category_returns_cache", {}),
          patch.object(category_ranking, "_category_short_history_cache", {})):
        for category in sorted(source_categories.keys() | client.categories.keys()):
            rows = source_categories.get(category, [])
            source = recount._category_rows(rows, category, today)
            codes = {row.scheme_code for row in source} | {row.amfi_code for row in client.categories.get(category, ())}
            client.stored = {s.amfi_code: s for s in db.query(Scheme).filter(Scheme.amfi_code.in_(codes)).all()}
            history, nav_ends = _stored_history(db, client.stored, today)
            for plan in SchemePlanType:
                reference = Scheme(sebi_category=category, plan_type=plan)
                ranking = await performance_ranking.load_ranking_pools(db, reference, today)
                ledger = recount.recount_all_periods(rows, category, plan.value, today, history)
                _plan_evidence(summary, funnel, pool, excluded, end_dates, checks, category=category,
                               plan=plan.value.title(), today=today, source=source, ledger=ledger,
                               ranking=ranking, nav_ends=nav_ends)

    _write_summary_formulas(summary, pool)
    return_headers = {f"{period} return" for period in PERIODS}
    for header, *cells in pool.iter_cols():
        if header.value in return_headers:
            for cell in cells:
                cell.number_format = "0.00%"
    add_checks_sheet(wb, checks)
    sources = _sheet(wb, "Sources", ("Reference", "Source", "Date taken", "What we used", "Where to find it"))
    for row in SOURCES:
        append_values(sources, row)
    for sheet in (summary, funnel, pool, excluded, cross, end_dates, sources):
        freeze_and_filter(sheet)


def write_workbook(db: Session, out_path: Path, *, navall_text: str, today: date, app_version: str) -> None:
    """Write an editable workbook from supplied NAVAll text and existing reference rows."""
    wb = Workbook()
    wb.calculation = CalcProperties(calcMode="auto", fullCalcOnLoad=True)
    _read_me(wb, today, app_version)
    asyncio.run(_populate(wb, db, navall_text, today))
    wb.save(out_path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--navall", type=Path, required=True, help="Local AMFI NAVAll text file")
    parser.add_argument("--today", type=date.fromisoformat, default=date.today())
    parser.add_argument("--app-version", default="Unspecified")
    args = parser.parse_args(argv)

    from app.db.session import SessionLocal

    navall_text = args.navall.read_text(encoding="utf-8-sig")
    with SessionLocal() as db:
        write_workbook(db, args.out, navall_text=navall_text, today=args.today, app_version=args.app_version)
    return 0


if __name__ == "__main__":
    sys.exit(main())
