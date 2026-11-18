"""Batch L: portfolio-disclosure audit queries E1 to E5, run read-only, one CSV per query.

    python scripts/audit_disclosures/run_audit.py --target-month-end 2026-10-31 --stdout

Nothing here writes to the database. The connection is made read-only before any query runs
(`PRAGMA query_only = ON` on SQLite, `SET TRANSACTION READ ONLY` on PostgreSQL) and the run
refuses to start if it cannot confirm that. Results hold fund-house and fund names, dates,
counts and assets only: no household or personal data is read.

The queries live in queries.sql next to this file. How to run it on the staging VM:
Docs/orchestration/2026-11-18-disclosures-audit-guide.md.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import Connection, bindparam, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.types import Date, String

QUERIES_FILE = Path(__file__).with_name("queries.sql")

# Fund houses whose normal state for a month is "no row", so they are never counted as a miss
# and never sit in the denominator. They are listed separately in the report.
#   - ASK, IL&FS, Lakshya, Carnelian, Nuvama publish no holdings file at all. They are NOT in the
#     52-house registry (backend/app/services/analytics/portfolio_disclosure_resolvers.py,
#     AMC_DISCLOSURE_RESOLVERS); the decision is recorded in
#     Docs/analytics/2026-10-09-sub-project-2-lookthrough-engine-spec.md ("NO_CONTENT_FOUND").
#     The spelling is AMFI's scheme-master spelling, compared case-insensitively. Carnelian and
#     Nuvama have no AMFI-listed schemes today, so their names cannot be confirmed from data.
#   - Taurus publishes half-yearly only (registry cadence "half_yearly"); Monarch publishes a
#     fortnightly file used as its best available. Both ARE registry keys, spelled as below.
EXPECTED_ABSENT_AMCS = (
    "ASK Mutual Fund",
    "IL&FS Mutual Fund (IDF)",
    "Lakshya Mutual Fund",
    "Carnelian Mutual Fund",
    "Nuvama Mutual Fund",
    "Taurus Mutual Fund",
    "Monarch Mutual Fund",
)

_PARAM_RE = re.compile(r"(?<![:\w]):([A-Za-z_]\w*)")


def load_queries(path: Path = QUERIES_FILE) -> dict[str, str]:
    """Return {"E1": sql, ...}: the comment lines removed, the trailing semicolon dropped."""
    found: dict[str, list[str]] = {}
    current: list[str] | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        marker = re.match(r"^--\s*@query\s+(E\d+)\s*$", line)
        if marker:
            current = found.setdefault(marker.group(1), [])
        elif current is not None and not line.lstrip().startswith("--"):
            current.append(line)
    queries = {name: "\n".join(lines).strip().rstrip(";").strip() for name, lines in found.items()}
    return {name: sql for name, sql in sorted(queries.items()) if sql}


def open_read_only(database_url: str) -> Connection:
    """Open a connection that cannot write, or refuse. The caller closes it and never commits."""
    url = make_url(database_url)
    backend = url.get_backend_name()
    if backend not in ("sqlite", "postgresql"):
        raise ValueError(f"Only SQLite and PostgreSQL are supported, not {backend!r}")
    if backend == "sqlite":
        # Never let the audit create an empty database by mistake.
        database = url.database or ""
        if database in ("", ":memory:") or not Path(database).is_file():
            raise ValueError("An existing SQLite database file is required")
    engine = create_engine(url)
    conn = engine.connect()
    try:
        if backend == "sqlite":
            conn.exec_driver_sql("PRAGMA query_only = ON")
            confirmed = conn.exec_driver_sql("PRAGMA query_only").scalar() == 1
        else:
            # Must be the first statement of the transaction.
            conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            confirmed = str(conn.exec_driver_sql("SHOW transaction_read_only").scalar()).lower() == "on"
        if not confirmed:
            raise RuntimeError("Could not confirm a read-only connection; the audit refuses to run")
    except BaseException:
        conn.close()
        engine.dispose()
        raise
    return conn


def _statement(sql: str, target: date, prior: date):
    values = {
        "target_month_end": bindparam("target_month_end", value=target, type_=Date()),
        "prior_month_end": bindparam("prior_month_end", value=prior, type_=Date()),
        "expected_absent": bindparam("expected_absent", value=[n.upper() for n in EXPECTED_ABSENT_AMCS],
                                     type_=String(), expanding=True),
    }
    names = set(_PARAM_RE.findall(sql))
    unknown = names - set(values)
    if unknown:
        raise ValueError(f"Unknown query parameter(s): {sorted(unknown)}")
    return text(sql).bindparams(*(values[name] for name in sorted(names)))


def run_audit(database_url: str, target_month_end: date, out_dir: Path) -> dict[str, Path]:
    """Run E1 to E5 read-only and write one CSV each into out_dir. Returns {"E1": path, ...}."""
    if (target_month_end + timedelta(days=1)).day != 1:
        raise ValueError("target_month_end must be the last day of a month")
    prior_month_end = target_month_end.replace(day=1) - timedelta(days=1)
    queries = load_queries()
    conn = open_read_only(database_url)
    try:
        results = {}
        for name, sql in queries.items():
            if not sql.lstrip().upper().startswith("SELECT"):
                raise RuntimeError(f"{name} is not a SELECT; the audit refuses to run it")
            result = conn.execute(_statement(sql, target_month_end, prior_month_end))
            results[name] = (list(result.keys()), result.fetchall())
    finally:
        conn.rollback()
        conn.close()
        conn.engine.dispose()

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for name, (header, rows) in results.items():
        path = out_dir / f"{name}.csv"
        with open(path, "w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(header)
            for row in rows:
                writer.writerow(["" if value is None else str(value) for value in row])
        paths[name] = path
    return paths


def _last_month_end(today: date) -> date:
    return today.replace(day=1) - timedelta(days=1)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database-url", help="Default: the app's own DATABASE_URL (set inside the backend container).")
    parser.add_argument("--target-month-end", type=date.fromisoformat,
                        help="Last day of the month audited. Default: the last day of the month before today.")
    parser.add_argument("--out-dir", type=Path, help="Where the CSV files go. Default: a temporary folder.")
    parser.add_argument("--stdout", action="store_true",
                        help="Also print every CSV, each under a === E1 === style line (use this inside the container).")
    args = parser.parse_args(argv)

    database_url = args.database_url
    if not database_url:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
        from app.config import settings
        database_url = settings.database_url
    target = args.target_month_end or _last_month_end(date.today())
    out_dir = args.out_dir or Path(tempfile.mkdtemp(prefix="audit_disclosures_"))

    paths = run_audit(database_url, target, out_dir)
    print(f"Portfolio disclosures audit, read-only. Target month end {target.isoformat()}, "
          f"taken on {date.today().isoformat()}.")
    for name, path in paths.items():
        if args.stdout:
            print(f"=== {name} ===")
            print(path.read_text(encoding="utf-8"), end="")
            print(f"=== end {name} ===")
        else:
            print(f"{name}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
