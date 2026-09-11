from datetime import date, datetime, timezone
from decimal import Decimal
import uuid

from app.db.session import get_db
from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
from app.models.auth import AuthIdentity
from app.models.enums import AuthIdentityProvider, ImportStatus, PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import NavHistory, Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.auth.session import create_session
from app.services.import_.coverage_gap import evaluate_folio_coverage_gaps


def _seed_households(client):
    db = next(client.app.dependency_overrides[get_db]())
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919400000001", created_at=now)
    outsider = User(phone_number="+919400000002", created_at=now)
    db.add_all([user, outsider])
    db.flush()
    own_members = [
        HouseholdMember(user_id=user.id, name="A", relationship=Relationship.SELF, created_at=now),
        HouseholdMember(user_id=user.id, name="B", relationship=Relationship.SPOUSE, created_at=now),
    ]
    other_member = HouseholdMember(user_id=outsider.id, name="X", relationship=Relationship.SELF, created_at=now)
    db.add_all([*own_members, other_member])
    db.flush()
    imports = [
        Import(household_member_id=own_members[0].id, status=ImportStatus.IMPORT_SUCCESSFUL, statement_from_date=date(2024, 1, 1), statement_to_date=date(2024, 12, 31), new_transactions_count=2, uploaded_at=now),
        Import(household_member_id=own_members[1].id, status=ImportStatus.CONFIRMED, new_transactions_count=1, uploaded_at=now),
        Import(household_member_id=other_member.id, status=ImportStatus.CONFIRMED, new_transactions_count=99, uploaded_at=now),
    ]
    db.add_all(imports)
    db.flush()
    _, token = create_session(db, user.id, auth_method=AuthIdentityProvider.PHONE_OTP)
    db.commit()
    return db, user, imports, {"Authorization": f"Bearer {token}"}


def test_household_import_history_lists_all_and_only_owned_member_imports(client):
    db, _user, imports, headers = _seed_households(client)
    response = client.get("/imports/history", headers=headers)

    assert response.status_code == 200
    assert {row["import_id"] for row in response.json()} == {str(imports[0].id), str(imports[1].id)}
    assert response.json()[0]["uploaded_at"] is not None
    assert {row["new_transactions_count"] for row in response.json()} == {1, 2}
    db.close()


def test_delete_import_removes_only_its_transactions_and_invalidates_analytics(client):
    db, user, imports, headers = _seed_households(client)
    scheme = Scheme(amfi_code="TEST-IMPORT-DELETE", name="Test", amc_name="AMC", sebi_category="Equity")
    db.add(scheme)
    db.flush()
    folio = Folio(household_member_id=imports[0].household_member_id, scheme_id=scheme.id, folio_number="F1", plan_type=PlanType.DIRECT)
    db.add(folio)
    db.flush()
    for import_rec, amount in [(imports[0], "100.00"), (imports[1], "200.00")]:
        db.add(Transaction(folio_id=folio.id, import_id=import_rec.id, type=TransactionType.PURCHASE, date=date(2024, 1, 1), amount=Decimal(amount), units=Decimal("1.000"), nav=Decimal(amount)))
    db.add(AnalyticsSection(user_id=user.id, scope_key="combined", section="allocation", payload={}, computed_at=datetime.now(timezone.utc)))
    db.add(AnalyticsRecomputeStatus(user_id=user.id, started_at=datetime.now(timezone.utc), generation=7))
    db.add(NavHistory(scheme_id=scheme.id, date=date.today(), nav=Decimal("100.0000")))
    db.commit()
    deleted_import_id = imports[0].id
    retained_import_id = imports[1].id

    before = client.get(f"/household-members/{imports[0].household_member_id}/holdings", headers=headers)
    assert before.status_code == 200
    assert before.json()["holdings"][0]["units_held"] == "2.000"

    response = client.delete(f"/imports/{deleted_import_id}", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"deleted_transactions_count": 1}
    db.expire_all()
    assert db.query(Transaction).filter_by(import_id=deleted_import_id).count() == 0
    assert db.query(Transaction).filter_by(import_id=retained_import_id).count() == 1
    assert db.get(Import, deleted_import_id) is None
    assert db.query(AnalyticsSection).filter_by(user_id=user.id).count() == 0
    status = db.get(AnalyticsRecomputeStatus, user.id)
    assert status.generation == 8
    after = client.get(f"/household-members/{folio.household_member_id}/holdings", headers=headers)
    assert after.status_code == 200
    assert after.json()["holdings"][0]["units_held"] == "1.000"
    db.close()


def test_delete_import_removes_folio_when_its_last_transaction_is_deleted(client):
    db, _user, imports, headers = _seed_households(client)
    scheme = Scheme(amfi_code="DELETE-ORPHAN", name="Orphan", amc_name="Ghost AMC", sebi_category="Equity")
    db.add(scheme)
    db.flush()
    folio = Folio(
        household_member_id=imports[0].household_member_id,
        scheme_id=scheme.id,
        folio_number="ONLY",
        plan_type=PlanType.REGULAR,
        arn_code="ARN-123",
        has_coverage_gap=True,
        coverage_gap_details={"deficit_units": "5.000"},
    )
    db.add(folio)
    db.flush()
    db.add(Transaction(
        folio_id=folio.id, import_id=imports[0].id, type=TransactionType.REDEMPTION,
        date=date(2024, 1, 1), amount=Decimal("50.00"), units=Decimal("5.000"), nav=Decimal("10.0000"),
    ))
    db.commit()
    folio_id = folio.id

    response = client.delete(f"/imports/{imports[0].id}", headers=headers)

    assert response.status_code == 200
    db.expire_all()
    assert db.get(Folio, folio_id) is None
    db.close()


def test_delete_import_recomputes_coverage_gap_for_surviving_folio(client):
    db, _user, imports, headers = _seed_households(client)
    scheme = Scheme(amfi_code="DELETE-GAP", name="Gap", amc_name="AMC", sebi_category="Equity")
    db.add(scheme)
    db.flush()
    folio = Folio(
        household_member_id=imports[0].household_member_id,
        scheme_id=scheme.id,
        folio_number="SHARED",
        plan_type=PlanType.DIRECT,
    )
    db.add(folio)
    db.flush()
    db.add_all([
        Transaction(
            folio_id=folio.id, import_id=imports[0].id, type=TransactionType.PURCHASE,
            date=date(2024, 1, 1), amount=Decimal("1000.00"), units=Decimal("100.000"), nav=Decimal("10.0000"),
        ),
        Transaction(
            folio_id=folio.id, import_id=imports[1].id, type=TransactionType.REDEMPTION,
            date=date(2024, 2, 1), amount=Decimal("500.00"), units=Decimal("50.000"), nav=Decimal("10.0000"),
        ),
    ])
    db.commit()
    assert evaluate_folio_coverage_gaps(db, folio.id) is None
    db.commit()

    response = client.delete(f"/imports/{imports[0].id}", headers=headers)

    assert response.status_code == 200
    db.expire_all()
    surviving = db.get(Folio, folio.id)
    assert surviving is not None
    assert surviving.has_coverage_gap is True
    assert surviving.coverage_gap_details["deficit_units"] == "50.000"
    db.close()


def test_delete_import_rejects_another_households_import(client):
    db, _user, imports, headers = _seed_households(client)
    response = client.delete(f"/imports/{imports[2].id}", headers=headers)
    assert response.status_code == 404
    assert db.get(Import, imports[2].id) is not None
    db.close()
