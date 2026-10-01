from datetime import datetime, timedelta, timezone
import uuid

import pytest

from app.models.enums import MemberPanConflict, MemberPanSource, Relationship
from app.models.user import HouseholdMember, User
from app.services.import_ import pan_claims
from app.services.import_.crypto import decrypt_pan, encrypt_pan, hash_pan
from app.services.import_.pan_claims import (
    PENDING_PAN_TTL,
    CrossAccountPanBlockedError,
    PanBelongsToOtherMemberError,
    PanMismatchForMemberError,
    claim_pan_for_member,
    classify_detected_pan,
    confirm_pan_claim,
    release_pending_pan_claim,
)

NOW = datetime(2026, 9, 24, 12, 0, tzinfo=timezone.utc)


def _aware(value):
    return value if value is None or value.tzinfo else value.replace(tzinfo=timezone.utc)


def _user(db):
    user = User(id=uuid.uuid4(), phone_number=f"+91{uuid.uuid4().int % 10**10:010d}", created_at=NOW)
    db.add(user)
    db.flush()
    return user


def _member(db, user, name="Ayush", *, pan=None, pending_until=None, relationship=Relationship.SELF):
    member = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name=name, relationship=relationship, created_at=NOW,
        pan_encrypted=encrypt_pan(pan) if pan else None,
        pan_lookup_hash=hash_pan(pan) if pan else None,
        pan_pending_until=pending_until,
    )
    db.add(member)
    db.commit()
    return member


def test_no_parsed_pan_claims_nothing(db_session):
    member = _member(db_session, _user(db_session))
    assert claim_pan_for_member(db_session, member, None, pending=True, now=NOW) is None
    assert member.pan_lookup_hash is None


def test_fresh_member_gets_a_pending_claim(db_session):
    member = _member(db_session, _user(db_session))
    claimed = claim_pan_for_member(db_session, member, "abcde1234f", pending=True, now=NOW)
    assert claimed == hash_pan("ABCDE1234F")
    assert member.pan_lookup_hash == hash_pan("ABCDE1234F")
    assert decrypt_pan(member.pan_encrypted) == "ABCDE1234F"
    assert _aware(member.pan_pending_until) == NOW + PENDING_PAN_TTL


def test_fresh_member_gets_a_permanent_claim_on_the_one_step_path(db_session):
    member = _member(db_session, _user(db_session))
    claim_pan_for_member(db_session, member, "ABCDE1234F", pending=False, now=NOW)
    assert member.pan_lookup_hash == hash_pan("ABCDE1234F")
    assert member.pan_pending_until is None


def test_reimport_of_own_permanent_pan_stays_permanent(db_session):
    member = _member(db_session, _user(db_session), pan="ABCDE1234F")
    claim_pan_for_member(db_session, member, "ABCDE1234F", pending=True, now=NOW)
    assert member.pan_pending_until is None


def test_reupload_of_own_pending_pan_refreshes_expiry(db_session):
    member = _member(db_session, _user(db_session), pan="ABCDE1234F", pending_until=NOW + timedelta(minutes=1))
    claim_pan_for_member(db_session, member, "ABCDE1234F", pending=True, now=NOW)
    assert _aware(member.pan_pending_until) == NOW + PENDING_PAN_TTL


def test_own_pending_pan_becomes_permanent_on_one_step_claim(db_session):
    member = _member(db_session, _user(db_session), pan="ABCDE1234F", pending_until=NOW + timedelta(minutes=1))
    claim_pan_for_member(db_session, member, "ABCDE1234F", pending=False, now=NOW)
    assert member.pan_pending_until is None


def test_pan_held_by_another_member_of_same_account_conflicts(db_session):
    user = _user(db_session)
    _member(db_session, user, "Priya", pan="BCDEF2222B", relationship=Relationship.SPOUSE)
    mom = _member(db_session, user, "Mom", relationship=Relationship.PARENT)
    with pytest.raises(PanBelongsToOtherMemberError) as exc:
        claim_pan_for_member(db_session, mom, "BCDEF2222B", pending=True, now=NOW)
    assert exc.value.code == "pan_belongs_to_other_member"
    assert "Mom" in exc.value.message
    assert "Priya" not in exc.value.message
    assert mom.pan_lookup_hash is None


def test_pan_held_by_another_account_is_blocked_without_leaking_it(db_session):
    _member(db_session, _user(db_session), "Someone Else", pan="ZZZZZ9999Z")
    member = _member(db_session, _user(db_session))
    with pytest.raises(CrossAccountPanBlockedError) as exc:
        claim_pan_for_member(db_session, member, "ZZZZZ9999Z", pending=True, now=NOW)
    assert exc.value.code == "cross_account_pan_blocked"
    assert "Someone Else" not in exc.value.message
    assert member.pan_lookup_hash is None


def test_different_pan_on_member_with_permanent_pan_conflicts(db_session):
    member = _member(db_session, _user(db_session), "Mom", pan="ABCDE1234F", relationship=Relationship.PARENT)
    with pytest.raises(PanMismatchForMemberError) as exc:
        claim_pan_for_member(db_session, member, "QWERT5678Y", pending=True, now=NOW)
    assert exc.value.code == "pan_mismatch_for_member"
    assert "Mom" in exc.value.message
    assert member.pan_lookup_hash == hash_pan("ABCDE1234F")


def test_different_pan_replaces_members_own_abandoned_pending_claim(db_session):
    member = _member(db_session, _user(db_session), pan="ABCDE1234F", pending_until=NOW + timedelta(minutes=30))
    claim_pan_for_member(db_session, member, "QWERT5678Y", pending=True, now=NOW)
    assert member.pan_lookup_hash == hash_pan("QWERT5678Y")


def test_expired_pending_claim_on_other_member_is_reclaimable(db_session):
    # _member commits, so pan_pending_until reads back from SQLite as a naive
    # datetime -- this also pins the naive/aware comparison (Review Focus 3).
    user = _user(db_session)
    stale = _member(db_session, user, "Mom", pan="ABCDE1234F", pending_until=NOW - timedelta(minutes=1),
                    relationship=Relationship.PARENT)
    db_session.expire_all()
    me = _member(db_session, user)
    claim_pan_for_member(db_session, me, "ABCDE1234F", pending=True, now=NOW)
    assert me.pan_lookup_hash == hash_pan("ABCDE1234F")
    assert stale.pan_lookup_hash is None
    assert stale.pan_encrypted is None
    assert stale.pan_pending_until is None


def test_unexpired_pending_claim_on_other_member_still_conflicts(db_session):
    user = _user(db_session)
    _member(db_session, user, "Mom", pan="ABCDE1234F", pending_until=NOW + timedelta(minutes=5),
            relationship=Relationship.PARENT)
    me = _member(db_session, user)
    with pytest.raises(PanBelongsToOtherMemberError):
        claim_pan_for_member(db_session, me, "ABCDE1234F", pending=True, now=NOW)


def test_losing_a_unique_index_race_surfaces_as_a_conflict(db_session, monkeypatch):
    user = _user(db_session)
    _member(db_session, user, "Priya", pan="BCDEF2222B", relationship=Relationship.SPOUSE)
    me = _member(db_session, user)
    real_holder_of = pan_claims._holder_of
    calls = {"n": 0}

    def misses_on_first_call(db, pan_hash, now):
        calls["n"] += 1
        return None if calls["n"] == 1 else real_holder_of(db, pan_hash, now)

    monkeypatch.setattr(pan_claims, "_holder_of", misses_on_first_call)
    with pytest.raises(PanBelongsToOtherMemberError):
        claim_pan_for_member(db_session, me, "BCDEF2222B", pending=True, now=NOW)
    db_session.refresh(me)
    assert me.pan_lookup_hash is None


def test_confirm_makes_pending_claim_permanent(db_session):
    member = _member(db_session, _user(db_session), pan="ABCDE1234F", pending_until=NOW + timedelta(minutes=30))
    confirm_pan_claim(db_session, member, "ABCDE1234F")
    assert member.pan_pending_until is None
    assert member.pan_lookup_hash == hash_pan("ABCDE1234F")


def test_confirm_without_parsed_pan_is_a_noop(db_session):
    member = _member(db_session, _user(db_session))
    confirm_pan_claim(db_session, member, None)
    assert member.pan_lookup_hash is None


def test_confirm_reclaims_a_pan_whose_pending_claim_vanished(db_session):
    member = _member(db_session, _user(db_session))
    confirm_pan_claim(db_session, member, "ABCDE1234F")
    assert member.pan_lookup_hash == hash_pan("ABCDE1234F")
    assert member.pan_pending_until is None


def test_confirm_claim_that_lost_its_pan_imports_without_it(db_session):
    user = _user(db_session)
    _member(db_session, user, "Priya", pan="BCDEF2222B", relationship=Relationship.SPOUSE)
    me = _member(db_session, user)
    confirm_pan_claim(db_session, me, "BCDEF2222B")  # must not raise
    assert me.pan_lookup_hash is None


def test_release_clears_only_a_matching_pending_claim(db_session):
    user = _user(db_session)
    pending = _member(db_session, user, "Mom", pan="ABCDE1234F", pending_until=NOW + timedelta(minutes=30),
                      relationship=Relationship.PARENT)
    permanent = _member(db_session, user, pan="QWERT5678Y")

    release_pending_pan_claim(pending, "ZZZZZ9999Z")
    assert pending.pan_lookup_hash == hash_pan("ABCDE1234F")

    release_pending_pan_claim(permanent, "QWERT5678Y")
    assert permanent.pan_lookup_hash == hash_pan("QWERT5678Y")

    release_pending_pan_claim(pending, "ABCDE1234F")
    assert pending.pan_lookup_hash is None
    assert pending.pan_encrypted is None
    assert pending.pan_pending_until is None


def test_race_whose_winner_already_let_go_retries_instead_of_500(db_session, monkeypatch):
    # Final review #3: IntegrityError on flush, but by the time we re-check,
    # the winner has released the PAN -- must retry, not re-raise raw.
    user = _user(db_session)
    winner = _member(db_session, user, "Priya", pan="BCDEF2222B", relationship=Relationship.SPOUSE)
    me = _member(db_session, user)
    real_holder_of = pan_claims._holder_of
    calls = {"n": 0}

    def racing_holder_of(db, pan_hash, now):
        calls["n"] += 1
        if calls["n"] == 1:
            return None  # stale read: the winner's claim isn't visible yet
        if calls["n"] == 2:
            db.refresh(winner)
            winner.pan_encrypted = winner.pan_lookup_hash = None
            db.commit()  # the winner releases before we re-check
        return real_holder_of(db, pan_hash, now)

    monkeypatch.setattr(pan_claims, "_holder_of", racing_holder_of)
    claim_pan_for_member(db_session, me, "BCDEF2222B", pending=True, now=NOW)
    assert me.pan_lookup_hash == hash_pan("BCDEF2222B")


def test_confirm_survives_an_integrity_error_from_the_fallback_claim(db_session, monkeypatch):
    from sqlalchemy.exc import IntegrityError

    member = _member(db_session, _user(db_session))

    def boom(*_args, **_kwargs):
        raise IntegrityError("UPDATE household_members", {}, Exception("unique"))

    monkeypatch.setattr(pan_claims, "claim_pan_for_member", boom)
    confirm_pan_claim(db_session, member, "ABCDE1234F")  # must not raise
    assert member.pan_lookup_hash is None


# --- classify_detected_pan (read-only; F7 order) ---------------------------


def test_classify_detected_pan_new(db_session):
    user = _user(db_session)
    assert classify_detected_pan(db_session, user.id, "ABCDE1234F", now=NOW) == ("new", None)


def test_classify_detected_pan_existing_member(db_session):
    user = _user(db_session)
    member = _member(db_session, user, pan="ABCDE1234F")
    assert classify_detected_pan(db_session, user.id, "abcde 1234f", now=NOW) == (
        "existing_member", member.id,
    )


def test_classify_detected_pan_other_account(db_session):
    _member(db_session, _user(db_session), pan="ABCDE1234F")
    me = _user(db_session)
    assert classify_detected_pan(db_session, me.id, "ABCDE1234F", now=NOW) == ("other_account", None)


def test_classify_detected_pan_expired_pending_claim_counts_as_new(db_session):
    user = _user(db_session)
    _member(db_session, user, pan="ABCDE1234F", pending_until=NOW - timedelta(minutes=1))
    other = _user(db_session)
    assert classify_detected_pan(db_session, user.id, "ABCDE1234F", now=NOW) == ("new", None)
    assert classify_detected_pan(db_session, other.id, "ABCDE1234F", now=NOW) == ("new", None)
    # read-only: the expired claim is not cleared
    assert db_session.query(HouseholdMember).filter_by(pan_lookup_hash=hash_pan("ABCDE1234F")).count() == 1


# 2026-10-01 member profile completion: the file has no `user` / `other_user`
# fixtures, so these build both accounts with the module's `_user` helper.
def test_store_detected_pan_uses_selfs_encrypted_unique_columns(db_session):
    from app.services.import_.pan_claims import store_detected_pan
    user = _user(db_session)
    m = _member(db_session, user, name="Ramesh Sharma", relationship=None)
    result = store_detected_pan(db_session, m, "ABCPS1234K", now=datetime.now(timezone.utc))
    db_session.flush()
    assert result == "stored"
    assert m.pan_encrypted != "ABCPS1234K" and decrypt_pan(m.pan_encrypted) == "ABCPS1234K"
    assert m.pan_lookup_hash == hash_pan("ABCPS1234K")
    assert m.pan_pending_until is None and m.pan_source == MemberPanSource.CAS and m.pan_verified_at is not None
    assert m.detected_pan_hash is None and m.pan_conflict is None


def test_store_detected_pan_held_by_other_account_goes_to_detected_columns(db_session):
    from app.services.import_.pan_claims import store_detected_pan
    user, other_user = _user(db_session), _user(db_session)
    _member(db_session, other_user, name="Vikram", pan="ABCPS1234K")  # permanent holder elsewhere
    m = _member(db_session, user, name="Vikram Kapoor", relationship=None)
    assert store_detected_pan(db_session, m, "ABCPS1234K", now=datetime.now(timezone.utc)) == "other_account"
    db_session.flush()
    assert m.pan_lookup_hash is None
    assert decrypt_pan(m.detected_pan_encrypted) == "ABCPS1234K"
    assert m.pan_conflict == MemberPanConflict.OTHER_ACCOUNT and m.pan_source == MemberPanSource.CAS


def test_store_detected_pan_held_by_same_account_member_raises(db_session):
    from app.services.import_.pan_claims import store_detected_pan
    user = _user(db_session)
    _member(db_session, user, name="Ayush", pan="ABCPS1234K")
    m = _member(db_session, user, name="Ramesh Sharma", relationship=None)
    with pytest.raises(PanBelongsToOtherMemberError):
        store_detected_pan(db_session, m, "ABCPS1234K", now=datetime.now(timezone.utc))


def test_store_detected_pan_clears_an_expired_pending_claim(db_session):
    from app.services.import_.pan_claims import store_detected_pan
    user = _user(db_session)
    stale = _member(db_session, _user(db_session), pan="ABCPS1234K", pending_until=NOW - timedelta(minutes=1))
    m = _member(db_session, user, name="Ramesh Sharma", relationship=None)
    assert store_detected_pan(db_session, m, "ABCPS1234K", now=NOW) == "stored"
    db_session.flush()
    assert stale.pan_lookup_hash is None and m.pan_lookup_hash == hash_pan("ABCPS1234K")


def test_classify_detected_pan_conflict_member_is_existing_member(db_session):
    user, other_user = _user(db_session), _user(db_session)
    _member(db_session, other_user, name="Vikram", pan="ABCPS1234K")
    m = _member(db_session, user, name="Vikram Kapoor", relationship=None)
    m.detected_pan_encrypted = encrypt_pan("ABCPS1234K")
    m.detected_pan_hash = hash_pan("ABCPS1234K")
    m.pan_source = MemberPanSource.CAS
    m.pan_conflict = MemberPanConflict.OTHER_ACCOUNT
    db_session.flush()
    assert classify_detected_pan(db_session, user.id, "ABCPS1234K") == ("existing_member", m.id)


def test_store_detected_pan_frees_an_expired_claim_before_taking_the_index(db_session):
    # Both rows persistent: SQLAlchemy orders same-table UPDATEs by primary
    # key, so a member that sorts first would take the unique index while
    # the expired claim still sits on it unless the clear is flushed first.
    from app.services.import_.pan_claims import store_detected_pan
    stale = _member(db_session, _user(db_session), pan="ABCPS1234K", pending_until=NOW - timedelta(minutes=1))
    stale_id = stale.id
    user = _user(db_session)
    m = HouseholdMember(id=uuid.UUID(int=1), user_id=user.id, name="Kavita", relationship=None, created_at=NOW)
    db_session.add(m)
    db_session.commit()
    db_session.execute(
        HouseholdMember.__table__.update().where(HouseholdMember.id == stale_id)
        .values(id=uuid.UUID(int=2**128 - 1))
    )
    db_session.commit()
    db_session.expire_all()
    assert store_detected_pan(db_session, m, "ABCPS1234K", now=NOW) == "stored"
    db_session.flush()
    assert m.pan_lookup_hash == hash_pan("ABCPS1234K")
