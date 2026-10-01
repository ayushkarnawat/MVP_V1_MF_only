import uuid
from datetime import datetime, timezone

import pytest

from app.models.enums import (
    MemberNameSource,
    MemberOrigin,
    MemberPanConflict,
    MemberPanSource,
    NameChangeReason,
    Relationship,
)
from app.models.member_history import HouseholdMemberNameChange
from app.models.user import HouseholdMember, User
from app.services.dashboard.household_members import create_household_member
from app.services.dashboard.member_details import (
    FieldNotEditableError,
    InvalidMemberDetailsError,
    InvalidPanFormatError,
    MemberNotFoundError,
    PanOnOtherMemberError,
    PanRequiredError,
)
from app.services.dashboard.member_profile import MemberProfileRequest, save_member_profile
from app.services.import_.crypto import decrypt_pan, encrypt_pan, hash_pan
from app.services.import_.name_match import InvalidPersonNameError
from app.services.import_.pan_claims import store_detected_pan

PAN = "ABCPS1234K"


def _user(db, phone):
    u = User(id=uuid.uuid4(), phone_number=phone, created_at=datetime.now(timezone.utc))
    db.add(u)
    db.commit()
    return u


@pytest.fixture()
def user(db_session):
    return _user(db_session, "+919000000001")


@pytest.fixture()
def other_user(db_session):
    return _user(db_session, "+919000000002")


@pytest.fixture()
def self_member(db_session, user):
    return create_household_member(db_session, user.id, "Aditi Sharma", Relationship.SELF)


def _detected(db, user, pan=None, name="Ramesh Sharma"):
    m = HouseholdMember(
        user_id=user.id, name=name, relationship=None, created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
    )
    db.add(m)
    db.flush()
    if pan:
        store_detected_pan(db, m, pan, now=datetime.now(timezone.utc))
    db.commit()
    return m


def _conflict(db, user, pan=PAN, name="Ramesh Sharma"):
    m = HouseholdMember(
        user_id=user.id, name=name, relationship=None, created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
        detected_pan_encrypted=encrypt_pan(pan), detected_pan_hash=hash_pan(pan),
        pan_conflict=MemberPanConflict.OTHER_ACCOUNT, pan_source=MemberPanSource.CAS,
    )
    db.add(m)
    db.commit()
    return m


def test_save_writes_only_sent_fields(db_session, user):
    m = _detected(db_session, user, pan=PAN)
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(relationship="parent"))
    assert saved.relationship == Relationship.PARENT
    assert saved.phone_number is None and saved.email is None


def test_relationship_is_optional_and_phone_email_normalised(db_session, user):
    m = _detected(db_session, user, pan=PAN)
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(
        phone_number="98000 00002", email=" R@Example.com "))
    assert saved.relationship is None
    assert saved.phone_number == "+919800000002" and saved.email == "r@example.com"


def test_name_edit_records_history_and_marks_user_edited(db_session, user):
    m = _detected(db_session, user, pan=PAN, name="Ramesh Sharma")
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(name="Ramesh K Sharma"))
    assert saved.name == "Ramesh K Sharma" and saved.name_source == MemberNameSource.USER_EDITED
    row = db_session.query(HouseholdMemberNameChange).filter_by(household_member_id=m.id).one()
    assert row.reason == NameChangeReason.USER_EDIT and row.import_id is None and row.old_name == "Ramesh Sharma"


def test_name_edit_invalidates_holdings_cache_after_commit(db_session, user, monkeypatch):
    # Final review I-2: cached holdings rows carry the member name for 15 min.
    from app.services.dashboard import member_profile

    calls = []
    monkeypatch.setattr(member_profile, "invalidate_holdings_cache", lambda mid: calls.append(mid))
    m = _detected(db_session, user, pan=PAN, name="Ramesh Sharma")
    save_member_profile(db_session, user.id, m.id, MemberProfileRequest(phone_number="9876543210"))
    assert calls == []  # no rename, nothing to invalidate
    save_member_profile(db_session, user.id, m.id, MemberProfileRequest(name="Ramesh K Sharma"))
    assert calls == [m.id]


def test_unchanged_name_is_not_an_edit(db_session, user):
    m = _detected(db_session, user, pan=PAN, name="Ramesh Sharma")
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(name="ramesh  sharma"))
    assert saved.name_source == MemberNameSource.CAS
    assert db_session.query(HouseholdMemberNameChange).count() == 0


def test_invalid_name_is_rejected(db_session, user):
    m = _detected(db_session, user, pan=PAN)
    with pytest.raises(InvalidPersonNameError):
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(name="R2D2"))


def test_cas_pan_cannot_be_sent(db_session, user):
    m = _detected(db_session, user, pan=PAN)
    with pytest.raises(FieldNotEditableError):
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(pan="ABCPS9999K"))


def test_name_only_member_requires_pan_and_writes_nothing(db_session, user):
    m = _detected(db_session, user, pan=None)
    with pytest.raises(PanRequiredError):
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(phone_number="9800000002"))
    db_session.refresh(m)
    assert m.phone_number is None


def test_name_only_member_bad_pan_format(db_session, user):
    m = _detected(db_session, user, pan=None)
    with pytest.raises(InvalidPanFormatError):
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(pan="abc"))


def test_name_only_member_typed_pan_is_stored_like_selfs(db_session, user):
    m = _detected(db_session, user, pan=None)
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(pan="abcps 1234k"))
    assert decrypt_pan(saved.pan_encrypted) == PAN and saved.pan_lookup_hash == hash_pan(PAN)
    assert saved.pan_source == MemberPanSource.USER_ENTERED and saved.pan_verified_at is None


def test_typed_pan_on_another_account_saves_details_and_flags_conflict(db_session, user, other_user):
    _detected(db_session, other_user, pan=PAN)
    m = _detected(db_session, user, pan=None)
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(pan=PAN, relationship="sibling"))
    assert saved.relationship == Relationship.SIBLING
    assert saved.pan_conflict == MemberPanConflict.OTHER_ACCOUNT and saved.pan_lookup_hash is None
    assert decrypt_pan(saved.detected_pan_encrypted) == PAN


def test_typed_pan_on_own_other_member_offers_merge(db_session, user):
    holder = _detected(db_session, user, pan=PAN, name="Dad")
    m = _detected(db_session, user, pan=None, name="Ramesh")
    with pytest.raises(PanOnOtherMemberError) as exc:
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(pan=PAN))
    assert exc.value.can_merge is True and exc.value.other_member_id == holder.id
    db_session.refresh(m)
    assert m.pan_lookup_hash is None


def test_typed_pan_on_own_other_member_not_mergeable_for_manual_member(db_session, user):
    _detected(db_session, user, pan=PAN, name="Dad")
    m = HouseholdMember(
        user_id=user.id, name="Meera", relationship=Relationship.PARENT, created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.MANUAL, name_source=MemberNameSource.USER_ENTERED,
    )
    db_session.add(m)
    db_session.commit()
    with pytest.raises(PanOnOtherMemberError) as exc:
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(pan=PAN))
    assert exc.value.can_merge is False


def test_conflict_member_saves_other_fields(db_session, user, other_user):
    _detected(db_session, other_user, pan=PAN)
    m = _conflict(db_session, user, pan=PAN)
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(email="v@example.com"))
    assert saved.email == "v@example.com" and saved.pan_conflict == MemberPanConflict.OTHER_ACCOUNT


def test_self_can_edit_name_only(db_session, user, self_member):
    save_member_profile(db_session, user.id, self_member.id, MemberProfileRequest(name="Aditi S Sharma"))
    for body in (MemberProfileRequest(phone_number="9800000003"), MemberProfileRequest(relationship="parent"),
                 MemberProfileRequest(pan=PAN)):
        with pytest.raises((FieldNotEditableError, InvalidMemberDetailsError)):
            save_member_profile(db_session, user.id, self_member.id, body)


def test_other_relationship_needs_label(db_session, user):
    m = _detected(db_session, user, pan=PAN)
    with pytest.raises(InvalidMemberDetailsError):
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(relationship="other"))
    saved = save_member_profile(
        db_session, user.id, m.id, MemberProfileRequest(relationship="other", relationship_other_label=" Cousin "))
    assert saved.relationship_other_label == "Cousin"


def test_relationship_self_is_rejected_for_a_member(db_session, user):
    m = _detected(db_session, user, pan=PAN)
    with pytest.raises(InvalidMemberDetailsError):
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(relationship="self"))


def test_other_users_member_is_not_found(db_session, user, other_user):
    m = _detected(db_session, other_user, pan=PAN)
    with pytest.raises(MemberNotFoundError):
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(email="a@b.co"))


def test_create_member_validates_name_and_sets_origin(db_session, user):
    me = create_household_member(db_session, user.id, "  Aditi   Sharma ", Relationship.SELF)
    assert me.name == "Aditi Sharma"
    assert me.origin == MemberOrigin.ONBOARDING
    assert me.name_source == MemberNameSource.USER_ENTERED
    dad = create_household_member(db_session, user.id, "Dad", Relationship.PARENT)
    assert dad.origin == MemberOrigin.MANUAL
    with pytest.raises(InvalidPersonNameError):
        create_household_member(db_session, user.id, "R2D2", Relationship.CHILD)
