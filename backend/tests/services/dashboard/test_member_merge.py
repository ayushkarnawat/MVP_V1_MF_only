import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from app.models.analytics import AnalyticsSection
from app.models.enums import (
    MemberPanSource, ImportStatus, MemberLockReason, MemberOrigin, PlanType, Relationship, TransactionType,
)
from app.models.folio import Folio
from app.models.imports import Import
from app.models.member_history import HouseholdMemberMerge
from app.models.reference import Scheme
from app.models.snapshot import PortfolioSnapshot
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.member_merge import MergeNotAllowedError, merge_member_into
from app.services.import_.crypto import encrypt_pan, hash_pan

NOW = datetime.now(timezone.utc)


def _user(db, phone="+919800000001"):
    u = User(id=uuid.uuid4(), phone_number=phone, created_at=NOW)
    db.add(u)
    db.commit()
    return u


def _target(db, user):
    m = HouseholdMember(user_id=user.id, name="Ramesh Kumar Sharma", relationship=Relationship.PARENT, created_at=NOW)
    db.add(m)
    db.commit()
    return m


def _source(db, user, detected=False):
    m = HouseholdMember(
        user_id=user.id, name="Ramesh Sharma", relationship=None, created_at=NOW,
        origin=MemberOrigin.CAS_DETECTED, details_completed_at=None,
        lock_reason=MemberLockReason.DETAILS_NEEDED,
        detected_pan_encrypted=encrypt_pan("BXQPS5678L") if detected else None,
        detected_pan_hash=hash_pan("BXQPS5678L") if detected else None,
    )
    db.add(m)
    db.commit()
    return m


def _imp(db, member):
    i = Import(household_member_id=member.id, status=ImportStatus.CONFIRMED, uploaded_at=NOW)
    db.add(i)
    db.commit()
    return i


def _scheme(db, code):
    s = Scheme(amfi_code=code, name=code, amc_name="AMC", sebi_category="Equity")
    db.add(s)
    db.commit()
    return s


def _folio(db, member, scheme, number):
    f = Folio(household_member_id=member.id, scheme_id=scheme.id, folio_number=number, plan_type=PlanType.DIRECT)
    db.add(f)
    db.commit()
    return f


def _txn(db, folio, imp, day, amount="100.00"):
    db.add(Transaction(
        folio_id=folio.id, import_id=imp.id, type=TransactionType.PURCHASE, date=day,
        amount=Decimal(amount), units=Decimal("1.000"), nav=Decimal(amount),
    ))
    db.commit()


def test_merge_moves_folios_and_drops_duplicates(db_session):
    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user)
    t_imp, s_imp = _imp(db, target), _imp(db, source)
    s1, s2 = _scheme(db, "S1"), _scheme(db, "S2")
    t_folio = _folio(db, target, s1, "F1")
    _txn(db, t_folio, t_imp, date(2024, 1, 1))
    s_same = _folio(db, source, s1, "F1")
    _txn(db, s_same, s_imp, date(2024, 1, 1))  # duplicate of the target's
    _txn(db, s_same, s_imp, date(2024, 2, 1))  # new to the target
    s_other = _folio(db, source, s2, "F9")
    _txn(db, s_other, s_imp, date(2024, 3, 1))
    other_id, same_id, source_id = s_other.id, s_same.id, source.id

    result = merge_member_into(db, user.id, source.id, target.id)

    assert (result.folios_moved, result.transactions_dropped) == (2, 1)
    db.expire_all()
    assert db.get(Folio, same_id) is None
    assert db.get(Folio, other_id).household_member_id == target.id
    assert db.query(Transaction).filter_by(folio_id=t_folio.id).count() == 2
    assert db.get(HouseholdMember, source_id) is None


def test_merge_repoints_imports_and_logs_audit(db_session):
    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user)
    s_imp = _imp(db, source)
    db.add(AnalyticsSection(
        user_id=user.id, household_member_id=source.id, scope_key=str(source.id),
        section="allocation", payload={}, computed_at=NOW,
    ))
    db.add(PortfolioSnapshot(household_member_id=source.id, snapshot_month=date(2024, 1, 31), total_value=Decimal("1"), computed_at=NOW))
    db.add(PortfolioSnapshot(household_member_id=target.id, snapshot_month=date(2024, 1, 31), total_value=Decimal("1"), computed_at=NOW))
    db.commit()

    merge_member_into(db, user.id, source.id, target.id)

    db.expire_all()
    assert db.get(Import, s_imp.id).household_member_id == target.id
    audit = db.query(HouseholdMemberMerge).one()
    assert (audit.kept_member_id, audit.removed_member_id) == (target.id, source.id)
    assert audit.removed_member_name == "Ramesh Sharma"
    assert db.query(AnalyticsSection).filter_by(household_member_id=source.id).count() == 0
    assert db.query(PortfolioSnapshot).count() == 0


def test_merge_refuses_member_with_detected_pan(db_session):
    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user, detected=True)
    with pytest.raises(MergeNotAllowedError):
        merge_member_into(db, user.id, source.id, target.id)
    assert db.get(HouseholdMember, source.id) is not None


def test_merge_refuses_unlocked_source(db_session):
    db = db_session
    user = _user(db)
    target = _target(db, user)
    unlocked = HouseholdMember(user_id=user.id, name="Other", relationship=Relationship.SPOUSE, created_at=NOW)
    db.add(unlocked)
    db.commit()
    with pytest.raises(MergeNotAllowedError):
        merge_member_into(db, user.id, unlocked.id, target.id)
    with pytest.raises(MergeNotAllowedError):
        merge_member_into(db, user.id, target.id, target.id)


def test_merge_refuses_target_of_another_user(db_session):
    db = db_session
    user, other = _user(db), _user(db, "+919800000002")
    source, foreign = _source(db, user), _target(db, other)
    with pytest.raises(Exception):
        merge_member_into(db, user.id, source.id, foreign.id)
    assert db.get(HouseholdMember, source.id) is not None


def test_merge_keeps_target_unlocked(db_session):
    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user)
    merge_member_into(db, user.id, source.id, target.id)
    db.expire_all()
    kept = db.get(HouseholdMember, target.id)
    assert not kept.is_locked and kept.relationship == Relationship.PARENT


def test_merge_allows_source_whose_pan_was_typed_by_the_user(db_session):
    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user, detected=True)
    source.pan_source = MemberPanSource.USER_ENTERED
    db.commit()
    source_id = source.id
    merge_member_into(db, user.id, source.id, target.id)
    db.expire_all()
    assert db.get(HouseholdMember, source_id) is None
