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


def test_untouched_lot_trusts_cas_cost_even_outside_pre_start_band():
    # Was test_implausible_cas_cost_falls_back_to_nav_on_start: an untouched
    # opening lot has no FIFO-subtraction step to distrust, so an out-of-band
    # result (e.g. a pre-2006 fund, or an NFO) is trusted, not discarded.
    lot = price_opening_lot(_s("1000", "500"), [], START, SERIES)
    assert lot.cost_source == CostSource.CAS_COST and lot.nav == Decimal("0.5000")


def test_untouched_lot_pre_2006_style_cost_trusted():
    # Mirrors the real HDFC Flexi Cap failure: a fund whose true cost predates
    # the pre-start NAV window entirely (earliest available NAV is 20, real
    # cost was ~49.73/unit -- a genuine historical void, not a data error).
    lot = price_opening_lot(_s("603.209", "30000"), [], START, SERIES)
    assert lot.cost_source == CostSource.CAS_COST
    assert lot.nav == Decimal("49.7340")   # 30000 / 603.209, below the pre-start floor of 20


def test_touched_lot_with_real_corruption_is_still_flagged():
    # The protection the band check exists for: an in-period sale consumes
    # part of the opening lot, and the resulting subtraction is genuinely
    # nonsense (0.5/unit against a pre-start floor of 20) -- not a
    # historical-void case, a real corrupted number. Must still fall back to
    # NAV_ON_START, even after the loosened touched-case layers (avg-cost,
    # x3 band).
    txns = [_t(date(2017, 1, 1), TransactionType.REDEMPTION, "500", "50")]
    lot = price_opening_lot(_s("1000", "250"), txns, START, SERIES)
    assert lot.cost_source == CostSource.NAV_ON_START


def test_touched_lot_prefers_average_cost_over_fifo_subtraction():
    # Demonstrates why average-cost must be tried BEFORE the FIFO-subtraction
    # band/loosened checks, not after: with an in-period purchase (500 @ 100,
    # untouched) and a partial sale of the opening lot (400 of 1000), the
    # FIFO-subtraction reading is 8.33/unit -- outside the normal band, but
    # inside the x3 loosened band, so an older FIFO-primary ordering would
    # have accepted it as CAS_COST at 8.33, which is wrong. The CAS's own
    # "Total Cost Value" is actually average cost (confirmed externally): 50
    # exactly here, squarely in-band, and correct.
    txns = [_t(date(2018, 1, 1), TransactionType.PURCHASE_SIP, "500", "100"),
            _t(date(2019, 1, 1), TransactionType.REDEMPTION, "400", "120")]
    lot = price_opening_lot(_s("1000", "55000"), txns, START, SERIES)
    assert lot.cost_source == CostSource.CAS_COST
    assert lot.nav == Decimal("50.0000")


def test_corrupted_zero_nav_point_does_not_defeat_the_floor():
    # One confirmed mfapi.in defect (3 Axis schemes share this exact corrupt
    # point): an unfiltered 0 reading sets a false floor of 0, so anything
    # positive -- including a real corruption -- passes. Must stay caught.
    series_with_zero = [(date(2005, 1, 1), Decimal("0"))] + SERIES
    txns = [_t(date(2017, 1, 1), TransactionType.REDEMPTION, "500", "50")]
    lot = price_opening_lot(_s("1000", "250"), txns, START, series_with_zero)
    assert lot.cost_source == CostSource.NAV_ON_START


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



def test_opening_lot_does_not_absorb_in_period_stamp_duty():
    """CAS cost 15,000 = 10,000 opening + 5,000 SIP (incl. 0.25 stamp duty).
    The opening lot must cost 10,000, not 10,000.25."""
    scheme = ParsedScheme(name="X", isin="INF1", amfi=None, scheme_type=None, folio="1/1", amc="X",
                          transaction_count=1, open_units=Decimal("100.000"), close_units=Decimal("200.000"),
                          valuation_cost=Decimal("15000.00"))
    sip = NormalizedTransaction(folio="1/1", amc="X", scheme_name="X", isin="INF1", amfi=None, scheme_type=None,
                                txn_date=date(2025, 10, 6), txn_type=TransactionType.PURCHASE_SIP, description="SIP",
                                amount=Decimal("4999.75"), units=Decimal("100.000"), nav=Decimal("49.9975"),
                                stamp_duty=Decimal("0.25"))
    lot = price_opening_lot(scheme, [sip], date(2025, 4, 1), None)
    assert lot.amount == Decimal("10000.00")
