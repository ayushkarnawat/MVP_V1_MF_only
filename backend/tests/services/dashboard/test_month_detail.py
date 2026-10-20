import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from app.models.enums import ImportStatus, PlanType, Relationship, TransactionType as T
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme, NavHistory
from app.models.transaction import Transaction
from app.models.user import User, HouseholdMember
import app.services.dashboard.snapshots as snapshots


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setattr(snapshots, "warm_nav_history", AsyncMock())
    monkeypatch.setattr(snapshots, "last_completed_month_end", lambda: date(2024, 4, 30))


def member(db, user=None, name="Self"):
    if user is None:
        user = User(id=uuid.uuid4(), phone_number=f"+91{uuid.uuid4().int % 10**10:010d}", created_at=datetime.now(timezone.utc))
        db.add(user)
        db.flush()
    row = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name=name, relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(row)
    db.flush()
    imp = Import(id=uuid.uuid4(), household_member_id=row.id, status=ImportStatus.CONFIRMED, uploaded_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc))
    db.add(imp)
    db.commit()
    return row, imp


def fund(db, owner, name="Fund A", scheme=None):
    scheme = scheme or Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], name=name, amc_name="Test AMC", sebi_category="Equity")
    db.add(scheme)
    db.flush()
    folio = Folio(id=uuid.uuid4(), household_member_id=owner.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex, plan_type=PlanType.DIRECT)
    db.add(folio)
    db.commit()
    return folio, scheme


def txn(db, imp, folio, day, kind, amount, units, nav="10", description=None):
    db.add(Transaction(id=uuid.uuid4(), import_id=imp.id, folio_id=folio.id, date=day, type=kind, amount=Decimal(amount), units=Decimal(units), nav=Decimal(nav), raw_description=description))
    db.commit()


def nav(db, scheme, day, value):
    db.add(NavHistory(scheme_id=scheme.id, date=day, nav=Decimal(value)))
    db.commit()


def detail(db, ids, month=date(2024, 2, 29)):
    return asyncio.run(snapshots.get_month_detail(db, ids, month))


def worked(db):
    owner, imp = member(db)
    a, sa = fund(db, owner)
    b, sb = fund(db, owner, "Fund B")
    txn(db, imp, a, date(2024, 1, 10), T.PURCHASE, "1000", "100")
    txn(db, imp, a, date(2024, 2, 5), T.PURCHASE_SIP, "100", "10")
    txn(db, imp, a, date(2024, 2, 6), T.PURCHASE, "200", "20")
    txn(db, imp, a, date(2024, 2, 7), T.REDEMPTION, "50", "5")
    txn(db, imp, a, date(2024, 2, 8), T.SWITCH_OUT, "200", "20")
    txn(db, imp, b, date(2024, 2, 8), T.SWITCH_IN, "200", "20")
    nav(db, sa, date(2024, 1, 31), "10")
    nav(db, sa, date(2024, 2, 29), "12")
    nav(db, sb, date(2024, 2, 29), "10")
    return owner, imp, a, sa, b, sb


def test_totals_equal_the_sum_of_the_fund_rows(db_session):
    owner, *_ = worked(db_session)
    result = detail(db_session, [owner.id])
    for total, field in [("total_value", "value"), ("change", "change_in_value"), ("new_money", "new_money"), ("market_movement", "market_movement"), ("opening_holdings", "opening_holdings")]:
        assert Decimal(getattr(result, total)) == sum((Decimal(getattr(f, field)) for f in result.funds), Decimal("0"))
    points = asyncio.run(snapshots.get_snapshots(db_session, [owner.id]))
    assert result.total_value == next(p.total_value for p in points if p.snapshot_month == result.month)


def test_change_equals_new_money_plus_market_movement(db_session):
    owner, *_ = worked(db_session)
    result = detail(db_session, [owner.id])
    assert (result.total_value, result.previous_value, result.change, result.new_money, result.market_movement) == ("1460.00", "1000.00", "460.00", "250.00", "210.00")
    a = next(f for f in result.funds if f.scheme_name == "Fund A")
    assert (a.units, a.nav, a.value, a.cost, a.change_in_value, a.new_money, a.switched_net, a.market_movement) == ("105.000", "12.0000", "1260.00", "1050.00", "260.00", "250.00", "-200.00", "210.00")
    assert result.change == str(Decimal(result.new_money) + Decimal(result.market_movement))


def test_a_switch_moves_value_between_funds_and_nets_to_zero(db_session):
    owner, *_ = worked(db_session)
    result = detail(db_session, [owner.id])
    assert result.switched_in == result.switched_out == "200.00"
    assert sum(Decimal(f.switched_net) for f in result.funds) == 0


def test_first_month_has_no_previous_month_and_openings_are_not_new_money(db_session):
    owner, imp = member(db_session)
    a, sa = fund(db_session, owner)
    txn(db_session, imp, a, date(2024, 1, 1), T.OPENING_BALANCE, "1000", "100")
    txn(db_session, imp, a, date(2024, 1, 5), T.PURCHASE, "100", "10")
    nav(db_session, sa, date(2024, 1, 31), "11")
    result = detail(db_session, [owner.id], date(2024, 1, 31))
    assert result.previous_month is None and result.previous_value == "0.00"
    assert (result.change, result.new_money, result.opening_holdings, result.market_movement) == ("1210.00", "100.00", "1000.00", "110.00")
    assert Decimal(result.change) == Decimal(result.new_money) + Decimal(result.opening_holdings) + Decimal(result.market_movement)


def test_a_fund_sold_out_in_the_month_is_listed_with_zero_value(db_session):
    owner, imp = member(db_session)
    a, sa = fund(db_session, owner)
    txn(db_session, imp, a, date(2024, 1, 1), T.PURCHASE, "1000", "100")
    txn(db_session, imp, a, date(2024, 2, 2), T.REDEMPTION, "1200", "100", "12")
    nav(db_session, sa, date(2024, 1, 31), "10")
    result = detail(db_session, [owner.id])
    assert len(result.funds) == 1 and result.funds[0].value == "0.00"
    assert (result.change, result.new_money, result.market_movement) == ("-1000.00", "-1200.00", "200.00")


def test_a_switch_posting_in_the_next_month_lands_in_that_month(db_session):
    owner, imp, a, sa, b, sb = worked(db_session)
    txn(db_session, imp, a, date(2024, 3, 31), T.SWITCH_OUT, "100", "10")
    txn(db_session, imp, b, date(2024, 4, 1), T.SWITCH_IN, "100", "10")
    march = detail(db_session, [owner.id], date(2024, 3, 31))
    april = detail(db_session, [owner.id], date(2024, 4, 30))
    assert march.switched_out == april.switched_in == "100.00"
    assert march.switched_in == april.switched_out == "0.00"


def test_an_unpriced_fund_is_flagged_not_zero_valued(db_session):
    owner, imp = member(db_session)
    a, _ = fund(db_session, owner, "No NAV")
    txn(db_session, imp, a, date(2024, 1, 1), T.PURCHASE, "100", "10")
    result = detail(db_session, [owner.id], date(2024, 1, 31))
    row = result.funds[0]
    assert row.value is row.market_movement is None and not row.priced
    assert row.cost == "0.00"
    assert result.total_value == "0.00" and result.is_partial
    assert result.missing_scheme_names == ["No NAV"]
    assert result.new_money == "100.00" and result.market_movement is None
    assert result.change is None  # a partial month never shows a headline change that could jump


def test_aggregate_merges_members_one_row_per_member_per_fund(db_session):
    one, imp1 = member(db_session)
    two, imp2 = member(db_session, user=db_session.get(User, one.user_id), name="Partner")
    a, sa = fund(db_session, one)
    b, _ = fund(db_session, two, scheme=sa)
    for imp, folio, amount, units in [(imp1, a, "100", "10"), (imp2, b, "200", "20")]:
        txn(db_session, imp, folio, date(2024, 1, 1), T.PURCHASE, amount, units)
    nav(db_session, sa, date(2024, 1, 31), "11")
    result = asyncio.run(snapshots.get_aggregate_month_detail(db_session, one.user_id, date(2024, 1, 31)))
    assert len(result.funds) == 2 and result.total_value == "330.00"
    assert {f.household_member_id for f in result.funds} == {str(one.id), str(two.id)}


def test_reversals_reduce_new_money_and_conversions_are_not_switch_cash(db_session):
    owner, imp = member(db_session)
    a, sa = fund(db_session, owner)
    txn(db_session, imp, a, date(2024, 1, 1), T.PURCHASE, "100", "10")
    txn(db_session, imp, a, date(2024, 1, 2), T.REVERSAL, "100", "10")
    txn(db_session, imp, a, date(2024, 1, 3), T.SWITCH_IN, "500", "50", description="MERGER")
    nav(db_session, sa, date(2024, 1, 31), "10")
    result = detail(db_session, [owner.id], date(2024, 1, 31))
    assert result.new_money == result.switched_in == "0.00"
    assert result.market_movement == "500.00"


def test_month_not_in_snapshot_list_is_absent(db_session):
    owner, *_ = worked(db_session)
    assert detail(db_session, [owner.id], date(2023, 12, 31)) is None
    assert detail(db_session, [owner.id], date(2024, 2, 28)) is None



def test_sub_paisa_rows_reconcile_to_snapshots_without_negative_values(db_session):
    owner, imp = member(db_session)
    for i in range(4):
        folio, scheme = fund(db_session, owner, f"Tiny {i}")
        txn(db_session, imp, folio, date(2024, 1, 1), T.PURCHASE, "0.01", "1", "0.0050")
        nav(db_session, scheme, date(2024, 1, 31), "0.0050")
    result = detail(db_session, [owner.id], date(2024, 1, 31))
    points = asyncio.run(snapshots.get_snapshots(db_session, [owner.id]))
    assert result.total_value == points[0].total_value == "0.02"
    assert sum(Decimal(f.value) for f in result.funds) == Decimal("0.02")
    assert sum(Decimal(f.cost) for f in result.funds) == Decimal(points[0].invested_value)
    assert all(Decimal(f.value) >= 0 and Decimal(f.cost) >= 0 for f in result.funds)


def test_cross_member_switch_is_not_new_money_and_nets_to_zero(db_session):
    one, imp1 = member(db_session)
    two, imp2 = member(db_session, user=db_session.get(User, one.user_id), name="Partner")
    a, sa = fund(db_session, one)
    b, sb = fund(db_session, two, "Fund B")
    txn(db_session, imp1, a, date(2024, 1, 1), T.PURCHASE, "1000", "100")
    txn(db_session, imp1, a, date(2024, 2, 1), T.SWITCH_OUT, "200", "20")
    txn(db_session, imp2, b, date(2024, 2, 1), T.SWITCH_IN, "200", "20")
    nav(db_session, sa, date(2024, 1, 31), "10")
    nav(db_session, sb, date(2024, 2, 29), "10")
    result = detail(db_session, [one.id, two.id])
    assert result.switched_in == result.switched_out == "200.00"
    assert result.new_money == result.change == result.market_movement == "0.00"
    assert sum(Decimal(row.switched_net) for row in result.funds) == 0


def test_all_new_schema_fields_have_defaults_for_saved_payloads():
    from app.services.dashboard.schemas import MonthDetail, MonthFundRow
    result = MonthDetail(month=date(2024, 1, 31))
    assert result.opening_holdings == "0.00" and result.funds == []
    row = MonthFundRow(scheme_id="s", scheme_name="Old", household_member_id="m", household_member_name="Self")
    assert row.opening_holdings == row.new_money == "0.00"



def test_multiple_folios_of_one_fund_are_combined_once(db_session):
    owner, imp = member(db_session)
    a, scheme = fund(db_session, owner)
    b, _ = fund(db_session, owner, scheme=scheme)
    for folio in (a, b):
        txn(db_session, imp, folio, date(2024, 1, 1), T.PURCHASE, "100", "10")
    nav(db_session, scheme, date(2024, 1, 31), "11")
    result = detail(db_session, [owner.id], date(2024, 1, 31))
    assert len(result.funds) == 1
    assert (result.funds[0].units, result.funds[0].value, result.funds[0].cost) == ("20.000", "220.00", "200.00")
    assert result.new_money == "200.00" and result.market_movement == "20.00"


def _adds_up(result):
    return Decimal(result.change) == (Decimal(result.new_money) + Decimal(result.opening_holdings)
        + Decimal(result.switches_net) + Decimal(result.gifts_net) + Decimal(result.market_movement))


def test_the_change_adds_up_even_when_a_switch_crosses_a_month_end(db_session):
    owner, imp, a, sa, b, sb = worked(db_session)
    txn(db_session, imp, a, date(2024, 3, 31), T.SWITCH_OUT, "100", "10")
    txn(db_session, imp, b, date(2024, 4, 1), T.SWITCH_IN, "100", "10")
    nav(db_session, sa, date(2024, 3, 31), "12")
    nav(db_session, sb, date(2024, 3, 31), "10")
    nav(db_session, sa, date(2024, 4, 30), "12")
    nav(db_session, sb, date(2024, 4, 30), "10")
    march = detail(db_session, [owner.id], date(2024, 3, 31))
    april = detail(db_session, [owner.id], date(2024, 4, 30))
    assert march.switches_net == "-100.00" and april.switches_net == "100.00"
    assert _adds_up(march) and _adds_up(april) and _adds_up(detail(db_session, [owner.id]))


def test_unequal_switch_legs_still_add_up(db_session):
    owner, imp, a, sa, b, sb = worked(db_session)
    txn(db_session, imp, a, date(2024, 2, 20), T.SWITCH_OUT, "100", "10")
    txn(db_session, imp, b, date(2024, 2, 20), T.SWITCH_IN, "99", "9.9")
    result = detail(db_session, [owner.id])
    assert result.switches_net == "-1.00"  # 200 + 99 in, 200 + 100 out
    assert _adds_up(result)


def test_gifted_units_are_their_own_line_not_market_movement(db_session):
    owner, imp, a, sa, b, sb = worked(db_session)
    before = detail(db_session, [owner.id])
    txn(db_session, imp, a, date(2024, 2, 15), T.GIFT_IN, "500", "50")
    after = detail(db_session, [owner.id])
    assert after.gifts_net == "500.00" and before.gifts_net == "0.00"
    assert after.new_money == before.new_money  # a gift is not money the user put in
    assert _adds_up(after)


def test_a_click_is_read_only_even_when_some_month_is_partial(db_session, monkeypatch):
    from app.models.snapshot import PortfolioSnapshot
    owner, imp = member(db_session)
    a, _ = fund(db_session, owner, "No NAV")
    txn(db_session, imp, a, date(2024, 1, 1), T.PURCHASE, "100", "10")
    asyncio.run(snapshots.get_snapshots(db_session, [owner.id]))  # what the History page does
    stored = {(r.snapshot_month, r.computed_at) for r in db_session.query(PortfolioSnapshot).all()}
    assert stored
    monkeypatch.setattr(snapshots, "warm_nav_history", AsyncMock(side_effect=AssertionError("no network on a click")))
    result = detail(db_session, [owner.id], date(2024, 1, 31))
    assert result is not None and result.is_partial
    db_session.expire_all()
    assert {(r.snapshot_month, r.computed_at) for r in db_session.query(PortfolioSnapshot).all()} == stored


def test_a_click_never_writes_even_when_no_snapshot_has_been_stored(db_session, monkeypatch):
    from app.models.snapshot import PortfolioSnapshot
    owner, *_ = worked(db_session)
    assert db_session.query(PortfolioSnapshot).count() == 0  # History was never opened
    monkeypatch.setattr(snapshots, "warm_nav_history", AsyncMock(side_effect=AssertionError("no network on a click")))
    result = detail(db_session, [owner.id])
    assert result is not None and result.total_value == "1460.00"
    assert db_session.query(PortfolioSnapshot).count() == 0


def test_months_that_are_not_month_ends_or_after_the_last_completed_month_are_absent(db_session):
    owner, *_ = worked(db_session)
    assert detail(db_session, [owner.id], date(2024, 2, 28)) is None  # not a month-end (2024 is a leap year)
    assert detail(db_session, [owner.id], date(2024, 5, 31)) is None  # after the last completed month (patched to 2024-04-30)
    assert detail(db_session, [owner.id], date(2023, 12, 31)) is None  # before this member's history began
