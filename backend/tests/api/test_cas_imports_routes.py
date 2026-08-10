from datetime import datetime, timezone
import uuid
import pytest
from app.models.enums import Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.session import create_session


@pytest.fixture
def auth_headers_and_member(client):
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
    db.commit()

    member_id = member.id
    user_id = user.id
    _, token = create_session(db, user.id)
    return {"Authorization": f"Bearer {token}"}, member_id, user_id


def test_post_cas_imports_validates_pdf_magic_bytes(client, auth_headers_and_member):
    headers, member_id, user_id = auth_headers_and_member
    non_pdf_content = b"Plain text file"

    response = client.post(
        "/cas-imports",
        headers=headers,
        data={
            "password": "PASS",
            "household_member_id": str(member_id),
        },
        files={"file": ("test.txt", non_pdf_content, "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_file"


def test_post_cas_imports_wrong_password_returns_password_required_and_allows_patch(client, auth_headers_and_member, monkeypatch):
    headers, member_id, user_id = auth_headers_and_member
    fake_pdf = b"%PDF-1.4 encrypted content"

    from app.services.import_.parser import (
        NormalizedTransaction,
        ParsedInvestor,
        ParsedScheme,
        ParseError,
        ParseResult,
    )
    from datetime import date
    from decimal import Decimal
    from app.models.enums import TransactionType

    def mock_parse(pdf_bytes, password):
        if password != "CORRECT_PASS":
            raise ParseError("wrong_password", "Incorrect PDF password.")
        return ParseResult(
            investor=ParsedInvestor(name="Rajesh Kumar", email="rajesh.kumar@example.com", pan_masked="A*****1"),
            schemes=[
                ParsedScheme(
                    name="HDFC Top 100", isin="INF179K01BE2", amfi="100033", scheme_type="Equity",
                    folio="123", amc="HDFC", transaction_count=1, plan_type="direct"
                )
            ],
            transactions=[
                NormalizedTransaction(
                    folio="123", amc="HDFC", scheme_name="HDFC Top 100", isin="INF179K01BE2", amfi="100033",
                    scheme_type="Equity", txn_date=date(2024, 1, 1), txn_type=TransactionType.PURCHASE,
                    description="Buy", amount=Decimal("5000.00"), units=Decimal("50.000"), nav=Decimal("100.0000")
                )
            ],
            raw_json='{"folios": []}',
        )

    monkeypatch.setattr("app.services.import_.lifecycle_service.parse_cas_pdf_bytes", mock_parse)

    # 1. Initial upload with wrong password
    upload_res = client.post(
        "/cas-imports",
        headers=headers,
        data={
            "password": "WRONG_PASS",
            "household_member_id": str(member_id),
        },
        files={"file": ("statement.pdf", fake_pdf, "application/pdf")},
    )

    assert upload_res.status_code == 202
    data = upload_res.json()
    import_id = data["import_id"]
    assert data["status"] == "password_required"
    assert data["error_code"] == "wrong_password"

    # 2. Query status via GET /cas-imports/{id}
    status_res = client.get(f"/cas-imports/{import_id}", headers=headers)
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "password_required"

    # 3. In-place password retry via PATCH /cas-imports/{id}/password
    patch_res = client.patch(
        f"/cas-imports/{import_id}/password",
        headers=headers,
        json={"password": "CORRECT_PASS"},
    )
    assert patch_res.status_code == 200
    patch_data = patch_res.json()
    assert patch_data["status"] == "import_successful"
    assert patch_data["new_transactions_count"] == 1

    # 4. List import history via GET /household-members/{member_id}/cas-imports
    history_res = client.get(f"/household-members/{member_id}/cas-imports", headers=headers)
    assert history_res.status_code == 200
    history_data = history_res.json()
    assert len(history_data) >= 1
    assert history_data[0]["import_id"] == import_id
    assert history_data[0]["status"] == "import_successful"


def test_post_cas_imports_summary_cas_transitions_validation_failed(client, auth_headers_and_member, monkeypatch):
    headers, member_id, user_id = auth_headers_and_member
    fake_pdf = b"%PDF-1.4 summary statement content"

    from app.services.import_.parser import ParseError

    def mock_parse(pdf_bytes, password):
        raise ParseError("summary_cas", "This is a Summary CAS. Please request a Detailed CAS.")

    monkeypatch.setattr("app.services.import_.lifecycle_service.parse_cas_pdf_bytes", mock_parse)

    upload_res = client.post(
        "/cas-imports",
        headers=headers,
        data={
            "password": "PASS",
            "household_member_id": str(member_id),
        },
        files={"file": ("summary.pdf", fake_pdf, "application/pdf")},
    )

    assert upload_res.status_code == 202
    data = upload_res.json()
    assert data["status"] == "validation_failed"
    assert data["error_code"] == "summary_cas"
    assert "Summary CAS" in data["error_message"]

