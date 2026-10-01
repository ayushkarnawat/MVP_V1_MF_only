import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import Relationship
from app.models.user import HouseholdMember, User
from app.services.import_.crypto import encrypt_pan, hash_pan
import pytest

from app.services.dashboard.household_members import (
    DuplicateSelfMemberError,
    create_household_member,
    list_household_members,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__, HouseholdMember.__table__])
    return sessionmaker(autoflush=False, bind=engine)()


def _user(db, phone="+919999999999"):
    user = User(id=uuid.uuid4(), phone_number=phone, created_at=datetime.now(timezone.utc))
    db.add(user)
    db.commit()
    return user


def test_create_household_member_scoped_to_user():
    db = _session()
    user = _user(db)

    member = create_household_member(db, user.id, "Ayush", Relationship.SELF)

    assert member.user_id == user.id
    assert member.name == "Ayush"
    assert member.relationship == Relationship.SELF


def test_create_household_member_with_other_relationship_label():
    db = _session()
    user = _user(db)

    member = create_household_member(db, user.id, "Grandpa", Relationship.OTHER, "Grandfather")

    assert member.relationship == Relationship.OTHER
    assert member.relationship_other_label == "Grandfather"


def test_list_household_members_returns_only_this_users_members():
    db = _session()
    user_a = _user(db, "+919999999999")
    user_b = _user(db, "+919888888888")
    create_household_member(db, user_a.id, "Ayush", Relationship.SELF)
    create_household_member(db, user_b.id, "Someone Else", Relationship.SELF)

    members = list_household_members(db, user_a.id)

    assert len(members) == 1
    assert members[0].name == "Ayush"


def test_create_household_member_rejects_second_self_row():
    db = _session()
    user = _user(db)
    me = create_household_member(db, user.id, "Ayush", Relationship.SELF)
    # A self row with no CAS PAN yet is provisional and gets renamed (decision
    # QA); once a statement has given it a PAN, a second self is refused.
    me.pan_encrypted, me.pan_lookup_hash = encrypt_pan("BXQPS5678L"), hash_pan("BXQPS5678L")
    db.commit()

    with pytest.raises(DuplicateSelfMemberError):
        create_household_member(db, user.id, "Ayush Again", Relationship.SELF)


def test_create_household_member_renames_a_provisional_self_row():
    db = _session()
    user = _user(db)
    first = create_household_member(db, user.id, "Ayush", Relationship.SELF)

    again = create_household_member(db, user.id, "Ayush Karnawat", Relationship.SELF)

    assert again.id == first.id and again.name == "Ayush Karnawat"
    assert db.query(HouseholdMember).filter_by(user_id=user.id).count() == 1


def test_create_household_member_allows_self_row_per_distinct_user():
    db = _session()
    user_a = _user(db, "+919999999999")
    user_b = _user(db, "+919888888888")
    create_household_member(db, user_a.id, "Ayush", Relationship.SELF)

    member_b = create_household_member(db, user_b.id, "Someone Else", Relationship.SELF)

    assert member_b.relationship == Relationship.SELF


def test_create_household_member_rejects_second_self_when_name_came_from_the_cas():
    # Only a typed (provisional) name is renamed; a CAS-named self is final.
    from app.models.enums import MemberNameSource

    db = _session()
    user = _user(db)
    me = create_household_member(db, user.id, "Ayush", Relationship.SELF)
    me.name_source = MemberNameSource.CAS
    db.commit()

    with pytest.raises(DuplicateSelfMemberError):
        create_household_member(db, user.id, "Ayush Again", Relationship.SELF)
