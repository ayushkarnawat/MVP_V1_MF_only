"""Portfolio XIRR vs. Nifty-index benchmark XIRR — PRD-04 FR-8/FR-9.

Both portfolio XIRR and benchmark-hypothetical XIRR share the same
cash-flow convention as `dashboard/cash_flow.py`'s FR-7 logic: purchase/SIP
outflows (negative) and redemption/dividend-payout inflows (positive) at
their transaction dates, switches and STT/stamp-duty/misc excluded as
intra-portfolio or non-cash-movement. This module runs its own transaction
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

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import BenchmarkIndex
from app.models.folio import Folio
from app.models.transaction import Transaction
from app.services.analytics.nse_indices_client import ensure_index_history_fresh, get_index_level_on_or_before
from app.services.analytics.schemas import (
    AggregatePortfolioBenchmarkResponse,
    IndexXirrRow,
    PortfolioBenchmarkSummary,
)
from app.services.analytics.xirr import xirr
from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.cash_flow import _CREDIT_TYPES, _DEBIT_TYPES
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members

_RELEVANT_TYPES = _DEBIT_TYPES | _CREDIT_TYPES


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


def _signed_amount(txn: Transaction) -> Decimal:
    return -txn.amount if txn.type in _DEBIT_TYPES else txn.amount


async def _benchmark_xirr_for_transactions(
    db: Session, transactions: list[Transaction], index: BenchmarkIndex
) -> Decimal | None:
    if not transactions:
        return None
    start_date = min(t.date for t in transactions)
    today = date.today()
    await ensure_index_history_fresh(db, index, start_date, today)

    net_units = Decimal("0")
    flows: list[tuple[date, Decimal]] = []
    for txn in transactions:
        level = get_index_level_on_or_before(db, index, txn.date)
        if level is None:
            # This index has no history covering this transaction's date
            # (fetch failed, or genuinely unavailable) — excluded from the
            # hypothetical stream rather than crashing the whole comparison.
            continue
        index_value, _ = level
        signed = _signed_amount(txn)
        if signed < 0:
            net_units += -signed / index_value
        else:
            net_units -= signed / index_value
        flows.append((txn.date, signed))

    today_level = get_index_level_on_or_before(db, index, today)
    if today_level is None or not flows:
        return None
    flows.append((today, net_units * today_level[0]))
    return xirr(flows)


async def compute_portfolio_vs_benchmarks(
    db: Session, household_member_ids: list[uuid.UUID]
) -> PortfolioBenchmarkSummary:
    transactions = _investment_transactions(db, household_member_ids)
    if not transactions:
        return PortfolioBenchmarkSummary(
            portfolio_xirr=None,
            benchmarks=[IndexXirrRow(index=i, xirr=None) for i in BenchmarkIndex],
        )

    holdings = await compute_holdings(db, household_member_ids)
    current_value = sum((Decimal(h.current_value) for h in holdings), Decimal("0"))
    portfolio_flows = [(t.date, _signed_amount(t)) for t in transactions]
    portfolio_flows.append((date.today(), current_value))
    portfolio_xirr = xirr(portfolio_flows)

    benchmark_rows = []
    for index in BenchmarkIndex:
        rate = await _benchmark_xirr_for_transactions(db, transactions, index)
        benchmark_rows.append(IndexXirrRow(index=index, xirr=str(rate) if rate is not None else None))

    return PortfolioBenchmarkSummary(
        portfolio_xirr=str(portfolio_xirr) if portfolio_xirr is not None else None,
        benchmarks=benchmark_rows,
    )


async def get_aggregate_portfolio_vs_benchmarks(
    db: Session, user_id: uuid.UUID
) -> AggregatePortfolioBenchmarkResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    benchmark = await compute_portfolio_vs_benchmarks(db, [m.id for m in members])
    return AggregatePortfolioBenchmarkResponse(members=statuses, benchmark=benchmark)
