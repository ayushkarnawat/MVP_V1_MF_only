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
