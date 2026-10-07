from datetime import datetime, timezone
import uuid
import pytest

from app.models.enums import AuthIdentityProvider, ConsentDocumentType, Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.session import create_session
from app.services.legal.registry import current_document

PAN_DISCLAIMER_VERSION = current_document(ConsentDocumentType.PAN_DISCLAIMER).version


@pytest.fixture
def auth_setup(client):
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
    _, token = create_session(db, user.id, auth_method=AuthIdentityProvider.PHONE_OTP)
    return {"Authorization": f"Bearer {token}"}, member_id


def test_post_cas_imports_request_returns_waiting_status_and_cams_url(client, auth_setup):
    headers, member_id = auth_setup

    res = client.post(
        "/cas-imports/request",
        headers=headers,
        json={"household_member_id": str(member_id), "pan_disclaimer_version": PAN_DISCLAIMER_VERSION},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["cams_url"] == "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement"
    assert data["import_id"] is not None


def test_post_cas_imports_cancel_transitions_to_expired(client, auth_setup):
    headers, member_id = auth_setup

    # 1. Create pending request
    req_res = client.post(
        "/cas-imports/request",
        headers=headers,
        json={"household_member_id": str(member_id), "pan_disclaimer_version": PAN_DISCLAIMER_VERSION},
    )
    import_id = req_res.json()["import_id"]

    # 2. Cancel pending request
    cancel_res = client.post(
        f"/cas-imports/{import_id}/cancel",
        headers=headers,
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "expired"


def _consent_rows(client):
    from app.db.session import get_db
    from app.models.consent import ConsentRecord

    db = next(client.app.dependency_overrides[get_db]())
    try:
        return db.query(ConsentRecord).all()
    finally:
        db.close()


def test_cams_request_needs_no_consent_and_records_none(client, auth_setup):
    """2026-10-07: requesting a CAS from CAMS records no PAN consent (that is
    recorded at upload). With or without a version -- even a stale one from an
    older client -- the request goes through and writes no consent row."""
    headers, member_id = auth_setup
    for body in (
        {"household_member_id": str(member_id)},
        {"household_member_id": str(member_id), "pan_disclaimer_version": "pan-old"},
    ):
        res = client.post("/cas-imports/request", headers=headers, json=body)
        assert res.status_code == 201, res.text
    assert _consent_rows(client) == []
