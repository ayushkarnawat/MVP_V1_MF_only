"""Tasks 6/7 (CAS member detection): /imports/parse returns people[] plus the
upload-time prompt queue, and the resolve endpoints answer each prompt."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import pytest

from app.models.enums import (
    MemberLockReason,
    MemberOrigin,
    MemberPanSource,
    Relationship,
)
from app.models.user import HouseholdMember
from app.services.import_ import file_storage as file_storage_module
from app.services.import_.crypto import encrypt_pan, hash_pan
from app.services.import_.service import _preview_sessions

from .import_helpers import _authed_headers_and_member, _parse, _test_db, family_result

ADITI_PAN = "ABCDE1234K"
ARJUN_PAN = "ARJUN5432P"
RAMESH_TYPED = "BXQPS5678L"
RAMESH_STMT = "BXQPS9999M"
KIRAN_PAN = "DLKMN4321N"


@pytest.fixture(autouse=True)
def isolate_cas_file_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage_module.default_file_storage, "_base_dir", tmp_path)


# ---------------------------------------------------------------- helpers


def _user_id(member_id: str) -> uuid.UUID:
    db = _test_db()
    try:
        return db.get(HouseholdMember, uuid.UUID(member_id)).user_id
    finally:
        db.close()


def _member(member_id: str) -> HouseholdMember:
    db = _test_db()
    try:
        m = db.get(HouseholdMember, uuid.UUID(member_id))
        db.expunge(m)
        return m
    finally:
        db.close()


def _set_pan(member_id: str, pan: str, *, source: MemberPanSource = MemberPanSource.CAS, verified: bool = True):
    db = _test_db()
    try:
        m = db.get(HouseholdMember, uuid.UUID(member_id))
        m.pan_encrypted = encrypt_pan(pan)
        m.pan_lookup_hash = hash_pan(pan)
        m.pan_pending_until = None
        m.pan_source = source
        m.pan_verified_at = datetime.now(timezone.utc) if verified else None
        db.commit()
    finally:
        db.close()


def _add_member(user_id: uuid.UUID, name: str, *, locked: bool = False, detected_pan: str | None = None,
                relationship: Relationship | None = Relationship.PARENT) -> str:
    db = _test_db()
    try:
        kwargs = {}
        if locked:
            kwargs = dict(
                relationship=None, origin=MemberOrigin.CAS_DETECTED, details_completed_at=None,
                lock_reason=MemberLockReason.DETAILS_NEEDED,
            )
        else:
            kwargs = dict(relationship=relationship)
        if detected_pan:
            kwargs.update(detected_pan_encrypted=encrypt_pan(detected_pan), detected_pan_hash=hash_pan(detected_pan))
        m = HouseholdMember(id=uuid.uuid4(), user_id=user_id, name=name,
                            created_at=datetime.now(timezone.utc), **kwargs)
        db.add(m)
        db.commit()
        return str(m.id)
    finally:
        db.close()


def _aditi_family():
    return family_result([
        {"name": "ARJUN SHARMA", "pan": ARJUN_PAN},
        {"name": "ADITI SHARMA", "pan": ADITI_PAN, "funds": 2, "unclassified": 1},
        {"name": "SUNITA SHARMA", "pan": None},
    ], addressee="ARJUN SHARMA", unassigned=1)


def _detail(resp):
    return resp.json()["detail"]


# ------------------------------------------------------------------ Task 6


def test_parse_family_cas_returns_people_me_first(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000001", name="Aditi Sharma")
    resp = _parse(client, headers, self_id, _aditi_family(), tmp_path)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    people = body["people"]
    assert [p["person_key"] for p in people] == ["p2", "p1", "p3"]
    me = people[0]
    assert me["is_me"] is True and me["status"] == "me" and me["member_id"] == self_id
    assert me["pan_masked"] == "AB******4K"
    assert me["fund_count"] == 2 and me["unresolved_count"] == 1
    assert people[1]["pan_masked"] == "AR******2P" and people[1]["status"] == "new"
    assert people[1]["is_me"] is False and people[1]["member_id"] is None
    assert people[2]["pan_masked"] is None  # (PAN not on statement)
    assert len(body["unassigned_temp_ids"]) == 1
    by_person = {s["person_key"] for s in body["schemes"]}
    assert by_person == {"p1", "p2", "p3", None}
    assert body["name_notices"] == [] and body["same_person_prompts"] == []
    assert body["expires_at"]
    session = _preview_sessions[body["session_id"]]
    expected = session["created_at"] + timedelta(minutes=60)
    assert datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00")) == expected


def test_parse_response_never_contains_raw_pan(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000002", name="Aditi Sharma")
    result = family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": "RAMESH SHARMA", "pan": RAMESH_TYPED},
    ])
    resp = _parse(client, headers, self_id, result, tmp_path)

    assert resp.status_code == 200
    assert RAMESH_TYPED not in resp.text and ADITI_PAN not in resp.text


def test_parse_first_upload_name_mismatch_is_409_and_keeps_session(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000003", name="Ayush Karnawat")
    result = family_result([{"name": "ROHAN MEHTA", "pan": ADITI_PAN}])
    resp = _parse(client, headers, self_id, result, tmp_path)

    assert resp.status_code == 409
    detail = _detail(resp)
    assert detail["code"] == "self_name_mismatch"
    assert detail["message"] == "This statement is in a different name"
    assert detail["details"] == {"entered_name": "Ayush Karnawat", "statement_name": "ROHAN MEHTA"}
    # F9: checked on the session store itself (discard 204s for unknown ids too).
    assert detail["session_id"] in _preview_sessions


def test_parse_u2_statement_name_is_the_addressee_person(client, tmp_path):
    # F29: in a multi-person file, U2 names the person matching the addressee.
    headers, self_id = _authed_headers_and_member(client, "+919800000013", name="Ayush Karnawat")
    result = family_result([
        {"name": "ROHAN MEHTA", "pan": ADITI_PAN},
        {"name": "PRIYA MEHTA", "pan": ARJUN_PAN},
    ], addressee="PRIYA MEHTA")
    resp = _parse(client, headers, self_id, result, tmp_path)

    assert _detail(resp)["details"]["statement_name"] == "PRIYA MEHTA"


def test_parse_first_upload_variant_returns_update_notice(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000004", name="Ayush Karnawat")
    result = family_result([{"name": "AYUSH KUMAR KARNAWAT", "pan": ADITI_PAN}])
    resp = _parse(client, headers, self_id, result, tmp_path)

    assert resp.status_code == 200, resp.text
    notice = resp.json()["name_notices"][0]
    assert notice == {
        "person_key": "p1", "member_id": self_id, "current_name": "Ayush Karnawat",
        "statement_name": "AYUSH KUMAR KARNAWAT", "kind": "update", "first_upload": True,
    }


def test_parse_ambiguous_self_is_409_which_is_self(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000005", name="A Sharma")
    result = family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": "ARJUN SHARMA", "pan": ARJUN_PAN},
    ])
    resp = _parse(client, headers, self_id, result, tmp_path)

    assert resp.status_code == 409
    detail = _detail(resp)
    assert detail["code"] == "which_is_self"
    assert detail["message"] == "Which one is you?"
    assert detail["details"] == {"candidates": [
        {"person_key": "p1", "name": "ADITI SHARMA", "pan_masked": "AB******4K"},
        {"person_key": "p2", "name": "ARJUN SHARMA", "pan_masked": "AR******2P"},
    ]}
    assert detail["session_id"] in _preview_sessions


def test_parse_for_locked_member_is_rejected(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000006", name="Aditi Sharma")
    locked_id = _add_member(_user_id(self_id), "RAMESH SHARMA", locked=True, detected_pan=RAMESH_STMT)
    before = set(_preview_sessions)

    resp = _parse(client, headers, locked_id, family_result([{"name": "RAMESH SHARMA", "pan": RAMESH_STMT}]), tmp_path)

    assert resp.status_code == 409
    detail = _detail(resp)
    assert detail["code"] == "member_details_required"
    assert detail["session_id"] is None
    assert set(_preview_sessions) == before  # I5: session dropped


def test_parse_member_not_in_file(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000007", name="Aditi Sharma")
    _set_pan(self_id, ADITI_PAN)
    mom_id = _add_member(_user_id(self_id), "Sunita Sharma")
    _set_pan(mom_id, KIRAN_PAN)  # verified from an earlier statement

    resp = _parse(client, headers, mom_id, family_result([{"name": "ADITI SHARMA", "pan": ADITI_PAN}]), tmp_path)

    assert resp.status_code == 409
    detail = _detail(resp)
    assert detail["code"] == "member_not_in_file"
    assert detail["message"] == "Sunita Sharma isn’t in this statement"
    assert detail["details"] == {
        "member_name": "Sunita Sharma", "member_pan_masked": "DL******1N", "people": ["ADITI SHARMA"],
    }
    assert detail["session_id"] in _preview_sessions


def _ramesh_typed(client, phone):
    headers, self_id = _authed_headers_and_member(client, phone, name="Aditi Sharma")
    _set_pan(self_id, ADITI_PAN)
    ramesh_id = _add_member(_user_id(self_id), "Ramesh Sharma")
    _set_pan(ramesh_id, RAMESH_TYPED, source=MemberPanSource.USER_ENTERED, verified=False)
    return headers, self_id, ramesh_id


def test_parse_member_pan_mismatch_for_unverified_typed_pan(client, tmp_path):
    headers, _, ramesh_id = _ramesh_typed(client, "+919800000008")
    result = family_result([{"name": "RAMESH SHARMA", "pan": RAMESH_STMT}])

    resp = _parse(client, headers, ramesh_id, result, tmp_path)

    assert resp.status_code == 409
    detail = _detail(resp)
    assert detail["code"] == "member_pan_mismatch"
    assert detail["message"] == "This PAN doesn’t match what you entered"
    assert detail["details"] == {
        "member_name": "Ramesh Sharma", "entered_pan_masked": "BX******8L", "statement_pan_masked": "BX******9M",
    }
    assert RAMESH_TYPED not in resp.text and RAMESH_STMT not in resp.text


def test_parse_locked_member_only(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000009", name="Aditi Sharma")
    locked_id = _add_member(_user_id(self_id), "RAMESH SHARMA", locked=True, detected_pan=RAMESH_STMT)

    resp = _parse(client, headers, self_id, family_result([{"name": "RAMESH SHARMA", "pan": RAMESH_STMT}]), tmp_path)

    assert resp.status_code == 409
    detail = _detail(resp)
    assert detail["code"] == "locked_member_only"
    assert detail["message"] == "Add RAMESH SHARMA’s details first"
    assert detail["details"] == {"member_id": locked_id, "member_name": "RAMESH SHARMA"}
    assert detail["session_id"] in _preview_sessions


def test_parse_whole_file_other_account(client, tmp_path):
    headers_b, kiran_self = _authed_headers_and_member(client, "+919800000010", name="Kiran Sharma")
    _set_pan(kiran_self, KIRAN_PAN)
    headers, self_id = _authed_headers_and_member(client, "+919800000011", name="Aditi Sharma")

    resp = _parse(client, headers, self_id, family_result([{"name": "KIRAN SHARMA", "pan": KIRAN_PAN}]), tmp_path)

    assert resp.status_code == 409
    detail = _detail(resp)
    assert detail["code"] == "cross_account_pan_blocked"
    assert detail["message"] == "This statement belongs to another Unifolio account"
    assert detail["details"] == {"people": ["KIRAN SHARMA"]}
    assert detail["session_id"] in _preview_sessions
    assert kiran_self not in resp.text


def test_parse_self_pan_on_other_account_keeps_todays_block(client, tmp_path):
    # F30: Me found by name, but Me's PAN is another account's -> today's 409,
    # session dropped (no "Include in family total" for yourself).
    _, other_self = _authed_headers_and_member(client, "+919800000014", name="Aditi Sharma")
    _set_pan(other_self, ADITI_PAN)
    headers, self_id = _authed_headers_and_member(client, "+919800000015", name="Aditi Sharma")
    before = set(_preview_sessions)

    resp = _parse(client, headers, self_id, family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN}, {"name": "ARJUN SHARMA", "pan": ARJUN_PAN},
    ]), tmp_path)

    assert resp.status_code == 409
    assert _detail(resp)["code"] == "cross_account_pan_blocked"
    assert set(_preview_sessions) == before
    assert _member(self_id).pan_lookup_hash is None


def test_parse_claims_self_pan_only_after_prompts_clear(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000012", name="Ayush Karnawat")
    resp = _parse(client, headers, self_id, family_result([{"name": "ROHAN MEHTA", "pan": ADITI_PAN}]), tmp_path)
    assert resp.status_code == 409
    assert _member(self_id).pan_lookup_hash is None  # nothing claimed while U2 is open

    headers2, self2 = _authed_headers_and_member(client, "+919800000016", name="Aditi Sharma")
    ok = _parse(client, headers2, self2, family_result([{"name": "ADITI SHARMA", "pan": ARJUN_PAN}]), tmp_path)
    assert ok.status_code == 200
    me = _member(self2)
    assert me.pan_lookup_hash == hash_pan(ARJUN_PAN) and me.pan_pending_until is not None
    assert _preview_sessions[ok.json()["session_id"]]["pending_claims"] == [(uuid.UUID(self2), ARJUN_PAN)]


def test_parse_same_person_prompt_listed(client, tmp_path):
    headers, self_id, ramesh_id = _ramesh_typed(client, "+919800000017")
    result = family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": "RAMESH SHARMA", "pan": RAMESH_STMT},
    ])

    resp = _parse(client, headers, self_id, result, tmp_path)

    assert resp.status_code == 200, resp.text
    assert resp.json()["same_person_prompts"] == [{
        "person_key": "p2", "member_id": ramesh_id, "member_name": "Ramesh Sharma",
        "entered_pan_masked": "BX******8L", "statement_pan_masked": "BX******9M",
        "kind": "typed_pan", "member_fund_count": 0, "statement_name": "RAMESH SHARMA",
    }]


# ------------------------------------------------------------------ Task 7

EXPIRED = {"code": "session_expired", "message": "This review has expired"}


def _post(client, headers, sid, action, body=None):
    return client.post(f"/imports/sessions/{sid}/{action}", json=body or {}, headers=headers)


def _u2_session(client, tmp_path, phone):
    headers, self_id = _authed_headers_and_member(client, phone, name="Ayush Karnawat")
    resp = _parse(client, headers, self_id, family_result([{"name": "ROHAN MEHTA", "pan": ADITI_PAN}]), tmp_path)
    assert resp.status_code == 409
    return headers, self_id, _detail(resp)["session_id"]


def test_resolve_name_renames_self_logs_change_and_returns_preview(client, tmp_path):
    from app.models.enums import MemberNameSource, NameChangeReason
    from app.models.member_history import HouseholdMemberNameChange

    headers, self_id, sid = _u2_session(client, tmp_path, "+919800000101")

    resp = _post(client, headers, sid, "resolve-name", {"name": "Rohan Mehta"})

    assert resp.status_code == 200, resp.text
    me = resp.json()["people"][0]
    assert me["is_me"] is True and me["member_id"] == self_id
    member = _member(self_id)
    assert member.name == "Rohan Mehta"
    assert member.name_source == MemberNameSource.CAS and member.name_updated_at is not None
    assert member.pan_lookup_hash == hash_pan(ADITI_PAN) and member.pan_pending_until is not None
    db = _test_db()
    try:
        change = db.query(HouseholdMemberNameChange).one()
        assert (change.old_name, change.new_name, change.reason) == (
            "Ayush Karnawat", "Rohan Mehta", NameChangeReason.USER_CORRECTED_TO_CAS,
        )
    finally:
        db.close()


def test_resolve_name_rejects_a_name_not_on_the_statement(client, tmp_path):
    headers, self_id, sid = _u2_session(client, tmp_path, "+919800000102")

    resp = _post(client, headers, sid, "resolve-name", {"name": "Ayush Karnawat"})
    assert resp.status_code == 422
    assert _detail(resp) == {"code": "name_not_on_statement", "message": "This name doesn’t match the statement"}

    bad = _post(client, headers, sid, "resolve-name", {"name": "R0han"})
    assert bad.status_code == 422 and _detail(bad)["code"] == "invalid_name"
    assert _member(self_id).name == "Ayush Karnawat"
    assert sid in _preview_sessions


def _u3_session(client, tmp_path, phone):
    headers, self_id = _authed_headers_and_member(client, phone, name="A Sharma")
    resp = _parse(client, headers, self_id, family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN}, {"name": "ARJUN SHARMA", "pan": ARJUN_PAN},
    ]), tmp_path)
    assert _detail(resp)["code"] == "which_is_self"
    return headers, self_id, _detail(resp)["session_id"]


def test_resolve_self_picks_candidate_and_claims_pan(client, tmp_path):
    headers, self_id, sid = _u3_session(client, tmp_path, "+919800000103")

    resp = _post(client, headers, sid, "resolve-self", {"person_key": "p2"})

    assert resp.status_code == 200, resp.text
    people = resp.json()["people"]
    assert people[0]["person_key"] == "p2" and people[0]["is_me"] is True
    assert _member(self_id).pan_lookup_hash == hash_pan(ARJUN_PAN)
    assert _preview_sessions[sid]["pending_claims"] == [(uuid.UUID(self_id), ARJUN_PAN)]

    unknown = _post(client, headers, sid, "resolve-self", {"person_key": "p9"})
    assert unknown.status_code == 200  # U3 already answered: returns the preview again


def test_resolve_self_rejects_a_person_not_offered(client, tmp_path):
    headers, _, sid = _u3_session(client, tmp_path, "+919800000113")
    resp = _post(client, headers, sid, "resolve-self", {"person_key": "p9"})
    assert resp.status_code == 422 and _detail(resp)["code"] == "invalid_choice"


def test_resolve_self_none_of_these_goes_to_u2(client, tmp_path):
    headers, self_id, sid = _u3_session(client, tmp_path, "+919800000104")

    resp = _post(client, headers, sid, "resolve-self", {"person_key": None})

    assert resp.status_code == 409
    detail = _detail(resp)
    assert detail["code"] == "self_name_mismatch" and detail["session_id"] == sid
    assert detail["details"]["entered_name"] == "A Sharma"
    assert _member(self_id).pan_lookup_hash is None


def _u4_session(client, tmp_path, phone, persons=None):
    headers, self_id, ramesh_id = _ramesh_typed(client, phone)
    result = family_result(persons or [{"name": "RAMESH SHARMA", "pan": RAMESH_STMT}])
    resp = _parse(client, headers, ramesh_id, result, tmp_path)
    assert _detail(resp)["code"] == "member_pan_mismatch"
    return headers, self_id, ramesh_id, _detail(resp)["session_id"]


def test_resolve_pan_switches_claim(client, tmp_path):
    headers, _, ramesh_id, sid = _u4_session(client, tmp_path, "+919800000105")

    resp = _post(client, headers, sid, "resolve-pan", {"choice": "statement"})

    assert resp.status_code == 200, resp.text
    person = resp.json()["people"][0]
    assert person["status"] == "existing_member" and person["member_id"] == ramesh_id
    ramesh = _member(ramesh_id)
    assert ramesh.pan_lookup_hash == hash_pan(RAMESH_STMT) and ramesh.pan_pending_until is not None
    assert ramesh.pan_source == MemberPanSource.USER_ENTERED  # permanent only at confirm

    confirm = client.post("/imports/confirm", json={
        "session_id": sid, "household_member_id": ramesh_id, "scheme_confirmations": [],
    }, headers=headers)
    assert confirm.status_code == 200, confirm.text
    ramesh = _member(ramesh_id)
    assert ramesh.pan_lookup_hash == hash_pan(RAMESH_STMT) and ramesh.pan_pending_until is None
    assert ramesh.pan_source == MemberPanSource.CAS and ramesh.pan_verified_at is not None


def test_resolve_pan_other_account_is_u12_and_member_unchanged(client, tmp_path):
    _, other_self = _authed_headers_and_member(client, "+919800000106", name="Someone Else")
    _set_pan(other_self, RAMESH_STMT)
    headers, _, ramesh_id, sid = _u4_session(client, tmp_path, "+919800000107")

    resp = _post(client, headers, sid, "resolve-pan", {"choice": "statement"})

    assert resp.status_code == 409
    detail = _detail(resp)
    assert detail["code"] == "statement_pan_on_other_account"
    assert detail["message"] == "We can’t switch Ramesh Sharma to this PAN"
    assert detail["details"] == {
        "member_name": "Ramesh Sharma", "entered_pan_masked": "BX******8L", "statement_pan_masked": "BX******9M",
    }
    ramesh = _member(ramesh_id)
    assert ramesh.details_completed_at is not None
    assert ramesh.pan_lookup_hash == hash_pan(RAMESH_TYPED) and ramesh.pan_pending_until is None
    assert other_self not in resp.text


def _u13_session(client, tmp_path, phone):
    headers, self_id, ramesh_id = _ramesh_typed(client, phone)
    resp = _parse(client, headers, self_id, family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN}, {"name": "RAMESH SHARMA", "pan": RAMESH_STMT},
    ]), tmp_path)
    assert resp.json()["same_person_prompts"]
    return headers, ramesh_id, resp.json()["session_id"]


def test_resolve_same_person_true_maps_person_to_member(client, tmp_path):
    headers, ramesh_id, sid = _u13_session(client, tmp_path, "+919800000108")

    resp = _post(client, headers, sid, "resolve-same-person",
                 {"person_key": "p2", "member_id": ramesh_id, "same": True})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["same_person_prompts"] == []
    p2 = next(p for p in body["people"] if p["person_key"] == "p2")
    assert p2["status"] == "existing_member" and p2["member_id"] == ramesh_id
    assert _member(ramesh_id).pan_lookup_hash == hash_pan(RAMESH_STMT)


def test_resolve_same_person_false_leaves_them_new(client, tmp_path):
    headers, ramesh_id, sid = _u13_session(client, tmp_path, "+919800000109")

    resp = _post(client, headers, sid, "resolve-same-person",
                 {"person_key": "p2", "member_id": ramesh_id, "same": False})

    assert resp.status_code == 200
    p2 = next(p for p in resp.json()["people"] if p["person_key"] == "p2")
    assert p2["status"] == "new" and resp.json()["same_person_prompts"] == []
    assert _member(ramesh_id).pan_lookup_hash == hash_pan(RAMESH_TYPED)


def test_resolve_same_person_other_account_is_u12(client, tmp_path):
    headers, ramesh_id, sid = _u13_session(client, tmp_path, "+919800000110")
    # Another account takes the statement PAN after the parse.
    _, other_self = _authed_headers_and_member(client, "+919800000111", name="Someone Else")
    _set_pan(other_self, RAMESH_STMT)

    resp = _post(client, headers, sid, "resolve-same-person",
                 {"person_key": "p2", "member_id": ramesh_id, "same": True})

    assert resp.status_code == 409 and _detail(resp)["code"] == "statement_pan_on_other_account"
    assert _member(ramesh_id).pan_lookup_hash == hash_pan(RAMESH_TYPED)


def test_acknowledge_member_not_in_file_returns_preview(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000112", name="Aditi Sharma")
    _set_pan(self_id, ADITI_PAN)
    mom_id = _add_member(_user_id(self_id), "Sunita Sharma")
    _set_pan(mom_id, KIRAN_PAN)
    sid = _detail(_parse(client, headers, mom_id,
                         family_result([{"name": "ADITI SHARMA", "pan": ADITI_PAN}]), tmp_path))["session_id"]

    resp = _post(client, headers, sid, "acknowledge", {"code": "member_not_in_file"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["people"][0]["is_me"] is True


def test_acknowledge_locked_member_only_after_unlock_continues(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000114", name="Aditi Sharma")
    _set_pan(self_id, ADITI_PAN)
    locked_id = _add_member(_user_id(self_id), "RAMESH SHARMA", locked=True, detected_pan=RAMESH_STMT)
    resp = _parse(client, headers, self_id, family_result([{"name": "RAMESH SHARMA", "pan": RAMESH_STMT}]), tmp_path)
    assert _detail(resp)["code"] == "member_not_in_file"  # Add data for self; Me isn't in it
    sid = _detail(resp)["session_id"]
    u6 = _post(client, headers, sid, "acknowledge", {"code": "member_not_in_file"})
    assert _detail(u6)["code"] == "locked_member_only"

    still = _post(client, headers, sid, "acknowledge", {"code": "locked_member_only"})
    assert still.status_code == 409 and _detail(still)["code"] == "locked_member_only"

    db = _test_db()  # the unlock write (Task 11's /details), done directly here
    try:
        m = db.get(HouseholdMember, uuid.UUID(locked_id))
        m.relationship = Relationship.PARENT
        m.details_completed_at = datetime.now(timezone.utc)
        m.lock_reason = None
        m.pan_encrypted, m.pan_lookup_hash = encrypt_pan(RAMESH_STMT), hash_pan(RAMESH_STMT)
        m.detected_pan_encrypted = m.detected_pan_hash = None
        db.commit()
    finally:
        db.close()

    resp = _post(client, headers, sid, "acknowledge", {"code": "locked_member_only"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["people"][0]["member_id"] == locked_id


def test_session_routes_return_410_when_expired(client, tmp_path):
    headers, _, ramesh_id, sid = _u4_session(client, tmp_path, "+919800000115")
    assert _post(client, headers, sid, "resolve-pan", {"choice": "statement"}).status_code == 200
    _preview_sessions[sid]["created_at"] -= timedelta(minutes=61)

    for action, body in [
        ("resolve-name", {"name": "Ramesh Sharma"}),
        ("resolve-self", {"person_key": None}),
        ("resolve-pan", {"choice": "statement"}),
        ("resolve-same-person", {"person_key": "p1", "member_id": ramesh_id, "same": False}),
        ("acknowledge", {"code": "member_not_in_file"}),
    ]:
        resp = _post(client, headers, sid, action, body)
        assert resp.status_code == 410, action
        assert _detail(resp) == EXPIRED
    confirm = client.post("/imports/confirm", json={
        "session_id": sid, "household_member_id": ramesh_id, "scheme_confirmations": [],
    }, headers=headers)
    assert confirm.status_code == 410 and _detail(confirm) == EXPIRED
    assert _post(client, headers, "no-such-session", "resolve-pan", {"choice": "statement"}).status_code == 410
    # The expiry sweep put Ramesh's typed PAN back (F6).
    ramesh = _member(ramesh_id)
    assert ramesh.pan_lookup_hash == hash_pan(RAMESH_TYPED) and ramesh.pan_pending_until is None


def test_discard_releases_all_pending_claims(client, tmp_path):
    headers, self_id = _authed_headers_and_member(client, "+919800000116", name="Aditi Sharma")
    ramesh_id = _add_member(_user_id(self_id), "Ramesh Sharma")
    _set_pan(ramesh_id, RAMESH_TYPED, source=MemberPanSource.USER_ENTERED, verified=False)
    resp = _parse(client, headers, ramesh_id, family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN}, {"name": "RAMESH SHARMA", "pan": RAMESH_STMT},
    ]), tmp_path)
    sid = _detail(resp)["session_id"]
    ok = _post(client, headers, sid, "resolve-pan", {"choice": "statement"})
    assert ok.status_code == 200, ok.text
    assert len(_preview_sessions[sid]["pending_claims"]) == 2  # Ramesh's switch + Me
    assert _member(self_id).pan_lookup_hash == hash_pan(ADITI_PAN)

    assert _post(client, headers, sid, "discard").status_code == 204

    assert sid not in _preview_sessions
    assert _member(self_id).pan_lookup_hash is None
    ramesh = _member(ramesh_id)
    assert ramesh.pan_lookup_hash == hash_pan(RAMESH_TYPED) and ramesh.pan_pending_until is None
    assert ramesh.pan_source == MemberPanSource.USER_ENTERED and ramesh.pan_verified_at is None


# ------------------------------------------------------------------ Task 9


def _family_session(client, tmp_path, phone):
    headers, self_id = _authed_headers_and_member(client, phone, name="Aditi Sharma")
    resp = _parse(client, headers, self_id, family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": "RAMESH SHARMA", "pan": RAMESH_STMT},
    ], addressee="ADITI SHARMA"), tmp_path)
    assert resp.status_code == 200, resp.text
    return headers, self_id, resp.json()["session_id"]


def test_confirm_route_people_body_imports_family_and_second_press_is_410(client, tmp_path):
    headers, self_id, sid = _family_session(client, tmp_path, "+919800000201")
    body = {"session_id": sid, "people": [{"person_key": "p1"}, {"person_key": "p2"}]}

    resp = client.post("/imports/confirm", json=body, headers=headers)

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert [p["person_key"] for p in data["people"]] == ["p1", "p2"]
    assert data["people"][0]["member_id"] == self_id
    assert data["upload_group_id"]
    assert ADITI_PAN not in resp.text and RAMESH_STMT not in resp.text

    again = client.post("/imports/confirm", json=body, headers=headers)
    assert again.status_code == 410 and _detail(again) == EXPIRED


def test_confirm_route_unknown_person_is_422_confirm_invalid(client, tmp_path):
    headers, _, sid = _family_session(client, tmp_path, "+919800000202")

    resp = client.post("/imports/confirm", json={
        "session_id": sid, "people": [{"person_key": "p1"}, {"person_key": "p2"}, {"person_key": "p7"}],
    }, headers=headers)

    assert resp.status_code == 422
    assert _detail(resp)["code"] == "confirm_invalid"
    assert sid in _preview_sessions


def test_confirm_route_old_body_on_family_file_is_422_confirm_invalid(client, tmp_path):
    headers, self_id, sid = _family_session(client, tmp_path, "+919800000203")

    resp = client.post("/imports/confirm", json={
        "session_id": sid, "household_member_id": self_id, "scheme_confirmations": [],
    }, headers=headers)

    assert resp.status_code == 422
    assert _detail(resp)["code"] == "confirm_invalid"


def test_confirm_route_prefetches_nav_for_every_imported_member(client, tmp_path):
    from unittest.mock import patch

    headers, self_id, sid = _family_session(client, tmp_path, "+919800000204")
    with patch("app.api.imports._prefetch_member_nav_history") as prefetch:
        resp = client.post("/imports/confirm", json={
            "session_id": sid, "people": [{"person_key": "p1"}, {"person_key": "p2"}],
        }, headers=headers)

    assert resp.status_code == 200, resp.text
    prefetched = {str(call.args[0]) for call in prefetch.call_args_list}
    assert prefetched == {p["member_id"] for p in resp.json()["people"]}


def test_household_members_lists_locked_detected_member_with_null_relationship(client, tmp_path):
    # F10: detected members have relationship NULL until unlocked (T11).
    headers, _, sid = _family_session(client, tmp_path, "+919800000205")
    assert client.post("/imports/confirm", json={
        "session_id": sid, "people": [{"person_key": "p1"}, {"person_key": "p2"}],
    }, headers=headers).status_code == 200

    resp = client.get("/household-members", headers=headers)

    assert resp.status_code == 200, resp.text
    ramesh = next(m for m in resp.json() if m["name"] == "RAMESH SHARMA")
    assert ramesh["relationship"] is None


# --------------------------------- real-fixture family replay (staging-QA fix 5)

# The synthetic family CAS PDFs (Docs/orchestration/qa-fixtures/synthetic-cas,
# untracked). UNIFOLIO_QA_FIXTURES points elsewhere; without the files these
# replay tests skip rather than fail.
FIX = Path(os.environ.get(
    "UNIFOLIO_QA_FIXTURES",
    Path(__file__).resolve().parents[3] / "Docs/orchestration/qa-fixtures/synthetic-cas",
))
needs_fixtures = pytest.mark.skipif(
    not (FIX / "family_cas_1.pdf").exists(), reason="synthetic family CAS fixtures not on disk"
)


def _parse_real(client, h, member_id, fname, tmp_path):
    from app.services.import_.enrich import mfapi_client

    async def fake(_self, url):
        if url.endswith("/latest"):
            return {"meta": {"scheme_category": "Equity Scheme - Flexi Cap Fund"}}
        return []

    with (
        patch("app.services.import_.enrich.MfApiClient._get_json", new=fake),
        patch.object(mfapi_client, "cache_dir", tmp_path),
        patch.object(mfapi_client, "_schemes", None),
    ):
        return client.post(
            "/imports/parse",
            files={"file": (fname, (FIX / fname).read_bytes(), "application/pdf")},
            data={"password": "MF@123", "household_member_id": member_id},
            headers=h,
        )


def _answer_same_person(client, h, prev, same=True):
    for sp in prev.get("same_person_prompts", []):
        r = client.post(f"/imports/sessions/{prev['session_id']}/resolve-same-person",
                        json={"person_key": sp["person_key"], "member_id": sp["member_id"], "same": same},
                        headers=h)
        assert r.status_code == 200, r.text
        prev = r.json()
    return prev


def _confirm_all(client, h, prev):
    confs = []
    for s in prev["schemes"]:
        c = {"temp_id": s["temp_id"]}
        if s["match_status"] != "confirmed":
            c["amfi_code"] = "125497"
        if s["plan_type"] == "unclassified":
            c["plan_type"] = "direct"
        confs.append(c)
    people = [
        {"person_key": p["person_key"],
         "scheme_confirmations": [c for c in confs if any(
             s["temp_id"] == c["temp_id"] and s["person_key"] == p["person_key"] for s in prev["schemes"])],
         **({"include": True} if p["status"] == "other_account" else {})}
        for p in prev["people"]
    ]
    moved = {s["temp_id"]: prev["people"][0]["person_key"] for s in prev["schemes"] if s["person_key"] is None}
    r = client.post("/imports/confirm",
                    json={"session_id": prev["session_id"], "people": people, "moved_funds": moved}, headers=h)
    assert r.status_code == 200, r.text


def _kavitas(user_id):
    db = _test_db()
    return db.query(HouseholdMember).filter_by(user_id=user_id, name="Kavita Shanbhag").count()


@needs_fixtures
def test_kavita_is_never_duplicated_across_family_uploads(client, tmp_path):
    """The user's staging sequence: file 1, unlock Rohan, then Add data for
    Rohan with file 2, file 1, file 2. Kavita has no PAN in file 1 and a PAN
    in file 2; she must stay one member throughout."""
    h, me_id = _authed_headers_and_member(client, "+919811300001", name="Aditi Shanbhag")
    uid = _user_id(me_id)
    first = _parse_real(client, h, me_id, "family_cas_1.pdf", tmp_path)
    assert first.status_code == 200, first.text
    _confirm_all(client, h, first.json())
    assert _kavitas(uid) == 1
    db = _test_db()
    rohan = db.query(HouseholdMember).filter_by(user_id=uid, name="Rohan Shanbhag").one()
    unlock = client.post(f"/household-members/{rohan.id}/details",
                         json={"relationship": "parent", "pan": "BNZPS5678L"}, headers=h)
    assert unlock.status_code == 200, unlock.text
    for fname in ("family_cas_2.pdf", "family_cas_1.pdf", "family_cas_2.pdf"):
        r = _parse_real(client, h, str(rohan.id), fname, tmp_path)
        assert r.status_code == 200, r.text
        _confirm_all(client, h, _answer_same_person(client, h, r.json()))
        assert _kavitas(uid) == 1, fname


@needs_fixtures
def test_file_1_reupload_does_not_duplicate_the_name_only_member(client, tmp_path):
    """Cause A alone: re-uploading the PAN-less statement attaches Kavita by exact name."""
    h, me_id = _authed_headers_and_member(client, "+919811300004", name="Aditi Shanbhag")
    uid = _user_id(me_id)
    _confirm_all(client, h, _parse_real(client, h, me_id, "family_cas_1.pdf", tmp_path).json())
    prev = _parse_real(client, h, me_id, "family_cas_1.pdf", tmp_path).json()
    kav = next(p for p in prev["people"] if p["name"] == "Kavita Shanbhag")
    assert kav["status"] == "locked_member"
    assert kav["matched_by_name_temp_ids"]  # tagged in the ribbon (FR-4)
    _confirm_all(client, h, prev)
    assert _kavitas(uid) == 1


@needs_fixtures
def test_name_only_same_person_prompt_and_yes_links_detected_pan(client, tmp_path):
    h, me_id = _authed_headers_and_member(client, "+919811300002", name="Aditi Shanbhag")
    uid = _user_id(me_id)
    _confirm_all(client, h, _parse_real(client, h, me_id, "family_cas_1.pdf", tmp_path).json())
    prev = _parse_real(client, h, me_id, "family_cas_2.pdf", tmp_path).json()
    [sp] = [p for p in prev["same_person_prompts"] if p["kind"] == "name_only"]
    assert sp["member_name"] == "Kavita Shanbhag" and sp["entered_pan_masked"] == ""
    assert sp["member_fund_count"] == 1 and sp["statement_name"] == "Kavita Shanbhag"
    prev = _answer_same_person(client, h, prev, same=True)
    assert prev["same_person_prompts"] == []
    _confirm_all(client, h, prev)
    db = _test_db()
    [k] = db.query(HouseholdMember).filter_by(user_id=uid, name="Kavita Shanbhag").all()
    assert k.detected_pan_hash == hash_pan("BNZPK4321M") and k.is_locked


@needs_fixtures
def test_name_only_same_person_no_creates_a_new_member(client, tmp_path):
    h, me_id = _authed_headers_and_member(client, "+919811300003", name="Aditi Shanbhag")
    uid = _user_id(me_id)
    _confirm_all(client, h, _parse_real(client, h, me_id, "family_cas_1.pdf", tmp_path).json())
    prev = _answer_same_person(
        client, h, _parse_real(client, h, me_id, "family_cas_2.pdf", tmp_path).json(), same=False
    )
    _confirm_all(client, h, prev)
    db = _test_db()
    assert db.query(HouseholdMember).filter_by(user_id=uid, name="Kavita Shanbhag").count() == 2


# ------------------------ final-review fixes (synthetic, no fixture PDFs needed)

KAVITA_PAN = "BNZPK4321M"


def _family_with_kavita(kavita_pan):
    return family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": "KAVITA SHARMA", "pan": kavita_pan},
    ])


def _confirm_raw(client, h, prev):
    people = [{"person_key": p["person_key"], "scheme_confirmations": []} for p in prev["people"]]
    return client.post("/imports/confirm", json={"session_id": prev["session_id"], "people": people}, headers=h)


def _kavita_rows(uid):
    db = _test_db()
    return db.query(HouseholdMember).filter_by(user_id=uid, name="Kavita Sharma").all()


def test_5b_locked_name_only_member_yes_links_detected_pan(client, tmp_path):
    h, me_id = _authed_headers_and_member(client, "+919811500001", name="Aditi Sharma")
    _set_pan(me_id, ADITI_PAN)
    uid = _user_id(me_id)
    kavita_id = _add_member(uid, "Kavita Sharma", locked=True)
    prev = _parse(client, h, me_id, _family_with_kavita(KAVITA_PAN), tmp_path).json()
    [sp] = prev["same_person_prompts"]
    assert (sp["kind"], sp["member_id"], sp["entered_pan_masked"]) == ("name_only", kavita_id, "")
    prev = _post(client, h, prev["session_id"], "resolve-same-person",
                 {"person_key": sp["person_key"], "member_id": kavita_id, "same": True}).json()
    assert prev["same_person_prompts"] == []
    p = next(x for x in prev["people"] if x["person_key"] == sp["person_key"])
    assert (p["status"], p["member_id"]) == ("locked_member", kavita_id)
    assert _confirm_raw(client, h, prev).status_code == 200
    [k] = _kavita_rows(uid)
    assert k.detected_pan_hash == hash_pan(KAVITA_PAN) and k.is_locked


def test_5b_unlocked_pan_free_member_yes_claims_the_pan(client, tmp_path):
    h, me_id = _authed_headers_and_member(client, "+919811500002", name="Aditi Sharma")
    _set_pan(me_id, ADITI_PAN)
    uid = _user_id(me_id)
    kavita_id = _add_member(uid, "Kavita Sharma")  # unlocked, relationship parent, no PAN
    prev = _parse(client, h, me_id, _family_with_kavita(KAVITA_PAN), tmp_path).json()
    [sp] = prev["same_person_prompts"]
    prev = _post(client, h, prev["session_id"], "resolve-same-person",
                 {"person_key": sp["person_key"], "member_id": kavita_id, "same": True}).json()
    assert _confirm_raw(client, h, prev).status_code == 200
    [k] = _kavita_rows(uid)
    assert k.pan_lookup_hash == hash_pan(KAVITA_PAN) and k.pan_pending_until is None


def test_5b_two_sessions_linking_one_member_with_different_pans_second_is_refused(client, tmp_path):
    """M-1: both tabs answered Yes for the same PAN-less Kavita, with different
    statement PANs. The first confirm writes its PAN; the second must not
    attach a different PAN's funds to her."""
    h, me_id = _authed_headers_and_member(client, "+919811500003", name="Aditi Sharma")
    _set_pan(me_id, ADITI_PAN)
    uid = _user_id(me_id)
    kavita_id = _add_member(uid, "Kavita Sharma", locked=True)
    sessions = []
    for pan in (KAVITA_PAN, "BNZPK9999Z"):
        prev = _parse(client, h, me_id, _family_with_kavita(pan), tmp_path).json()
        [sp] = prev["same_person_prompts"]
        sessions.append(_post(client, h, prev["session_id"], "resolve-same-person",
                              {"person_key": sp["person_key"], "member_id": kavita_id, "same": True}).json())
    assert _confirm_raw(client, h, sessions[0]).status_code == 200
    second = _confirm_raw(client, h, sessions[1])
    assert second.status_code == 422, second.text
    [k] = _kavita_rows(uid)
    assert k.detected_pan_hash == hash_pan(KAVITA_PAN)


def test_upload_target_beats_an_exact_name_match_elsewhere(client, tmp_path):
    """I-1: Add data for "K Sharma"; the statement's PAN-less KAVITA SHARMA is
    found as that target by name, so an exact-name member elsewhere must not
    take her funds."""
    h, me_id = _authed_headers_and_member(client, "+919811500004", name="Aditi Sharma")
    _set_pan(me_id, ADITI_PAN)
    uid = _user_id(me_id)
    target_id = _add_member(uid, "K Sharma")
    _add_member(uid, "Kavita Sharma", relationship=Relationship.SIBLING)
    resp = _parse(client, h, target_id, _family_with_kavita(None), tmp_path)
    assert resp.status_code == 200, resp.text
    p = next(x for x in resp.json()["people"] if x["name"].upper() == "KAVITA SHARMA")
    assert p["member_id"] == target_id
