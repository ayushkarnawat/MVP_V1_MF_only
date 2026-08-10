from datetime import date, datetime, timezone
from decimal import Decimal
import uuid
import pytest

from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.imports import Import, ImportStatus
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.import_.coverage_gap import (
    create_opening_balance,
    evaluate_folio_coverage_gaps,
    evaluate_member_coverage_gaps,
)


@pytest.fixture
def folio_setup(db_session):
    now = datetime.now(timezone.utc)
    user = User(
        id=uuid.uuid4(),
        phone_number="+919876543210",
        email="rajesh.kumar@example.com",
        created_at=now,
    )
    db_session.add(user)
    db_session.flush()

    member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Rajesh Kumar",
        relationship=Relationship.SELF,
        created_at=now,
    )
    db_session.add(member)
    db_session.flush()

    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code="100033",
        isin="INF179K01BE2",
        name="HDFC Top 100 Fund - Growth",
        amc_name="HDFC Mutual Fund",
        sebi_category="Equity",
    )
    db_session.add(scheme)
    db_session.flush()

    folio = Folio(
        id=uuid.uuid4(),
        household_member_id=member.id,
        scheme_id=scheme.id,
        folio_number="12345/67",
        plan_type=PlanType.DIRECT,
    )
    db_session.add(folio)
    db_session.flush()

    import_rec = Import(
        id=uuid.uuid4(),
        household_member_id=member.id,
        status=ImportStatus.IMPORT_SUCCESSFUL,
        uploaded_at=now,
    )
    db_session.add(import_rec)
    db_session.commit()

    return {
        "user": user,
        "member": member,
        "scheme": scheme,
        "folio": folio,
        "import_rec": import_rec,
    }


def test_complete_history_has_no_coverage_gap(db_session, folio_setup):
    folio = folio_setup["folio"]
    import_rec = folio_setup["import_rec"]

    # Purchase 100 units in Jan
    t1 = Transaction(
        id=uuid.uuid4(),
        folio_id=folio.id,
        import_id=import_rec.id,
        type=TransactionType.PURCHASE,
        date=date(2024, 1, 15),
        amount=Decimal("10000.00"),
        units=Decimal("100.000"),
        nav=Decimal("100.0000"),
    )
    # Redeem 40 units in Feb
    t2 = Transaction(
        id=uuid.uuid4(),
        folio_id=folio.id,
        import_id=import_rec.id,
        type=TransactionType.REDEMPTION,
        date=date(2024, 2, 15),
        amount=Decimal("4400.00"),
        units=Decimal("40.000"),
        nav=Decimal("110.0000"),
    )
    db_session.add_all([t1, t2])
    db_session.commit()

    gap = evaluate_folio_coverage_gaps(db_session, folio.id)
    assert gap is None
    assert folio.has_coverage_gap is False
    assert folio.coverage_gap_details is None


def test_redemption_exceeding_purchases_flags_coverage_gap(db_session, folio_setup):
    folio = folio_setup["folio"]
    import_rec = folio_setup["import_rec"]

    # Only 30 units purchased
    t1 = Transaction(
        id=uuid.uuid4(),
        folio_id=folio.id,
        import_id=import_rec.id,
        type=TransactionType.PURCHASE,
        date=date(2024, 1, 15),
        amount=Decimal("3000.00"),
        units=Decimal("30.000"),
        nav=Decimal("100.0000"),
    )
    # But 100 units redeemed in Feb (due to bounded CAS date range missing earlier purchases)
    t2 = Transaction(
        id=uuid.uuid4(),
        folio_id=folio.id,
        import_id=import_rec.id,
        type=TransactionType.REDEMPTION,
        date=date(2024, 2, 15),
        amount=Decimal("11000.00"),
        units=Decimal("100.000"),
        nav=Decimal("110.0000"),
    )
    db_session.add_all([t1, t2])
    db_session.commit()

    gap = evaluate_folio_coverage_gaps(db_session, folio.id)
    assert gap is not None
    assert folio.has_coverage_gap is True
    assert Decimal(gap["deficit_units"]) == Decimal("70.000")
    assert gap["first_deficit_date"] == "2024-02-15"


def test_manual_opening_balance_resolves_coverage_gap(db_session, folio_setup):
    folio = folio_setup["folio"]
    user = folio_setup["user"]
    import_rec = folio_setup["import_rec"]

    # Redemption with no prior purchase (deficit = 50 units)
    t1 = Transaction(
        id=uuid.uuid4(),
        folio_id=folio.id,
        import_id=import_rec.id,
        type=TransactionType.REDEMPTION,
        date=date(2024, 2, 15),
        amount=Decimal("5500.00"),
        units=Decimal("50.000"),
        nav=Decimal("110.0000"),
    )
    db_session.add(t1)
    db_session.commit()

    gap = evaluate_folio_coverage_gaps(db_session, folio.id)
    assert gap is not None
    assert folio.has_coverage_gap is True

    # User adds manual opening balance of 50 units as-of 2024-01-01
    created_txn = create_opening_balance(
        db=db_session,
        folio_id=folio.id,
        user_id=user.id,
        units=Decimal("50.000"),
        date_=date(2024, 1, 1),
        amount=Decimal("5000.00"),
        nav=Decimal("100.0000"),
    )

    assert created_txn.type == TransactionType.OPENING_BALANCE
    assert folio.has_coverage_gap is False
    assert folio.coverage_gap_details is None
