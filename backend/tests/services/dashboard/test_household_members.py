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


def test_list_returns_profile_fields_for_self_using_account_contact(client):
    from app.db.session import get_db

    phone = "+919100400001"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    h = {"Authorization": f"Bearer {token}"}
    me = client.post("/household-members", json={"name": "Asha Rao", "relationship": "self"}, headers=h).json()
    db = next(client.app.dependency_overrides[get_db]())
    member = db.get(HouseholdMember, uuid.UUID(me["id"]))
    member.pan_encrypted, member.pan_lookup_hash = encrypt_pan("BXQPS5678L"), hash_pan("BXQPS5678L")
    user = db.get(User, member.user_id)
    user.email = "asha@example.com"  # Self's phone/email live on users
    db.commit()
    db.close()

    row = next(m for m in client.get("/household-members", headers=h).json() if m["id"] == me["id"])
    assert row["missing_fields"] == []
    assert row["profile_completion"] == 100
    assert row["pan_editable"] is False


def test_refresh_promotes_released_conflict_pan():
    from app.models.enums import MemberNameSource, MemberOrigin, MemberPanConflict, MemberPanSource
    from app.services.dashboard.member_details import refresh_pan_conflicts
    from app.services.import_.crypto import decrypt_pan

    db = _session()
    user = _user(db)
    pan = "BXQPS5678L"
    m = HouseholdMember(
        user_id=user.id, name="Vikram Rao", created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
        detected_pan_hash=hash_pan(pan), detected_pan_encrypted=encrypt_pan(pan),
        pan_source=MemberPanSource.CAS, pan_conflict=MemberPanConflict.OTHER_ACCOUNT,
    )
    db.add(m)
    db.commit()

    assert refresh_pan_conflicts(db, user.id) == 1
    db.expire_all()
    assert m.pan_lookup_hash == hash_pan(pan)
    assert decrypt_pan(m.pan_encrypted) == pan
    assert m.pan_conflict is None
    assert m.detected_pan_hash is None
    assert m.pan_verified_at is not None


def test_refresh_survives_lost_race(monkeypatch):
    from sqlalchemy.exc import IntegrityError

    from app.models.enums import MemberOrigin, MemberPanConflict, MemberPanSource
    from app.services.dashboard.member_details import refresh_pan_conflicts

    db = _session()
    user = _user(db)
    pan = "BXQPS5678L"
    m = HouseholdMember(
        user_id=user.id, name="Vikram Rao", created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.CAS_DETECTED,
        detected_pan_hash=hash_pan(pan), detected_pan_encrypted=encrypt_pan(pan),
        pan_source=MemberPanSource.CAS, pan_conflict=MemberPanConflict.OTHER_ACCOUNT,
    )
    db.add(m)
    db.commit()

    calls = {"n": 0}
    real_commit = db.commit

    def flaky_commit():
        calls["n"] += 1
        if calls["n"] == 1:
            raise IntegrityError("UPDATE household_members", {}, Exception("unique"))
        return real_commit()

    monkeypatch.setattr(db, "commit", flaky_commit)
    assert refresh_pan_conflicts(db, user.id) == 0
    db.expire_all()
    assert m.pan_conflict == MemberPanConflict.OTHER_ACCOUNT  # kept for the next list call
    assert m.pan_lookup_hash is None


@pytest.mark.parametrize("conflict_id_lower", [True, False])
def test_refresh_promotes_when_holder_is_expired_pending_in_either_id_order(conflict_id_lower):
    # SQLAlchemy orders UPDATEs on one table by primary key; the claim must
    # not run before the stale holder releases the hash, whichever id is lower.
    from datetime import timedelta

    from app.models.enums import MemberOrigin, MemberPanConflict, MemberPanSource
    from app.services.dashboard.member_details import refresh_pan_conflicts
    from app.services.import_.crypto import decrypt_pan

    low = uuid.UUID("00000000-0000-0000-0000-000000000001")
    high = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
    conflict_id, stale_id = (low, high) if conflict_id_lower else (high, low)

    db = _session()
    user, other = _user(db), _user(db, "+919888888888")
    pan = "BXQPS5678L"
    now = datetime.now(timezone.utc)
    stale = HouseholdMember(
        id=stale_id, user_id=other.id, name="Someone", relationship=Relationship.SELF, created_at=now,
        pan_encrypted=encrypt_pan(pan), pan_lookup_hash=hash_pan(pan),
        pan_pending_until=now - timedelta(hours=1), pan_source=MemberPanSource.CAS, pan_verified_at=now,
    )
    m = HouseholdMember(
        id=conflict_id, user_id=user.id, name="Vikram Rao", created_at=now,
        origin=MemberOrigin.CAS_DETECTED,
        detected_pan_hash=hash_pan(pan), detected_pan_encrypted=encrypt_pan(pan),
        pan_source=MemberPanSource.CAS, pan_conflict=MemberPanConflict.OTHER_ACCOUNT,
    )
    db.add_all([stale, m])
    db.commit()

    assert refresh_pan_conflicts(db, user.id) == 1
    db.expire_all()
    assert m.pan_lookup_hash == hash_pan(pan) and decrypt_pan(m.pan_encrypted) == pan
    assert m.pan_conflict is None and m.detected_pan_hash is None
    assert stale.pan_lookup_hash is None and stale.pan_encrypted is None and stale.pan_pending_until is None
    assert stale.pan_source is None and stale.pan_verified_at is None


def test_refresh_keeps_conflict_while_holder_is_live():
    from app.models.enums import MemberOrigin, MemberPanConflict, MemberPanSource
    from app.services.dashboard.member_details import refresh_pan_conflicts

    db = _session()
    user, other = _user(db), _user(db, "+919888888888")
    pan = "BXQPS5678L"
    now = datetime.now(timezone.utc)
    db.add(HouseholdMember(user_id=other.id, name="Someone", relationship=Relationship.SELF, created_at=now,
                           pan_encrypted=encrypt_pan(pan), pan_lookup_hash=hash_pan(pan)))
    m = HouseholdMember(
        user_id=user.id, name="Vikram Rao", created_at=now, origin=MemberOrigin.CAS_DETECTED,
        detected_pan_hash=hash_pan(pan), detected_pan_encrypted=encrypt_pan(pan),
        pan_source=MemberPanSource.CAS, pan_conflict=MemberPanConflict.OTHER_ACCOUNT,
    )
    db.add(m)
    db.commit()
    assert refresh_pan_conflicts(db, user.id) == 0
    assert m.pan_conflict == MemberPanConflict.OTHER_ACCOUNT


def _conflict(user_id, name, pan, created_at, member_id=None):
    from app.models.enums import MemberOrigin, MemberPanConflict, MemberPanSource

    return HouseholdMember(
        id=member_id or uuid.uuid4(), user_id=user_id, name=name, created_at=created_at,
        origin=MemberOrigin.CAS_DETECTED,
        detected_pan_hash=hash_pan(pan), detected_pan_encrypted=encrypt_pan(pan),
        pan_source=MemberPanSource.CAS, pan_conflict=MemberPanConflict.OTHER_ACCOUNT,
    )


def test_refresh_same_hash_pair_promotes_one_and_does_not_block_others():
    # Final review I-1: autoflush=False hid row 1's promotion from row 2's
    # holder query, both claimed the hash, the commit failed, and nothing --
    # not even the unrelated row -- was ever promoted.
    from app.models.enums import MemberPanConflict
    from app.services.dashboard.member_details import refresh_pan_conflicts

    db = _session()
    user = _user(db)
    now = datetime.now(timezone.utc)
    a = _conflict(user.id, "Vikram Rao", "BXQPS5678L", now)
    b = _conflict(user.id, "Vikram R", "BXQPS5678L", now)
    c = _conflict(user.id, "Meera Rao", "CXQPS1234M", now)
    db.add_all([a, b, c])
    db.commit()

    assert refresh_pan_conflicts(db, user.id) == 2
    db.expire_all()
    assert c.pan_conflict is None and c.pan_lookup_hash == hash_pan("CXQPS1234M")
    pair = [a, b]
    promoted = [m for m in pair if m.pan_conflict is None]
    kept = [m for m in pair if m.pan_conflict is not None]
    assert len(promoted) == 1 and len(kept) == 1
    assert promoted[0].pan_lookup_hash == hash_pan("BXQPS5678L")
    assert kept[0].pan_conflict == MemberPanConflict.OTHER_ACCOUNT
    assert kept[0].detected_pan_hash == hash_pan("BXQPS5678L") and kept[0].pan_lookup_hash is None
    # Stable: a second pass promotes nothing more and doesn't raise.
    assert refresh_pan_conflicts(db, user.id) == 0


def test_refresh_lost_race_at_inner_flush_does_not_raise(monkeypatch):
    # Final review I-1, second path: the flush that releases an expired
    # holder ran outside the try, so a lost race 500'd GET /household-members.
    from datetime import timedelta

    from sqlalchemy.exc import IntegrityError

    from app.models.enums import MemberPanConflict, MemberPanSource
    from app.services.dashboard.member_details import refresh_pan_conflicts

    db = _session()
    user, other = _user(db), _user(db, "+919888888888")
    now = datetime.now(timezone.utc)
    pan = "BXQPS5678L"
    stale = HouseholdMember(
        user_id=other.id, name="Someone", relationship=Relationship.SELF, created_at=now,
        pan_encrypted=encrypt_pan(pan), pan_lookup_hash=hash_pan(pan),
        pan_pending_until=now - timedelta(hours=1), pan_source=MemberPanSource.CAS, pan_verified_at=now,
    )
    m = _conflict(user.id, "Vikram Rao", pan, now)
    db.add_all([stale, m])
    db.commit()

    calls = {"n": 0}
    real_flush = db.flush

    def flaky_flush(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise IntegrityError("UPDATE household_members", {}, Exception("unique"))
        return real_flush(*args, **kwargs)

    monkeypatch.setattr(db, "flush", flaky_flush)
    assert refresh_pan_conflicts(db, user.id) == 0
    monkeypatch.undo()
    db.expire_all()
    assert m.pan_conflict == MemberPanConflict.OTHER_ACCOUNT and m.pan_lookup_hash is None
