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
from app.services.auth.session import create_session


@pytest.fixture
def gap_setup(client):
    from app.db.session import get_db

    db_gen = client.app.dependency_overrides[get_db]()
    db = next(db_gen)
    now = datetime.now(timezone.utc)

    user = User(
        id=uuid.uuid4(),
        phone_number="+919876543210",
        email="rajesh.kumar@example.com",
        created_at=now,
    )
    db.add(user)
    db.flush()

    member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Rajesh Kumar",
        relationship=Relationship.SELF,
        created_at=now,
    )
    db.add(member)
    db.flush()

    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code="100033",
        isin="INF179K01BE2",
        name="HDFC Top 100 Fund - Growth",
        amc_name="HDFC Mutual Fund",
        sebi_category="Equity",
    )
    db.add(scheme)
    db.flush()

    folio = Folio(
        id=uuid.uuid4(),
        household_member_id=member.id,
        scheme_id=scheme.id,
        folio_number="12345/67",
        plan_type=PlanType.DIRECT,
        has_coverage_gap=True,
        coverage_gap_details={
            "folio_id": "",
            "folio_number": "12345/67",
            "deficit_units": "50.000",
            "first_deficit_date": "2024-02-15",
        },
    )
    folio.coverage_gap_details["folio_id"] = str(folio.id)
    db.add(folio)
    db.flush()

    import_rec = Import(
        id=uuid.uuid4(),
        household_member_id=member.id,
        status=ImportStatus.IMPORT_SUCCESSFUL,
        uploaded_at=now,
    )
    db.add(import_rec)

    # Add a redemption of 50 units
    redemption = Transaction(
        id=uuid.uuid4(),
        folio_id=folio.id,
        import_id=import_rec.id,
        type=TransactionType.REDEMPTION,
        date=date(2024, 2, 15),
        amount=Decimal("5500.00"),
        units=Decimal("50.000"),
        nav=Decimal("110.0000"),
        raw_description="Redemption",
    )
    db.add(redemption)
    db.commit()

    member_id = member.id
    folio_id = folio.id
    _, token = create_session(db, user.id)
    return {"Authorization": f"Bearer {token}"}, member_id, folio_id


def test_get_coverage_gaps_for_member(client, gap_setup):
    headers, member_id, folio_id = gap_setup

    res = client.get(f"/household-members/{member_id}/coverage-gaps", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["folio_id"] == str(folio_id)
    assert data[0]["folio_number"] == "12345/67"
    assert data[0]["scheme_name"] == "HDFC Top 100 Fund - Growth"
    assert data[0]["deficit_units"] == "50.000"
    assert data[0]["first_deficit_date"] == "2024-02-15"


def test_post_opening_balance_resolves_gap(client, gap_setup):
    headers, member_id, folio_id = gap_setup

    # Post opening balance of 50 units as-of 2024-01-01
    res = client.post(
        f"/folios/{folio_id}/opening-balance",
        headers=headers,
        json={
            "units": "50.000",
            "date": "2024-01-01",
            "amount": "5000.00",
            "nav": "100.0000",
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["folio_id"] == str(folio_id)
    assert body["type"] == "opening_balance"
    assert body["has_coverage_gap"] is False

    # Coverage gaps endpoint should now return empty list
    gaps_res = client.get(f"/household-members/{member_id}/coverage-gaps", headers=headers)
    assert gaps_res.status_code == 200
    assert len(gaps_res.json()) == 0
