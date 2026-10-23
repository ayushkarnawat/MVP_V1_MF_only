"""Read-mostly timing check for the pieces the Individual Fund page would call (planning check B3).

    python scripts/measure_fund_page_staging.py --user-id <uuid> [--schemes 4] [--runs 3]
        [--include-live-fetch] [--include-score] [--simulate-fresh-cache] [--risk-free 0.065]

Run it on the staging VM against the staging database, with a household that has real
statements. It times, for a sample of the household's held funds (different categories first):

  TIER 1  household-wide holdings, cold and warm (what the page would inherit if it called
          compute_holdings to find one fund), and a one-fund NAV availability check
  TIER 2  one fund's 3-year and 10-year NAV read, its benchmark's TRI read, the 3-year risk
          numbers (volatility, max drawdown, Sharpe, beta) computed in memory, and the latest two
          disclosure batches (top holdings, allocation grouping, added/removed diff)
  TIER 3  the category peer pass: peers, a 10-year month-end series for every peer, a 1-year and
          3-year daily NAV read for every peer plus an in-memory average (the category line),
          and the existing Fund Score for the fund (cold, then warm)

Prints only counts and milliseconds (and the SEBI category name, which is not personal).

Writes: none by default. A tier-1 NAV freshness check that would need a live download is reported as
"live fetch needed" instead of running; --include-live-fetch allows it (nav_history cache rows are
written, exactly what opening the Dashboard does today). Tier 3 needs --include-score: the peer set
may create scheme rows from AMFI's NAVAll file and the Fund Score writes its one row per fund per
day to fund_scores, exactly what opening Analytics does; any other write aborts the run.
--simulate-fresh-cache makes the NAV freshness check treat yesterday as today (the no-live-download path).
The default risk-free rate (6.5%) is a placeholder for timing only, not a decision.
"""
import argparse
import asyncio
import math
import statistics
import sys
import time
import uuid
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models.enums import BenchmarkReturnType, DisclosureBatchStatus
from app.models.reference import (
    BenchmarkIndexHistory,
    DisclosureBatch,
    FundScore,
    NavHistory,
    Scheme,
    SchemeHolding,
)
from app.services.analytics.benchmark import _benchmark_index_for_category
from app.services.analytics.risk_metrics import build_monthly_series_bulk, month_end_dates, years_ago
from app.services.analytics.scheme_universe import get_category_peers
from app.services.analytics.scorer import compute_fund_score
from app.services.dashboard.holdings import compute_holdings, invalidate_holdings_cache
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.nav import get_nav_on_or_before


class WriteAttempted(RuntimeError):
    pass


def guard(db: Session, allowed_tables: set[str], allowed_models: tuple):
    """Aborts any write outside the tables the chosen flags allow (ORM flushes and raw statements)."""
    @event.listens_for(db, "before_flush")
    def _no_flush(session, ctx, instances):
        objs = list(session.new) + list(session.dirty) + list(session.deleted)
        if allowed_models and all(isinstance(o, allowed_models) for o in objs):
            return
        raise WriteAttempted("a write outside the allowed tables was about to happen; nothing was committed.")

    @event.listens_for(db.get_bind(), "before_cursor_execute")
    def _no_write_sql(conn, cursor, statement, parameters, context, executemany):
        head = statement.lstrip()[:12].upper()
        if head.startswith(("INSERT", "UPDATE", "DELETE")):
            low = statement.lower()
            if any(t in low for t in allowed_tables):
                return
            raise WriteAttempted("a write statement outside the allowed tables was about to run; nothing was committed.")


def ms(t0: float) -> float:
    return (time.perf_counter() - t0) * 1000


def run_timed(fn, runs: int) -> list[float]:
    out = []
    for _ in range(runs):
        t0 = time.perf_counter()
        asyncio.run(fn())
        out.append(ms(t0))
    return out


def read_nav(db: Session, scheme_id: uuid.UUID, years: int) -> tuple[list[tuple[date, float]], float]:
    start = date.today() - timedelta(days=365 * years)
    t0 = time.perf_counter()
    rows = db.execute(
        select(NavHistory.date, NavHistory.nav)
        .where(NavHistory.scheme_id == scheme_id, NavHistory.date >= start)
        .order_by(NavHistory.date)
    ).all()
    return [(d, float(n)) for d, n in rows], ms(t0)


def read_tri(db: Session, index, years: int) -> tuple[list[tuple[date, float]], float]:
    start = date.today() - timedelta(days=365 * years)
    t0 = time.perf_counter()
    rows = db.execute(
        select(BenchmarkIndexHistory.date, BenchmarkIndexHistory.value)
        .where(
            BenchmarkIndexHistory.index_name == index,
            BenchmarkIndexHistory.return_type == BenchmarkReturnType.TRI,
            BenchmarkIndexHistory.date >= start,
        )
        .order_by(BenchmarkIndexHistory.date)
    ).all()
    return [(d, float(v)) for d, v in rows], ms(t0)


def daily_returns(series: list[tuple[date, float]]) -> list[tuple[date, float]]:
    return [(d1, v1 / v0 - 1) for (d0, v0), (d1, v1) in zip(series, series[1:]) if v0]


def risk_numbers(nav: list[tuple[date, float]], tri: list[tuple[date, float]], rf: float) -> dict:
    """Volatility, max drawdown, Sharpe and beta on daily returns. Timing only: floats here are fine
    because this script never feeds the product; the real build uses Decimal."""
    r = daily_returns(nav)
    vals = [x for _, x in r]
    out = {"points": len(nav)}
    if len(vals) < 30:
        return out
    vol = statistics.pstdev(vals) * math.sqrt(252)
    peak, mdd = nav[0][1], 0.0
    for _, v in nav:
        peak = max(peak, v)
        mdd = min(mdd, v / peak - 1)
    years = (nav[-1][0] - nav[0][0]).days / 365.25
    cagr = (nav[-1][1] / nav[0][1]) ** (1 / years) - 1 if years > 0 else 0.0
    out.update(volatility=vol, max_drawdown=mdd, sharpe=(cagr - rf) / vol if vol else None)
    by_date = dict(daily_returns(tri))
    pairs = [(x, by_date[d]) for d, x in r if d in by_date]
    if len(pairs) > 30:
        xs, ys = [p[0] for p in pairs], [p[1] for p in pairs]
        mx, my = statistics.fmean(xs), statistics.fmean(ys)
        var = sum((y - my) ** 2 for y in ys)
        out["beta"] = sum((x - mx) * (y - my) for x, y in pairs) / var if var else None
        out["beta_points"] = len(pairs)
    return out


def latest_batches(db: Session, scheme_id: uuid.UUID) -> list[DisclosureBatch]:
    return (
        db.query(DisclosureBatch)
        .filter(DisclosureBatch.scheme_id == scheme_id, DisclosureBatch.status == DisclosureBatchStatus.WRITTEN)
        .order_by(DisclosureBatch.as_of_date.desc())
        .limit(2)
        .all()
    )


def batch_pass(db: Session, batches: list[DisclosureBatch]) -> dict:
    """Top 10, grouping by asset type and sector, and the added/removed diff between two months."""
    t0 = time.perf_counter()
    sets, top10, groups = [], [], {}
    for i, b in enumerate(batches):
        rows = db.query(SchemeHolding).filter(SchemeHolding.batch_id == b.id).all()
        sets.append({r.isin or r.instrument_name for r in rows})
        if i == 0:
            top10 = sorted(rows, key=lambda r: r.pct_to_nav, reverse=True)[:10]
            by_type, by_sector = defaultdict(float), defaultdict(float)
            for r in rows:
                by_type[r.asset_type] += float(r.pct_to_nav)
                by_sector[r.sector_raw or "unknown"] += float(r.pct_to_nav)
            groups = {"rows": len(rows), "asset_types": len(by_type), "sectors": len(by_sector)}
    added = removed = None
    if len(sets) == 2:
        added, removed = len(sets[0] - sets[1]), len(sets[1] - sets[0])
    return {**groups, "top10": len(top10), "months": len(batches), "added": added, "removed": removed, "ms": ms(t0)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--user-id", required=True, type=uuid.UUID)
    ap.add_argument("--schemes", type=int, default=4, help="how many held funds to sample")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--risk-free", type=float, default=0.065, help="placeholder, timing only")
    ap.add_argument("--include-live-fetch", action="store_true")
    ap.add_argument("--include-score", action="store_true")
    ap.add_argument("--simulate-fresh-cache", action="store_true")
    a = ap.parse_args()

    if a.simulate_fresh_cache:
        import app.services.dashboard.nav as nav_mod
        real_date = nav_mod.date

        class _Yesterday(real_date):
            @classmethod
            def today(cls):
                return real_date.today() - timedelta(days=1)

        nav_mod.date = _Yesterday
        print("SIMULATION: NAV freshness check treats yesterday as today; no live NAV download will happen.")

    from app.config import settings
    url = make_url(settings.database_url)
    print(f"Database: {url.render_as_string(hide_password=True)}", flush=True)
    allowed_tables: set[str] = set()
    allowed_models: tuple = ()
    if a.include_live_fetch:
        allowed_tables.add("nav_history")
        allowed_models += (NavHistory,)
        print("NOTE: live NAV downloads allowed (nav_history cache rows may be written).")
    if a.include_score:
        allowed_tables |= {"fund_scores", "schemes"}
        allowed_models += (FundScore, Scheme)
        print("NOTE: tier 3 allowed (peer scheme rows and one fund_scores row per fund per day may be written).")

    engine = create_engine(url)
    try:
        with Session(engine, autoflush=False) as db:
            guard(db, allowed_tables, allowed_models)
            ids = [m.id for m in list_household_members(db, a.user_id)]
            print(f"members: {len(ids)}")

            print("\n== TIER 1 ==")
            for i in ids:
                invalidate_holdings_cache(i)
            t0 = time.perf_counter()
            try:
                holdings = asyncio.run(compute_holdings(db, ids))
            except WriteAttempted as e:
                print(f"household holdings cold: needs a live NAV download ({e}). Re-run with --include-live-fetch.")
                return 2
            cold = ms(t0)
            warm = run_timed(lambda: compute_holdings(db, ids), a.runs)
            sids = sorted({uuid.UUID(h.scheme_id) for h in holdings})
            print(f"household holdings: {len(holdings)} rows, {len(sids)} schemes; cold {cold:.0f} ms, "
                  f"warm median {statistics.median(warm):.0f} ms")

            schemes = [s for s in (db.get(Scheme, i) for i in sids) if s is not None]
            seen_cat, sample = set(), []
            for s in schemes:
                if s.sebi_category not in seen_cat:
                    seen_cat.add(s.sebi_category)
                    sample.append(s)
            sample += [s for s in schemes if s not in sample]
            sample = sample[: a.schemes]

            report = []
            for n, s in enumerate(sample, 1):
                print(f"\n-- fund {n}/{len(sample)}: category '{s.sebi_category}' plan {s.plan_type} --", flush=True)
                today = date.today()
                t0 = time.perf_counter()
                try:
                    got = asyncio.run(get_nav_on_or_before(db, s, today))
                    newest = got[1] if got else None
                    print(f"T1 one-fund NAV availability: newest {newest}, today's row "
                          f"{'present' if newest == today else 'absent'}, {ms(t0):.0f} ms")
                except WriteAttempted:
                    print("T1 one-fund NAV availability: LIVE FETCH NEEDED (no row dated today); "
                          "re-run with --include-live-fetch to time it")

                nav3, t_nav3 = read_nav(db, s.id, 3)
                nav10, t_nav10 = read_nav(db, s.id, 10)
                idx = _benchmark_index_for_category(s.sebi_category)
                tri3, t_tri = read_tri(db, idx, 3)
                t0 = time.perf_counter()
                risk = risk_numbers(nav3, tri3, a.risk_free)
                t_risk = ms(t0)
                batches = latest_batches(db, s.id)
                bp = batch_pass(db, batches) if batches else None
                tier2 = t_nav3 + t_tri + t_risk + (bp["ms"] if bp else 0)
                print(f"T2 NAV 3y: {len(nav3)} rows {t_nav3:.0f} ms | NAV 10y: {len(nav10)} rows {t_nav10:.0f} ms")
                print(f"T2 benchmark {idx.value} TRI 3y: {len(tri3)} rows {t_tri:.0f} ms"
                      f"{'  (NO TRI ROWS: beta impossible)' if not tri3 else ''}")
                print(f"T2 risk numbers: {t_risk:.1f} ms; got {sorted(k for k in risk if k not in ('points',))}")
                print(f"T2 disclosure batches: {bp if bp else 'none written for this fund'}")
                print(f"T2 total (reads + risk + batches): {tier2:.0f} ms")

                if not a.include_score:
                    print("T3 skipped (add --include-score)")
                    report.append((s.sebi_category, tier2, None))
                    continue
                t0 = time.perf_counter()
                peers = asyncio.run(get_category_peers(db, s.sebi_category, s.plan_type))
                t_peers = ms(t0)
                pids = [p.id for p in peers.schemes]
                print(f"T3 peers: {len(pids)} funds ({peers.fund_count} in category) in {t_peers:.0f} ms")
                month_ends = month_end_dates(years_ago(today, 10), today)
                t0 = time.perf_counter()
                series = build_monthly_series_bulk(db, pids, month_ends)
                t_ser = ms(t0)
                print(f"T3 10y month-end series for peers: {len(series)} series x {len(month_ends)} months in {t_ser:.0f} ms")
                t_daily = {}
                for years in (1, 3):
                    start = today - timedelta(days=365 * years)
                    t0 = time.perf_counter()
                    rows = db.execute(
                        select(NavHistory.scheme_id, NavHistory.date, NavHistory.nav)
                        .where(NavHistory.scheme_id.in_(pids), NavHistory.date >= start)
                    ).all()
                    t_read = ms(t0)
                    t0 = time.perf_counter()
                    by = defaultdict(list)
                    for sid, d, v in rows:
                        by[sid].append((d, float(v)))
                    day_sum, day_n = defaultdict(float), defaultdict(int)
                    for sid, pts in by.items():
                        pts.sort()
                        base = pts[0][1]
                        for d, v in pts:
                            day_sum[d] += v / base
                            day_n[d] += 1
                    _ = {d: day_sum[d] / day_n[d] for d in day_sum}
                    t_daily[years] = t_read + ms(t0)
                    print(f"T3 daily category average {years}y: {len(rows)} rows, read {t_read:.0f} ms + average {ms(t0):.0f} ms")
                t0 = time.perf_counter()
                try:
                    row = asyncio.run(compute_fund_score(db, s))
                    t_score_cold = ms(t0)
                    warm_s = run_timed(lambda: compute_fund_score(db, s), 2)
                    print(f"T3 Fund Score: cold {t_score_cold:.0f} ms, warm median {statistics.median(warm_s):.0f} ms "
                          f"(score present: {row.final_score is not None})")
                except WriteAttempted as e:
                    t_score_cold = None
                    print(f"T3 Fund Score: blocked ({e})")
                tier3 = t_peers + t_ser + t_daily.get(3, 0) + (t_score_cold or 0)
                print(f"T3 total (peers + 10y series + 3y daily + score): {tier3:.0f} ms")
                report.append((s.sebi_category, tier2, tier3))

            print("\n== SUMMARY (milliseconds) ==")
            print(f"tier 1 household-wide holdings cold: {cold:.0f} (the cost to avoid with a scheme-filtered read)")
            for cat, t2, t3 in report:
                print(f"{cat}: tier 2 {t2:.0f} | tier 3 {('%.0f' % t3) if t3 is not None else 'not run'}")
            db.rollback()
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
