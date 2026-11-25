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


def test_waiting_request_is_readable_for_each_member(client, auth_setup):
    from app.db.session import get_db
    from tests.services.import_.test_confirm_people import _member

    headers, member_id = auth_setup
    db = next(client.app.dependency_overrides[get_db]())
    member = db.get(HouseholdMember, member_id)
    other = _member(db, db.get(User, member.user_id), "Meera Sharma", relationship=Relationship.PARENT)
    for mid in (member_id, other.id):
        requested = client.post("/cas-imports/request", headers=headers, json={"household_member_id": str(mid)})
        assert requested.status_code == 201
        response = client.get("/cas-imports/pending", headers=headers, params={"member_id": str(mid)})
        assert response.status_code == 200
        pending = response.json()["pending"]
        assert set(pending) == {"import_id", "household_member_id", "expires_at"}
        assert pending["import_id"] == requested.json()["import_id"]
        assert pending["household_member_id"] == str(mid)
        assert datetime.fromisoformat(pending["expires_at"]) == datetime.fromisoformat(requested.json()["expires_at"])


def test_pending_is_null_when_nothing_waits(client, auth_setup):
    headers, member_id = auth_setup
    response = client.get("/cas-imports/pending", headers=headers, params={"member_id": str(member_id)})
    assert response.status_code == 200
    assert response.json() == {"pending": None}


def test_pending_ignores_a_request_past_its_expiry(client, auth_setup):
    from datetime import timedelta
    from app.db.session import get_db
    from app.models.imports import Import

    headers, member_id = auth_setup
    requested = client.post("/cas-imports/request", headers=headers, json={"household_member_id": str(member_id)})
    db = next(client.app.dependency_overrides[get_db]())
    row = db.get(Import, uuid.UUID(requested.json()["import_id"]))
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    response = client.get("/cas-imports/pending", headers=headers, params={"member_id": str(member_id)})
    assert response.status_code == 200
    assert response.json() == {"pending": None}


def test_pending_is_scoped_to_the_user_and_member(client, auth_setup):
    from app.db.session import get_db
    from app.services.import_.cams_portal import initiate_cams_request
    from tests.services.import_.test_confirm_people import _member, _user

    headers, member_id = auth_setup
    db = next(client.app.dependency_overrides[get_db]())
    outsider = _member(db, _user(db), "Kiran Sharma")
    initiate_cams_request(db, outsider.user_id, outsider.id)
    assert client.get("/cas-imports/pending", headers=headers, params={"member_id": str(outsider.id)}).status_code == 404
    assert client.get("/cas-imports/pending", headers=headers, params={"member_id": str(uuid.uuid4())}).status_code == 404
    assert client.get("/cas-imports/pending", headers=headers, params={"member_id": "invalid"}).status_code == 400
    assert client.get("/cas-imports/pending", params={"member_id": str(member_id)}).status_code == 401


def test_cancel_works_with_the_id_the_server_gave(client, auth_setup):
    headers, member_id = auth_setup
    client.post("/cas-imports/request", headers=headers, json={"household_member_id": str(member_id)})
    pending = client.get("/cas-imports/pending", headers=headers, params={"member_id": str(member_id)})
    assert pending.status_code == 200
    import_id = pending.json()["pending"]["import_id"]
    cancelled = client.post(f"/cas-imports/{import_id}/cancel", headers=headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "expired"
    assert client.get("/cas-imports/pending", headers=headers, params={"member_id": str(member_id)}).json() == {"pending": None}


def test_cams_link_returns_the_fixed_address_and_needs_a_session(client, auth_setup):
    from app.services.import_.cams_portal import build_cams_mailback_url

    headers, _ = auth_setup
    response = client.get("/cas-imports/cams-link", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"cams_url": build_cams_mailback_url()}
    assert client.get("/cas-imports/cams-link").status_code == 401


def test_pending_and_cams_link_are_not_read_as_an_import_id(client, auth_setup):
    headers, member_id = auth_setup
    for path in (f"/cas-imports/pending?member_id={member_id}", "/cas-imports/cams-link"):
        response = client.get(path, headers=headers)
        assert response.status_code == 200, response.text
