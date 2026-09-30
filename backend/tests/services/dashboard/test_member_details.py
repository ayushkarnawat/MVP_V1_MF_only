import uuid
from datetime import datetime, timezone

import pytest

from app.models.enums import (
    MemberLockReason,
    MemberNameSource,
    MemberOrigin,
    MemberPanSource,
    NameChangeReason,
    Relationship,
)
from app.models.member_history import HouseholdMemberNameChange
from app.models.user import HouseholdMember, User
from app.services.dashboard.household_members import create_household_member
from app.services.dashboard.member_details import (
    DetectedPanMismatchError,
    InvalidMemberDetailsError,
    InvalidPanFormatError,
    MemberDetailsRequest,
    PanOnOtherMemberError,
    complete_member_details,
    normalise_pan_input,
    refresh_other_account_locks,
    require_unlocked_member,
)
from app.services.import_.crypto import decrypt_pan, encrypt_pan, hash_pan
from app.services.import_.name_match import InvalidPersonNameError
from app.services.import_.pan_claims import CrossAccountPanBlockedError

PAN = "BXQPS5678L"
OTHER_PAN = "ABCDE1234F"


def _user(db, phone):
    u = User(id=uuid.uuid4(), phone_number=phone, created_at=datetime.now(timezone.utc))
    db.add(u)
    db.commit()
    return u


def _locked(db, user, name="Ramesh Sharma", detected=PAN):
    m = HouseholdMember(
        user_id=user.id, name=name, relationship=None, created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
        details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED,
        detected_pan_encrypted=encrypt_pan(detected) if detected else None,
        detected_pan_hash=hash_pan(detected) if detected else None,
    )
    db.add(m)
    db.commit()
    return m


def _claimed(db, user, name, pan):
    m = HouseholdMember(
        user_id=user.id, name=name, relationship=Relationship.PARENT,
        created_at=datetime.now(timezone.utc),
        pan_encrypted=encrypt_pan(pan), pan_lookup_hash=hash_pan(pan),
    )
    db.add(m)
    db.commit()
    return m


def _req(pan=PAN, **kw):
    kw.setdefault("relationship", Relationship.PARENT)
    return MemberDetailsRequest(pan=pan, **kw)


def test_normalise_pan_input():
    assert normalise_pan_input(" bxqps 5678l\t") == PAN


def test_unlock_with_matching_pan_completes_member(db_session):
    u = _user(db_session, "+911")
    m = _locked(db_session, u)
    out = complete_member_details(db_session, u.id, m.id, _req())
    assert out.details_completed_at is not None and not out.is_locked
    assert out.lock_reason is None
    assert out.relationship == Relationship.PARENT
    assert out.pan_lookup_hash == hash_pan(PAN)
    assert decrypt_pan(out.pan_encrypted) == PAN
    assert out.pan_pending_until is None
    assert out.pan_source == MemberPanSource.CAS
    assert out.detected_pan_hash is None and out.detected_pan_encrypted is None


def test_unlock_normalises_lowercase_spaced_pan(db_session):
    u = _user(db_session, "+911")
    m = _locked(db_session, u)
    out = complete_member_details(db_session, u.id, m.id, _req("bxqps 5678l"))
    assert out.pan_lookup_hash == hash_pan(PAN)


def test_unlock_bad_format_is_422(db_session):
    u = _user(db_session, "+911")
    m = _locked(db_session, u)
    with pytest.raises(InvalidPanFormatError) as e:
        complete_member_details(db_session, u.id, m.id, _req("12345"))
    assert e.value.code == "invalid_pan_format"
    assert e.value.message == "Enter a valid PAN: 5 letters, 4 digits, then 1 letter."
    assert db_session.get(HouseholdMember, m.id).is_locked


def test_unlock_detected_mismatch_is_409_with_masked_hint(db_session):
    u = _user(db_session, "+911")
    m = _locked(db_session, u)
    with pytest.raises(DetectedPanMismatchError) as e:
        complete_member_details(db_session, u.id, m.id, _req(OTHER_PAN))
    assert e.value.details == {"detected_pan_masked": "BX******8L"}
    assert PAN not in e.value.message
    assert db_session.get(HouseholdMember, m.id).is_locked


def test_unlock_pan_on_other_member_offers_merge_only_for_name_only(db_session):
    u = _user(db_session, "+911")
    dad = _claimed(db_session, u, "Dad", OTHER_PAN)
    name_only = _locked(db_session, u, "Meera Sharma", detected=None)
    with pytest.raises(PanOnOtherMemberError) as e:
        complete_member_details(db_session, u.id, name_only.id, _req(OTHER_PAN))
    assert e.value.can_merge is True
    assert e.value.details["other_member_id"] == str(dad.id)
    assert e.value.details["other_member_name"] == "Dad"
    assert e.value.details["can_merge"] is True
    assert e.value.details["source_fund_count"] == 0
    assert e.value.message == (
        "This PAN is already on Dad. Meera Sharma and Dad may be the same person. Merging "
        "moves Meera Sharma\u2019s 0 funds into Dad and removes Meera Sharma from your family list."
    )
    assert db_session.get(HouseholdMember, name_only.id).is_locked

    # Staging-QA 5C (2026-09-30): a person WITH a detected PAN equal to the
    # PAN another member already holds is provably the same person -- merge
    # offered (it used to be refused, stranding the duplicate locked).
    u3 = _user(db_session, "+913")
    _claimed(db_session, u3, "Dad", PAN)
    detected_member = _locked(db_session, u3, "Ramesh", detected=PAN)
    with pytest.raises(PanOnOtherMemberError) as e2:
        complete_member_details(db_session, u3.id, detected_member.id, _req(PAN))
    assert e2.value.can_merge is True


def test_unlock_pan_on_other_account_saves_relationship_and_stays_locked(db_session):
    u = _user(db_session, "+911")
    other_user = _user(db_session, "+912")
    _claimed(db_session, other_user, "Ramesh", PAN)
    m = _locked(db_session, u)
    with pytest.raises(CrossAccountPanBlockedError):
        complete_member_details(db_session, u.id, m.id, _req())
    db_session.expire_all()
    row = db_session.get(HouseholdMember, m.id)
    assert row.is_locked
    assert row.relationship == Relationship.PARENT
    assert row.lock_reason == MemberLockReason.PAN_ON_OTHER_ACCOUNT
    assert row.pan_lookup_hash is None


def test_l5_for_name_only_person_stores_typed_pan_as_detected(db_session):
    u = _user(db_session, "+911")
    other_user = _user(db_session, "+912")
    _claimed(db_session, other_user, "Ramesh", PAN)
    m = _locked(db_session, u, detected=None)
    with pytest.raises(CrossAccountPanBlockedError) as exc:
        complete_member_details(db_session, u.id, m.id, _req())
    assert exc.value.message == (
        "Ramesh Sharma has their own Unifolio account. Their funds are included in your family "
        "total. Their own dashboard stays with their account."
    )
    db_session.expire_all()
    row = db_session.get(HouseholdMember, m.id)
    assert row.pan_source == MemberPanSource.USER_ENTERED
    assert row.detected_pan_hash == hash_pan(PAN)
    assert decrypt_pan(row.detected_pan_encrypted) == PAN
    assert row.lock_reason == MemberLockReason.PAN_ON_OTHER_ACCOUNT


def test_unlock_name_only_person_is_user_entered_unverified(db_session):
    u = _user(db_session, "+911")
    m = _locked(db_session, u, "Meera Sharma", detected=None)
    out = complete_member_details(db_session, u.id, m.id, _req())
    assert out.pan_source == MemberPanSource.USER_ENTERED
    assert out.pan_verified_at is None
    assert not out.is_locked


def test_unlock_relationship_other_needs_label_and_self_is_rejected(db_session):
    u = _user(db_session, "+911")
    m = _locked(db_session, u)
    with pytest.raises(InvalidMemberDetailsError) as e:
        complete_member_details(db_session, u.id, m.id, _req(relationship=Relationship.SELF))
    assert e.value.code == "invalid_relationship"
    with pytest.raises(InvalidMemberDetailsError):
        complete_member_details(db_session, u.id, m.id, _req(relationship=Relationship.OTHER))
    out = complete_member_details(
        db_session, u.id, m.id, _req(relationship=Relationship.OTHER, relationship_other_label="Friend")
    )
    assert out.relationship_other_label == "Friend"


def test_details_refused_on_self_member(db_session):
    u = _user(db_session, "+911")
    me = create_household_member(db_session, u.id, "Aditi Sharma", Relationship.SELF)
    with pytest.raises(InvalidMemberDetailsError):
        complete_member_details(db_session, u.id, me.id, _req())


def test_name_edit_logs_user_edit(db_session):
    u = _user(db_session, "+911")
    m = _locked(db_session, u)
    out = complete_member_details(db_session, u.id, m.id, _req(name="Ramesh K Sharma"))
    assert out.name == "Ramesh K Sharma"
    assert out.name_source == MemberNameSource.USER_ENTERED
    rows = db_session.query(HouseholdMemberNameChange).all()
    assert [(r.old_name, r.new_name, r.reason) for r in rows] == [
        ("Ramesh Sharma", "Ramesh K Sharma", NameChangeReason.USER_EDIT)
    ]
    with pytest.raises(InvalidPersonNameError):
        complete_member_details(db_session, u.id, m.id, _req(name="R2"))


def test_retry_same_pan_on_unlocked_member_is_200(db_session):
    u = _user(db_session, "+911")
    m = _locked(db_session, u)
    first = complete_member_details(db_session, u.id, m.id, _req())
    completed_at = first.details_completed_at
    again = complete_member_details(db_session, u.id, m.id, _req("bxqps5678l"))
    assert again.details_completed_at == completed_at
    assert again.lock_reason is None
    assert again.pan_source == MemberPanSource.CAS


def test_edit_unlocked_member_conflict_changes_nothing_and_stays_unlocked(db_session):
    u = _user(db_session, "+911")
    other_user = _user(db_session, "+912")
    _claimed(db_session, other_user, "Someone", OTHER_PAN)
    m = _locked(db_session, u)
    first = complete_member_details(db_session, u.id, m.id, _req())
    completed_at = first.details_completed_at
    with pytest.raises(CrossAccountPanBlockedError):
        complete_member_details(
            db_session, u.id, m.id, _req(OTHER_PAN, relationship=Relationship.CHILD)
        )
    db_session.expire_all()
    row = db_session.get(HouseholdMember, m.id)
    assert row.relationship == Relationship.PARENT
    assert row.pan_lookup_hash == hash_pan(PAN)
    assert row.lock_reason is None
    assert row.details_completed_at == completed_at
    # same-account conflict
    _claimed(db_session, u, "Dad", "QWERT1234Y")
    with pytest.raises(PanOnOtherMemberError) as e:
        complete_member_details(db_session, u.id, m.id, _req("QWERT1234Y"))
    assert e.value.can_merge is False
    db_session.expire_all()
    assert db_session.get(HouseholdMember, m.id).pan_lookup_hash == hash_pan(PAN)


def test_require_unlocked_member(db_session):
    from fastapi import HTTPException

    u = _user(db_session, "+911")
    v = _user(db_session, "+912")
    locked = _locked(db_session, u)
    done = _claimed(db_session, u, "Dad", OTHER_PAN)
    assert require_unlocked_member(db_session, u.id, done.id).id == done.id
    with pytest.raises(HTTPException) as e:
        require_unlocked_member(db_session, u.id, locked.id)
    assert e.value.status_code == 403
    assert e.value.detail["code"] == "member_details_required"
    with pytest.raises(HTTPException) as e:
        require_unlocked_member(db_session, v.id, done.id)
    assert e.value.status_code == 404


def test_refresh_other_account_locks_flips_to_details_needed(db_session):
    u = _user(db_session, "+911")
    other = _user(db_session, "+912")
    holder = _claimed(db_session, other, "Ramesh", PAN)
    m = _locked(db_session, u)
    m.lock_reason = MemberLockReason.PAN_ON_OTHER_ACCOUNT
    db_session.commit()

    assert refresh_other_account_locks(db_session, u.id) == 0
    assert db_session.get(HouseholdMember, m.id).lock_reason == MemberLockReason.PAN_ON_OTHER_ACCOUNT

    holder.pan_lookup_hash = None
    holder.pan_encrypted = None
    db_session.commit()
    assert refresh_other_account_locks(db_session, u.id) == 1
    db_session.expire_all()
    assert db_session.get(HouseholdMember, m.id).lock_reason == MemberLockReason.DETAILS_NEEDED


def test_create_member_validates_name_and_sets_origin(db_session):
    u = _user(db_session, "+911")
    me = create_household_member(db_session, u.id, "  Aditi   Sharma ", Relationship.SELF)
    assert me.name == "Aditi Sharma"
    assert me.origin == MemberOrigin.ONBOARDING
    assert me.name_source == MemberNameSource.USER_ENTERED
    assert me.details_completed_at is not None and me.lock_reason is None
    dad = create_household_member(db_session, u.id, "Dad", Relationship.PARENT)
    assert dad.origin == MemberOrigin.MANUAL
    with pytest.raises(InvalidPersonNameError):
        create_household_member(db_session, u.id, "R2D2", Relationship.CHILD)


def _l5_name_only(db):
    u = _user(db, "+911")
    other = _user(db, "+912")
    holder = _claimed(db, other, "Ramesh", PAN)
    m = _locked(db, u, detected=None)
    with pytest.raises(CrossAccountPanBlockedError):
        complete_member_details(db, u.id, m.id, _req())
    holder.pan_lookup_hash = None
    holder.pan_encrypted = None
    db.commit()
    return u, m


def test_unlock_after_l5_same_typed_pan_stays_user_entered_unverified(db_session):
    u, m = _l5_name_only(db_session)
    out = complete_member_details(db_session, u.id, m.id, _req())
    assert not out.is_locked
    assert out.pan_source == MemberPanSource.USER_ENTERED
    assert out.pan_verified_at is None
    assert out.pan_lookup_hash == hash_pan(PAN)
    assert out.detected_pan_hash is None


def test_unlock_after_l5_different_valid_pan_is_accepted(db_session):
    u, m = _l5_name_only(db_session)
    out = complete_member_details(db_session, u.id, m.id, _req(OTHER_PAN))
    assert out.pan_lookup_hash == hash_pan(OTHER_PAN)
    assert out.pan_source == MemberPanSource.USER_ENTERED
    assert out.pan_verified_at is None


def test_unlocked_edit_name_and_pan_conflict_writes_nothing(db_session):
    u = _user(db_session, "+911")
    other = _user(db_session, "+912")
    _claimed(db_session, other, "Someone", OTHER_PAN)
    m = _locked(db_session, u)
    complete_member_details(db_session, u.id, m.id, _req())
    with pytest.raises(CrossAccountPanBlockedError) as exc:
        complete_member_details(db_session, u.id, m.id, _req(OTHER_PAN, name="Ramesh K Sharma"))
    assert exc.value.message == (
        "This PAN is already on another Unifolio account. Ramesh Sharma\u2019s PAN hasn\u2019t changed."
    )
    db_session.expire_all()
    assert db_session.get(HouseholdMember, m.id).name == "Ramesh Sharma"
    assert db_session.query(HouseholdMemberNameChange).count() == 0
