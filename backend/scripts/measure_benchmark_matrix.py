"""Read-only timing gate for the benchmark-window matrix added to Analytics.

    python scripts/measure_benchmark_matrix.py --user-id <uuid> [--runs 3]

Run this on the staging VM against the staging database. It measures the combined
household scope and each member scope without printing names or monetary values:

  a. build_window_context
  b. load_index_levels for all eight TRI indices over the required range
  c. compute_window_rows plus compute_fund_window_rows for every fund (pure CPU)
  d. 2 x a + 2 x b + c, reported as "added by windows" (the portfolio and the fund computation
     each build their own context and levels; c uses the since-inception rates the legacy
     code has already solved, as production does)
  e. the existing portfolio and fund benchmark computations end to end, warm

The database guard aborts on every INSERT, UPDATE, DELETE or schema statement and on every ORM
flush. Run only with fresh portfolio snapshots: get_snapshots may otherwise rebuild
stale rows, and this script will stop with a clear read-only error. Benchmark-index
and NAV caches must likewise be fresh for the end-to-end calls; a write attempt is
blocked even when a service catches that exception and degrades its result.

The gate passes when the worst measured "added by windows" run for the largest scope
is below 3000 ms. The owner must also compare a full run_analytics_recompute.py run
against the 15-minute stale ceiling.
"""

import argparse
import asyncio
import statistics
import sys
import time
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models.enums import ALL_BENCHMARK_INDICES, LEGACY_BENCHMARK_INDICES, TransactionType
from app.models.folio import Folio
from app.models.reference import NavHistory, Scheme
from app.services.analytics.benchmark import (
    _benchmark_index_for_category,
    _benchmark_xirr_for_transactions,
    _current_value_by_scheme,
    _fund_level_transactions,
    _investment_transactions,
    _portfolio_xirr,
    compute_fund_vs_benchmark,
    compute_portfolio_vs_benchmarks,
)
from app.services.analytics.benchmark_windows import (
    SinceInceptionRates,
    build_window_context,
    compute_fund_window_rows,
    compute_window_rows,
    load_index_levels,
)
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members


class WriteAttempted(RuntimeError):
    pass


class StatementCounter:
    def __init__(self) -> None:
        self.enabled = False
        self.count = 0
        self.write_error: str | None = None

    def start(self) -> None:
        self.count = 0
        self.enabled = True

    def stop(self) -> int:
        self.enabled = False
        return self.count

    def check_read_only(self) -> None:
        if self.write_error is not None:
            message = self.write_error
            self.write_error = None
            raise WriteAttempted(message)


_LOOP = asyncio.new_event_loop()


def run_async(coro):
    return _LOOP.run_until_complete(coro)


_WRITE_VERBS = ("INSERT", "UPDATE", "DELETE", "REPLACE", "CREATE", "ALTER", "DROP", "TRUNCATE")


def is_write_statement(statement: str, allow_nav_writes: bool = False) -> bool:
    """True for data or schema changes. Reads, CTEs, PRAGMA, SHOW, SET and the driver's own
    housekeeping are not writes: an allow-list of SELECT alone would abort on the first of them.
    With allow_nav_writes the NAV cache's own INSERT into nav_history (a live NAV download that
    opening the Dashboard does too) is let through, like --include-live-fetch in the other scripts."""
    head = statement.lstrip().upper()
    if allow_nav_writes and head.startswith("INSERT") and "nav_history" in statement.lower():
        return False
    return head.startswith(_WRITE_VERBS)


def guard(db: Session, counter: StatementCounter, allow_nav_writes: bool = False) -> None:
    @event.listens_for(db, "before_flush")
    def _no_flush(session, ctx, instances):
        objects = list(session.new) + list(session.dirty) + list(session.deleted)
        if allow_nav_writes and all(isinstance(obj, NavHistory) for obj in objects):
            return
        counter.write_error = (
            "an ORM write was about to run. Use fresh snapshots and reference-data caches; "
            "nothing was committed."
        )
        raise WriteAttempted(counter.write_error)

    @event.listens_for(db.get_bind(), "before_cursor_execute")
    def _select_only(conn, cursor, statement, parameters, context, executemany):
        if is_write_statement(statement, allow_nav_writes):
            counter.write_error = (
                "a write statement was about to run. Use fresh snapshots and "
                "reference-data caches; nothing was committed."
            )
            raise WriteAttempted(counter.write_error)
        if counter.enabled:
            counter.count += 1


def ms(t0: float) -> float:
    return (time.perf_counter() - t0) * 1000


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--user-id", required=True, type=uuid.UUID)
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument(
        "--allow-nav-writes", action="store_true",
        help="let the NAV cache insert into nav_history (a live NAV download) instead of aborting; "
        "needed before the evening NAV publish, when today's NAV is not stored yet",
    )
    args = ap.parse_args()
    if args.runs < 1:
        ap.error("--runs must be at least 1")

    from app.config import settings

    url = make_url(settings.database_url)
    print(f"Database: {url.render_as_string(hide_password=True)}", flush=True)
    engine = create_engine(url)
    if url.get_backend_name() == "postgresql" and not args.allow_nav_writes:
        # Second layer under the statement guard: Postgres itself refuses any write.
        engine = engine.execution_options(postgresql_readonly=True)
    largest_scope_size = (-1, -1)
    largest_scope_worst_ms = 0.0

    try:
        with Session(engine, autoflush=False) as db:
            counter = StatementCounter()
            guard(db, counter, args.allow_nav_writes)
            member_ids = [member.id for member in list_household_members(db, args.user_id)]
            scopes = [("combined", member_ids)] + [
                (f"member {position}", [member_id])
                for position, member_id in enumerate(member_ids, 1)
            ]
            print(f"members: {len(member_ids)} | scopes: {len(scopes)}")

            for label, scope_ids in scopes:
                transactions = _investment_transactions(db, scope_ids)
                fund_transactions = _fund_level_transactions(db, scope_ids)
                folio_scheme = {
                    folio.id: folio.scheme_id
                    for folio in db.query(Folio.id, Folio.scheme_id)
                    .filter(Folio.household_member_id.in_(scope_ids))
                    .all()
                }
                grouped = defaultdict(list)
                for transaction in fund_transactions:
                    grouped[folio_scheme[transaction.folio_id]].append(transaction)
                schemes = {
                    scheme.id: scheme
                    for scheme in db.query(Scheme).filter(Scheme.id.in_(grouped.keys())).all()
                }
                holdings = run_async(compute_holdings(db, scope_ids))
                counter.check_read_only()
                current_values = _current_value_by_scheme(holdings)
                total_current_value = sum(current_values.values(), Decimal("0"))

                combined_transactions = []
                seen_transactions = set()
                for transaction in [*fund_transactions, *transactions]:
                    identity = (
                        ("id", transaction.id)
                        if transaction.id is not None
                        else ("object", id(transaction))
                    )
                    if identity not in seen_transactions:
                        seen_transactions.add(identity)
                        combined_transactions.append(transaction)

                scope_size = (len(combined_transactions), len(grouped))
                print(
                    f"\n== {label}: {len(scope_ids)} members, {len(grouped)} funds, "
                    f"{len(combined_transactions)} transactions ==",
                    flush=True,
                )

                contexts = []
                context_ms = []
                context_sql = []
                for _ in range(args.runs):
                    counter.start()
                    t0 = time.perf_counter()
                    contexts.append(run_async(build_window_context(db, scope_ids, date.today())))
                    context_ms.append(ms(t0))
                    context_sql.append(counter.stop())
                    counter.check_read_only()

                starts = [
                    start
                    for context in contexts
                    for start in context.starts.values()
                    if start is not None
                ]
                transaction_dates = [transaction.date for transaction in combined_transactions]
                earliest = min([*transaction_dates, *starts])

                levels_by_run = []
                levels_ms = []
                levels_sql = []
                for context in contexts:
                    counter.start()
                    t0 = time.perf_counter()
                    levels_by_run.append(
                        load_index_levels(
                            db,
                            ALL_BENCHMARK_INDICES,
                            earliest,
                            context.today,
                        )
                    )
                    levels_ms.append(ms(t0))
                    levels_sql.append(counter.stop())
                    counter.check_read_only()

                # The production path hands the engine the since-inception rates the legacy code has
                # already solved; solve them here once, untimed, so the timed step is the real one.
                legacy_rates = {
                    index: run_async(_benchmark_xirr_for_transactions(db, transactions, index))
                    for index in LEGACY_BENCHMARK_INDICES
                }
                counter.check_read_only()
                since_inception = SinceInceptionRates(
                    portfolio=_portfolio_xirr(transactions, total_current_value),
                    indices=legacy_rates,
                )
                fund_since_inception = {}
                for scheme_id, scheme_transactions in grouped.items():
                    index = _benchmark_index_for_category(schemes[scheme_id].sebi_category)
                    fund_since_inception[scheme_id] = (
                        _portfolio_xirr(
                            scheme_transactions,
                            current_values.get(str(scheme_id), Decimal("0")),
                            extra_debit_types={TransactionType.SWITCH_IN},
                        ),
                        run_async(
                            _benchmark_xirr_for_transactions(
                                db,
                                scheme_transactions,
                                index,
                                extra_debit_types={TransactionType.SWITCH_IN},
                            )
                        ),
                    )
                counter.check_read_only()

                pure_ms = []
                for context, levels in zip(contexts, levels_by_run):
                    t0 = time.perf_counter()
                    compute_window_rows(
                        context, transactions, total_current_value, levels,
                        since_inception=since_inception,
                    )
                    for scheme_id, scheme_transactions in grouped.items():
                        scheme = schemes[scheme_id]
                        compute_fund_window_rows(
                            context,
                            scheme_id,
                            scheme_transactions,
                            current_values.get(str(scheme_id), Decimal("0")),
                            _benchmark_index_for_category(scheme.sebi_category),
                            levels,
                            since_inception=fund_since_inception[scheme_id],
                        )
                    pure_ms.append(ms(t0))

                # Production builds a context and loads the levels twice: once in the portfolio
                # computation and once in the fund computation.
                added_ms = [
                    2 * context_time + 2 * levels_time + pure_time
                    for context_time, levels_time, pure_time in zip(context_ms, levels_ms, pure_ms)
                ]
                print(
                    f"a. build_window_context: median {statistics.median(context_ms):.0f} ms, "
                    f"worst {max(context_ms):.0f} ms | SQL median {statistics.median(context_sql):.0f}, "
                    f"worst {max(context_sql)}"
                )
                print(
                    f"b. load_index_levels (8 TRI): median {statistics.median(levels_ms):.0f} ms, "
                    f"worst {max(levels_ms):.0f} ms | SQL median {statistics.median(levels_sql):.0f}, "
                    f"worst {max(levels_sql)}"
                )
                print(
                    f"c. pure window matrix: median {statistics.median(pure_ms):.0f} ms, "
                    f"worst {max(pure_ms):.0f} ms | SQL 0"
                )
                print(
                    f'd. added by windows: median {statistics.median(added_ms):.0f} ms, '
                    f"worst {max(added_ms):.0f} ms"
                )

                run_async(compute_portfolio_vs_benchmarks(db, scope_ids))
                counter.check_read_only()
                run_async(compute_fund_vs_benchmark(db, scope_ids))
                counter.check_read_only()

                portfolio_ms = []
                portfolio_sql = []
                fund_ms = []
                fund_sql = []
                for _ in range(args.runs):
                    counter.start()
                    t0 = time.perf_counter()
                    run_async(compute_portfolio_vs_benchmarks(db, scope_ids))
                    portfolio_ms.append(ms(t0))
                    portfolio_sql.append(counter.stop())
                    counter.check_read_only()

                    counter.start()
                    t0 = time.perf_counter()
                    run_async(compute_fund_vs_benchmark(db, scope_ids))
                    fund_ms.append(ms(t0))
                    fund_sql.append(counter.stop())
                    counter.check_read_only()

                print(
                    f"e1. portfolio benchmark warm: median {statistics.median(portfolio_ms):.0f} ms, "
                    f"worst {max(portfolio_ms):.0f} ms | SQL median {statistics.median(portfolio_sql):.0f}, "
                    f"worst {max(portfolio_sql)}"
                )
                print(
                    f"e2. fund benchmarks warm: median {statistics.median(fund_ms):.0f} ms, "
                    f"worst {max(fund_ms):.0f} ms | SQL median {statistics.median(fund_sql):.0f}, "
                    f"worst {max(fund_sql)}"
                )

                if scope_size > largest_scope_size:
                    largest_scope_size = scope_size
                    largest_scope_worst_ms = max(added_ms)

            db.rollback()
    except WriteAttempted as exc:
        print(f"ABORTED (read-only): {exc}", flush=True)
        return 2
    finally:
        engine.dispose()

    print(
        "Reminder: compare a full run_analytics_recompute.py run against the "
        "15-minute stale ceiling."
    )
    if largest_scope_worst_ms < 3000:
        print("GATE: PASS")
        return 0
    print(f"GATE: FAIL ({largest_scope_worst_ms:.0f} ms)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
