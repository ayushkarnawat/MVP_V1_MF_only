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


def test_one_step_upload_requires_review(client, auth_headers_and_member):
    headers, member_id, _ = auth_headers_and_member
    for name, content, ctype in [
        ("statement.pdf", b"%PDF-1.4 fake", "application/pdf"),
        ("test.txt", b"Plain text file", "text/plain"),
    ]:
        response = client.post(
            "/cas-imports",
            headers=headers,
            data={"password": "PASS", "household_member_id": str(member_id)},
            files={"file": (name, content, ctype)},
        )
        assert response.status_code == 409
        assert response.json()["detail"] == {
            "code": "review_required",
            "message": "Upload this statement through the review screen.",
        }


def test_one_step_upload_requires_auth(client):
    response = client.post(
        "/cas-imports",
        data={"password": "PASS", "household_member_id": str(uuid.uuid4())},
        files={"file": ("s.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code in (401, 403)


def test_password_retry_requires_review(client, auth_headers_and_member):
    headers, member_id, _ = auth_headers_and_member
    from app.db.session import get_db
    from app.models.enums import ImportStatus
    from app.models.imports import Import

    db = next(client.app.dependency_overrides[get_db]())
    rec = Import(
        id=uuid.uuid4(),
        household_member_id=member_id,
        status=ImportStatus.PASSWORD_REQUIRED,
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(rec)
    db.commit()

    response = client.patch(
        f"/cas-imports/{rec.id}/password", headers=headers, json={"password": "x"}
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "review_required"
