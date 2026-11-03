"""Read-only report: which funds end on each benchmark label, and which end on "none".

    python scripts/benchmark_none_report.py
    python scripts/benchmark_none_report.py --max-names 300

Runs the same selection the screens use (`benchmark_choices`) over every held scheme
(has a folio, so a fund sold long ago still counts) and every listed active scheme, and
prints how many end on each final label, then the categories and fund names that end on
"none" (both "No benchmark" and "As printed in the fund house's factsheet", which is
"none" for the index series but shows printed returns). Scheme names are public reference
data; no user, member, amount or holding quantity is printed.

Needs only a database. No network. Every statement is checked to be a SELECT and a
SQLite file is opened read-only, as the other read-only reports do.
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.folio import Folio
from app.models.reference import Scheme
from app.services.analytics.benchmark_selection import SOURCE_LABELS, PRINTED_LABEL
from app.services.fund_page.benchmark_select import benchmark_choices

_BATCH = 500  # stays below SQLite's 999-variable limit
LABEL_ORDER = (SOURCE_LABELS["factsheet"], SOURCE_LABELS["closest"], SOURCE_LABELS["category"], PRINTED_LABEL, SOURCE_LABELS["none"])


@dataclass
class NoneReport:
    held: Counter = field(default_factory=Counter)      # final label -> schemes
    listed: Counter = field(default_factory=Counter)
    none_by_category: dict[str, dict[str, int]] = field(default_factory=lambda: defaultdict(lambda: {"held": 0, "listed": 0}))
    none_names_held: list[tuple[str, str, str]] = field(default_factory=list)    # (category, name, label)
    none_names_listed: list[tuple[str, str, str]] = field(default_factory=list)


def collect(db: Session) -> NoneReport:
    """Only SELECTs. `held` and `listed` overlap: a held active scheme is in both."""
    held_ids = set(db.scalars(select(Folio.scheme_id).distinct()))
    # Filtered in Python: an `IN` over every held id could exceed a driver's variable limit.
    schemes = [s for s in db.scalars(select(Scheme)) if s.is_active or s.id in held_ids]
    report = NoneReport()
    for start in range(0, len(schemes), _BATCH):
        batch = schemes[start:start + _BATCH]
        choices = benchmark_choices(db, {s.id: s for s in batch})
        for scheme in batch:
            choice = choices[scheme.id]
            is_held, is_listed = scheme.id in held_ids, bool(scheme.is_active)
            if is_held:
                report.held[choice.label] += 1
            if is_listed:
                report.listed[choice.label] += 1
            if choice.source != "none":
                continue
            category = scheme.sebi_category or "(no category)"
            counts = report.none_by_category[category]
            line = (category, scheme.name, choice.label)
            if is_held:
                counts["held"] += 1
                report.none_names_held.append(line)
            if is_listed:
                counts["listed"] += 1
                report.none_names_listed.append(line)
    report.none_names_held.sort()
    report.none_names_listed.sort()
    return report


def _table(title: str, counter: Counter) -> list[str]:
    total = sum(counter.values())
    lines = [f"{title} (total {total})"]
    for label in LABEL_ORDER:
        count = counter.get(label, 0)
        share = f"{count * 100 / total:.1f}%" if total else "-"
        lines.append(f"  {label:<45} {count:>7}  {share:>6}")
    return lines


def format_report(report: NoneReport, max_names: int = 100) -> str:
    lines = _table("Held schemes by final label", report.held) + [""]
    lines += _table("Listed active schemes by final label", report.listed) + [""]
    lines.append("Categories ending on none (held / listed)")
    ordered = sorted(report.none_by_category.items(), key=lambda kv: (-kv[1]["held"], -kv[1]["listed"], kv[0]))
    for category, counts in ordered:
        lines.append(f"  {category:<70} {counts['held']:>6} {counts['listed']:>7}")
    for title, names in (("Held funds ending on none", report.none_names_held),
                         ("Listed active funds ending on none", report.none_names_listed)):
        lines += ["", f"{title} (showing {min(len(names), max_names)} of {len(names)})"]
        lines += [f"  {category} | {name} | {label}" for category, name, label in names[:max_names]]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database-url", help="defaults to the application's configured database")
    parser.add_argument("--max-names", type=int, default=100, help="names printed per list (default 100)")
    args = parser.parse_args(argv)
    from scripts.benchmark_series_check import read_only_engine
    engine = None
    try:
        url = args.database_url
        if url is None:
            from app.config import settings
            url = settings.database_url
        engine = read_only_engine(url)
        with Session(engine, autoflush=False) as db:
            print(format_report(collect(db), args.max_names))
    except Exception:
        # Exceptions can carry SQL parameters or connection strings; keep them out of the output.
        print("report_stopped=1")
        return 1
    finally:
        if engine is not None:
            engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
