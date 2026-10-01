import uuid
from datetime import datetime, timezone

from app.db.session import get_db
from app.main import app
from app.models.enums import MemberLockReason, MemberNameSource, MemberOrigin, MemberPanSource, Relationship
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
                    json={"relationship": "parent"}, headers=h)
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
    # 2026-10-01 (QD): a typed PAN on a statement-PAN member is refused
    # outright; the old L3 detected_pan_mismatch branch is gone.
    r = client.post(url, json={"relationship": "parent", "pan": "ABCDE1234F"}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"
    r = client.post(url, json={"relationship": "self"}, headers=h)
    assert r.status_code == 422
    r = client.post(f"/household-members/{uuid.uuid4()}/details",
                    json={"relationship": "parent"}, headers=h)
    assert r.status_code == 404
    # Format check still runs for a name-only member (QC), the one typed-PAN case.
    db = _db()
    uid = db.get(HouseholdMember, uuid.UUID(mid)).user_id
    name_only = HouseholdMember(
        user_id=uid, name="Meera Sharma", relationship=None, created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
        details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED,
    )
    db.add(name_only)
    db.commit()
    r = client.post(f"/household-members/{name_only.id}/details",
                    json={"relationship": "parent", "pan": "abc"}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid_pan_format"


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
                    json={"relationship": "sibling"}, headers=h1)
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
                json={"relationship": "parent"}, headers=h)
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


# ---------------------------------------------- use_detected_pan (staging-QA fix 4)
# 2026-10-01: the flag is accepted and ignored (old clients during a rollout);
# the statement PAN is always used, so these still pass unchanged.

def test_use_detected_pan_unlocks_with_the_statement_pan(client):
    from app.models.enums import MemberPanSource

    h = _headers(client, "+919811200001")
    _, mid = _add_locked(client, h)
    r = client.post(f"/household-members/{mid}/details",
                    json={"relationship": "parent", "use_detected_pan": True}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["lock_reason"] is None
    got = _db().get(HouseholdMember, uuid.UUID(mid))
    assert got.pan_lookup_hash == hash_pan(PAN)
    assert got.pan_source == MemberPanSource.CAS and got.pan_verified_at is not None


def test_use_detected_pan_still_raises_l4_when_pan_is_on_another_member(client):
    h = _headers(client, "+919811200005")
    _, mid = _add_locked(client, h)
    db = _db()
    uid = db.get(HouseholdMember, uuid.UUID(mid)).user_id
    now = datetime.now(timezone.utc)
    db.add(HouseholdMember(
        user_id=uid, name="Dad", relationship=Relationship.PARENT, created_at=now, details_completed_at=now,
        origin=MemberOrigin.MANUAL, name_source=MemberNameSource.USER_ENTERED,
        pan_encrypted=encrypt_pan(PAN), pan_lookup_hash=hash_pan(PAN),
    ))
    db.commit()
    r = client.post(f"/household-members/{mid}/details",
                    json={"relationship": "parent", "use_detected_pan": True}, headers=h)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "pan_belongs_to_other_member"


# ------------------------------------ duplicate Kavita merge (staging-QA fix 5C)

KAVITA_PAN = "BNZPK4321M"


def _kavita_pair(client, h):
    """#1 name-only locked, #2 locked with a detected PAN; same user, same name."""
    me = client.post("/household-members", json={"name": "Aditi Shanbhag", "relationship": "self"}, headers=h).json()
    db = _db()
    uid = db.get(HouseholdMember, uuid.UUID(me["id"])).user_id
    now = datetime.now(timezone.utc)
    common = dict(user_id=uid, name="Kavita Shanbhag", relationship=None, created_at=now,
                  origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
                  details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED)
    one = HouseholdMember(**common)
    two = HouseholdMember(**common, detected_pan_encrypted=encrypt_pan(KAVITA_PAN), detected_pan_hash=hash_pan(KAVITA_PAN))
    db.add_all([one, two])
    db.commit()
    return one.id, two.id


def test_order_a_name_only_first_then_pan_bearing_can_merge(client):
    from app.models.enums import MemberPanSource

    h = _headers(client, "+919811400001")
    one, two = _kavita_pair(client, h)
    first = client.post(f"/household-members/{one}/details", json={"relationship": "parent", "pan": KAVITA_PAN}, headers=h)
    assert first.status_code == 200, first.text
    r = client.post(f"/household-members/{two}/details", json={"relationship": "parent"}, headers=h)
    assert r.status_code == 409
    d = r.json()["detail"]["details"]
    assert d["can_merge"] is True and d["other_member_id"] == str(one) and d["source_pan_label"] == "BN******1M"
    m = client.post(f"/household-members/{two}/merge-into/{one}", headers=h)
    assert m.status_code == 200, m.text
    got = _db().get(HouseholdMember, one)
    assert got.pan_source == MemberPanSource.CAS and got.pan_verified_at is not None  # the statement confirmed it


def test_order_b_pan_bearing_first_then_name_only_can_merge(client):
    h = _headers(client, "+919811400002")
    one, two = _kavita_pair(client, h)
    first = client.post(f"/household-members/{two}/details", json={"relationship": "parent"}, headers=h)
    assert first.status_code == 200, first.text
    r = client.post(f"/household-members/{one}/details", json={"relationship": "parent", "pan": KAVITA_PAN}, headers=h)
    d = r.json()["detail"]["details"]
    assert d["can_merge"] is True and d["source_pan_label"] == "PAN not on statement"
    assert client.post(f"/household-members/{one}/merge-into/{two}", headers=h).status_code == 200


def test_locked_member_with_a_different_detected_pan_still_cannot_merge(client):
    h = _headers(client, "+919811400003")
    one, _ = _kavita_pair(client, h)
    assert client.post(f"/household-members/{one}/details",
                       json={"relationship": "parent", "pan": KAVITA_PAN}, headers=h).status_code == 200
    db = _db()
    three = HouseholdMember(
        user_id=db.get(HouseholdMember, one).user_id, name="Kavita S", relationship=None,
        created_at=datetime.now(timezone.utc), origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
        details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED,
        detected_pan_encrypted=encrypt_pan("ZZZPZ9999Z"), detected_pan_hash=hash_pan("ZZZPZ9999Z"),
    )
    db.add(three)
    db.commit()
    assert client.post(f"/household-members/{three.id}/merge-into/{one}", headers=h).status_code == 409


def test_self_create_renames_provisional_self(client):
    h = _headers(client, "+919100100001")
    first = client.post("/household-members", json={"name": "Ravi", "relationship": "self"}, headers=h)
    again = client.post("/household-members", json={"name": "Ravi Kumar", "relationship": "self"}, headers=h)
    assert first.status_code == 200 and again.status_code == 200
    assert again.json()["id"] == first.json()["id"]
    assert again.json()["name"] == "Ravi Kumar"


def test_self_create_is_409_once_self_has_a_cas_pan(client):
    h = _headers(client, "+919100100002")
    me = client.post("/household-members", json={"name": "Ravi", "relationship": "self"}, headers=h).json()
    db = _db()
    m = db.get(HouseholdMember, uuid.UUID(me["id"]))
    m.pan_encrypted, m.pan_lookup_hash = encrypt_pan(PAN), hash_pan(PAN)
    db.commit(); db.close()
    r = client.post("/household-members", json={"name": "Someone Else", "relationship": "self"}, headers=h)
    assert r.status_code == 409


# ------------------------------- 2026-10-01: name and PAN come from the CAS (QC/QD)

def test_unlock_with_statement_pan_needs_only_relationship(client):
    h = _headers(client, "+919100200001")
    _, mid = _add_locked(client, h)
    r = client.post(f"/household-members/{mid}/details", json={"relationship": "parent"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["pan_masked"] == "BX******8L" and r.json()["details_required"] is False
    db = _db(); m = db.get(HouseholdMember, uuid.UUID(mid))
    assert m.pan_lookup_hash == hash_pan(PAN) and m.pan_source == MemberPanSource.CAS and m.pan_verified_at is not None


def test_unlock_rejects_a_typed_pan_when_the_statement_has_one(client):
    h = _headers(client, "+919100200002")
    _, mid = _add_locked(client, h)
    r = client.post(f"/household-members/{mid}/details", json={"relationship": "parent", "pan": PAN}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"


def test_unlock_without_statement_pan_requires_a_typed_pan(client):
    h = _headers(client, "+919100200003")
    _, mid = _add_locked(client, h, detected=None)
    assert client.post(f"/household-members/{mid}/details", json={"relationship": "parent"}, headers=h).status_code == 422
    r = client.post(f"/household-members/{mid}/details", json={"relationship": "parent", "pan": "abcde1234f"}, headers=h)
    assert r.status_code == 200 and r.json()["pan_masked"] == "AB******4F"
    db = _db(); m = db.get(HouseholdMember, uuid.UUID(mid))
    assert m.pan_source == MemberPanSource.USER_ENTERED


def test_unlock_rejects_a_name(client):
    h = _headers(client, "+919100200004")
    _, mid = _add_locked(client, h)
    r = client.post(f"/household-members/{mid}/details", json={"relationship": "parent", "name": "New Name"}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"


def test_details_on_an_unlocked_member_is_422(client):
    h = _headers(client, "+919100200005")
    _, mid = _add_locked(client, h)
    client.post(f"/household-members/{mid}/details", json={"relationship": "parent"}, headers=h)
    r = client.post(f"/household-members/{mid}/details", json={"relationship": "sibling"}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"
