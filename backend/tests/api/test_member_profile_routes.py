import uuid
from datetime import datetime, timezone

from app.db.session import get_db
from app.main import app
from app.models.enums import MemberNameSource, MemberOrigin, Relationship
from app.models.user import HouseholdMember
from app.services.import_.crypto import hash_pan
from app.services.import_.pan_claims import store_detected_pan

PAN = "ABCPS1234K"


def _headers(client, phone):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    return {"Authorization": f"Bearer {token}"}


def _db():
    return next(app.dependency_overrides[get_db]())


def _add_detected(client, headers, name="Ramesh Sharma", pan=PAN):
    me = client.post("/household-members", json={"name": "Self User", "relationship": "self"}, headers=headers).json()
    db = _db()
    uid = db.get(HouseholdMember, uuid.UUID(me["id"])).user_id
    m = HouseholdMember(
        user_id=uid, name=name, relationship=None, created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
    )
    db.add(m)
    db.flush()
    if pan:
        store_detected_pan(db, m, pan, now=datetime.now(timezone.utc))
    db.commit()
    return str(m.id)


def _put(client, h, mid, body):
    return client.put(f"/household-members/{mid}/profile", json=body, headers=h)


def test_put_profile_returns_new_completion(client):
    h = _headers(client, "+919100000001")
    mid = _add_detected(client, h)
    r = _put(client, h, mid, {"relationship": "parent", "phone_number": "9800000002"})
    assert r.status_code == 200, r.text
    assert r.json()["profile_completion"] == 80 and r.json()["missing_fields"] == ["email"]
    assert PAN not in r.text


def test_put_profile_reaching_100(client):
    h = _headers(client, "+919100000002")
    mid = _add_detected(client, h)
    r = _put(client, h, mid, {"relationship": "parent", "phone_number": "9800000002", "email": "r@example.com"})
    assert r.status_code == 200 and r.json()["profile_completion"] == 100


def test_put_profile_pan_required_is_422(client):
    h = _headers(client, "+919100000003")
    mid = _add_detected(client, h, pan=None)
    r = _put(client, h, mid, {"phone_number": "9800000002"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "pan_required"
    row = next(m for m in client.get("/household-members", headers=h).json() if m["id"] == mid)
    assert row["phone_number"] is None


def test_put_profile_other_account_pan_is_200_with_conflict(client):
    h1 = _headers(client, "+919100000004")
    h2 = _headers(client, "+919100000005")
    _add_detected(client, h2)  # user 2 holds PAN
    mid = _add_detected(client, h1, pan=None)
    r = _put(client, h1, mid, {"pan": PAN, "relationship": "sibling"})
    assert r.status_code == 200, r.text
    assert r.json()["pan_conflict"] == "other_account" and r.json()["relationship"] == "sibling"
    assert r.json()["profile_completion"] == 40


def test_put_profile_duplicate_is_409_with_merge_details(client):
    h = _headers(client, "+919100000006")
    holder = _add_detected(client, h, name="Dad")
    db = _db()
    uid = db.get(HouseholdMember, uuid.UUID(holder)).user_id
    dup = HouseholdMember(
        user_id=uid, name="Ramesh", relationship=None, created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
    )
    db.add(dup)
    db.commit()
    dup_id = dup.id
    r = _put(client, h, str(dup_id), {"pan": PAN})
    assert r.status_code == 409, r.text
    d = r.json()["detail"]
    assert d["code"] == "pan_belongs_to_other_member"
    assert d["details"]["can_merge"] is True and d["details"]["other_member_id"] == holder
    assert d["details"]["source_pan_label"] == "PAN not on statement"
    m = client.post(f"/household-members/{dup_id}/merge-into/{holder}", headers=h)
    assert m.status_code == 200, m.text
    db.expire_all()
    assert db.get(HouseholdMember, dup_id) is None
    assert db.get(HouseholdMember, uuid.UUID(holder)).pan_lookup_hash == hash_pan(PAN)


def test_put_profile_other_users_member_is_404(client):
    h1 = _headers(client, "+919100000007")
    h2 = _headers(client, "+919100000008")
    mid = _add_detected(client, h1)
    cross = _put(client, h2, mid, {"email": "a@b.co"})
    assert cross.status_code == 404
    assert _put(client, h1, str(uuid.uuid4()), {"email": "a@b.co"}).status_code == 404


def test_put_profile_invalid_name_is_422(client):
    h = _headers(client, "+919100000009")
    mid = _add_detected(client, h)
    r = _put(client, h, mid, {"name": "R2D2"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid_name"


def test_put_profile_cas_pan_member_cannot_send_pan(client):
    h = _headers(client, "+919100000010")
    mid = _add_detected(client, h)
    r = _put(client, h, mid, {"pan": "ABCPS9999K"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"


def test_old_details_and_patch_routes_are_gone(client):
    h = _headers(client, "+919100000011")
    mid = _add_detected(client, h)
    assert client.post(f"/household-members/{mid}/details", json={"relationship": "parent"}, headers=h).status_code in (404, 405)
    assert client.patch(f"/household-members/{mid}", json={"email": "a@b.co"}, headers=h).status_code in (404, 405)


def test_detected_member_reads_are_200(client):
    h = _headers(client, "+919100000012")
    mid = _add_detected(client, h)
    for path in ("holdings", "sips", "allocation", "cash-flow", "snapshots"):
        assert client.get(f"/household-members/{mid}/{path}", headers=h).status_code == 200, path
    assert client.get(f"/analytics/{mid}", headers=h).status_code == 200
