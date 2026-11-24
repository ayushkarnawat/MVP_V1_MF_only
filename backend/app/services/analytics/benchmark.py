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
differs — `net_units * the index level at the portfolio price date`, replacing the fund's own
`current_value`. This keeps "same cash-flow timing and amounts, priced at
the index level instead of NAV" (PRD-04 Research) literally true.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from dataclasses import replace
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
from app.services.dashboard.xirr import (
    PortfolioXirrDisplay,
    latest_holding_price_date,
    portfolio_cash_flows,
    portfolio_xirr_display,
    unpriced_holding_scheme_ids,
)
from app.services.dashboard.xirr import portfolio_xirr as _portfolio_xirr
from app.services.lot_rules import paid_amount

if TYPE_CHECKING:
    from app.services.analytics.benchmark_windows import IndexLevels, WindowContext

logger = logging.getLogger(__name__)

# Same flow sets as the dashboard XIRR (gifts valued, #3).
_RELEVANT_TYPES = _XIRR_RELEVANT_TYPES



def _investment_transactions(
    db: Session, household_member_ids: list[uuid.UUID], excluded_scheme_ids: frozenset[str] = frozenset(),
) -> list[Transaction]:
    if not household_member_ids:
        return []
    folios = db.query(Folio.id).filter(Folio.household_member_id.in_(household_member_ids))
    if excluded_scheme_ids:
        folios = folios.filter(Folio.scheme_id.not_in([uuid.UUID(sid) for sid in excluded_scheme_ids]))
    folio_ids = [f.id for f in folios.all()]
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
    *,
    price_date: date | None = None,
) -> Decimal | None:
    if not transactions:
        return None
    start_date = min(t.date for t in transactions)
    end = price_date or date.today()
    # TRI includes reinvested dividends, matching a fund NAV (decided 9 Oct).
    await ensure_index_history_fresh(db, index, start_date, end, return_type=BenchmarkReturnType.TRI)

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

    closing_level = get_index_level_on_or_before(db, index, end, return_type=BenchmarkReturnType.TRI)
    if closing_level is None or not flows:
        return None
    flows.append((end, net_units * closing_level[0]))
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
        if h.current_value is not None:
            totals[h.scheme_id] += Decimal(h.current_value)
    return totals


async def build_window_context(
    db: Session,
    member_ids: list[uuid.UUID],
    today: date,
    excluded_scheme_ids: frozenset[str] = frozenset(),
) -> WindowContext:
    from app.services.analytics.benchmark_windows import build_window_context as _build_window_context

    return await _build_window_context(db, member_ids, today, excluded_scheme_ids)


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
    indices: tuple[BenchmarkIndex, ...], *, refresh_indices=None,
    price_date: date | None = None,
    excluded_scheme_ids: frozenset[str] = frozenset(),
) -> tuple[WindowContext, dict[BenchmarkIndex, IndexLevels]]:
    # `earliest_transaction` is read by the caller before this runs: the snapshot rebuild and the index
    # top-up below commit, and a commit expires every ORM row the caller already loaded.
    from app.services.analytics.benchmark_windows import ist_today

    today = price_date or ist_today()
    if excluded_scheme_ids:
        ctx = await build_window_context(db, member_ids, today, excluded_scheme_ids)
    else:
        ctx = await build_window_context(db, member_ids, today)
    earliest = min([earliest_transaction] + [start for start in ctx.starts.values() if start is not None])
    for index in indices if refresh_indices is None else refresh_indices:
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
    holdings = await compute_holdings(db, household_member_ids) if transactions else []
    unpriced = frozenset(unpriced_holding_scheme_ids(holdings))
    if unpriced:
        holdings = [holding for holding in holdings if holding.scheme_id not in unpriced]
        transactions = _investment_transactions(db, household_member_ids, unpriced)
    if not transactions:
        return PortfolioBenchmarkSummary(
            portfolio_xirr=None,
            benchmarks=[IndexXirrRow(index=i, xirr=None) for i in LEGACY_BENCHMARK_INDICES],
        )

    current_value = sum(_current_value_by_scheme(holdings).values(), Decimal("0"))
    price_date = latest_holding_price_date(holdings)
    portfolio_xirr = _portfolio_xirr(transactions, current_value, price_date=price_date)

    benchmark_rows = []
    legacy_rates: dict[BenchmarkIndex, Decimal | None] = {}
    for index in LEGACY_BENCHMARK_INDICES:
        rate = await _benchmark_xirr_for_transactions(db, transactions, index, price_date=price_date)
        legacy_rates[index] = rate
        benchmark_rows.append(IndexXirrRow(index=index, xirr=_xirr_str(rate)))

    windows = []
    try:
        ctx, levels = await _window_inputs(
            db,
            household_member_ids,
            min(transaction.date for transaction in transactions),
            ALL_BENCHMARK_INDICES,
            price_date=price_date,
            excluded_scheme_ids=unpriced,
        )
        # The snapshot rebuild or index top-up above may have committed and expired `transactions`;
        # selecting them again refreshes the whole batch in one statement.
        transactions = _investment_transactions(db, household_member_ids, unpriced)
        from app.services.analytics.benchmark_windows import SinceInceptionRates

        # The since-inception row reuses the rates solved above, so it equals the legacy numbers by
        # construction and the solver does not run again on the longest cash-flow lists.
        windows = compute_window_rows(
            ctx,
            transactions,
            current_value,
            levels,
            since_inception=SinceInceptionRates(portfolio=portfolio_xirr, indices=legacy_rates, price_date=price_date),
        )
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
    db: Session, household_member_ids: list[uuid.UUID], *, include_declared: bool = True,
) -> FundVsBenchmarkSummary:
    transactions = _investment_transactions(db, household_member_ids)
    fund_level_transactions = _fund_level_transactions(db, household_member_ids)
    if not transactions and not fund_level_transactions:
        return FundVsBenchmarkSummary(funds=[], overall_portfolio_xirr=None, overall_broad_market_xirr=None, declared_comparison=[] if include_declared else None)

    folio_scheme = {
        f.id: f.scheme_id
        for f in db.query(Folio.id, Folio.scheme_id).filter(Folio.household_member_id.in_(household_member_ids)).all()
    }
    grouped: dict[uuid.UUID, list[Transaction]] = defaultdict(list)
    for txn in fund_level_transactions:
        grouped[folio_scheme[txn.folio_id]].append(txn)

    holdings = await compute_holdings(db, household_member_ids)
    unpriced = frozenset(unpriced_holding_scheme_ids(holdings))
    holdings = [holding for holding in holdings if holding.scheme_id not in unpriced]
    current_values = _current_value_by_scheme(holdings)
    holdings_by_scheme: dict[str, list[HoldingRow]] = defaultdict(list)
    for holding in holdings:
        holdings_by_scheme[holding.scheme_id].append(holding)
    price_dates = {sid: latest_holding_price_date(rows) for sid, rows in holdings_by_scheme.items()}
    dated_funds = {end for end in price_dates.values() if end is not None}
    portfolio_price_date = max(dated_funds, default=None)
    transactions = [txn for txn in transactions if str(folio_scheme[txn.folio_id]) not in unpriced]
    schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_(grouped.keys())).all()}

    from app.services.fund_page.benchmark_select import benchmark_choices
    choices = benchmark_choices(db, schemes) if include_declared else {}
    declared_comparison = None
    fund_rows: list[FundBenchmarkRow] = []
    window_jobs: list[
        tuple[FundBenchmarkRow, uuid.UUID, list[Transaction], BenchmarkIndex, Decimal | None, Decimal | None]
    ] = []
    switch_debits = frozenset({TransactionType.SWITCH_IN})
    for scheme_id, scheme_txns in grouped.items():
        scheme = schemes[scheme_id]
        index = _benchmark_index_for_category(scheme.sebi_category)

        sid = str(scheme_id)
        fund_rate = benchmark_rate = None
        display = PortfolioXirrDisplay()
        price_date = price_dates.get(sid)
        end_date = None
        if sid not in unpriced:
            end_date = price_date or date.today()
            value = current_values.get(sid, Decimal("0"))
            cash_flows = portfolio_cash_flows(scheme_txns, value, switch_debits, price_date=end_date)
            fund_rate = _portfolio_xirr(
                scheme_txns, value, extra_debit_types=switch_debits, price_date=end_date, cash_flows=cash_flows,
            )
            display = portfolio_xirr_display(fund_rate, cash_flows)
            benchmark_rate = await _benchmark_xirr_for_transactions(
                db, scheme_txns, index, extra_debit_types={TransactionType.SWITCH_IN}, price_date=price_date,
            )

        fund_rows.append(
            FundBenchmarkRow(
                scheme_id=str(scheme_id),
                scheme_name=scheme.name,
                benchmark_index=index,
                # The display rate: flows that net to zero on one day give no figure here (a dash on every screen);
                # the since-inception window keeps the raw solve for its own callers.
                fund_xirr=_xirr_str(display.rate),
                benchmark_xirr=_xirr_str(benchmark_rate),
                xirr_as_of=end_date.isoformat() if end_date and (price_date or fund_rate is not None) else None,
                xirr_basis=display.basis,
                since_purchase_return=_xirr_str(display.since_purchase_return),
                xirr_caution=display.caution,
            )
        )
        window_jobs.append((fund_rows[-1], scheme_id, scheme_txns, index, fund_rate, benchmark_rate))

    total_current_value = sum(current_values.values(), Decimal("0"))
    overall_portfolio_rate = _portfolio_xirr(transactions, total_current_value, price_date=portfolio_price_date)
    overall_broad_market_rate = await _benchmark_xirr_for_transactions(
        db, transactions, BenchmarkIndex.NIFTY_500, price_date=portfolio_price_date,
    )

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
        from app.services.analytics.benchmark_windows import ist_today

        window_end = portfolio_price_date
        if window_end is not None and any(
            str(sid) not in unpriced and price_dates.get(str(sid)) is None for sid in grouped
        ):
            window_end = max(window_end, ist_today())
        window_ctx, window_levels = await _window_inputs(
            db,
            household_member_ids,
            min(transaction.date for transaction in window_transactions),
            tuple(dict.fromkeys([*LEGACY_BENCHMARK_INDICES, *(c.index_key for c in choices.values() if c.index_key)])),
            refresh_indices=LEGACY_BENCHMARK_INDICES,
            price_date=window_end,
        )
        # Fund prices can differ across schemes. Within a month the 1Y/3Y/5Y opening dates are shared.
        contexts = {window_ctx.today: window_ctx}
        for end in sorted(dated_funds - contexts.keys()):
            if (end.year, end.month) == (window_ctx.today.year, window_ctx.today.month):
                contexts[end] = replace(window_ctx, today=end)
            else:
                contexts[end] = await build_window_context(db, household_member_ids, end)
        fund_contexts = {sid: contexts.get(price_dates.get(str(sid)), window_ctx) for sid in grouped}
        # Refresh rows a commit above may have expired, in one statement (see the portfolio path).
        _fund_level_transactions(db, household_member_ids)
    except Exception as error:
        _roll_back_if_database_error(db, error)
        logger.warning("Fund benchmark window inputs could not be built", exc_info=True)
    else:
        for row, scheme_id, scheme_txns, index, fund_rate, benchmark_rate in window_jobs:
            try:
                sid = str(scheme_id)
                row.windows = compute_fund_window_rows(
                    fund_contexts[scheme_id],
                    scheme_id,
                    scheme_txns,
                    None if sid in unpriced else current_values.get(sid, Decimal("0")),
                    index,
                    window_levels,
                    since_inception=(fund_rate, benchmark_rate),
                    since_inception_price_date=price_dates.get(sid),
                )
            except Exception as error:
                _roll_back_if_database_error(db, error)
                logger.warning(
                    "Fund benchmark windows could not be computed for scheme %s",
                    scheme_id,
                    exc_info=True,
                )

        if include_declared:
            try:
                declared_comparison = compute_fund_vs_declared_benchmark(
                    window_ctx, window_levels, choices, grouped, current_values, schemes, fund_rows,
                    fund_contexts=fund_contexts, unpriced_scheme_ids=unpriced,
                )
            except Exception:
                # Only the new field may be lost; every legacy number above is already final.
                logger.warning("Declared benchmark comparison could not be computed", exc_info=True)

    return FundVsBenchmarkSummary(
        declared_comparison=declared_comparison,
        funds=fund_rows,
        overall_portfolio_xirr=_xirr_str(overall_portfolio_rate),
        overall_broad_market_xirr=_xirr_str(overall_broad_market_rate),
    )


def compute_fund_vs_declared_benchmark(
    ctx, levels, choices, grouped, current_values, schemes, legacy_rows, *,
    fund_contexts: dict[uuid.UUID, WindowContext] | None = None,
    unpriced_scheme_ids: frozenset[str] = frozenset(),
):
    """No database access: reuse the section's flows, holdings and history batch."""
    from app.services.analytics.schemas import DeclaredFundBenchmarkRow, DeclaredFundWindowXirr
    old = {row.scheme_id: row for row in legacy_rows}
    result = []
    for sid, choice in choices.items():
        fund_ctx = fund_contexts[sid] if fund_contexts is not None else ctx
        previous = old[str(sid)]
        from app.services.analytics.benchmark_windows import IndexLevels, audited_index_replay, _cas_opening_in_window
        windows = []
        for old_window in previous.windows:
            start = fund_ctx.starts.get(old_window.window)
            opening = fund_ctx.fund_start_values.get(old_window.window, {}).get(sid) if start is not None else None
            transactions = grouped.get(sid, [])
            reason = None
            value = None
            if not choice.index_key:
                reason = "No benchmark is available for this fund."
            elif str(sid) in unpriced_scheme_ids:
                reason = "The current investment value is not available."
            elif current_values.get(str(sid), Decimal("0")) == 0:
                reason = "The fund has been fully sold."
            elif start is not None and _cas_opening_in_window(transactions, start, fund_ctx.today):
                reason = "The original investment dates are not available for this period."
            elif old_window.window != "SI" and (start is None or opening is None):
                reason = "The starting investment value is not available for this period."
            else:
                flows = [
                    (txn.date, _signed_amount(txn, frozenset({TransactionType.SWITCH_IN})))
                    for txn in transactions if (start is None or start < txn.date) and txn.date <= fund_ctx.today
                ]
                checked = audited_index_replay(
                    levels.get(choice.index_key, IndexLevels([], [])), flows, start, opening, fund_ctx.today,
                    solve=choice.index_key != previous.benchmark_index,
                )
                reason = checked.reason
                if reason is None:
                    value = old_window.benchmark_xirr if choice.index_key == previous.benchmark_index else _xirr_str(checked.rate)
            windows.append(DeclaredFundWindowXirr(window=old_window.window, start_date=start if start is not None else min((t.date for t in transactions), default=None) if old_window.window == "SI" else None, fund_xirr=old_window.fund_xirr, benchmark_xirr=value, reason=reason))
        result.append(DeclaredFundBenchmarkRow(
            scheme_id=str(sid), scheme_name=schemes[sid].name,
            index_key=choice.index_key, source=choice.source, declared_name=choice.declared_name,
            note=choice.window_start_note, mapping_age_days=choice.mapping_age_days,
            windows=windows,
        ))
    return result


async def get_aggregate_fund_vs_benchmark(db: Session, user_id: uuid.UUID) -> AggregateFundVsBenchmarkResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    comparison = await compute_fund_vs_benchmark(db, [m.id for m in members])
    return AggregateFundVsBenchmarkResponse(members=statuses, comparison=comparison)
