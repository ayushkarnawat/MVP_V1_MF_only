import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.sip import compute_active_sips


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


def _scheme(db, name="SIP Fund"):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name=name, amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    return scheme


def _folio(db, member, scheme):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    db.commit()
    return folio


def _sip_txn(db, folio, on_date, amount=Decimal("1000.00"), units=Decimal("20.000"), nav=Decimal("50.0000")):
    txn = Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE_SIP, date=on_date, amount=amount, units=units, nav=nav)
    db.add(txn)
    db.commit()
    return txn


def test_sip_within_40_days_is_active():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date.today() - timedelta(days=10))

    sips = compute_active_sips(db, [member.id])
    assert len(sips) == 1
    assert sips[0].scheme_name == "SIP Fund"


def test_sip_older_than_40_days_is_not_active():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date.today() - timedelta(days=45))

    sips = compute_active_sips(db, [member.id])
    assert sips == []


def test_sip_uses_most_recent_transaction_per_folio():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date.today() - timedelta(days=70), amount=Decimal("1000.00"))
    _sip_txn(db, folio, date.today() - timedelta(days=10), amount=Decimal("1500.00"))

    sips = compute_active_sips(db, [member.id])
    assert len(sips) == 1
    assert Decimal(sips[0].sip_amount) == Decimal("1500.00")


def test_non_sip_purchase_is_not_a_sip():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=date.today(), amount=Decimal("1000.00"), units=Decimal("20.000"), nav=Decimal("50.0000")))
    db.commit()

    sips = compute_active_sips(db, [member.id])
    assert sips == []
