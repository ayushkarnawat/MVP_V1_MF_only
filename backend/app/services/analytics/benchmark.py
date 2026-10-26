"""Portfolio XIRR vs. Nifty-index benchmark XIRR — PRD-04 FR-8/FR-9.

Both portfolio XIRR and benchmark-hypothetical XIRR share the same
cash-flow convention as `dashboard/cash_flow.py`'s FR-7 logic: purchase/SIP
outflows (negative) and redemption/dividend-payout inflows (positive) at
their transaction dates. Switches are excluded as intra-portfolio movements
from portfolio-level and broad-market rollups only; per-fund XIRR includes
switch-in debits and switch-out credits. STT/stamp-duty/misc remain excluded.
This module runs its own transaction
query rather than reusing `compute_cash_flow` because it needs each
transaction's `scheme_id` (FR-9's per-fund grouping), which
`CashFlowEntry` doesn't carry.

Benchmark-hypothetical XIRR design (not fully spelled out in the PRD, a
judgment call, documented here per CLAUDE.md's "stop and say so"): each
real transaction is replayed against the index instead of the fund — a
purchase buys `amount / index_level_on_date` hypothetical index units, a
redemption/dividend sells that many. The cash-flow *dates and amounts* fed
into `xirr()` are identical to the real ones; only the terminal value
differs — `net_units * today's index level`, replacing the fund's own
`current_value`. This keeps "same cash-flow timing and amounts, priced at
the index level instead of NAV" (PRD-04 Research) literally true.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.enums import (
    ALL_BENCHMARK_INDICES,
    LEGACY_BENCHMARK_INDICES,
    BenchmarkIndex,
    BenchmarkReturnType,
    TransactionType,
)
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.services.analytics.nse_indices_client import ensure_index_history_fresh, get_index_level_on_or_before
from app.services.analytics.schemas import (
    AggregateFundVsBenchmarkResponse,
    AggregatePortfolioBenchmarkResponse,
    FundBenchmarkRow,
    FundVsBenchmarkSummary,
    IndexXirrRow,
    PortfolioBenchmarkSummary,
)
from app.services.analytics.xirr import xirr
from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.schemas import HoldingRow
from app.services.dashboard.xirr import _RELEVANT_TYPES as _XIRR_RELEVANT_TYPES, _XIRR_DEBIT_TYPES, _FUND_RELEVANT_TYPES
from app.services.dashboard.xirr import portfolio_xirr as _portfolio_xirr
from app.services.lot_rules import paid_amount

if TYPE_CHECKING:
    from app.services.analytics.benchmark_windows import IndexLevels, WindowContext

logger = logging.getLogger(__name__)

# Same flow sets as the dashboard XIRR (gifts valued, #3).
_RELEVANT_TYPES = _XIRR_RELEVANT_TYPES



def _investment_transactions(db: Session, household_member_ids: list[uuid.UUID]) -> list[Transaction]:
    if not household_member_ids:
        return []
    folio_ids = [
        f.id for f in db.query(Folio.id).filter(Folio.household_member_id.in_(household_member_ids)).all()
    ]
    if not folio_ids:
        return []
    return (
        db.query(Transaction)
        .filter(Transaction.folio_id.in_(folio_ids), Transaction.type.in_(_RELEVANT_TYPES))
        .order_by(Transaction.date, Transaction.id)
        .all()
    )


def _fund_level_transactions(db: Session, household_member_ids: list[uuid.UUID]) -> list[Transaction]:
    if not household_member_ids:
        return []
    folio_ids = [
        f.id for f in db.query(Folio.id).filter(Folio.household_member_id.in_(household_member_ids)).all()
    ]
    if not folio_ids:
        return []
    return (
        db.query(Transaction)
        .filter(Transaction.folio_id.in_(folio_ids), Transaction.type.in_(_FUND_RELEVANT_TYPES))
        .order_by(Transaction.date, Transaction.id)
        .all()
    )


def _signed_amount(
    txn: Transaction, extra_debit_types: frozenset[TransactionType] = frozenset()
) -> Decimal:
    debit_types = _XIRR_DEBIT_TYPES | extra_debit_types
    amount = paid_amount(txn)
    return -amount if txn.type in debit_types else amount


async def _benchmark_xirr_for_transactions(
    db: Session,
    transactions: list[Transaction],
    index: BenchmarkIndex,
    extra_debit_types: frozenset[TransactionType] = frozenset(),
) -> Decimal | None:
    if not transactions:
        return None
    start_date = min(t.date for t in transactions)
    today = date.today()
    # TRI includes reinvested dividends, matching a fund NAV (decided 9 Oct).
    await ensure_index_history_fresh(db, index, start_date, today, return_type=BenchmarkReturnType.TRI)

    net_units = Decimal("0")
    flows: list[tuple[date, Decimal]] = []
    for txn in transactions:
        level = get_index_level_on_or_before(db, index, txn.date, return_type=BenchmarkReturnType.TRI)
        if level is None:
            # This index has no history covering this transaction's date
            # (fetch failed, or genuinely unavailable) — excluded from the
            # hypothetical stream rather than crashing the whole comparison.
            continue
        index_value, _ = level
        signed = _signed_amount(txn, extra_debit_types)
        if signed < 0:
            net_units += -signed / index_value
        else:
            net_units -= signed / index_value
        flows.append((txn.date, signed))

    today_level = get_index_level_on_or_before(db, index, today, return_type=BenchmarkReturnType.TRI)
    if today_level is None or not flows:
        return None
    flows.append((today, net_units * today_level[0]))
    return xirr(flows)


def _xirr_str(rate: Decimal | None) -> str | None:
    """Fixed-point serialization for XIRR rates. Bare `str()` on a Decimal
    switches to scientific notation for near-zero results (xirr()'s
    Newton-Raphson output can land arbitrarily close to zero) — the
    frontend's decimal-fraction-to-percent shift can't parse that. `format(d,
    "f")` is always fixed-point; the explicit zero-check also normalizes
    signed zero ("-0"), which `format` alone does not."""
    if rate is None:
        return None
    if rate == 0:
        return "0"
    return format(rate, "f")


def _current_value_by_scheme(holdings: list[HoldingRow]) -> dict[str, Decimal]:
    totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for h in holdings:
        totals[h.scheme_id] += Decimal(h.current_value)
    return totals


async def build_window_context(
    db: Session,
    member_ids: list[uuid.UUID],
    today: date,
) -> WindowContext:
    from app.services.analytics.benchmark_windows import build_window_context as _build_window_context

    return await _build_window_context(db, member_ids, today)


def load_index_levels(
    db: Session,
    indices: tuple[BenchmarkIndex, ...],
    start: date,
    end: date,
) -> dict[BenchmarkIndex, IndexLevels]:
    from app.services.analytics.benchmark_windows import load_index_levels as _load_index_levels

    return _load_index_levels(db, indices, start, end)


def compute_window_rows(*args, **kwargs):
    from app.services.analytics.benchmark_windows import compute_window_rows as _compute_window_rows

    return _compute_window_rows(*args, **kwargs)


def compute_fund_window_rows(*args, **kwargs):
    from app.services.analytics.benchmark_windows import compute_fund_window_rows as _compute_fund_window_rows

    return _compute_fund_window_rows(*args, **kwargs)


async def _window_inputs(
    db: Session,
    member_ids: list[uuid.UUID],
    earliest_transaction: date,
    indices: tuple[BenchmarkIndex, ...],
) -> tuple[WindowContext, dict[BenchmarkIndex, IndexLevels]]:
    # `earliest_transaction` is read by the caller before this runs: the snapshot rebuild and the index
    # top-up below commit, and a commit expires every ORM row the caller already loaded.
    today = date.today()
    ctx = await build_window_context(db, member_ids, today)
    earliest = min([earliest_transaction] + [start for start in ctx.starts.values() if start is not None])
    for index in indices:
        if index not in LEGACY_BENCHMARK_INDICES:
            await ensure_index_history_fresh(
                db,
                index,
                earliest,
                today,
                return_type=BenchmarkReturnType.TRI,
            )
    levels = load_index_levels(db, indices, earliest, today)
    return ctx, levels


def _roll_back_if_database_error(db: Session, error: Exception) -> None:
    # A failed flush or commit leaves the session unusable until it is rolled back. Any other exception
    # leaves it healthy, and a rollback would expire every loaded row for nothing (one refresh query each).
    if isinstance(error, SQLAlchemyError):
        db.rollback()


async def compute_portfolio_vs_benchmarks(
    db: Session, household_member_ids: list[uuid.UUID]
) -> PortfolioBenchmarkSummary:
    transactions = _investment_transactions(db, household_member_ids)
    if not transactions:
        return PortfolioBenchmarkSummary(
            portfolio_xirr=None,
            benchmarks=[IndexXirrRow(index=i, xirr=None) for i in LEGACY_BENCHMARK_INDICES],
        )

    holdings = await compute_holdings(db, household_member_ids)
    current_value = sum(_current_value_by_scheme(holdings).values(), Decimal("0"))
    portfolio_xirr = _portfolio_xirr(transactions, current_value)

    benchmark_rows = []
    for index in LEGACY_BENCHMARK_INDICES:
        rate = await _benchmark_xirr_for_transactions(db, transactions, index)
        benchmark_rows.append(IndexXirrRow(index=index, xirr=_xirr_str(rate)))

    windows = []
    try:
        ctx, levels = await _window_inputs(
            db,
            household_member_ids,
            min(transaction.date for transaction in transactions),
            ALL_BENCHMARK_INDICES,
        )
        # The snapshot rebuild or index top-up above may have committed and expired `transactions`;
        # selecting them again refreshes the whole batch in one statement.
        transactions = _investment_transactions(db, household_member_ids)
        windows = compute_window_rows(ctx, transactions, current_value, levels)
    except Exception as error:
        _roll_back_if_database_error(db, error)
        logger.warning("Portfolio benchmark windows could not be computed", exc_info=True)

    return PortfolioBenchmarkSummary(
        portfolio_xirr=_xirr_str(portfolio_xirr),
        benchmarks=benchmark_rows,
        windows=windows,
    )


async def get_aggregate_portfolio_vs_benchmarks(
    db: Session, user_id: uuid.UUID
) -> AggregatePortfolioBenchmarkResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    benchmark = await compute_portfolio_vs_benchmarks(db, [m.id for m in members])
    return AggregatePortfolioBenchmarkResponse(members=statuses, benchmark=benchmark)


def _benchmark_index_for_category(sebi_category: str) -> BenchmarkIndex:
    """Only 4 benchmark indices exist in this product's scope (PRD-04
    Research), so every SEBI category must fold into one of them — a
    judgment call, flagged per CLAUDE.md's "stop and say so". Large Cap ->
    Nifty 50, Mid Cap -> Nifty Midcap 150, Large & Mid Cap -> Nifty
    LargeMidcap 250 (matching FR-9's own examples verbatim); everything
    else — Flexi/Multi/Small Cap, Value/Contra, Focused, Sectoral, ELSS,
    Dividend Yield, and every non-equity category (Debt, Hybrid, etc.) —
    falls back to Nifty 500 as the broad-market default. Never excludes a
    fund from comparison over category granularity; a broad-market
    comparison is still meaningful even where imperfect."""
    cat = sebi_category.upper()
    has_large = "LARGE" in cat
    has_mid = "MID" in cat
    if has_large and has_mid:
        return BenchmarkIndex.NIFTY_LARGEMIDCAP_250
    if has_large:
        return BenchmarkIndex.NIFTY_50
    if has_mid:
        return BenchmarkIndex.NIFTY_MIDCAP_150
    return BenchmarkIndex.NIFTY_500


async def compute_fund_vs_benchmark(
    db: Session, household_member_ids: list[uuid.UUID]
) -> FundVsBenchmarkSummary:
    transactions = _investment_transactions(db, household_member_ids)
    fund_level_transactions = _fund_level_transactions(db, household_member_ids)
    if not transactions and not fund_level_transactions:
        return FundVsBenchmarkSummary(funds=[], overall_portfolio_xirr=None, overall_broad_market_xirr=None)

    folio_scheme = {
        f.id: f.scheme_id
        for f in db.query(Folio.id, Folio.scheme_id).filter(Folio.household_member_id.in_(household_member_ids)).all()
    }
    grouped: dict[uuid.UUID, list[Transaction]] = defaultdict(list)
    for txn in fund_level_transactions:
        grouped[folio_scheme[txn.folio_id]].append(txn)

    holdings = await compute_holdings(db, household_member_ids)
    current_value_by_scheme = _current_value_by_scheme(holdings)
    schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_(grouped.keys())).all()}

    fund_rows: list[FundBenchmarkRow] = []
    window_jobs: list[tuple[FundBenchmarkRow, uuid.UUID, list[Transaction], BenchmarkIndex]] = []
    for scheme_id, scheme_txns in grouped.items():
        scheme = schemes[scheme_id]
        index = _benchmark_index_for_category(scheme.sebi_category)

        fund_rate = _portfolio_xirr(
            scheme_txns,
            current_value_by_scheme.get(str(scheme_id), Decimal("0")),
            extra_debit_types={TransactionType.SWITCH_IN},
        )
        benchmark_rate = await _benchmark_xirr_for_transactions(
            db,
            scheme_txns,
            index,
            extra_debit_types={TransactionType.SWITCH_IN},
        )

        fund_rows.append(
            FundBenchmarkRow(
                scheme_id=str(scheme_id),
                scheme_name=scheme.name,
                benchmark_index=index,
                fund_xirr=_xirr_str(fund_rate),
                benchmark_xirr=_xirr_str(benchmark_rate),
            )
        )
        window_jobs.append((fund_rows[-1], scheme_id, scheme_txns, index))

    total_current_value = sum(current_value_by_scheme.values(), Decimal("0"))
    overall_portfolio_rate = _portfolio_xirr(transactions, total_current_value)
    overall_broad_market_rate = await _benchmark_xirr_for_transactions(db, transactions, BenchmarkIndex.NIFTY_500)

    # Windows come last, after every legacy number: a failure here can only leave `windows` empty. Each
    # fund's own index is one of the legacy four, so only those are loaded and nothing new is fetched.
    try:
        window_transactions = []
        seen_transactions = set()
        for transaction in [*fund_level_transactions, *transactions]:
            identity = (
                ("id", transaction.id)
                if transaction.id is not None
                else ("object", id(transaction))
            )
            if identity not in seen_transactions:
                seen_transactions.add(identity)
                window_transactions.append(transaction)
        window_ctx, window_levels = await _window_inputs(
            db,
            household_member_ids,
            min(transaction.date for transaction in window_transactions),
            LEGACY_BENCHMARK_INDICES,
        )
        # Refresh rows a commit above may have expired, in one statement (see the portfolio path).
        _fund_level_transactions(db, household_member_ids)
    except Exception as error:
        _roll_back_if_database_error(db, error)
        logger.warning("Fund benchmark window inputs could not be built", exc_info=True)
    else:
        for row, scheme_id, scheme_txns, index in window_jobs:
            try:
                row.windows = compute_fund_window_rows(
                    window_ctx,
                    scheme_id,
                    scheme_txns,
                    current_value_by_scheme.get(str(scheme_id), Decimal("0")),
                    index,
                    window_levels,
                )
            except Exception as error:
                _roll_back_if_database_error(db, error)
                logger.warning(
                    "Fund benchmark windows could not be computed for scheme %s",
                    scheme_id,
                    exc_info=True,
                )

    return FundVsBenchmarkSummary(
        funds=fund_rows,
        overall_portfolio_xirr=_xirr_str(overall_portfolio_rate),
        overall_broad_market_xirr=_xirr_str(overall_broad_market_rate),
    )


async def get_aggregate_fund_vs_benchmark(db: Session, user_id: uuid.UUID) -> AggregateFundVsBenchmarkResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    comparison = await compute_fund_vs_benchmark(db, [m.id for m in members])
    return AggregateFundVsBenchmarkResponse(members=statuses, comparison=comparison)
