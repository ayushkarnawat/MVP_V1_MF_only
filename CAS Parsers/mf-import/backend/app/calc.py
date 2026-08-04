"""Pure Decimal math: XIRR, FIFO gains, holdings, valuations."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from enum import Enum
from typing import Iterable, Sequence

from app.decimal_utils import quantize_amount, quantize_nav, quantize_pct, quantize_units

DAYS_PER_YEAR = Decimal("365")
EQUITY_LTCG_MONTHS = 12
DEBT_SLAB_CUTOFF = date(2023, 4, 1)
EQUITY_GRANDFATHER_CUTOFF = date(2018, 2, 1)
EQUITY_GRANDFATHER_NAV_DATE = date(2018, 1, 31)
LTCG_EXEMPTION_NOTE = "Equity LTCG exemption of ₹1.25 lakh per FY applies (display only; not tax filing)."


class TransactionType(str, Enum):
    PURCHASE = "PURCHASE"
    PURCHASE_SIP = "PURCHASE_SIP"
    REDEMPTION = "REDEMPTION"
    SWITCH_IN = "SWITCH_IN"
    SWITCH_OUT = "SWITCH_OUT"
    DIVIDEND_PAYOUT = "DIVIDEND_PAYOUT"
    DIVIDEND_REINVEST = "DIVIDEND_REINVEST"
    SEGREGATION = "SEGREGATION"
    STAMP_DUTY = "STAMP_DUTY"
    STT = "STT"
    MISC = "MISC"


PURCHASE_TYPES = frozenset(
    {
        TransactionType.PURCHASE,
        TransactionType.PURCHASE_SIP,
        TransactionType.SWITCH_IN,
        TransactionType.DIVIDEND_REINVEST,
        TransactionType.SEGREGATION,
    }
)
REDEMPTION_TYPES = frozenset(
    {
        TransactionType.REDEMPTION,
        TransactionType.SWITCH_OUT,
    }
)
CASH_INFLOW_TYPES = frozenset(
    {
        TransactionType.REDEMPTION,
        TransactionType.SWITCH_OUT,
        TransactionType.DIVIDEND_PAYOUT,
    }
)


@dataclass(frozen=True)
class Transaction:
    txn_date: date
    txn_type: TransactionType
    amount: Decimal | None = None
    units: Decimal | None = None
    nav: Decimal | None = None
    description: str = ""


@dataclass(frozen=True)
class Cashflow:
    cf_date: date
    amount: Decimal


@dataclass
class Lot:
    purchase_date: date
    units: Decimal
    cost_per_unit: Decimal

    @property
    def total_cost(self) -> Decimal:
        return quantize_amount(self.units * self.cost_per_unit)


@dataclass
class RealizedGain:
    sale_date: date
    units: Decimal
    gain: Decimal
    gain_type: str  # STCG, LTCG, SLAB
    holding_days: int
    note: str = ""


@dataclass
class FifoResult:
    remaining_lots: list[Lot] = field(default_factory=list)
    realized_gains: list[RealizedGain] = field(default_factory=list)
    total_realized_gain: Decimal = Decimal("0")
    stcg: Decimal = Decimal("0")
    ltcg: Decimal = Decimal("0")
    slab_gains: Decimal = Decimal("0")


@dataclass(frozen=True)
class NavPoint:
    nav_date: date
    nav: Decimal


@dataclass(frozen=True)
class UnitEvent:
    event_date: date
    units_delta: Decimal


@dataclass(frozen=True)
class ValuationPoint:
    val_date: date
    value: Decimal
    units: Decimal


def _years_between(start: date, end: date) -> Decimal:
    return Decimal(str((end - start).days)) / DAYS_PER_YEAR


def _signed_amount(txn: Transaction) -> Decimal | None:
    if txn.amount is None:
        return None
    amt = abs(txn.amount)
    if txn.txn_type in PURCHASE_TYPES:
        return -amt
    if txn.txn_type in CASH_INFLOW_TYPES:
        return amt
    return None


def build_cashflows(
    transactions: Sequence[Transaction],
    terminal_value: Decimal,
    as_of: date,
) -> list[Cashflow]:
    """Build XIRR cashflow series: outflows negative, inflows positive."""
    flows: list[Cashflow] = []
    for txn in sorted(transactions, key=lambda t: t.txn_date):
        signed = _signed_amount(txn)
        if signed is not None and signed != 0:
            flows.append(Cashflow(txn.txn_date, signed))
    if terminal_value != 0:
        flows.append(Cashflow(as_of, terminal_value))
    return flows


def _npv(rate: Decimal, cashflows: Sequence[Cashflow]) -> Decimal:
    if not cashflows:
        return Decimal("0")
    base = cashflows[0].cf_date
    total = Decimal("0")
    one_plus_r = Decimal("1") + rate
    for cf in cashflows:
        t = _years_between(base, cf.cf_date)
        total += cf.amount / (one_plus_r ** t)
    return total


def _npv_derivative(rate: Decimal, cashflows: Sequence[Cashflow]) -> Decimal:
    if not cashflows:
        return Decimal("0")
    base = cashflows[0].cf_date
    total = Decimal("0")
    one_plus_r = Decimal("1") + rate
    for cf in cashflows:
        t = _years_between(base, cf.cf_date)
        if t == 0:
            continue
        total -= t * cf.amount / (one_plus_r ** (t + Decimal("1")))
    return total


def xirr(
    cashflows: Sequence[Cashflow],
    *,
    guess: Decimal = Decimal("0.1"),
    max_iterations: int = 100,
    tolerance: Decimal = Decimal("1e-7"),
) -> Decimal | None:
    """Compute XIRR via Newton-Raphson with bisection fallback."""
    if len(cashflows) < 2:
        return None

    has_negative = any(cf.amount < 0 for cf in cashflows)
    has_positive = any(cf.amount > 0 for cf in cashflows)
    if not (has_negative and has_positive):
        return None

    rate = guess
    for _ in range(max_iterations):
        f = _npv(rate, cashflows)
        if abs(f) < tolerance:
            return rate
        fp = _npv_derivative(rate, cashflows)
        if fp == 0:
            break
        rate = rate - f / fp
        if rate <= Decimal("-0.9999"):
            break

    lo = Decimal("-0.9999")
    hi = Decimal("10")
    f_lo = _npv(lo, cashflows)
    f_hi = _npv(hi, cashflows)
    if f_lo * f_hi > 0:
        return None

    for _ in range(max_iterations):
        mid = (lo + hi) / 2
        f_mid = _npv(mid, cashflows)
        if abs(f_mid) < tolerance:
            return mid
        if f_lo * f_mid <= 0:
            hi = mid
            f_hi = f_mid
        else:
            lo = mid
            f_lo = f_mid
    return None


def compute_holdings(transactions: Sequence[Transaction]) -> Decimal:
    """Net units from all transactions."""
    total = Decimal("0")
    for txn in transactions:
        if txn.units is None:
            continue
        units = abs(txn.units)
        if txn.txn_type in PURCHASE_TYPES:
            total += units
        elif txn.txn_type in REDEMPTION_TYPES:
            total -= units
    return quantize_units(total)


def _lot_cost_per_unit(txn: Transaction) -> Decimal:
    if txn.nav is not None and txn.nav > 0:
        return quantize_nav(txn.nav)
    if txn.units and txn.amount and txn.units != 0:
        return quantize_nav(abs(txn.amount) / abs(txn.units))
    return Decimal("0")


def _months_between(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + (end.month - start.month)


def _lookup_nav(nav_history: Sequence[NavPoint], target: date) -> Decimal | None:
    """Return NAV on or before target date."""
    best: NavPoint | None = None
    for point in nav_history:
        if point.nav_date <= target:
            if best is None or point.nav_date > best.nav_date:
                best = point
    return best.nav if best else None


def _is_equity_category(category: str | None) -> bool:
    if not category:
        return True
    cat = category.upper()
    return "EQUITY" in cat or "ELSS" in cat


def _is_debt_category(category: str | None) -> bool:
    if not category:
        return False
    return "DEBT" in category.upper() or "LIQUID" in category.upper()


def _classify_gain(
    purchase_date: date,
    sale_date: date,
    scheme_category: str | None,
) -> str:
    is_equity = _is_equity_category(scheme_category)
    is_debt = _is_debt_category(scheme_category)
    if is_debt and purchase_date >= DEBT_SLAB_CUTOFF:
        return "SLAB"
    if is_equity:
        months = _months_between(purchase_date, sale_date)
        return "LTCG" if months > EQUITY_LTCG_MONTHS else "STCG"
    months = _months_between(purchase_date, sale_date)
    return "LTCG" if months > 36 else "STCG"


def _grandfathered_cost(
    purchase_date: date,
    fifo_cost: Decimal,
    units: Decimal,
    nav_history: Sequence[NavPoint],
    scheme_category: str | None,
) -> tuple[Decimal, str]:
    if not _is_equity_category(scheme_category):
        return fifo_cost, ""
    if purchase_date >= EQUITY_GRANDFATHER_CUTOFF:
        return fifo_cost, ""

    jan31_nav = _lookup_nav(nav_history, EQUITY_GRANDFATHER_NAV_DATE)
    if jan31_nav is None:
        return fifo_cost, "Grandfathering: Jan 31 2018 NAV unavailable; FIFO cost used."

    substituted = quantize_amount(units * jan31_nav)
    if substituted > fifo_cost:
        return substituted, "Grandfathering: Jan 31 2018 NAV used as substituted cost (pre-Feb 2018 equity)."
    return fifo_cost, ""


def fifo_cost_basis(transactions: Sequence[Transaction]) -> tuple[list[Lot], Decimal]:
    """Process transactions FIFO; return remaining lots and average cost of holdings."""
    lots: list[Lot] = []
    for txn in sorted(transactions, key=lambda t: t.txn_date):
        if txn.txn_type in PURCHASE_TYPES and txn.units:
            units = abs(txn.units)
            cpu = _lot_cost_per_unit(txn)
            lots.append(Lot(txn.txn_date, units, cpu))
        elif txn.txn_type in REDEMPTION_TYPES and txn.units:
            to_sell = abs(txn.units)
            i = 0
            while to_sell > 0 and i < len(lots):
                lot = lots[i]
                if lot.units <= to_sell:
                    to_sell -= lot.units
                    lots.pop(i)
                else:
                    lot.units -= to_sell
                    to_sell = Decimal("0")
                    i += 1

    total_units = sum((lot.units for lot in lots), Decimal("0"))
    total_cost = sum((lot.total_cost for lot in lots), Decimal("0"))
    avg = quantize_nav(total_cost / total_units) if total_units > 0 else Decimal("0")
    return lots, avg


def fifo_realized_gains(
    transactions: Sequence[Transaction],
    scheme_category: str | None,
    nav_history: Sequence[NavPoint],
) -> FifoResult:
    """FIFO lot matching with Indian capital gains classification."""
    lots: list[Lot] = []
    result = FifoResult()

    for txn in sorted(transactions, key=lambda t: t.txn_date):
        if txn.txn_type in PURCHASE_TYPES and txn.units:
            units = abs(txn.units)
            cpu = _lot_cost_per_unit(txn)
            lots.append(Lot(txn.txn_date, units, cpu))
            continue

        if txn.txn_type not in REDEMPTION_TYPES or not txn.units:
            continue

        sale_units = abs(txn.units)
        sale_price = _lot_cost_per_unit(txn)
        if sale_price == 0 and txn.amount and txn.units:
            sale_price = quantize_nav(abs(txn.amount) / abs(txn.units))

        while sale_units > 0 and lots:
            lot = lots[0]
            matched = min(lot.units, sale_units)
            fifo_cost = quantize_amount(matched * lot.cost_per_unit)
            cost_basis, note = _grandfathered_cost(
                lot.purchase_date, fifo_cost, matched, nav_history, scheme_category
            )
            proceeds = quantize_amount(matched * sale_price)
            gain = proceeds - cost_basis
            gain_type = _classify_gain(lot.purchase_date, txn.txn_date, scheme_category)

            result.realized_gains.append(
                RealizedGain(
                    sale_date=txn.txn_date,
                    units=matched,
                    gain=gain,
                    gain_type=gain_type,
                    holding_days=(txn.txn_date - lot.purchase_date).days,
                    note=note,
                )
            )
            result.total_realized_gain += gain
            if gain_type == "STCG":
                result.stcg += gain
            elif gain_type == "LTCG":
                result.ltcg += gain
            else:
                result.slab_gains += gain

            lot.units -= matched
            sale_units -= matched
            if lot.units == 0:
                lots.pop(0)

    result.remaining_lots = lots
    result.total_realized_gain = quantize_amount(result.total_realized_gain)
    result.stcg = quantize_amount(result.stcg)
    result.ltcg = quantize_amount(result.ltcg)
    result.slab_gains = quantize_amount(result.slab_gains)
    return result


def invested_amount(transactions: Sequence[Transaction]) -> Decimal:
    """Net invested: purchases minus redemptions (excluding taxes/dividends)."""
    total = Decimal("0")
    for txn in transactions:
        if txn.amount is None:
            continue
        if txn.txn_type in PURCHASE_TYPES:
            total += abs(txn.amount)
        elif txn.txn_type in REDEMPTION_TYPES:
            total -= abs(txn.amount)
    return quantize_amount(total)


def value_at_dates(
    unit_events: Sequence[UnitEvent],
    nav_series: Sequence[NavPoint],
) -> list[ValuationPoint]:
    """Historical portfolio value from unit balance × NAV over time."""
    if not nav_series:
        return []

    events = sorted(unit_events, key=lambda e: e.event_date)
    nav_sorted = sorted(nav_series, key=lambda p: p.nav_date)
    event_idx = 0
    balance = Decimal("0")
    points: list[ValuationPoint] = []

    for nav_point in nav_sorted:
        while event_idx < len(events) and events[event_idx].event_date <= nav_point.nav_date:
            balance += events[event_idx].units_delta
            balance = quantize_units(balance)
            event_idx += 1
        value = quantize_amount(balance * nav_point.nav)
        points.append(ValuationPoint(nav_point.nav_date, value, balance))

    return points


def unit_events_from_transactions(transactions: Sequence[Transaction]) -> list[UnitEvent]:
    events: list[UnitEvent] = []
    for txn in transactions:
        if txn.units is None:
            continue
        units = abs(txn.units)
        if txn.txn_type in PURCHASE_TYPES:
            events.append(UnitEvent(txn.txn_date, units))
        elif txn.txn_type in REDEMPTION_TYPES:
            events.append(UnitEvent(txn.txn_date, -units))
    return events


def allocation_by_category(
    holdings: dict[str, Decimal],
    categories: dict[str, str],
) -> dict[str, Decimal]:
    """Aggregate holdings value by broad category (equity/debt/hybrid/other)."""
    buckets: dict[str, Decimal] = {
        "equity": Decimal("0"),
        "debt": Decimal("0"),
        "hybrid": Decimal("0"),
        "other": Decimal("0"),
    }
    for scheme_key, value in holdings.items():
        cat = categories.get(scheme_key, "").upper()
        if "HYBRID" in cat or "BALANCED" in cat or "ARBITRAGE" in cat:
            buckets["hybrid"] += value
        elif "DEBT" in cat or "LIQUID" in cat or "MONEY MARKET" in cat:
            buckets["debt"] += value
        elif "EQUITY" in cat or "ELSS" in cat:
            buckets["equity"] += value
        else:
            buckets["other"] += value

    total = sum(buckets.values(), Decimal("0"))
    if total == 0:
        return {k: Decimal("0") for k in buckets}
    return {k: quantize_pct(v / total) for k, v in buckets.items()}


def map_category_from_mfapi(scheme_category: str | None) -> str:
    """Map mfapi.in scheme_category to broad bucket."""
    if not scheme_category:
        return "other"
    cat = scheme_category.upper()
    if "HYBRID" in cat or "BALANCED" in cat or "ARBITRAGE" in cat:
        return "hybrid"
    if "DEBT" in cat or "LIQUID" in cat or "MONEY MARKET" in cat:
        return "debt"
    if "EQUITY" in cat or "ELSS" in cat:
        return "equity"
    return "other"
