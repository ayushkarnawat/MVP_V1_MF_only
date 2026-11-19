"""Recount category peers from a local AMFI NAVAll.txt file."""

import argparse
import csv
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path


PERIODS = (1, 3, 5)

# Explicit equivalences for variant AMFI headings. Leave ambiguous headings alone.
_CATEGORY_PREFIXES = {
    "Equity Schemes": "Equity Scheme",
    "Hybrid Schemes": "Hybrid Scheme",
    "Solution Oriented Schemes": "Solution Oriented Scheme",
    "Solution Oriented Schemes **": "Solution Oriented Scheme",
    "Income/Debt Oriented Schemes": "Debt Scheme",
}
_CATEGORY_LABELS = {
    "Equity Scheme - ELSS- Tax Saver Fund": "Equity Scheme - ELSS",
    "Equity Scheme - Sectoral Fund": "Equity Scheme - Sectoral/ Thematic",
    "Equity Scheme - Thematic Fund": "Equity Scheme - Sectoral/ Thematic",
    "Hybrid Scheme - Balanced Advantage Fund/ Dynamic Asset Allocation":
        "Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage",
    "Hybrid Scheme - Equity Savings Fund": "Hybrid Scheme - Equity Savings",
    "Hybrid Scheme - Multi Asset Allocation Fund": "Hybrid Scheme - Multi Asset Allocation",
    "Debt Scheme - Banking and PSU Debt Fund": "Debt Scheme - Banking and PSU Fund",
    "Debt Scheme - Dynamic Term Fund": "Debt Scheme - Dynamic Bond",
    "Debt Scheme - Ultra Short Term Fund": "Debt Scheme - Ultra Short Duration Fund",
    "Debt Scheme - Short Term Fund": "Debt Scheme - Short Duration Fund",
    "Debt Scheme - Medium Term Fund": "Debt Scheme - Medium Duration Fund",
    "Debt Scheme - Medium to Long Term Fund": "Debt Scheme - Medium to Long Duration Fund",
    "Debt Scheme - Long Term Fund": "Debt Scheme - Long Duration Fund",
}
_CATEGORY_HEADING = re.compile(r"(?:Open Ended|Closed? Ended|Interval Fund) Schemes\s*\((.+)\)")
_PLAN_WORDS = re.compile(r"\b(direct|dir|regular|reg)\b", re.IGNORECASE)
_OPTION_WORDS = re.compile(r"\b(growth|idcw|dividend|payout|reinvestment|bonus)\b", re.IGNORECASE)
_INCOME_WORDS = {"idcw", "dividend", "payout", "reinvestment"}
_DISTRIBUTION_WORDS = {"payout", "reinvestment"}
_LEGACY_SUFFIX = re.compile(
    r"(?:\s*[-(]\s*|\s+\(?)"
    r"(?:direct|dir|regular|reg|growth|idcw|dividend|payout|reinvestment|bonus)"
    r"(?:\s+(?:plan|option))?\)?$",
    re.IGNORECASE,
)
_PASSIVE_WORDS = re.compile(r"\b(?:index|etfs?)\b", re.IGNORECASE)
_EXCHANGE_TRADED = re.compile(r"\bexchange traded\b", re.IGNORECASE)
_CLOSURE_MARKER = re.compile(r"\b(?:closed|merged)\b", re.IGNORECASE)


@dataclass(frozen=True)
class AmfiRow:
    scheme_code: str
    name: str
    category: str
    nav_date: date | None
    amc_name: str = ""
    base_name: str = ""
    plan: str = ""
    option: str = ""
    has_nav: bool = True


@dataclass(frozen=True)
class LedgerEntry:
    scheme_code: str
    name: str
    reason: str


@dataclass(frozen=True)
class FlagEntry:
    scheme_code: str
    name: str
    flag: str


@dataclass(frozen=True)
class Step:
    name: str
    remaining: int
    set_aside: list[LedgerEntry]


@dataclass(frozen=True)
class RecountResult:
    steps: list[Step]
    final_pool: list[str]
    flags: list[FlagEntry]


def _canonical_category(category: str) -> str:
    normalized = " ".join(category.replace("’", "'").split())
    prefix, separator, label = normalized.partition(" - ")
    with_prefix = _CATEGORY_PREFIXES.get(prefix, prefix) + separator + label
    return _CATEGORY_LABELS.get(with_prefix, with_prefix)


def _nav_date(text: str) -> date | None:
    try:
        return datetime.strptime(text, "%d-%b-%Y").date()
    except ValueError:
        return None


def _has_nav(text: str) -> bool:
    try:
        nav = Decimal(text)
    except InvalidOperation:
        return False
    return nav.is_finite() and nav > 0


def parse_navall(text: str) -> list[AmfiRow]:
    """Read legacy name-only rows and rows with separate Plan and Option columns."""
    rows: list[AmfiRow] = []
    category = amc_name = ""
    for line in text.lstrip("\ufeff").splitlines():
        line = line.strip()
        if not line:
            continue
        heading = _CATEGORY_HEADING.fullmatch(line)
        if heading:
            category = heading[1]
            amc_name = ""
            continue
        if ";" not in line:
            amc_name = line
            continue

        fields = [field.strip() for field in line.split(";")]
        if not (category and amc_name and len(fields) in (6, 8) and fields[0].isascii()
                and fields[0].isdigit() and fields[3]):
            continue
        code, _, _, scheme_name, *tail = fields
        plan, option = tail[:2] if len(tail) == 4 else ("", "")
        nav, nav_date = tail[-2:]
        rows.append(AmfiRow(
            scheme_code=code,
            name=" - ".join(part for part in (scheme_name, plan, option) if part),
            category=category,
            nav_date=_nav_date(nav_date),
            amc_name=amc_name,
            base_name=scheme_name if len(fields) == 8 else "",
            plan=plan,
            option=option,
            has_nav=_has_nav(nav),
        ))
    return rows


def _fund_key(row: AmfiRow) -> tuple[str, str]:
    name = row.base_name or row.name
    if not row.base_name:
        while (suffix := _LEGACY_SUFFIX.search(name)) is not None:
            name = name[:suffix.start()].rstrip()
    return (" ".join(row.amc_name.casefold().split()), " ".join(name.casefold().split()))


def _plans(text: str) -> set[str]:
    return {"direct" if word.lower().startswith("dir") else "regular"
            for word in _PLAN_WORDS.findall(text)}


def _plan_for(row: AmfiRow) -> str | None:
    plans = _plans(row.plan) or _plans(row.base_name or row.name)
    return next(iter(plans)) if len(plans) == 1 else None


def _options(text: str) -> set[str]:
    return set(_OPTION_WORDS.findall(text.lower()))


def _not_growth(row: AmfiRow) -> bool:
    return bool(_options(f"{row.name} {row.option}") & (_INCOME_WORDS | {"bonus"}))


def _option_kinds(words: set[str]) -> set[str]:
    kinds = words & {"growth", "bonus"}
    if words & _INCOME_WORDS:
        kinds.add("income")
    return kinds


def _mis_named(row: AmfiRow) -> bool:
    declared_plans = _plans(row.plan)
    if declared_plans and _plans(row.base_name) - declared_plans:
        return True

    named = _options(row.base_name)
    declared = _options(row.option)
    declared_kinds = _option_kinds(declared)
    declared_distributions = declared & _DISTRIBUTION_WORDS
    return bool(
        (declared_kinds and _option_kinds(named) - declared_kinds)
        or (declared_distributions and (named & _DISTRIBUTION_WORDS) - declared_distributions)
    )


def _is_passive(row: AmfiRow) -> bool:
    category = " ".join(row.category.split())
    return bool(_PASSIVE_WORDS.search(row.name) or _PASSIVE_WORDS.search(category)
                or _EXCHANGE_TRADED.search(category))


def _category_rows(rows: list[AmfiRow], category: str, today: date) -> list[AmfiRow]:
    wanted = _canonical_category(category)
    by_code: dict[str, AmfiRow] = {}

    def priority(row: AmfiRow) -> tuple[bool, date]:
        return (row.has_nav and row.nav_date is not None and row.nav_date <= today,
                row.nav_date or date.min)

    for row in rows:
        if _canonical_category(row.category) != wanted:
            continue
        previous = by_code.get(row.scheme_code)
        if previous is None or priority(row) > priority(previous):
            by_code[row.scheme_code] = row
    return sorted(by_code.values(), key=lambda row: row.scheme_code)


def _review_flags(rows: list[AmfiRow], plans: dict[str, str | None]) -> list[FlagEntry]:
    flags: list[FlagEntry] = []
    funds: dict[tuple[str, str], list[AmfiRow]] = {}
    for row in rows:
        funds.setdefault(_fund_key(row), []).append(row)
        if plans[row.scheme_code] is None:
            flags.append(FlagEntry(row.scheme_code, row.name, "plan_unknown"))
        if row.nav_date is None:
            flags.append(FlagEntry(row.scheme_code, row.name, "unparseable_nav_date"))
        if _mis_named(row):
            flags.append(FlagEntry(row.scheme_code, row.name, "mis_named"))
    for series in funds.values():
        if all(_options(f"{row.name} {row.option}") & _INCOME_WORDS for row in series):
            first = series[0]
            flags.append(FlagEntry(first.scheme_code, first.name, "idcw_only_fund"))
    return flags


def recount_pool(
    rows: list[AmfiRow],
    category: str,
    plan: str,
    today: date,
    history_days: dict[str, int] | None = None,
    period_years: int = 3,
) -> RecountResult:
    """Apply the workbook's funnel and record each scheme's first exclusion."""
    if plan not in ("direct", "regular"):
        raise ValueError("Plan must be direct or regular.")
    if period_years not in PERIODS:
        raise ValueError("Period must be 1, 3 or 5 years.")

    remaining = _category_rows(rows, category, today)
    steps = [Step("category_match", len(remaining), [])]
    plans = {row.scheme_code: _plan_for(row) for row in remaining}
    flags = _review_flags(remaining, plans)
    live_since = today - timedelta(days=30)
    min_history = period_years * 365
    seen_funds: set[tuple[str, str]] = set()

    def duplicate_fund(row: AmfiRow) -> bool:
        # Rows are in scheme-code order, so equivalent series have a stable representative.
        key = _fund_key(row)
        if key in seen_funds:
            return True
        seen_funds.add(key)
        return False

    filters: list[tuple[str, Callable[[AmfiRow], bool]]] = [
        ("not_live", lambda row: not row.has_nav or row.nav_date is None
         or not live_since <= row.nav_date <= today),
        ("idcw", _not_growth),
        ("other_plan_type", lambda row: plans[row.scheme_code] != plan),
        ("second_option_of_fund", duplicate_fund),
        ("index_or_etf", _is_passive),
        ("no_history_for_period", lambda row: history_days is not None
         and history_days.get(row.scheme_code, 0) < min_history),
        ("closed_or_merged", lambda row: bool(_CLOSURE_MARKER.search(row.name))),
    ]
    for reason, exclude in filters:
        retained: list[AmfiRow] = []
        set_aside: list[LedgerEntry] = []
        for row in remaining:
            if exclude(row):
                set_aside.append(LedgerEntry(row.scheme_code, row.name, reason))
            else:
                retained.append(row)
        remaining = retained
        steps.append(Step(reason, len(remaining), set_aside))

    dated_peers = [(row, row.nav_date) for row in remaining if row.nav_date is not None]
    if dated_peers:
        newest = max(nav_date for _, nav_date in dated_peers)
        for row, nav_date in dated_peers:
            if (newest - nav_date).days > 4:
                flags.append(FlagEntry(row.scheme_code, row.name, "mixed_end_dates"))
    return RecountResult(steps, [row.scheme_code for row in remaining], flags)


def recount_all_periods(
    rows: list[AmfiRow],
    category: str,
    plan: str,
    today: date,
    history_days: dict[str, int] | None = None,
) -> dict[int, RecountResult]:
    return {years: recount_pool(rows, category, plan, today, history_days, years) for years in PERIODS}


def _read_history(path: Path) -> dict[str, int]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or not {"scheme_code", "history_days"} <= set(reader.fieldnames):
            raise ValueError("History CSV must have scheme_code and history_days columns.")
        history: dict[str, int] = {}
        for row in reader:
            code = (row["scheme_code"] or "").strip()
            days = (row["history_days"] or "").strip()
            if not code or not days.isascii() or not days.isdigit():
                raise ValueError(f"Invalid scheme code or history days on CSV line {reader.line_num}.")
            history[code] = int(days)
    return history


def _ledger_text(category: str, plan: str, results: dict[int, RecountResult]) -> str:
    lines = [
        f"AMFI pool recount | {_canonical_category(category)} | {plan}",
        "Known gap: NAVAll.txt does not identify schemes marked inactive in the app database.",
    ]
    exchange_traded = _EXCHANGE_TRADED.search(" ".join(category.split()))
    for years, result in results.items():
        lines.extend(["", f"{years}Y", "Step | Remaining"])
        lines.extend(f"{step.name} | {step.remaining}" for step in result.steps)
        lines.append("Set aside")
        for step in result.steps:
            for entry in step.set_aside:
                detail = " (exchange traded category)" if exchange_traded and entry.reason == "index_or_etf" else ""
                lines.append(f"{entry.reason} | {entry.scheme_code} | {entry.name}{detail}")
        lines.append("Flags")
        lines.extend(f"{entry.flag} | {entry.scheme_code} | {entry.name}" for entry in result.flags)
        lines.append("Final pool")
        lines.extend(result.final_pool)
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", required=True)
    parser.add_argument("--plan", choices=("direct", "regular"), required=True)
    parser.add_argument("--navall", type=Path, required=True)
    parser.add_argument("--history", type=Path, help="CSV with scheme_code and history_days columns")
    parser.add_argument("--period", choices=("1", "3", "5", "all"), default="all")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    try:
        rows = parse_navall(args.navall.read_text(encoding="utf-8-sig"))
        history = _read_history(args.history) if args.history is not None else None
        today = date.today()
        if args.period == "all":
            results = recount_all_periods(rows, args.category, args.plan, today, history)
        else:
            years = int(args.period)
            results = {years: recount_pool(rows, args.category, args.plan, today, history, years)}
        args.out.write_text(_ledger_text(args.category, args.plan, results), encoding="utf-8", newline="\n")
    except (OSError, ValueError, csv.Error) as exc:
        parser.error(str(exc))

    for years, result in results.items():
        print(f"{years}Y | {len(result.final_pool)} schemes in the pool")
        for step in result.steps:
            print(f"{step.name} | {step.remaining}")
            for entry in step.set_aside:
                print(entry.name)


if __name__ == "__main__":
    main()
