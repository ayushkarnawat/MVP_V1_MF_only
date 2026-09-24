from datetime import datetime, timedelta, timezone
import uuid
from unittest.mock import patch

import pytest
from app.models.enums import AuthIdentityProvider, Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.session import create_session
from app.services.import_ import file_storage as file_storage_module
from app.services.import_.file_storage import CAS_FILE_RETENTION_DAYS, storage_key_for_import


@pytest.fixture(autouse=True)
def isolate_cas_file_storage(tmp_path, monkeypatch):
    """Prevent the success-path test below (which reaches store_cas_file via
    the real upload+retry-password route) from writing to disk via the
    module-level default_file_storage singleton -- same isolation Task 6
    needed in test_service.py, since the singleton captures
    settings.cas_file_storage_dir once at import time (monkeypatching the
    setting itself would silently no-op)."""
    monkeypatch.setattr(file_storage_module.default_file_storage, "_base_dir", tmp_path)


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
    _, token = create_session(db, user.id, auth_method=AuthIdentityProvider.PHONE_OTP)
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

    # 3. In-place password retry via PATCH /cas-imports/{id}/password.
    before = datetime.now(timezone.utc)
    patch_res = client.patch(
        f"/cas-imports/{import_id}/password",
        headers=headers,
        json={"password": "CORRECT_PASS"},
    )
    assert patch_res.status_code == 200
    patch_data = patch_res.json()
    assert patch_data["status"] == "import_successful"
    assert patch_data["new_transactions_count"] == 1
    # parse_warnings is kept on the response schema but always empty:
    # nothing writes it since the cross-account advisory was removed.
    assert patch_data["parse_warnings"] == []

    # Review finding (Task 7): this route test reaches retry_cas_import_password's
    # real success path (nothing here mocks the service function itself) --
    # verify store_cas_file's effect actually landed on the committed Import
    # row, not just that the call didn't raise. Same check as
    # test_lifecycle_service.py's unit-level assertion, exercised end-to-end
    # through the HTTP route this time.
    from app.db.session import get_db
    from app.models.imports import Import

    db_gen = client.app.dependency_overrides[get_db]()
    db = next(db_gen)
    imp = db.query(Import).filter_by(id=uuid.UUID(import_id)).one()
    assert imp.file_reference == storage_key_for_import(user_id, imp.id)
    expected_expiry = before + timedelta(days=CAS_FILE_RETENTION_DAYS)
    actual_expiry = imp.file_expires_at
    if actual_expiry.tzinfo is None:
        actual_expiry = actual_expiry.replace(tzinfo=timezone.utc)
    assert abs((actual_expiry - expected_expiry).total_seconds()) < 5

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


def test_post_cas_imports_blocks_cross_account_pan_reuse_without_leaking_other_account(
    client, auth_headers_and_member, monkeypatch
):
    """A PAN held by another account is refused with a 409 at upload, without
    leaking that account and without writing anything."""
    headers, member_id, user_id = auth_headers_and_member

    from app.db.session import get_db
    from app.models.enums import Relationship
    from app.models.imports import Import
    from app.models.user import HouseholdMember, User
    from app.services.import_.crypto import encrypt_pan, hash_pan

    db_gen = client.app.dependency_overrides[get_db]()
    db = next(db_gen)

    # A member of a DIFFERENT account who already has this PAN on file.
    other_user = User(
        id=uuid.uuid4(),
        phone_number="+919999999999",
        email="other@example.com",
        created_at=datetime.now(timezone.utc),
    )
    db.add(other_user)
    db.flush()
    other_member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=other_user.id,
        name="Someone Else Entirely",
        relationship=Relationship.SELF,
        created_at=datetime.now(timezone.utc),
        pan_encrypted=encrypt_pan("ABCDE1234F"),
        pan_lookup_hash=hash_pan("ABCDE1234F"),
    )
    db.add(other_member)
    db.commit()
    other_member_id = other_member.id
    other_member_name = other_member.name

    from app.services.import_.parser import ParsedInvestor, ParseResult

    def mock_parse(pdf_bytes, password):
        return ParseResult(
            investor=ParsedInvestor(
                name="Rajesh Kumar", email="rajesh.kumar@example.com",
                pan_masked="ABCDE****F", pan="ABCDE1234F",
            ),
            schemes=[],
            transactions=[],
            raw_json='{"folios": []}',
        )

    monkeypatch.setattr("app.services.import_.lifecycle_service.parse_cas_pdf_bytes", mock_parse)

    response = client.post(
        "/cas-imports",
        headers=headers,
        data={
            "password": "PASS",
            "household_member_id": str(member_id),
        },
        files={"file": ("statement.pdf", b"%PDF-1.4 statement", "application/pdf")},
    )

    assert response.status_code == 409
    body = response.json()
    assert body["detail"]["code"] == "cross_account_pan_blocked"

    # No leak: the other account's member name/id must not appear anywhere
    # in the response body, structured or not.
    body_text = response.text
    assert other_member_name not in body_text
    assert str(other_member_id) not in body_text

    # No DB write: the Import row create_cas_import add()ed+flush()ed before
    # hitting the block was never committed -- get_db's `finally: db.close()`
    # rolls it back, so a fresh session sees none for this household member.
    db_gen2 = client.app.dependency_overrides[get_db]()
    db2 = next(db_gen2)
    assert db2.query(Import).filter_by(household_member_id=member_id).count() == 0
