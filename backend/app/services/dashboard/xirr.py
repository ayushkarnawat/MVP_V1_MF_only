from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.folio import Folio
from app.models.transaction import Transaction
from app.models.enums import TransactionOrigin, TransactionType
from app.services.analytics.xirr import xirr
from app.services.dashboard.cash_flow import _CREDIT_TYPES, _DEBIT_TYPES
from app.services.dashboard.schemas import HoldingRow, XirrDisclaimerOut
from app.services.lot_rules import LOT_CONSUMING_TYPES, apply_lot_rules, cost_per_unit, paid_amount

# #3: a gift isn't cash, but for returns a gift received is money put in at
# its value and a gift given is money taken out, so neither distorts XIRR.
_XIRR_DEBIT_TYPES = _DEBIT_TYPES | {TransactionType.GIFT_IN}
_RELEVANT_TYPES = _XIRR_DEBIT_TYPES | _CREDIT_TYPES | {TransactionType.GIFT_OUT}
_FUND_DEBIT_TYPES = _XIRR_DEBIT_TYPES | {TransactionType.SWITCH_IN}
_FUND_RELEVANT_TYPES = _RELEVANT_TYPES | {TransactionType.SWITCH_IN, TransactionType.SWITCH_OUT}
# The disclaimer's lineage replay needs every lot-adding row, including the
# ones that are not XIRR cash flows (reinvested dividends, bonus and segregated
# units). Leaving them out would make a later REVERSAL (newest-lot-first in
# apply_lot_rules) eat into the opening lot instead of the lot it really
# cancels. Used ONLY for the SQL filter; XIRR inputs stay on _FUND_RELEVANT_TYPES.
_LINEAGE_QUERY_TYPES = _FUND_RELEVANT_TYPES | {
    TransactionType.DIVIDEND_REINVEST, TransactionType.BONUS, TransactionType.SEGREGATION,
}

# Root Cause B (2026-10-10 Chandra Tripathi investigation, §3): an opening
# balance is dated at the statement's own start, not its real purchase date,
# which can make XIRR look far better or worse than reality. Rather than
# guess a date we don't have, we disclaim the number instead -- but only when
# excluding the undated opening lineage would actually bring the number back
# under this same ceiling (see _build_disclaimer below). ponytail: single
# judgement-call constant, calibrated against the synthetic p/r scenario grid
# (21 scenarios), the real Chandra Tripathi file, and a further 27-scenario
# grid run 2026-10-19 specifically to pressure-test the trigger shape --
# re-tune by re-running that grid, don't treat this as a derived formula.
# An earlier version of this trigger also gated on `opening_cost_share >=
# 0.25`; a 10-24% share was found to still misfire silently (plan doc's
# "Empirical scenario-grid testing"), so that constant is removed, not kept
# dormant -- see the plan doc's decision log, item 2.
_XIRR_SANITY_CEILING = Decimal("0.35")


@dataclass(frozen=True)
class XirrDisclaimer:
    alt_xirr: str | None
    opening_cost_share: str

    def to_schema(self) -> XirrDisclaimerOut:
        return XirrDisclaimerOut(alt_xirr=self.alt_xirr, opening_cost_share=self.opening_cost_share)


@dataclass(frozen=True)
class DashboardXirrSummary:
    lifetime_xirr: str | None
    current_holdings_xirr: str | None
    lifetime_xirr_disclaimer: XirrDisclaimer | None = None
    current_holdings_xirr_disclaimer: XirrDisclaimer | None = None


def _signed_amount(
    transaction: Transaction,
    extra_debit_types: frozenset[TransactionType] = frozenset(),
) -> Decimal:
    return -paid_amount(transaction) if transaction.type in (_XIRR_DEBIT_TYPES | extra_debit_types) else paid_amount(transaction)


def portfolio_xirr(
    transactions: list[Transaction],
    current_value: Decimal,
    extra_debit_types: frozenset[TransactionType] = frozenset(),
    dated_share: dict[int, Decimal] | None = None,
) -> Decimal | None:
    """`dated_share` (keyed by id(transaction)) scales a row's cash flow to the
    part that is NOT opening-lineage; only the disclaimer's alt_xirr passes it,
    so the headline numbers are computed exactly as before."""
    flows = []
    for transaction in transactions:
        amount = _signed_amount(transaction, extra_debit_types)
        if dated_share is not None and id(transaction) in dated_share:
            amount *= dated_share[id(transaction)]
            if amount == 0:
                continue
        flows.append((transaction.date, amount))
    flows.append((date.today(), current_value))
    return xirr(flows)


def xirr_string(rate: Decimal | None) -> str | None:
    if rate is None:
        return None
    if rate == 0:
        return "0"
    return format(rate, "f")


def _replay_opening_lineage(
    folio_transactions: list[Transaction],
) -> tuple[Decimal, Decimal, dict[int, Decimal]]:
    """Units/cost of one folio still sitting in their original opening lot,
    untouched since, plus -- for every sale-type row -- the share of its units
    that came out of the opening lot (keyed by id(row)). A switch re-anchors
    its units to a real, dated transaction (the switch itself), so
    switched-away units are no longer opening-lineage -- only units that have
    never left their original scheme since import still carry the
    statement-start placeholder date."""
    lots: list[list] = []
    opening_sold_share: dict[int, Decimal] = {}
    # Same-date rows reach us in random-uuid order; sells must replay after
    # buys (as holdings.py does) or a statement-start-day redemption would
    # find no lots and be silently lost. sorted() is stable, so ties keep SQL order.
    for txn in sorted(folio_transactions, key=lambda t: (t.date, t.type in LOT_CONSUMING_TYPES)):
        is_opening = txn.origin == TransactionOrigin.CAS_OPENING
        opening_before = sum((lot[0] for lot in lots if lot[2]), Decimal("0"))
        apply_lot_rules(lots, txn.type, txn.units, cost_per_unit(txn.units, txn.nav, txn.amount, txn.stamp_duty),
                         lambda u, n: [u, n, is_opening])
        if txn.type in LOT_CONSUMING_TYPES and txn.units:
            opening_after = sum((lot[0] for lot in lots if lot[2]), Decimal("0"))
            opening_sold_share[id(txn)] = min(max((opening_before - opening_after) / txn.units, Decimal("0")), Decimal("1"))
    units = sum((lot[0] for lot in lots if lot[2]), Decimal("0"))
    cost = sum((lot[0] * lot[1] for lot in lots if lot[2]), Decimal("0"))
    return units, cost, opening_sold_share


def _opening_lineage(folio_transactions: list[Transaction]) -> tuple[Decimal, Decimal]:
    units, cost, _sold = _replay_opening_lineage(folio_transactions)
    return units, cost


def _opening_lineage_by_scheme(
    transaction_rows: list[tuple[Transaction, uuid.UUID]],
) -> tuple[dict[uuid.UUID, tuple[Decimal, Decimal]], dict[int, Decimal]]:
    by_folio: dict[uuid.UUID, list[Transaction]] = defaultdict(list)
    folio_scheme: dict[uuid.UUID, uuid.UUID] = {}
    for transaction, scheme_id in transaction_rows:
        by_folio[transaction.folio_id].append(transaction)
        folio_scheme[transaction.folio_id] = scheme_id
    result: dict[uuid.UUID, tuple[Decimal, Decimal]] = defaultdict(lambda: (Decimal("0"), Decimal("0")))
    opening_sold_share: dict[int, Decimal] = {}
    for folio_id, folio_transactions in by_folio.items():
        units, cost, sold_share = _replay_opening_lineage(folio_transactions)
        opening_sold_share.update(sold_share)
        prev_units, prev_cost = result[folio_scheme[folio_id]]
        result[folio_scheme[folio_id]] = (prev_units + units, prev_cost + cost)
    return result, opening_sold_share


def _build_disclaimer(
    transactions: list[Transaction],
    relevant_types: frozenset[TransactionType],
    extra_debit_types: frozenset[TransactionType],
    current_value: Decimal,
    rate: Decimal | None,
    lineage_by_scheme: dict[uuid.UUID, tuple[Decimal, Decimal]],
    scheme_totals: dict[uuid.UUID, tuple[Decimal, Decimal]],
    in_scope_schemes: set[uuid.UUID] | None,
    opening_sold_share: dict[int, Decimal],
) -> XirrDisclaimer | None:
    # 2026-10-19: condition (b) used to be opening_cost_share >= 25% -- a proxy
    # for "would removing the undated opening lineage actually explain this
    # number." A 27-scenario empirical grid (plan doc, "Empirical scenario-grid
    # testing") found real cases where that proxy disagrees with the real
    # answer: a 10-24% opening-lineage share can still drag a blended XIRR
    # 2-8x past its true rate, silently. Comparing alt_rate to the same
    # ceiling asks the real question directly, using a value this function
    # already computes either way -- no new data, no second constant.
    if rate is None or rate <= _XIRR_SANITY_CEILING:
        return None
    relevant = [t for t in transactions if t.type in relevant_types]
    debit_types = _XIRR_DEBIT_TYPES | extra_debit_types
    total_cost = sum((paid_amount(t) for t in relevant if t.type in debit_types), Decimal("0"))
    if total_cost <= 0:
        return None
    scope_items = (
        lineage_by_scheme.items() if in_scope_schemes is None
        else ((sid, v) for sid, v in lineage_by_scheme.items() if sid in in_scope_schemes)
    )
    opening_units_by_scheme = {}
    opening_cost = Decimal("0")
    for scheme_id, (units, cost) in scope_items:
        opening_units_by_scheme[scheme_id] = units
        opening_cost += cost
    if opening_cost <= 0:
        return None
    opening_cost_share = opening_cost / total_cost
    opening_value_remaining = Decimal("0")
    for scheme_id, opening_units in opening_units_by_scheme.items():
        units_held, scheme_value = scheme_totals.get(scheme_id, (Decimal("0"), Decimal("0")))
        if units_held > 0:
            opening_value_remaining += opening_units / units_held * scheme_value
    # Only the CAS-statement opening rows are undated placeholders (matching
    # _opening_lineage). A MANUAL opening balance carries a user-entered date,
    # so it stays a real flow -- dropping its cost while its units remain in
    # the terminal value would overstate alt_xirr.
    alt_flows = [t for t in relevant if t.origin != TransactionOrigin.CAS_OPENING]
    # Sale proceeds follow the same rule as cost and value: the part of a sale
    # FIFO took from the opening lot belongs to undated units, so only the
    # dated share stays in (PR review). Dividend payouts are not scaled -- they
    # would need the holding at each payout date. dated_share = 1 - opening share.
    dated_share = {key: Decimal("1") - share for key, share in opening_sold_share.items()}
    alt_rate = portfolio_xirr(alt_flows, current_value - opening_value_remaining, extra_debit_types, dated_share)
    # The actual gate: fire only if excluding the undated piece would bring
    # the number back under the ceiling (or leave nothing to compute). If
    # alt_rate is ALSO implausible, the opening-balance dating isn't what's
    # making this number look wrong -- something else is, and disclaiming
    # "this may be inflated by an undated opening balance" would be a false
    # explanation, not just an unnecessary one.
    if alt_rate is not None and alt_rate > _XIRR_SANITY_CEILING:
        return None
    return XirrDisclaimer(alt_xirr=xirr_string(alt_rate), opening_cost_share=format(opening_cost_share, "f"))


def calculate_dashboard_xirr(
    db: Session,
    household_member_ids: list[uuid.UUID],
    holdings: list[HoldingRow],
) -> DashboardXirrSummary:
    if not household_member_ids:
        return DashboardXirrSummary(None, None)

    transaction_rows = (
        db.query(Transaction, Folio.scheme_id)
        .join(Folio, Folio.id == Transaction.folio_id)
        .filter(
            Folio.household_member_id.in_(household_member_ids),
            Transaction.type.in_(_LINEAGE_QUERY_TYPES),
        )
        .order_by(Transaction.date, Transaction.id)
        .all()
    )
    # transaction_rows also carries the lot-adding non-cash rows (see
    # _LINEAGE_QUERY_TYPES); only the lineage replay may see those.
    transactions = [t for t, _scheme_id in transaction_rows if t.type in _FUND_RELEVANT_TYPES]
    if not transactions:
        return DashboardXirrSummary(None, None)

    lifetime_value = sum(
        (Decimal(holding.current_value) for holding in holdings if holding.current_value is not None),
        Decimal("0"),
    )
    current_scheme_ids = {
        uuid.UUID(holding.scheme_id)
        for holding in holdings
        if Decimal(holding.units_held) != 0
    }
    current_transactions = [
        transaction
        for transaction, scheme_id in transaction_rows
        if scheme_id in current_scheme_ids and transaction.type in _FUND_RELEVANT_TYPES
    ]
    current_value = sum(
        (
            Decimal(holding.current_value)
            for holding in holdings
            if holding.current_value is not None and uuid.UUID(holding.scheme_id) in current_scheme_ids
        ),
        Decimal("0"),
    )
    lifetime_rate = portfolio_xirr([t for t in transactions if t.type in _RELEVANT_TYPES], lifetime_value)
    current_rate = portfolio_xirr(current_transactions, current_value, frozenset({TransactionType.SWITCH_IN})) if current_transactions else None

    scheme_totals: dict[uuid.UUID, tuple[Decimal, Decimal]] = defaultdict(lambda: (Decimal("0"), Decimal("0")))
    for holding in holdings:
        sid = uuid.UUID(holding.scheme_id)
        u, v = scheme_totals[sid]
        scheme_totals[sid] = (u + Decimal(holding.units_held), v + (Decimal(holding.current_value) if holding.current_value is not None else Decimal("0")))
    lineage_by_scheme, opening_sold_share = _opening_lineage_by_scheme(transaction_rows)

    return DashboardXirrSummary(
        lifetime_xirr=xirr_string(lifetime_rate),
        current_holdings_xirr=xirr_string(current_rate),
        lifetime_xirr_disclaimer=_build_disclaimer(
            transactions, _RELEVANT_TYPES, frozenset(), lifetime_value, lifetime_rate,
            lineage_by_scheme, scheme_totals, None, opening_sold_share,
        ),
        current_holdings_xirr_disclaimer=_build_disclaimer(
            current_transactions, _FUND_RELEVANT_TYPES, frozenset({TransactionType.SWITCH_IN}), current_value, current_rate,
            lineage_by_scheme, scheme_totals, current_scheme_ids, opening_sold_share,
        ) if current_transactions else None,
    )
