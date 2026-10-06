from datetime import date
from decimal import Decimal

from app.models.enums import CostSource, TransactionType
from app.services.import_.opening_balance import OpeningLot, apply_opening_cost_to_conversions, price_opening_lot
from app.services.import_.parser import NormalizedTransaction, ParsedScheme


def _s(open_units, cost, vnav="128.30"):
    return ParsedScheme(name="X", isin="INF1", amfi="1", scheme_type="EQUITY", folio="1/1", amc="A",
                        transaction_count=0, open_units=Decimal(open_units),
                        valuation_cost=Decimal(cost) if cost is not None else None, valuation_nav=Decimal(vnav))


def _t(d, type_, units, nav):
    u, n = Decimal(units), Decimal(nav)
    return NormalizedTransaction(folio="1/1", amc="A", scheme_name="X", isin="INF1", amfi="1", scheme_type="EQUITY",
                                 txn_date=d, txn_type=type_, description="", amount=(u * n).quantize(Decimal("0.01")), units=u, nav=n)


START = date(2016, 1, 1)
SERIES = [(date(2010, 1, 1), Decimal("20")), (date(2014, 3, 1), Decimal("85")), (date(2016, 1, 1), Decimal("90"))]


def test_cas_cost_when_no_in_period_activity():
    lot = price_opening_lot(_s("7251.691", "512000"), [], START, SERIES)
    assert lot.cost_source == CostSource.CAS_COST
    assert lot.nav == Decimal("70.6042")       # quantize_nav(512000 / 7251.691)
    assert lot.units == Decimal("7251.691")


def test_cas_cost_minus_in_period_purchases_still_held():
    txns = [_t(date(2020, 1, 1), TransactionType.PURCHASE_SIP, "100", "50")]   # 5000 cost, still held
    lot = price_opening_lot(_s("1000", "45000"), txns, START, SERIES)
    assert lot.cost_source == CostSource.CAS_COST
    assert lot.nav == Decimal("40.0000")        # (45000 - 5000) / 1000


def test_implausible_cas_cost_falls_back_to_nav_on_start():
    lot = price_opening_lot(_s("1000", "500"), [], START, SERIES)   # 0.50/unit, below the pre-start min 20
    assert lot.cost_source == CostSource.NAV_ON_START and lot.nav == Decimal("90.0000")


def test_opening_consumed_falls_back_to_nav_on_start():
    txns = [_t(date(2018, 1, 1), TransactionType.REDEMPTION, "1000", "120")]
    lot = price_opening_lot(_s("1000", "0"), txns, START, SERIES)
    assert lot.cost_source == CostSource.NAV_ON_START


def test_missing_cas_cost_and_no_series_uses_valuation_nav():
    lot = price_opening_lot(_s("10", None, vnav="55.5"), [], START, None)
    assert lot.cost_source == CostSource.NAV_ON_START and lot.nav == Decimal("55.5000")


def test_zero_opening_returns_none():
    assert price_opening_lot(_s("0", "0"), [], START, SERIES) is None


def test_apply_opening_cost_to_conversion_prices_both_legs():
    outgoing = _t(date(2016, 3, 12), TransactionType.SWITCH_OUT, "95800", "0")
    outgoing.conversion_from_opening = True
    incoming = _t(date(2016, 3, 12), TransactionType.SWITCH_IN, "829.43", "0")
    incoming.isin = "INF2"
    incoming.conversion_from_opening = True
    lot = OpeningLot(Decimal("95800"), START, Decimal("10"), Decimal("958000"), CostSource.NAV_ON_START)
    apply_opening_cost_to_conversions(lot, [outgoing], {0: incoming})
    assert outgoing.amount == incoming.amount == Decimal("958000.00")
    assert outgoing.nav == Decimal("10.0000")
    assert incoming.nav == (Decimal("958000") / Decimal("829.43")).quantize(Decimal("0.0001"))
    assert not outgoing.conversion_from_opening and not incoming.conversion_from_opening


# ---- Phase 3 review fix: opening cost knows the new row types ----

# SERIES spans 20–85 before START, so plausible costs here are 20..85 per unit.


def test_gift_out_reduces_remaining_opening_units():
    # opening 100 units, CAS cost of what's still held 2,500, 50 units gifted away:
    # the remaining 50 opening units cost 2,500 → 50.0000/unit (not 25 if the gift were ignored)
    txns = [_t(date(2020, 1, 1), TransactionType.GIFT_OUT, "50.000", "60")]
    lot = price_opening_lot(_s("100", "2500"), txns, START, SERIES)
    assert lot.cost_source == CostSource.CAS_COST and lot.nav == Decimal("50.0000")


def test_bounced_sip_is_not_counted_as_held_cost():
    # 1,000 opening units; a 40-unit SIP at 125 that bounces. CAS cost of holdings = 60,000.
    # Bounced SIP removed → (60,000 − 0) / 1,000 = 60.0000 (ignoring it gave 55)
    txns = [_t(date(2020, 1, 7), TransactionType.PURCHASE_SIP, "40.000", "125"),
            _t(date(2020, 1, 10), TransactionType.REVERSAL, "40.000", "125")]
    lot = price_opening_lot(_s("1000", "60000"), txns, START, SERIES)
    assert lot.cost_source == CostSource.CAS_COST and lot.nav == Decimal("60.0000")


def test_bonus_and_gift_in_lots_are_held_cost():
    # 100 opening units; 100 bonus units (cost 0); 10 units gifted in at 50 (cost 500).
    # CAS cost 5,500 → opening cost (5,500 − 0 − 500) / 100 = 50.0000
    txns = [_t(date(2018, 1, 1), TransactionType.BONUS, "100.000", "0"),
            _t(date(2019, 1, 1), TransactionType.GIFT_IN, "10.000", "50")]
    lot = price_opening_lot(_s("100", "5500"), txns, START, SERIES)
    assert lot.cost_source == CostSource.CAS_COST and lot.nav == Decimal("50.0000")

