from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest

from app.models.enums import ImportStatus, PlanType, Relationship, TransactionOrigin, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.schemas import HoldingRow
from app.services.dashboard.xirr import _opening_lineage, _replay_opening_lineage, calculate_dashboard_xirr


def _holding(scheme_id: uuid.UUID, member_id: uuid.UUID) -> HoldingRow:
    return HoldingRow(
        scheme_id=str(scheme_id), scheme_name="Current Fund", amc_name="AMC",
        household_member_id=str(member_id), household_member_name="Investor",
        plan_type=PlanType.DIRECT, units_held="10.000", average_nav="10.0000",
        current_nav="20.0000", current_nav_date=date.today(), amount_invested="100.00",
        current_value="200.00", current_profit_total="100.00", realized_gain="0.00",
        unrealized_gain="100.00", today_gain="0.00",
    )


def test_dashboard_xirr_includes_redeemed_schemes_only_in_lifetime(db_session):
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919500000001", created_at=now)
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(user_id=user.id, name="Investor", relationship=Relationship.SELF, created_at=now)
    current_scheme = Scheme(amfi_code="XIRR-CURRENT", name="Current Fund", amc_name="AMC", sebi_category="Equity")
    redeemed_scheme = Scheme(amfi_code="XIRR-REDEEMED", name="Redeemed Fund", amc_name="AMC", sebi_category="Equity")
    db_session.add_all([member, current_scheme, redeemed_scheme])
    db_session.flush()
    current_folio = Folio(household_member_id=member.id, scheme_id=current_scheme.id, folio_number="C", plan_type=PlanType.DIRECT)
    redeemed_folio = Folio(household_member_id=member.id, scheme_id=redeemed_scheme.id, folio_number="R", plan_type=PlanType.DIRECT)
    db_session.add_all([current_folio, redeemed_folio])
    db_session.flush()
    imported = Import(household_member_id=member.id, status=ImportStatus.CONFIRMED, uploaded_at=now)
    db_session.add(imported)
    db_session.flush()
    one_year_ago = date.today() - timedelta(days=365)
    db_session.add_all([
        Transaction(folio_id=current_folio.id, import_id=imported.id, type=TransactionType.PURCHASE, date=one_year_ago, amount=Decimal("100.00"), units=Decimal("10.000"), nav=Decimal("10.0000")),
        Transaction(folio_id=redeemed_folio.id, import_id=imported.id, type=TransactionType.PURCHASE, date=one_year_ago, amount=Decimal("100.00"), units=Decimal("10.000"), nav=Decimal("10.0000")),
        Transaction(folio_id=redeemed_folio.id, import_id=imported.id, type=TransactionType.REDEMPTION, date=date.today() - timedelta(days=180), amount=Decimal("120.00"), units=Decimal("10.000"), nav=Decimal("12.0000")),
    ])
    db_session.commit()

    result = calculate_dashboard_xirr(db_session, [member.id], [_holding(current_scheme.id, member.id)])

    assert result.lifetime_xirr is not None
    assert result.current_holdings_xirr is not None
    assert Decimal(result.current_holdings_xirr) == pytest.approx(Decimal("1"), abs=Decimal("0.000001"))
    assert Decimal(result.lifetime_xirr) < Decimal(result.current_holdings_xirr)


def test_dashboard_xirr_returns_nulls_without_investment_transactions(db_session):
    result = calculate_dashboard_xirr(db_session, [], [])
    assert result.lifetime_xirr is None
    assert result.current_holdings_xirr is None


def test_dashboard_xirr_with_only_opening_lot_is_positive(db_session):
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919500000002", created_at=now)
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(user_id=user.id, name="Investor", relationship=Relationship.SELF, created_at=now)
    scheme = Scheme(amfi_code="XIRR-OPENING", name="Current Fund", amc_name="AMC", sebi_category="Equity")
    db_session.add_all([member, scheme])
    db_session.flush()
    folio = Folio(household_member_id=member.id, scheme_id=scheme.id, folio_number="O", plan_type=PlanType.DIRECT)
    imp = Import(household_member_id=member.id, status=ImportStatus.CONFIRMED, uploaded_at=now)
    db_session.add_all([folio, imp])
    db_session.flush()
    db_session.add(Transaction(folio_id=folio.id, import_id=imp.id, type=TransactionType.OPENING_BALANCE,
                               date=date(2016, 1, 1), amount=Decimal("100000.00"), units=Decimal("10000"), nav=Decimal("10")))
    db_session.commit()
    holding = _holding(scheme.id, member.id).model_copy(update={"current_value": "200000.00"})
    result = calculate_dashboard_xirr(db_session, [member.id], [holding])
    assert result.lifetime_xirr is not None and Decimal(result.lifetime_xirr) > 0


def test_gift_in_counts_as_invested(db_session):
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919500000003", created_at=now)
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(user_id=user.id, name="Investor", relationship=Relationship.SELF, created_at=now)
    scheme = Scheme(amfi_code="XIRR-GIFT", name="Gift Fund", amc_name="AMC", sebi_category="Equity")
    db_session.add_all([member, scheme])
    db_session.flush()
    folio = Folio(household_member_id=member.id, scheme_id=scheme.id, folio_number="G", plan_type=PlanType.DIRECT)
    imp = Import(household_member_id=member.id, status=ImportStatus.CONFIRMED, uploaded_at=now)
    db_session.add_all([folio, imp])
    db_session.flush()
    db_session.add(Transaction(folio_id=folio.id, import_id=imp.id, type=TransactionType.GIFT_IN,
                               date=date(2020, 1, 1), amount=Decimal("10000.00"), units=Decimal("1000"), nav=Decimal("10")))
    db_session.commit()
    holding = _holding(scheme.id, member.id).model_copy(update={"current_value": "20000.00"})
    result = calculate_dashboard_xirr(db_session, [member.id], [holding])
    assert result.lifetime_xirr is not None and Decimal(result.lifetime_xirr) > 0



def test_current_holdings_xirr_counts_switch_in_cost():
    from tests.services.dashboard.test_holdings import _session, _household_member, _scheme, _folio, _persisted_txn
    db = _session(); member = _household_member(db)
    liquid, midcap = _scheme(db, "Axis Liquid", "2001"), _scheme(db, "Axis Mid Cap", "2002")
    fl, fm = _folio(db, member, liquid), _folio(db, member, midcap, "2/2")
    for folio, kind, day, units, nav in [
        (fl, TransactionType.PURCHASE, date(2020, 1, 1), "100", "1000"),
        (fl, TransactionType.SWITCH_OUT, date(2020, 1, 2), "100", "1000"),
        (fm, TransactionType.SWITCH_IN, date(2020, 1, 2), "1000", "100"),
    ]:
        _persisted_txn(db, folio, kind, day, Decimal("100000"), Decimal(units), Decimal(nav))
    holding = _holding(midcap.id, member.id).model_copy(update={"units_held": "1000", "current_value": "200000"})
    summary = calculate_dashboard_xirr(db, [member.id], [holding])
    assert summary.current_holdings_xirr is not None
    assert Decimal("0.09") < Decimal(summary.current_holdings_xirr) < Decimal("0.13")


def test_paid_amount_adds_stamp_duty_to_purchases_only():
    from app.services.dashboard.xirr import paid_amount
    buy = Transaction(type=TransactionType.PURCHASE_SIP, amount=Decimal("4999.75"), stamp_duty=Decimal("0.25"))
    sell = Transaction(type=TransactionType.REDEMPTION, amount=Decimal("6000.00"))
    assert paid_amount(buy) == Decimal("5000.00")
    assert paid_amount(sell) == Decimal("6000.00")


# ---------------------------------------------------------------------------
# Root Cause B: opening-balance dating disclaimer (additive; headline XIRR unchanged)
# ---------------------------------------------------------------------------

def _opening_txn(on_date, units, nav):
    return Transaction(type=TransactionType.OPENING_BALANCE, date=on_date, origin=TransactionOrigin.CAS_OPENING,
                       amount=(Decimal(units) * Decimal(nav)), units=Decimal(units), nav=Decimal(nav))


def _buy_txn(type_, on_date, units, nav):
    return Transaction(type=type_, date=on_date, origin=TransactionOrigin.CAS_ROW,
                       amount=(Decimal(units) * Decimal(nav)), units=Decimal(units), nav=Decimal(nav))


def test_opening_lineage_untouched_opening_lot_is_fully_opening():
    txns = [_opening_txn(date(2020, 1, 1), "1000", "10")]
    units, cost = _opening_lineage(txns)
    assert units == Decimal("1000") and cost == Decimal("10000")


def test_opening_lineage_redemption_consumes_opening_first_fifo():
    txns = [
        _opening_txn(date(2020, 1, 1), "1000", "10"),
        _buy_txn(TransactionType.REDEMPTION, date(2021, 1, 1), "400", "15"),
    ]
    units, cost = _opening_lineage(txns)
    assert units == Decimal("600") and cost == Decimal("6000")


def test_opening_lineage_later_purchase_is_not_opening():
    txns = [
        _opening_txn(date(2020, 1, 1), "1000", "10"),
        _buy_txn(TransactionType.PURCHASE_SIP, date(2024, 6, 1), "500", "20"),
    ]
    units, cost = _opening_lineage(txns)
    assert units == Decimal("1000") and cost == Decimal("10000")


def test_opening_lineage_switch_out_exits_lineage_switch_in_does_not_inherit_it():
    # A switch is a real, precisely-dated transaction -- Root Cause B's actual
    # problem (an arbitrary opening-balance date) doesn't carry across it.
    from_folio = [
        _opening_txn(date(2020, 1, 1), "1000", "10"),
        _buy_txn(TransactionType.SWITCH_OUT, date(2021, 1, 1), "1000", "12"),
    ]
    units, cost = _opening_lineage(from_folio)
    assert units == Decimal("0") and cost == Decimal("0")
    to_folio = [_buy_txn(TransactionType.SWITCH_IN, date(2021, 1, 1), "857.142", "14")]
    units, cost = _opening_lineage(to_folio)
    assert units == Decimal("0") and cost == Decimal("0")


def _disclaimer_scenario(db_session, phone, opening_date, opening_units, opening_nav, extra_txns, current_value,
                         typed_txns=(), units_held=None, manual_opening=None):
    """typed_txns: (type, date, units, nav, amount) rows of any type (bonus,
    reinvest, reversal ...); pass units_held when they change the unit count."""
    now = datetime.now(timezone.utc)
    user = User(phone_number=phone, created_at=now)
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(user_id=user.id, name="Investor", relationship=Relationship.SELF, created_at=now)
    scheme = Scheme(amfi_code=f"XIRR-{phone[-6:]}", name="Legacy Fund", amc_name="AMC", sebi_category="Equity")
    db_session.add_all([member, scheme])
    db_session.flush()
    folio = Folio(household_member_id=member.id, scheme_id=scheme.id, folio_number="1", plan_type=PlanType.DIRECT)
    imp = Import(household_member_id=member.id, status=ImportStatus.CONFIRMED, uploaded_at=now)
    db_session.add_all([folio, imp])
    db_session.flush()
    units, nav = Decimal(opening_units), Decimal(opening_nav)
    db_session.add(Transaction(folio_id=folio.id, import_id=imp.id, type=TransactionType.OPENING_BALANCE,
                               date=opening_date, origin=TransactionOrigin.CAS_OPENING,
                               amount=units * nav, units=units, nav=nav))
    total_units = units
    for txn_date, txn_units, txn_nav in extra_txns:
        tu, tn = Decimal(txn_units), Decimal(txn_nav)
        db_session.add(Transaction(folio_id=folio.id, import_id=imp.id, type=TransactionType.PURCHASE_SIP,
                                   date=txn_date, origin=TransactionOrigin.CAS_ROW, amount=tu * tn, units=tu, nav=tn))
        total_units += tu
    if manual_opening is not None:
        # A user-entered opening balance (coverage-gap flow): origin MANUAL, dated by the user.
        m_date, m_units, m_nav = manual_opening
        mu, mn = Decimal(m_units), Decimal(m_nav)
        db_session.add(Transaction(folio_id=folio.id, import_id=imp.id, type=TransactionType.OPENING_BALANCE,
                                   date=m_date, origin=TransactionOrigin.MANUAL, amount=mu * mn, units=mu, nav=mn))
        total_units += mu
    for kind, txn_date, txn_units, txn_nav, txn_amount in typed_txns:
        db_session.add(Transaction(folio_id=folio.id, import_id=imp.id, type=kind, date=txn_date,
                                   origin=TransactionOrigin.CAS_ROW, amount=Decimal(txn_amount),
                                   units=Decimal(txn_units), nav=Decimal(txn_nav)))
    db_session.commit()
    held = str(total_units) if units_held is None else units_held
    holding = _holding(scheme.id, member.id).model_copy(update={"units_held": held, "current_value": current_value})
    return calculate_dashboard_xirr(db_session, [member.id], [holding])


def test_disclaimer_fires_when_blended_xirr_and_alt_xirr_both_cross_threshold(db_session):
    recent_window_start = date.today() - timedelta(days=365)
    result = _disclaimer_scenario(
        db_session, "+919500000010", recent_window_start, "1000", "10",
        [(date.today() - timedelta(days=180), "200", "15")],
        current_value="20000.00",
    )
    assert Decimal(result.lifetime_xirr) > Decimal("0.35")
    assert result.lifetime_xirr_disclaimer is not None
    assert Decimal(result.lifetime_xirr_disclaimer.opening_cost_share) == pytest.approx(Decimal("0.7692"), abs=Decimal("0.001"))
    assert result.lifetime_xirr_disclaimer.alt_xirr is not None
    assert Decimal(result.lifetime_xirr_disclaimer.alt_xirr) == pytest.approx(Decimal("0.2382"), abs=Decimal("0.005"))
    assert Decimal(result.lifetime_xirr_disclaimer.alt_xirr) != Decimal(result.lifetime_xirr)


def test_disclaimer_fires_even_when_opening_share_is_below_the_old_25pct_floor(db_session):
    # 2026-10-19 empirical grid: an 18.6% opening-cost share can still drag the
    # blended XIRR far past the ceiling (value split is by units, not cost).
    opening_date = date.today() - timedelta(days=365)
    result = _disclaimer_scenario(
        db_session, "+919500000014", opening_date, "800", "10",
        [(date.today() - timedelta(days=180), "500", "70")],
        current_value="100000.00",
    )
    assert result.lifetime_xirr is not None and Decimal(result.lifetime_xirr) > Decimal("0.35")
    assert result.lifetime_xirr_disclaimer is not None
    assert Decimal(result.lifetime_xirr_disclaimer.opening_cost_share) == pytest.approx(Decimal("0.186"), abs=Decimal("0.001"))
    assert result.lifetime_xirr_disclaimer.alt_xirr is not None
    assert Decimal(result.lifetime_xirr_disclaimer.alt_xirr) == pytest.approx(Decimal("0.2108"), abs=Decimal("0.005"))


def test_disclaimer_absent_when_excluding_opening_doesnt_fix_the_number(db_session):
    # The recent, correctly-dated purchase is itself implausible in isolation
    # (alt_xirr ~44.7%), so the opening balance's dating is not the cause.
    recent_window_start = date.today() - timedelta(days=365)
    result = _disclaimer_scenario(
        db_session, "+919500000011", recent_window_start, "100", "10",
        [(date.today() - timedelta(days=180), "900", "10")],
        current_value="12000.00",
    )
    assert result.lifetime_xirr is not None and Decimal(result.lifetime_xirr) > Decimal("0.35")
    assert result.lifetime_xirr_disclaimer is None


def test_disclaimer_absent_when_xirr_below_sanity_ceiling(db_session):
    old_window_start = date(2010, 1, 1)
    result = _disclaimer_scenario(
        db_session, "+919500000012", old_window_start, "1000", "10", [],
        current_value="13000.00",
    )
    assert result.lifetime_xirr is not None and Decimal(result.lifetime_xirr) < Decimal("0.35")
    assert result.lifetime_xirr_disclaimer is None


def test_disclaimer_alt_xirr_is_none_when_nothing_left_after_excluding_opening(db_session):
    recent_window_start = date.today() - timedelta(days=365)
    result = _disclaimer_scenario(
        db_session, "+919500000013", recent_window_start, "1000", "10", [],
        current_value="90000.00",
    )
    assert result.lifetime_xirr_disclaimer is not None
    assert Decimal(result.lifetime_xirr_disclaimer.opening_cost_share) == Decimal("1")
    assert result.lifetime_xirr_disclaimer.alt_xirr is None


def test_widened_lineage_query_leaves_headline_xirr_unchanged(db_session):
    # The lineage replay needs DIVIDEND_REINVEST/BONUS/SEGREGATION rows (they
    # add lots), but they must never reach the XIRR cash flows: a reinvest has
    # a nonzero amount and _signed_amount would book it as a cash INFLOW,
    # silently changing current_holdings_xirr.
    opening = date.today() - timedelta(days=365)
    sip = [(date.today() - timedelta(days=180), "200", "15")]
    base = _disclaimer_scenario(db_session, "+919500000020", opening, "1000", "10", sip, current_value="20000.00")
    with_extras = _disclaimer_scenario(
        db_session, "+919500000021", opening, "1000", "10", sip, current_value="20000.00",
        typed_txns=[
            (TransactionType.DIVIDEND_REINVEST, date.today() - timedelta(days=90), "5", "100", "500"),
            (TransactionType.BONUS, date.today() - timedelta(days=60), "50", "0", "0"),
        ],
        units_held="1255",
    )
    assert with_extras.lifetime_xirr == base.lifetime_xirr
    assert with_extras.current_holdings_xirr == base.current_holdings_xirr


def test_reversal_after_bonus_is_attributed_to_the_bonus_lot_not_the_opening_lot(db_session):
    # apply_lot_rules treats a REVERSAL newest-first. With the bonus row
    # missing from the replay, the reversal would instead eat into the opening
    # lot and understate opening_cost_share (0.9 instead of 1).
    opening = date.today() - timedelta(days=365)
    result = _disclaimer_scenario(
        db_session, "+919500000022", opening, "1000", "10", [], current_value="20000.00",
        typed_txns=[
            (TransactionType.BONUS, date.today() - timedelta(days=150), "100", "0", "0"),
            (TransactionType.REVERSAL, date.today() - timedelta(days=100), "100", "0", "0"),
        ],
        units_held="1000",
    )
    assert result.lifetime_xirr_disclaimer is not None
    assert Decimal(result.lifetime_xirr_disclaimer.opening_cost_share) == Decimal("1")


def test_opening_lineage_same_day_redemption_listed_before_opening_still_consumes_it():
    # Same-date rows arrive in random-uuid order from SQL. Holdings sorts
    # consuming types after adding ones; the lineage replay must too, or a
    # redemption on the statement-start date runs on empty lots and is lost.
    txns = [
        _buy_txn(TransactionType.REDEMPTION, date(2020, 1, 1), "400", "15"),
        _opening_txn(date(2020, 1, 1), "1000", "10"),
    ]
    units, cost = _opening_lineage(txns)
    assert units == Decimal("600") and cost == Decimal("6000")


def test_disclaimer_keeps_a_manual_opening_balance_in_the_alt_flows(db_session):
    # A MANUAL opening balance carries a user-entered date, so it is a real
    # dated flow: alt_xirr must keep it (cost AND value), not drop its cost
    # while its units stay in the terminal value.
    one_year_ago = date.today() - timedelta(days=365)
    result = _disclaimer_scenario(
        db_session, "+919500000020", one_year_ago, "1000", "10", [],
        current_value="18000.00", manual_opening=(one_year_ago, "200", "12"),
    )
    assert result.lifetime_xirr is not None and Decimal(result.lifetime_xirr) > Decimal("0.35")
    assert result.lifetime_xirr_disclaimer is not None
    assert result.lifetime_xirr_disclaimer.alt_xirr is not None
    assert Decimal(result.lifetime_xirr_disclaimer.alt_xirr) == pytest.approx(Decimal("0.25"), abs=Decimal("0.01"))


def test_current_holdings_disclaimer_is_built_from_the_current_scope(db_session):
    # No switches or exits here, so the current-holdings scope equals the
    # lifetime scope and both disclaimers must agree. Covers the previously
    # untested current_holdings_xirr_disclaimer path end to end.
    recent_window_start = date.today() - timedelta(days=365)
    result = _disclaimer_scenario(
        db_session, "+919500000021", recent_window_start, "1000", "10",
        [(date.today() - timedelta(days=180), "200", "15")],
        current_value="20000.00",
    )
    assert result.current_holdings_xirr_disclaimer is not None
    assert result.current_holdings_xirr_disclaimer == result.lifetime_xirr_disclaimer
    assert Decimal(result.current_holdings_xirr_disclaimer.alt_xirr) == pytest.approx(Decimal("0.2382"), abs=Decimal("0.005"))


def test_disclaimer_excludes_redemption_proceeds_taken_from_the_opening_lot(db_session):
    # PR review: a redemption that FIFO takes from the opening lot is proceeds
    # of undated units. alt_xirr removes that lot's cost and value, so keeping
    # the proceeds as an inflow (with no matching cost) inflates alt_xirr past
    # the ceiling and wrongly suppresses the disclaimer.
    # 1000 opening units (cost 10000, 365d ago); 600 units bought 180d ago at
    # 12 (7200); 400 units redeemed 90d ago for 6000 (all from the opening lot,
    # FIFO); 1200 units left worth 16000 today.
    # By hand: alt = only the 600-unit purchase. Its half of today's value is
    # 600/1200 * 16000 = 8000 on a 7200 cost over 180 days:
    # (8000/7200)^(365/180) - 1 = about 23.8%, under the ceiling, so it fires.
    result = _disclaimer_scenario(
        db_session, "+919500000022", date.today() - timedelta(days=365), "1000", "10",
        [(date.today() - timedelta(days=180), "600", "12")],
        current_value="16000.00", units_held="1200",
        typed_txns=[(TransactionType.REDEMPTION, date.today() - timedelta(days=90), "400", "15", "6000")],
    )
    assert Decimal(result.lifetime_xirr) > Decimal("0.35")
    assert result.lifetime_xirr_disclaimer is not None
    assert Decimal(result.lifetime_xirr_disclaimer.alt_xirr) == pytest.approx(Decimal("0.238"), abs=Decimal("0.01"))


def test_replay_reports_the_opening_share_of_a_sale_that_spans_both_lots():
    # 1000 opening units + 500 bought later; a 1200-unit sale takes all 1000
    # opening units (FIFO) and 200 dated ones: 1000/1200 of it is opening-lineage.
    # (Tested on the replay: once the opening lot is fully sold there is no
    # lineage cost left, so the disclaimer itself is not built for that case.)
    opening = _opening_txn(date(2020, 1, 1), "1000", "10")
    buy = _buy_txn(TransactionType.PURCHASE_SIP, date(2020, 6, 1), "500", "12")
    sale = _buy_txn(TransactionType.REDEMPTION, date(2020, 9, 1), "1200", "15")
    units, cost, share = _replay_opening_lineage([opening, buy, sale])
    assert units == Decimal("0") and cost == Decimal("0")
    assert share[id(sale)] == Decimal("1000") / Decimal("1200")
    assert id(buy) not in share and id(opening) not in share


def test_replay_gives_a_sale_of_only_dated_units_a_zero_opening_share():
    opening = _opening_txn(date(2020, 1, 1), "1000", "10")
    buy = _buy_txn(TransactionType.PURCHASE_SIP, date(2020, 6, 1), "500", "12")
    # A bounced SIP (REVERSAL) takes the newest lot, never the opening one.
    reversal = _buy_txn(TransactionType.REVERSAL, date(2020, 6, 2), "500", "12")
    _units, _cost, share = _replay_opening_lineage([opening, buy, reversal])
    assert share[id(reversal)] == Decimal("0")
