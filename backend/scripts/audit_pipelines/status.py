"""Status check of the two AMC data pipelines (factsheets and portfolio disclosures), read-only.

Part S of Docs/orchestration/2026-11-27-amc-data-pipelines-plan.html. Run inside the backend
container on the staging VM; the run guide is Docs/orchestration/2026-11-27-pipelines-status-check-guide.md.

    python scripts/audit_pipelines/status.py --target-month-end 2026-10-31
    python scripts/audit_pipelines/status.py --target-month-end 2026-10-31 --discover   # adds S5

It also runs when piped in (``python - <args> < status.py``) from the container's /app folder, so it
needs no deploy: everything it reads besides the database is already in the image.

Blocks printed, each as CSV between ``=== NAME ===`` and ``=== end NAME ===``:
  S1-E1..E5  the 18 Nov disclosure audit queries (scripts/audit_disclosures), unchanged
  S2a        factsheets: newest reference period per fund house, schemes with a manager then
  S2b        factsheets: schemes with a manager per house per period, last five periods
  S3         disclosures: batches and distinct source files per house, date and status, from three
             days before last month's end to the target (shows LIC's second workbook, and any batch
             dated on a last working day)
  S4         disclosures: scheme families written last month that have fewer written series now
  S7         registry keys with no live schemes, and live houses no registry knows (both registries)
  S5         (--discover only) every automatic house's locator run in discovery mode with a relaxed
             date window: which houses list files dated just before the month end. Plain requests,
             the job's own browser user agent, nothing downloaded, nothing written.

Nothing here writes. The database connection is made read-only before any query and the run refuses
to start if that cannot be confirmed (the same check as run_audit.py). Every query must be a SELECT.
Output holds fund-house names, fund names, dates, counts and file addresses: no household or
personal data is read.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import io
import sys
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace



def _project_root(file_value: str | None, cwd: Path) -> Path:
    """The backend folder: two levels above this file, or the working folder when piped in.

    Piped in (`python - < status.py`, as the VM guide runs it from /app), Python sets __file__ to
    "<stdin>", which is not a real path, so the working folder is the root.
    """
    if file_value and not file_value.startswith("<"):
        return Path(file_value).resolve().parents[2]
    return cwd


_ROOT = _project_root(globals().get("__file__"), Path.cwd())
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from sqlalchemy import bindparam, text  # noqa: E402
from sqlalchemy.types import Date  # noqa: E402

from scripts.audit_disclosures import run_audit as e_audit  # noqa: E402

FACTSHEET_HISTORY_PERIODS = 5
DISCOVERY_WINDOW_DAYS = 3
DISCOVERY_TIMEOUT_SECONDS = 120.0

# Portable SQL (SQLite in the tests, PostgreSQL on staging). Bind parameters: :target_month_end,
# :prior_month_end, :window_start (prior month end minus 3 days), :history_since.
QUERIES: dict[str, str] = {
    "S2a": """
SELECT p.amc_name AS amc_name,
       COUNT(*) AS live_schemes,
       MAX(p.house_newest) AS newest_period,
       SUM(CASE WHEN p.scheme_newest IS NOT NULL AND p.scheme_newest = p.house_newest THEN 1 ELSE 0 END)
           AS schemes_at_newest,
       SUM(CASE WHEN p.scheme_newest IS NOT NULL THEN 1 ELSE 0 END) AS schemes_with_any_manager
FROM (
    SELECT q.amc_name AS amc_name, q.scheme_newest AS scheme_newest,
           MAX(q.scheme_newest) OVER (PARTITION BY q.amc_name) AS house_newest
    FROM (
        SELECT s.amc_name AS amc_name, MAX(f.reference_period) AS scheme_newest
        FROM schemes s
        LEFT JOIN scheme_fund_managers f ON f.scheme_id = s.id
        WHERE s.is_active = TRUE
        GROUP BY s.id, s.amc_name
    ) q
) p
GROUP BY p.amc_name
ORDER BY p.amc_name
""",
    "S2b": """
SELECT s.amc_name AS amc_name,
       f.reference_period AS reference_period,
       COUNT(DISTINCT f.scheme_id) AS schemes
FROM scheme_fund_managers f
JOIN schemes s ON s.id = f.scheme_id
WHERE s.is_active = TRUE
  AND f.reference_period >= :history_since
GROUP BY s.amc_name, f.reference_period
ORDER BY s.amc_name, f.reference_period
""",
    "S3": """
SELECT b.amc_name AS amc_name,
       b.as_of_date AS as_of_date,
       CAST(b.status AS VARCHAR(40)) AS status,
       COUNT(*) AS batches,
       COUNT(DISTINCT b.source_url) AS files
FROM disclosure_batches b
WHERE b.as_of_date >= :window_start
  AND b.as_of_date <= :target_month_end
GROUP BY b.amc_name, b.as_of_date, CAST(b.status AS VARCHAR(40))
ORDER BY b.amc_name, b.as_of_date, CAST(b.status AS VARCHAR(40))
""",
    "S4": """
SELECT p.amc_name AS amc_name,
       p.family AS family,
       p.prior_written AS prior_written,
       COALESCE(t.target_written, 0) AS target_written,
       COALESCE(t.target_failed, 0) AS target_failed,
       COALESCE(t.target_awaiting, 0) AS target_awaiting,
       COALESCE(a.live_series, 0) AS live_series_now
FROM (
    SELECT s.amc_name AS amc_name, COALESCE(s.base_name, s.name) AS family, COUNT(*) AS prior_written
    FROM disclosure_batches b
    JOIN schemes s ON s.id = b.scheme_id
    WHERE b.as_of_date = :prior_month_end AND b.status = 'written'
    GROUP BY s.amc_name, COALESCE(s.base_name, s.name)
) p
LEFT JOIN (
    SELECT s.amc_name AS amc_name, COALESCE(s.base_name, s.name) AS family,
           SUM(CASE WHEN b.status = 'written' THEN 1 ELSE 0 END) AS target_written,
           SUM(CASE WHEN b.status = 'failed' THEN 1 ELSE 0 END) AS target_failed,
           SUM(CASE WHEN b.status = 'awaiting_manual_upload' THEN 1 ELSE 0 END) AS target_awaiting
    FROM disclosure_batches b
    JOIN schemes s ON s.id = b.scheme_id
    WHERE b.as_of_date = :target_month_end
    GROUP BY s.amc_name, COALESCE(s.base_name, s.name)
) t ON t.amc_name = p.amc_name AND t.family = p.family
LEFT JOIN (
    SELECT s.amc_name AS amc_name, COALESCE(s.base_name, s.name) AS family, COUNT(*) AS live_series
    FROM schemes s
    WHERE s.is_active = TRUE
    GROUP BY s.amc_name, COALESCE(s.base_name, s.name)
) a ON a.amc_name = p.amc_name AND a.family = p.family
WHERE COALESCE(t.target_written, 0) < p.prior_written
ORDER BY p.amc_name, p.family
""",
}

_LIVE_HOUSES = "SELECT s.amc_name AS amc_name, COUNT(*) AS live_series FROM schemes s WHERE s.is_active = TRUE GROUP BY s.amc_name"
_LIVE_SCHEMES = ("SELECT s.amc_name AS amc_name, s.name AS name, s.base_name AS base_name "
                 "FROM schemes s WHERE s.is_active = TRUE ORDER BY s.amc_name, s.name")


def _registries() -> dict[str, set[str]]:
    from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS
    from app.services.analytics.portfolio_disclosure_resolvers import AMC_DISCLOSURE_RESOLVERS
    return {"disclosures": set(AMC_DISCLOSURE_RESOLVERS), "factsheets": set(AMC_RESOLVERS)}


def _disclosure_registry():
    from app.services.analytics.portfolio_disclosure_resolvers import AMC_DISCLOSURE_RESOLVERS
    return AMC_DISCLOSURE_RESOLVERS


def _month_end_before(day: date) -> date:
    return day.replace(day=1) - timedelta(days=1)


def _params(target: date) -> dict[str, date]:
    prior = _month_end_before(target)
    since = target
    for _ in range(FACTSHEET_HISTORY_PERIODS - 1):
        since = _month_end_before(since)
    return {"target_month_end": target, "prior_month_end": prior,
            "window_start": prior - timedelta(days=DISCOVERY_WINDOW_DAYS),
            "history_since": since.replace(day=1)}


def _select(conn, name: str, sql: str, params: dict[str, date]):
    if not sql.lstrip().upper().startswith("SELECT"):
        raise RuntimeError(f"{name} is not a SELECT; the status check refuses to run it")
    names = [key for key in params if f":{key}" in sql]
    stmt = text(sql).bindparams(*(bindparam(key, value=params[key], type_=Date()) for key in names))
    result = conn.execute(stmt)
    return list(result.keys()), result.fetchall()


def _registry_rows(live: dict[str, int]) -> tuple[list[str], list[tuple]]:
    absent = {n.upper() for n in e_audit.EXPECTED_ABSENT_AMCS}
    rows = []
    for registry, keys in sorted(_registries().items()):
        for key in sorted(keys):
            if live.get(key, 0) == 0:
                rows.append((registry, key, "registry_key_without_live_schemes", 0))
        for house in sorted(live):
            if house not in keys and house.upper() not in absent:
                rows.append((registry, house, "live_house_not_in_registry", live[house]))
    return ["registry", "amc_name", "problem", "live_series"], rows


def run_status(database_url: str, target_month_end: date, *, with_schemes: bool = False):
    """Run S2a, S2b, S3, S4 and S7 read-only. Returns {"S2a": (header, rows), ...}; with
    with_schemes=True also {"_schemes": {amc_name: [scheme rows]}} for S5."""
    if (target_month_end + timedelta(days=1)).day != 1:
        raise ValueError("target_month_end must be the last day of a month")
    params = _params(target_month_end)
    conn = e_audit.open_read_only(database_url)
    try:
        blocks = {name: _select(conn, name, sql, params) for name, sql in QUERIES.items()}
        _, live_rows = _select(conn, "live houses", _LIVE_HOUSES, params)
        schemes: dict[str, list] = {}
        if with_schemes:
            header, rows = _select(conn, "live schemes", _LIVE_SCHEMES, params)
            for row in rows:
                item = SimpleNamespace(**dict(zip(header, row)))
                schemes.setdefault(item.amc_name, []).append(item)
    finally:
        conn.rollback()
        conn.close()
        conn.engine.dispose()
    blocks["S7"] = _registry_rows({row[0]: int(row[1]) for row in live_rows})
    if with_schemes:
        blocks["_schemes"] = schemes
    return blocks


def relaxed_fetch_dated_records(target: date, *, window_days: int = DISCOVERY_WINDOW_DAYS, seen: list):
    """A stand-in for the client's exact-date filter, used only in discovery mode: it records every
    dated record a locator saw, and keeps records dated from window_days before the month end up to
    the month end (never the month before). It never downloads: discovery mode is required."""
    from app.services.analytics import portfolio_disclosure_client as client_mod

    earliest = max(target - timedelta(days=window_days), target.replace(day=1))

    async def _fetch_dated_records(client, records, as_of, *, keep_all=True):
        if not client_mod._DISCOVERY_ONLY.get():
            raise RuntimeError("the status check only runs locators in discovery mode")
        results, urls = [], set()
        for url, disclosed, hint in records:
            seen.append((url, disclosed))
            if not url or disclosed is None or url in urls or not client_mod._WORKBOOK_URL.search(url):
                continue
            if earliest <= disclosed <= target:
                urls.add(url)
                results.append(client_mod.LocatedFile(None, url, disclosed, hint))
        return results

    return _fetch_dated_records


DISCOVERY_HEADER = ["amc_name", "kind", "result", "records_seen", "exact_month_end_files",
                    "near_month_end_files", "near_dates", "newest_other_date", "detail"]


def discover(target: date, schemes_by_house: dict[str, list], *, timeout: float = DISCOVERY_TIMEOUT_SECONDS):
    """S5: run every registered locator in discovery mode with the relaxed date window."""
    import httpx

    from app.services.analytics import portfolio_disclosure_client as client_mod
    from app.services.analytics.portfolio_disclosure_resolvers import DisclosureResolverKind

    rows = []

    async def one_house(http_client, amc_name, entry):
        kind = entry.kind.value
        if entry.kind is DisclosureResolverKind.MANUAL:
            return [amc_name, kind, "manual", 0, 0, 0, "", "", ""]
        if not client_mod._is_locate_implemented(entry):
            return [amc_name, kind, "not_onboarded", 0, 0, 0, "", "", ""]
        scheme_rows = schemes_by_house.get(amc_name) or []
        if not scheme_rows:
            return [amc_name, kind, "no_live_schemes", 0, 0, 0, "", "", "registry key has no live schemes"]
        seen: list = []
        original = client_mod._fetch_dated_records
        client_mod._fetch_dated_records = relaxed_fetch_dated_records(target, seen=seen)
        try:
            refs = await asyncio.wait_for(client_mod._locate_and_fetch(http_client, entry, scheme_rows), timeout)
        except Exception as exc:  # one house never stops the others; the reason is the finding
            status = getattr(getattr(exc, "response", None), "status_code", None)
            detail = f"{type(exc).__name__}: {exc}"[:500]
            return [amc_name, kind, f"error {status}" if status else "error", len(seen), 0, 0, "", "", detail]
        finally:
            client_mod._fetch_dated_records = original
        # Static-page houses return their whole history without passing the dated-records filter,
        # so "near" is decided here by the same window, never by "returned".
        earliest = max(target - timedelta(days=DISCOVERY_WINDOW_DAYS), target.replace(day=1))
        dates = [ref.as_of_date for ref in refs if ref.as_of_date]
        exact = sum(1 for d in dates if d == target)
        near = [d for d in dates if earliest <= d < target]
        everything = dates + [d for _, d in seen if d]
        older = [d for d in everything if d < earliest]
        records_seen = len(seen) if seen else len(refs)
        return [amc_name, kind, "ok", records_seen, exact, len(near),
                ";".join(d.isoformat() for d in sorted(set(near))), max(older).isoformat() if older else "", ""]

    async def run_all():
        token_discovery = client_mod._DISCOVERY_ONLY.set(True)
        token_today = client_mod._RUN_TODAY.set(target + timedelta(days=1))
        try:
            async with httpx.AsyncClient(timeout=client_mod._HTTP_TIMEOUT, headers=client_mod._HEADERS,
                                         follow_redirects=True) as http_client:
                for amc_name, entry in sorted(_disclosure_registry().items()):
                    rows.append(await one_house(http_client, amc_name, entry))
        finally:
            client_mod._RUN_TODAY.reset(token_today)
            client_mod._DISCOVERY_ONLY.reset(token_discovery)

    asyncio.run(run_all())
    return list(DISCOVERY_HEADER), rows


def _csv(header, rows) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow(["" if value is None else str(value) for value in row])
    return buffer.getvalue()


def _print_block(name: str, body: str) -> None:
    print(f"=== {name} ===")
    print(body, end="" if body.endswith("\n") else "\n")
    print(f"=== end {name} ===")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database-url", help="Default: the app's own DATABASE_URL (set inside the backend container).")
    parser.add_argument("--target-month-end", type=date.fromisoformat,
                        help="Last day of the month checked. Default: the last day of the month before today.")
    parser.add_argument("--discover", action="store_true",
                        help="Also run S5: every automatic house's locator in discovery mode (network, read-only).")
    args = parser.parse_args(argv)

    database_url = args.database_url
    if not database_url:
        from app.config import settings
        database_url = settings.database_url
    target = args.target_month_end or _month_end_before(date.today())

    print(f"AMC pipelines status check, read-only. Target month end {target.isoformat()}, "
          f"taken on {date.today().isoformat()}.")
    out_dir = Path(e_audit.tempfile.mkdtemp(prefix="pipelines_status_"))
    for name, path in e_audit.run_audit(database_url, target, out_dir).items():
        _print_block(f"S1-{name}", path.read_text(encoding="utf-8"))
    blocks = run_status(database_url, target, with_schemes=args.discover)
    for name in ("S2a", "S2b", "S3", "S4", "S7"):
        _print_block(name, _csv(*blocks[name]))
    if args.discover:
        _print_block("S5", _csv(*discover(target, blocks["_schemes"])))
    print("=== done ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
