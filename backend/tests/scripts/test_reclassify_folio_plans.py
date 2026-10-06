import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.enums import PlanType, Relationship, SchemePlanType, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from scripts.reclassify_folio_plans import reclassify


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _seed(db):
    user = User(id=uuid.uuid4(), phone_number="+919900000001", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Self", relationship=Relationship.SELF,
                             created_at=datetime.now(timezone.utc))
    scheme = Scheme(id=uuid.uuid4(), amfi_code="125497", isin="INF123", name="HDFC Flexi Cap Fund - Direct Plan - Growth",
                    amc_name="HDFC AMC", plan_type=SchemePlanType.DIRECT, sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add_all([member, scheme])
    db.flush()
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number="123/45",
                  plan_type=PlanType.UNCLASSIFIED, plan_verified=False)
    db.add(folio)
    db.flush()
    bonus = Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE,
                        date=date(2020, 1, 1), amount=Decimal("0"), units=Decimal("10"), nav=Decimal("0"),
                        raw_description="Bonus units allotted")
    buy = Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE,
                      date=date(2019, 1, 1), amount=Decimal("1000"), units=Decimal("10"), nav=Decimal("100"),
                      raw_description="Purchase")
    db.add_all([bonus, buy])
    db.commit()
    return folio, bonus, buy


def test_reclassify_sets_master_plan_and_converts_legacy_bonus_rows():
    db = _session()
    folio, bonus, buy = _seed(db)
    counts = reclassify(db, dry_run=False)
    db.refresh(folio)
    db.refresh(bonus)
    db.refresh(buy)
    assert folio.plan_type == PlanType.DIRECT and folio.plan_verified is True
    assert bonus.type == TransactionType.BONUS
    assert buy.type == TransactionType.PURCHASE
    assert counts["folios_changed"] == 1 and counts["bonus_rows_converted"] == 1


def test_dry_run_changes_nothing():
    db = _session()
    folio, bonus, _ = _seed(db)
    counts = reclassify(db, dry_run=True)
    db.refresh(folio)
    db.refresh(bonus)
    assert folio.plan_type == PlanType.UNCLASSIFIED and folio.plan_verified is False
    assert bonus.type == TransactionType.PURCHASE
    assert counts["folios_changed"] == 1 and counts["bonus_rows_converted"] == 1


def test_never_writes_unclassified():
    db = _session()
    folio, _, _ = _seed(db)
    scheme = db.get(Scheme, folio.scheme_id)
    scheme.plan_type, scheme.name = None, "Some Fund - Growth"
    db.commit()
    reclassify(db, dry_run=False)
    db.refresh(folio)
    assert folio.plan_type in (PlanType.DIRECT, PlanType.REGULAR)


def test_never_downgrades_a_verified_plan():
    # A plan verified at import (sibling NAV, or the user's own override) stays.
    db = _session()
    folio, _, _ = _seed(db)
    scheme = db.get(Scheme, folio.scheme_id)
    scheme.plan_type, scheme.name = None, "Some Fund - Growth"
    folio.plan_type, folio.plan_verified = PlanType.DIRECT, True
    db.commit()
    reclassify(db, dry_run=False)
    db.refresh(folio)
    assert folio.plan_type == PlanType.DIRECT and folio.plan_verified is True


def test_cas_only_scheme_plan_is_not_treated_as_verified():
    # A CAS-only scheme's plan_type is the import's guess, not the AMFI master.
    from app.models.enums import SchemeSource
    db = _session()
    folio, _, _ = _seed(db)
    scheme = db.get(Scheme, folio.scheme_id)
    scheme.source, scheme.name, scheme.plan_type = SchemeSource.CAS_ONLY, "Old Merged Fund - Growth", SchemePlanType.REGULAR
    folio.plan_type, folio.plan_verified = PlanType.REGULAR, False
    db.commit()
    counts = reclassify(db, dry_run=False)
    db.refresh(folio)
    assert folio.plan_verified is False
    assert counts["folios_changed"] == 0


def test_legacy_bonus_beside_a_new_bonus_row_is_removed_not_converted():
    # Re-uploaded after Phase 3 but before this script: the parser already
    # saved the same bonus as `bonus`, so converting would hit the unique key.
    db = _session()
    folio, bonus, _ = _seed(db)
    twin = Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.BONUS,
                       date=bonus.date, amount=bonus.amount, units=bonus.units, nav=Decimal("0"),
                       raw_description="Bonus units allotted")
    db.add(twin)
    db.commit()
    legacy_id = bonus.id
    counts = reclassify(db, dry_run=False)
    assert db.query(Transaction).filter_by(id=legacy_id).first() is None
    assert db.query(Transaction).filter_by(folio_id=folio.id, type=TransactionType.BONUS).count() == 1
    assert counts["bonus_duplicates_removed"] == 1 and counts["bonus_rows_converted"] == 0


def test_unverified_legacy_plan_is_not_replaced_by_another_guess():
    # Before 0028 every folio was unverified, including the user's own choice;
    # a guess never replaces it, only a verified answer does.
    db = _session()
    folio, _, _ = _seed(db)
    scheme = db.get(Scheme, folio.scheme_id)
    scheme.plan_type, scheme.name = None, "Some Fund - Growth"
    folio.plan_type, folio.plan_verified = PlanType.DIRECT, False
    db.commit()
    counts = reclassify(db, dry_run=False)
    db.refresh(folio)
    assert folio.plan_type == PlanType.DIRECT
    assert counts["folios_changed"] == 0
