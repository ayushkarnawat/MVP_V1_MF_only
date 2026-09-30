import uuid
from datetime import datetime, timezone

from app.db.session import get_db
from app.main import app
from app.models.enums import MemberLockReason, MemberNameSource, MemberOrigin, Relationship
from app.models.user import HouseholdMember, User
from app.services.import_.crypto import encrypt_pan, hash_pan

PAN = "BXQPS5678L"


def _headers(client, phone):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    return {"Authorization": f"Bearer {token}"}


def _db():
    gen = app.dependency_overrides[get_db]()
    return next(gen)


def _add_locked(client, headers, name="Ramesh Sharma", detected=PAN):
    me = client.post("/household-members", json={"name": "Self User", "relationship": "self"}, headers=headers).json()
    db = _db()
    uid = db.get(HouseholdMember, uuid.UUID(me["id"])).user_id
    m = HouseholdMember(
        user_id=uid, name=name, relationship=None, created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
        details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED,
        detected_pan_encrypted=encrypt_pan(detected) if detected else None,
        detected_pan_hash=hash_pan(detected) if detected else None,
    )
    db.add(m)
    db.commit()
    mid = str(m.id)
    db.close()
    return me["id"], mid


def test_details_route_unlocks_and_response_has_masked_pan(client):
    h = _headers(client, "+919100000001")
    _, mid = _add_locked(client, h)
    r = client.post(f"/household-members/{mid}/details",
                    json={"relationship": "parent", "pan": "bxqps 5678l"}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["details_required"] is False
    assert body["pan_masked"] == "BX******8L"
    assert body["lock_reason"] is None
    assert PAN not in r.text


def test_details_route_errors(client):
    h = _headers(client, "+919100000002")
    _, mid = _add_locked(client, h)
    url = f"/household-members/{mid}/details"
    r = client.post(url, json={"relationship": "parent", "pan": "abc"}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid_pan_format"
    r = client.post(url, json={"relationship": "parent", "pan": "ABCDE1234F"}, headers=h)
    assert r.status_code == 409
    d = r.json()["detail"]
    assert d["code"] == "detected_pan_mismatch"
    assert d["details"]["detected_pan_masked"] == "BX******8L"
    assert "BX******8L" in d["message"]
    r = client.post(url, json={"relationship": "self", "pan": PAN}, headers=h)
    assert r.status_code == 422
    r = client.post(f"/household-members/{uuid.uuid4()}/details",
                    json={"relationship": "parent", "pan": PAN}, headers=h)
    assert r.status_code == 404


def test_details_route_cross_account_is_409_and_saves_relationship(client):
    h1 = _headers(client, "+919100000003")
    h2 = _headers(client, "+919100000004")
    _, mid = _add_locked(client, h1)
    # user 2 claims the PAN
    me2 = client.post("/household-members", json={"name": "Other User", "relationship": "self"}, headers=h2).json()
    db = _db()
    row = db.get(HouseholdMember, uuid.UUID(me2["id"]))
    row.pan_encrypted, row.pan_lookup_hash = encrypt_pan(PAN), hash_pan(PAN)
    db.commit()
    db.close()
    r = client.post(f"/household-members/{mid}/details",
                    json={"relationship": "sibling", "pan": PAN}, headers=h1)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "cross_account_pan_blocked"
    members = {m["id"]: m for m in client.get("/household-members", headers=h1).json()}
    assert members[mid]["relationship"] == "sibling"
    assert members[mid]["lock_reason"] == "pan_on_other_account"
    assert members[mid]["details_required"] is True


def test_member_routes_403_while_locked_and_aggregate_includes_them(client):
    h = _headers(client, "+919100000005")
    _, mid = _add_locked(client, h)
    for path in ("holdings", "distributor-comparison", "allocation", "sips",
                 "sips/monthly", "cash-flow", "snapshots", "cas-imports", "coverage-gaps"):
        r = client.get(f"/household-members/{mid}/{path}", headers=h)
        assert r.status_code == 403, path
        assert r.json()["detail"]["code"] == "member_details_required", path
    assert client.get(f"/analytics/{mid}", headers=h).status_code == 403
    assert client.post(f"/analytics/{mid}/retry", headers=h).status_code == 403
    assert client.get("/household/aggregate/holdings", headers=h).status_code == 200
    # unlocked -> 200
    client.post(f"/household-members/{mid}/details",
                json={"relationship": "parent", "pan": PAN}, headers=h)
    assert client.get(f"/household-members/{mid}/holdings", headers=h).status_code == 200


def test_list_members_response_has_lock_fields(client):
    h = _headers(client, "+919100000006")
    me_id, mid = _add_locked(client, h)
    members = {m["id"]: m for m in client.get("/household-members", headers=h).json()}
    assert members[me_id]["origin"] == "onboarding"
    assert members[me_id]["details_required"] is False
    assert members[me_id]["pan_masked"] is None
    assert members[mid]["relationship"] is None
    assert members[mid]["details_required"] is True
    assert members[mid]["lock_reason"] == "details_needed"
    assert members[mid]["origin"] == "cas_detected"
    assert members[mid]["pan_masked"] == "BX******8L"


def test_create_member_invalid_name_is_422(client):
    h = _headers(client, "+919100000007")
    r = client.post("/household-members", json={"name": "R2D2", "relationship": "self"}, headers=h)
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalid_name"


def test_write_side_doors_are_403_for_a_locked_member(client):
    from app.models.folio import Folio
    from app.models.reference import Scheme

    h = _headers(client, "+919100000031")
    _, mid = _add_locked(client, h)
    db = _db()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="100033", isin="INF179K01BE2",
                    name="HDFC Top 100 Fund - Growth", amc_name="HDFC Mutual Fund", sebi_category="Equity")
    db.add(scheme)
    db.flush()
    folio = Folio(id=uuid.uuid4(), household_member_id=uuid.UUID(mid), scheme_id=scheme.id, folio_number="1/2")
    db.add(folio)
    db.commit()
    folio_id = str(folio.id)
    db.close()

    r = client.post(f"/folios/{folio_id}/opening-balance",
                    json={"units": "10", "date": "2020-01-01"}, headers=h)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "member_details_required"
    r = client.post("/cas-imports/request", json={"household_member_id": mid}, headers=h)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "member_details_required"
