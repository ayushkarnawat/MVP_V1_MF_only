import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.cash_flow import compute_cash_flow


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _household_member(db):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Self", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _folio(db, member):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name="Test Fund", amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    db.commit()
    return folio


def _txn(db, folio, type_, on_date, amount):
    txn = Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=type_, date=on_date, amount=amount, units=Decimal("1.000"), nav=Decimal("50.0000"))
    db.add(txn)
    db.commit()
    return txn


def test_purchase_is_a_debit():
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("1000.00"))

    entries = compute_cash_flow(db, [member.id])
    assert len(entries) == 1
    assert entries[0].direction == "debit"


def test_opening_balance_is_a_debit_on_statement_start():
    db = _session()
    member = _household_member(db)
    _txn(db, _folio(db, member), TransactionType.OPENING_BALANCE, date(2016, 1, 1), Decimal("100000.00"))
    [entry] = compute_cash_flow(db, [member.id])
    assert entry.direction == "debit" and entry.date == date(2016, 1, 1)


def test_redemption_is_a_credit():
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.REDEMPTION, date(2024, 3, 1), Decimal("1200.00"))

    entries = compute_cash_flow(db, [member.id])
    assert len(entries) == 1
    assert entries[0].direction == "credit"


def test_dividend_payout_is_a_credit():
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.DIVIDEND_PAYOUT, date(2024, 4, 1), Decimal("50.00"))

    entries = compute_cash_flow(db, [member.id])
    assert len(entries) == 1
    assert entries[0].direction == "credit"


def test_switch_in_and_out_are_excluded():
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member)
    # Amounts differ so the two rows don't collide on the
    # (folio_id, date, amount, units) dedup unique constraint.
    _txn(db, folio, TransactionType.SWITCH_IN, date(2024, 5, 1), Decimal("500.00"))
    _txn(db, folio, TransactionType.SWITCH_OUT, date(2024, 5, 1), Decimal("600.00"))

    entries = compute_cash_flow(db, [member.id])
    assert entries == []


def test_entries_are_ordered_by_date():
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 3, 1), Decimal("1000.00"))
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("500.00"))

    entries = compute_cash_flow(db, [member.id])
    assert [e.date for e in entries] == [date(2024, 1, 1), date(2024, 3, 1)]


def test_payout_is_inflow():
    db = _session()
    member = _household_member(db)
    txn = _txn(db, _folio(db, member), TransactionType.DIVIDEND_PAYOUT, date(2022, 3, 1), Decimal("2500.00"))
    txn.units, txn.nav = Decimal("0"), Decimal("0")
    db.commit()
    [entry] = compute_cash_flow(db, [member.id])
    assert entry.direction == "credit" and entry.amount == "2500.00"


def test_reversal_is_credit():
    db = _session()
    member = _household_member(db)
    _txn(db, _folio(db, member), TransactionType.REVERSAL, date(2020, 2, 10), Decimal("5000.00"))
    [entry] = compute_cash_flow(db, [member.id])
    assert entry.direction == "credit"


def test_gifts_are_not_cash():
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.GIFT_IN, date(2021, 4, 1), Decimal("30000.00"))
    _txn(db, folio, TransactionType.GIFT_OUT, date(2022, 4, 1), Decimal("100.00"))
    assert compute_cash_flow(db, [member.id]) == []



def test_purchase_cash_flow_includes_stamp_duty():
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member)
    original_amount = Decimal("4999.75")
    buy = _txn(db, folio, TransactionType.PURCHASE, date(2025, 10, 6), original_amount)
    buy.stamp_duty = Decimal("0.25")
    db.commit()
    [entry] = compute_cash_flow(db, [member.id])
    assert entry.direction == "debit"
    assert entry.amount == str(original_amount + Decimal("0.25"))
