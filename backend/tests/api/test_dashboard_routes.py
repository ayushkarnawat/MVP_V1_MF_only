def _authed_headers(client, phone="+919999999999"):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    return {"Authorization": f"Bearer {token}"}


def test_household_members_requires_auth(client):
    response = client.get("/household-members")
    assert response.status_code == 401


def test_create_and_list_household_member(client):
    headers = _authed_headers(client)

    create_resp = client.post(
        "/household-members", json={"name": "Ayush", "relationship": "self"}, headers=headers
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["relationship"] == "self"

    list_resp = client.get("/household-members", headers=headers)
    assert list_resp.status_code == 200
    assert [m["name"] for m in list_resp.json()] == ["Ayush"]


def test_household_members_scoped_per_user(client):
    headers_a = _authed_headers(client, "+919999999999")
    headers_b = _authed_headers(client, "+919888888888")
    client.post("/household-members", json={"name": "Ayush", "relationship": "self"}, headers=headers_a)

    response = client.get("/household-members", headers=headers_b)

    assert response.json() == []


def test_create_household_member_rejects_second_self_row(client):
    headers = _authed_headers(client)
    me = client.post("/household-members", json={"name": "Ayush", "relationship": "self"}, headers=headers).json()
    # A PAN makes the self member permanent; a provisional self (no PAN) is renamed instead of rejected.
    import uuid
    from app.db.session import get_db
    from app.main import app
    from app.models.user import HouseholdMember
    from app.services.import_.crypto import encrypt_pan, hash_pan
    db = next(app.dependency_overrides[get_db]())
    row = db.get(HouseholdMember, uuid.UUID(me["id"]))
    row.pan_encrypted = encrypt_pan("ABCDE1234F")
    row.pan_lookup_hash = hash_pan("ABCDE1234F")
    db.commit()

    response = client.post(
        "/household-members", json={"name": "Ayush Again", "relationship": "self"}, headers=headers
    )

    assert response.status_code == 409


# ---- Task 5 (2026-10-01): PATCH /household-members/{id} -------------------

def _family(client, h):
    return client.post("/household-members", json={"name": "Meera Rao", "relationship": "parent"}, headers=h).json()


def test_patch_member_updates_relationship_phone_email(client):
    h = _authed_headers(client, "+919100300001")
    client.post("/household-members", json={"name": "Asha Rao", "relationship": "self"}, headers=h)
    m = _family(client, h)
    r = client.patch(f"/household-members/{m['id']}", json={"relationship": "sibling", "phone_number": "9876543210", "email": "meera@example.com"}, headers=h)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["relationship"] == "sibling" and b["phone_number"] == "+919876543210" and b["email"] == "meera@example.com"


def test_patch_member_rejects_name_and_pan(client):
    h = _authed_headers(client, "+919100300002")
    m = _family(client, h)
    for body in ({"name": "X"}, {"pan": "ABCDE1234F"}):
        r = client.patch(f"/household-members/{m['id']}", json=body, headers=h)
        assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"


def test_patch_self_rejects_relationship_and_contact(client):
    h = _authed_headers(client, "+919100300003")
    me = client.post("/household-members", json={"name": "Asha Rao", "relationship": "self"}, headers=h).json()
    assert client.patch(f"/household-members/{me['id']}", json={"relationship": "parent"}, headers=h).status_code == 422
    r = client.patch(f"/household-members/{me['id']}", json={"phone_number": "9876543210"}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"


def test_patch_member_clears_email_with_empty_string(client):
    h = _authed_headers(client, "+919100300004")
    m = _family(client, h)
    client.patch(f"/household-members/{m['id']}", json={"email": "a@b.co"}, headers=h)
    assert client.patch(f"/household-members/{m['id']}", json={"email": ""}, headers=h).json()["email"] is None


def test_patch_member_bad_phone_and_email_are_422(client):
    h = _authed_headers(client, "+919100300005")
    m = _family(client, h)
    assert client.patch(f"/household-members/{m['id']}", json={"phone_number": "12"}, headers=h).status_code == 422
    assert client.patch(f"/household-members/{m['id']}", json={"email": "not-an-email"}, headers=h).status_code == 422


def test_patch_relationship_self_is_422(client):
    h = _authed_headers(client, "+919100300009")
    m = _family(client, h)
    assert client.patch(f"/household-members/{m['id']}", json={"relationship": "self"}, headers=h).status_code == 422


def test_patch_other_users_member_is_404(client):
    a = _authed_headers(client, "+919100300006"); b = _authed_headers(client, "+919100300007")
    m = _family(client, a)
    assert client.patch(f"/household-members/{m['id']}", json={"relationship": "sibling"}, headers=b).status_code == 404


def test_detected_member_with_cas_pan_is_patchable_and_reports_profile_fields(client):
    import uuid
    from datetime import datetime, timezone
    from app.db.session import get_db
    from app.main import app
    from app.models.enums import MemberNameSource, MemberOrigin, MemberPanSource
    from app.models.user import HouseholdMember
    from app.services.import_.crypto import encrypt_pan, hash_pan
    h = _authed_headers(client, "+919100300010")
    me = client.post("/household-members", json={"name": "Asha Rao", "relationship": "self"}, headers=h).json()
    db = next(app.dependency_overrides[get_db]())
    uid = db.get(HouseholdMember, uuid.UUID(me["id"])).user_id
    detected = HouseholdMember(
        user_id=uid, name="Ramesh Sharma", relationship=None, created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
        pan_encrypted=encrypt_pan("ABCDE1234F"), pan_lookup_hash=hash_pan("ABCDE1234F"),
        pan_source=MemberPanSource.CAS,
    )
    db.add(detected)
    db.commit()
    mid = str(detected.id)
    row = next(m for m in client.get("/household-members", headers=h).json() if m["id"] == mid)
    assert row["pan_editable"] is False and row["profile_completion"] == 40
    assert row["missing_fields"] == ["relationship", "phone_number", "email"]
    assert row["name_from_statement"] is True and row["pan_conflict"] is None
    assert row["removed_with_last_import"] is True
    assert row["pan_masked"] is not None
    for gone in ("lock_reason", "details_required", "pan_on_statement"):
        assert gone not in row
    # No lock any more: a detected member is editable straight away.
    resp = client.patch(f"/household-members/{mid}", json={"relationship": "sibling"}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["profile_completion"] == 60
    assert resp.json()["removed_with_last_import"] is False


def test_member_response_has_statement_flags(client):
    h = _authed_headers(client, "+919100300008")
    m = _family(client, h)
    assert m["pan_editable"] is True and m["name_from_statement"] is False
    assert m["phone_number"] is None and m["email"] is None
