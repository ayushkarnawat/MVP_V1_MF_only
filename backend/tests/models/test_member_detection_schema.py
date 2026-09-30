"""Schema-level guarantees for CAS member detection (migration 0018).

The check constraints and the never-relock trigger are the DB-level backstop
for the lock/unlock rules (I15) -- service code is expected to respect them,
but these tests prove a bug there can't produce an impossible row.
"""

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import DatabaseError, IntegrityError

from app.models.enums import (
    ImportStatus,
    MemberLockReason,
    MemberNameSource,
    MemberOrigin,
    MemberPanSource,
    NameChangeReason,
    Relationship,
)
from app.models.imports import Import
from app.models.member_history import HouseholdMemberMerge, HouseholdMemberNameChange
from app.models.user import HouseholdMember, User

NOW = datetime(2026, 9, 29, 10, 0, tzinfo=timezone.utc)

LOCKED = dict(
    relationship=None,
    origin=MemberOrigin.CAS_DETECTED,
    details_completed_at=None,
    lock_reason=MemberLockReason.DETAILS_NEEDED,
)


def _user(db) -> User:
    user = User(id=uuid.uuid4(), phone_number=f"+91{uuid.uuid4().int % 10**10:010d}", created_at=NOW)
    db.add(user)
    db.flush()
    return user


def _member(db, user: User | None = None, **overrides) -> HouseholdMember:
    fields = dict(
        user_id=(user or _user(db)).id,
        name="Asha Rao",
        relationship=Relationship.SPOUSE,
        created_at=NOW,
    )
    fields.update(overrides)
    member = HouseholdMember(**fields)
    db.add(member)
    return member


def test_locked_detected_member_may_have_no_relationship(db_session):
    m = _member(db_session, relationship=None, origin=MemberOrigin.CAS_DETECTED,
                details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED)
    db_session.flush()
    assert m.is_locked is True


def test_unlocked_member_requires_relationship(db_session):
    _member(db_session, relationship=None, details_completed_at=NOW, lock_reason=None)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_other_requires_label(db_session):
    _member(db_session, relationship=Relationship.OTHER, relationship_other_label=None,
            details_completed_at=NOW, lock_reason=None)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_lock_reason_iff_not_completed(db_session):
    _member(db_session, relationship=Relationship.SELF, details_completed_at=NOW,
            lock_reason=MemberLockReason.DETAILS_NEEDED)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_locked_member_requires_lock_reason(db_session):
    _member(db_session, relationship=None, details_completed_at=None, lock_reason=None)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_detected_pan_columns_come_in_pairs(db_session):
    _member(db_session, detected_pan_encrypted="x", detected_pan_hash=None, **LOCKED)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_unlocked_member_cannot_be_locked_again(db_session):
    m = _member(db_session, relationship=Relationship.SPOUSE, details_completed_at=NOW, lock_reason=None)
    db_session.commit()
    m.details_completed_at = None
    m.lock_reason = MemberLockReason.DETAILS_NEEDED
    with pytest.raises(DatabaseError, match="member_already_unlocked"):
        db_session.commit()


def test_locked_member_can_be_unlocked_and_then_edited(db_session):
    m = _member(db_session, **LOCKED)
    db_session.commit()
    m.relationship = Relationship.PARENT
    m.details_completed_at = NOW
    m.lock_reason = None
    db_session.commit()
    # The trigger must only block re-locking, not ordinary edits of an
    # unlocked member.
    m.name = "Asha K Rao"
    db_session.commit()
    assert m.is_locked is False


# F1 ruling: ~44 existing constructor sites set neither field. Omitting
# details_completed_at means "created unlocked" (now); an explicit None means
# "locked" and must stay None -- a plain column default can't tell these apart.
def test_omitted_details_completed_at_defaults_to_now_and_member_is_unlocked(db_session):
    before = datetime.now(timezone.utc)
    m = _member(db_session)
    db_session.flush()
    assert m.details_completed_at is not None
    assert m.details_completed_at >= before
    assert m.lock_reason is None
    assert m.is_locked is False


def test_explicit_none_details_completed_at_stays_none(db_session):
    m = _member(db_session, **LOCKED)
    db_session.flush()
    assert m.details_completed_at is None
    assert m.is_locked is True


def test_new_member_column_defaults(db_session):
    m = _member(db_session)
    db_session.flush()
    assert m.origin == MemberOrigin.MANUAL
    assert m.name_source == MemberNameSource.USER_ENTERED
    assert m.pan_source is None
    assert m.detected_from_import_id is None


def test_detected_member_round_trips_all_new_columns(db_session):
    user = _user(db_session)
    owner = _member(db_session, user=user, relationship=Relationship.SELF)
    db_session.flush()
    imp = Import(household_member_id=owner.id, status=ImportStatus.PENDING, uploaded_at=NOW,
                 upload_group_id=uuid.uuid4())
    db_session.add(imp)
    db_session.flush()
    m = _member(db_session, user=user, detected_pan_encrypted="enc", detected_pan_hash="h",
                detected_from_import_id=imp.id, name_source=MemberNameSource.CAS,
                pan_source=MemberPanSource.CAS, name_updated_at=NOW, pan_verified_at=NOW, **LOCKED)
    db_session.commit()
    db_session.expire_all()
    assert m.detected_from_import_id == imp.id
    assert m.name_source == MemberNameSource.CAS
    assert m.pan_source == MemberPanSource.CAS
    assert imp.upload_group_id is not None


def test_detected_pan_hash_index_is_not_unique(db_session):
    user = _user(db_session)
    _member(db_session, user=user, detected_pan_encrypted="e1", detected_pan_hash="same", **LOCKED)
    _member(db_session, user=user, detected_pan_encrypted="e2", detected_pan_hash="same", **LOCKED)
    db_session.flush()


def test_name_change_and_merge_audit_rows(db_session):
    user = _user(db_session)
    m = _member(db_session, user=user)
    db_session.flush()
    db_session.add(HouseholdMemberNameChange(
        household_member_id=m.id, old_name="Asha Rao", new_name="Asha K Rao",
        reason=NameChangeReason.CAS_VARIANT, import_id=None, changed_at=NOW,
    ))
    db_session.add(HouseholdMemberMerge(
        user_id=user.id, kept_member_id=m.id, removed_member_id=uuid.uuid4(),
        removed_member_name="A Rao", folios_moved=2, transactions_dropped=1, merged_at=NOW,
    ))
    db_session.commit()
    change = db_session.query(HouseholdMemberNameChange).one()
    assert change.reason == NameChangeReason.CAS_VARIANT
    assert db_session.query(HouseholdMemberMerge).one().folios_moved == 2
