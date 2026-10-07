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


# ---- PUT /household-members/{id}/profile (replaces PATCH) -------------------

def _family(client, h):
    return client.post("/household-members", json={"name": "Meera Rao", "relationship": "parent"}, headers=h).json()


def test_put_profile_member_updates_relationship_phone_email(client):
    h = _authed_headers(client, "+919100300001")
    client.post("/household-members", json={"name": "Asha Rao", "relationship": "self"}, headers=h)
    m = _family(client, h)
    r = client.put(f"/household-members/{m['id']}/profile", json={"relationship": "sibling", "phone_number": "9876543210", "email": "meera@example.com", "pan": "ABCPS1234K"}, headers=h)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["relationship"] == "sibling" and b["phone_number"] == "+919876543210" and b["email"] == "meera@example.com"


def test_put_profile_member_edits_name_and_rejects_a_bad_one(client):
    h = _authed_headers(client, "+919100300002")
    m = _family(client, h)
    ok = client.put(f"/household-members/{m['id']}/profile", json={"name": "Meera K Rao", "pan": "ABCPS1234K"}, headers=h)
    assert ok.status_code == 200 and ok.json()["name"] == "Meera K Rao"
    bad = client.put(f"/household-members/{m['id']}/profile", json={"name": "R2D2"}, headers=h)
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "invalid_name"


def test_put_profile_self_rejects_relationship_and_contact(client):
    h = _authed_headers(client, "+919100300003")
    me = client.post("/household-members", json={"name": "Asha Rao", "relationship": "self"}, headers=h).json()
    assert client.put(f"/household-members/{me['id']}/profile", json={"relationship": "parent"}, headers=h).status_code == 422
    r = client.put(f"/household-members/{me['id']}/profile", json={"phone_number": "9876543210"}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"


def test_put_profile_member_clears_email_with_empty_string(client):
    h = _authed_headers(client, "+919100300004")
    m = _family(client, h)
    client.put(f"/household-members/{m['id']}/profile", json={"email": "a@b.co", "pan": "ABCPS1234K"}, headers=h)
    assert client.put(f"/household-members/{m['id']}/profile", json={"email": ""}, headers=h).json()["email"] is None


def test_put_profile_member_bad_phone_and_email_are_422(client):
    h = _authed_headers(client, "+919100300005")
    m = _family(client, h)
    assert client.put(f"/household-members/{m['id']}/profile", json={"phone_number": "12"}, headers=h).status_code == 422
    assert client.put(f"/household-members/{m['id']}/profile", json={"email": "not-an-email"}, headers=h).status_code == 422


def test_put_profile_relationship_self_is_422(client):
    h = _authed_headers(client, "+919100300009")
    m = _family(client, h)
    assert client.put(f"/household-members/{m['id']}/profile", json={"relationship": "self"}, headers=h).status_code == 422


def test_put_profile_other_users_member_is_404(client):
    a = _authed_headers(client, "+919100300006"); b = _authed_headers(client, "+919100300007")
    m = _family(client, a)
    assert client.put(f"/household-members/{m['id']}/profile", json={"relationship": "sibling"}, headers=b).status_code == 404


def test_detected_member_with_cas_pan_is_editable_and_reports_profile_fields(client):
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
    resp = client.put(f"/household-members/{mid}/profile", json={"relationship": "sibling"}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["profile_completion"] == 60
    assert resp.json()["removed_with_last_import"] is False


def test_member_response_has_statement_flags(client):
    h = _authed_headers(client, "+919100300008")
    m = _family(client, h)
    assert m["pan_editable"] is True and m["name_from_statement"] is False
    assert m["phone_number"] is None and m["email"] is None


def test_holdings_routes_return_realized_summary(client):
    headers = _authed_headers(client)
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    for path in [f"/household-members/{member['id']}/holdings", "/household/aggregate/holdings"]:
        response = client.get(path, headers=headers)
        assert response.status_code == 200
        assert response.json()["realized_summary"] == {"total": "0.00", "funds": []}


import pytest
from unittest.mock import AsyncMock

@pytest.fixture(autouse=True)
def snapshot_background_test_db(monkeypatch):
    from .import_helpers import _test_db
    monkeypatch.setattr("app.services.dashboard.snapshots.SessionLocal", _test_db)
    monkeypatch.setattr("app.services.dashboard.snapshots.warm_nav_history", AsyncMock())



def _calculation_folio(db, member, name, plan):
    import uuid
    from datetime import date,datetime,timezone
    from decimal import Decimal
    from app.models.enums import SchemePlanType,ImportStatus,TransactionType,PlanType
    from app.models.reference import Scheme
    from app.models.folio import Folio
    from app.models.imports import Import
    from app.models.transaction import Transaction
    from app.models.transaction_import import TransactionImport
    scheme = Scheme(id=uuid.uuid4(),amfi_code=uuid.uuid4().hex[:6],isin=uuid.uuid4().hex[:12],
                    name=name,amc_name="Test AMC",sebi_category="E",base_name="Test Fund",plan_type=SchemePlanType(plan))
    folio = Folio(id=uuid.uuid4(),household_member_id=member.id,scheme_id=scheme.id,
                  folio_number=uuid.uuid4().hex[:6],plan_type=PlanType(plan))
    imp = Import(id=uuid.uuid4(),household_member_id=member.id,status=ImportStatus.CONFIRMED,
                 uploaded_at=datetime.now(timezone.utc),statement_to_date=date(2026,10,5))
    db.add(scheme);db.flush()
    db.add_all([folio,imp]);db.flush()
    for occurrence in range(2):
        txn = Transaction(id=uuid.uuid4(),folio_id=folio.id,import_id=imp.id,type=TransactionType.PURCHASE_SIP,
                          date=date(2013,1,5),amount=Decimal("1000"),units=Decimal("10"),nav=Decimal("100"),occurrence=occurrence)
        db.add(txn);db.flush()
        db.add(TransactionImport(transaction_id=txn.id,transaction_date=txn.date,import_id=imp.id))
    db.commit()
    return scheme


def test_sip_routes_include_stopped_only_on_request_and_keep_twins(client):
    import uuid
    from app.models.user import HouseholdMember
    from .import_helpers import _test_db
    headers = _authed_headers(client)
    member = client.post("/household-members",json={"name":"Self","relationship":"self"},headers=headers).json()
    db = _test_db()
    _calculation_folio(db,db.get(HouseholdMember,uuid.UUID(member["id"])),"Test Direct","direct")
    for path, wrapped in [(f"/household-members/{member['id']}/sips",False),("/household/aggregate/sips",True)]:
        response = client.get(path,headers=headers)
        assert response.status_code == 200
        assert (response.json()["sips"] if wrapped else response.json()) == []
        response = client.get(path+"?include_stopped=true",headers=headers)
        assert response.status_code == 200
        [row] = response.json()["sips"] if wrapped else response.json()
        assert row["status"] == "stopped" and row["series_count"] == 2
    response = client.get(f"/household-members/{member['id']}/sips/monthly?year=2013&month=1",headers=headers)
    assert response.status_code == 200
    assert [r["instalment"] for r in response.json()] == [1,2]


def test_distributor_member_and_aggregate_expose_optional_plan_nav_and_saving(client,monkeypatch):
    import uuid
    from datetime import date
    from decimal import Decimal
    from app.models.user import HouseholdMember
    from app.models.reference import SchemeTer
    from .import_helpers import _test_db
    headers = _authed_headers(client)
    member = client.post("/household-members",json={"name":"Self","relationship":"self"},headers=headers).json()
    db = _test_db();owner = db.get(HouseholdMember,uuid.UUID(member["id"]))
    direct = _calculation_folio(db,owner,"Test Direct","direct")
    regular = _calculation_folio(db,owner,"Test Regular","regular")
    for scheme,ter in [(direct,"0.50"),(regular,"1.50")]:
        db.add(SchemeTer(scheme_id=scheme.id,reference_period=date(2026,9,1),ter_value=Decimal(ter)))
    db.commit()
    monkeypatch.setattr("app.services.dashboard.distributor_comparison.get_navs_on_or_before",AsyncMock(return_value={direct.id:(Decimal("20"),date.today()),regular.id:None}))
    for path,wrapped in [(f"/household-members/{member['id']}/distributor-comparison",False),("/household/aggregate/distributor-comparison",True)]:
        response = client.get(path,headers=headers)
        assert response.status_code == 200,response.text
        rows = response.json()["rows"] if wrapped else response.json()
        by_plan = {r["plan_type"]:r for r in rows}
        assert by_plan["regular"]["nav_unavailable_schemes"] == ["Test Regular"]
        assert by_plan["direct"]["schemes"][0]["annual_ter_saving"] == "1.00"
