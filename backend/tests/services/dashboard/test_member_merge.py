import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from app.models.analytics import AnalyticsSection
from app.models.enums import (
    MemberPanSource, ImportStatus, MemberOrigin, PlanType, Relationship, TransactionType,
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
        origin=MemberOrigin.CAS_DETECTED,
        # A statement PAN is recorded as pan_source=cas (is_name_only reads it).
        pan_source=MemberPanSource.CAS if detected else None,
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


def _txn(db, folio, imp, day, amount="100.00", occurrence=1):
    db.add(Transaction(
        folio_id=folio.id, import_id=imp.id, type=TransactionType.PURCHASE, date=day,
        amount=Decimal(amount), units=Decimal("1.000"), nav=Decimal(amount), occurrence=occurrence,
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


def test_merge_refuses_source_with_statement_pan(db_session):
    db = db_session
    user = _user(db)
    target = _target(db, user)
    with_pan = HouseholdMember(
        user_id=user.id, name="Other", relationship=Relationship.SPOUSE, created_at=NOW,
        pan_encrypted=encrypt_pan("AAAPZ1234C"), pan_lookup_hash=hash_pan("AAAPZ1234C"),
        pan_source=MemberPanSource.CAS,
    )
    db.add(with_pan)
    db.commit()
    with pytest.raises(MergeNotAllowedError):
        merge_member_into(db, user.id, with_pan.id, target.id)
    with pytest.raises(MergeNotAllowedError):
        merge_member_into(db, user.id, target.id, target.id)


def test_merge_refuses_target_of_another_user(db_session):
    db = db_session
    user, other = _user(db), _user(db, "+919800000002")
    source, foreign = _source(db, user), _target(db, other)
    with pytest.raises(Exception):
        merge_member_into(db, user.id, source.id, foreign.id)
    assert db.get(HouseholdMember, source.id) is not None


def test_merge_keeps_target_relationship(db_session):
    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user)
    merge_member_into(db, user.id, source.id, target.id)
    db.expire_all()
    kept = db.get(HouseholdMember, target.id)
    assert kept.relationship == Relationship.PARENT


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


def test_merge_refuses_manual_source_even_without_pan(db_session):
    # Controller ruling (fix round 1): the origin check replaces the lock
    # check, so a manual or onboarding member is never merged away.
    db = db_session
    user = _user(db)
    target = _target(db, user)
    manual = HouseholdMember(user_id=user.id, name="Ramesh Sharma", relationship=None, created_at=NOW,
                             origin=MemberOrigin.MANUAL)
    db.add(manual)
    db.commit()
    with pytest.raises(MergeNotAllowedError):
        merge_member_into(db, user.id, manual.id, target.id)
    assert db.get(HouseholdMember, manual.id) is not None


def test_merge_allows_cas_detected_name_only_source(db_session):
    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user)
    source_id = source.id
    merge_member_into(db, user.id, source.id, target.id)
    db.expire_all()
    assert db.get(HouseholdMember, source_id) is None


@pytest.mark.parametrize("target_holds", ["pan_lookup_hash", "detected_pan_hash"])
def test_merge_allows_statement_pan_source_matching_target_pan(db_session, target_holds):
    # Final review I-1: a same-hash conflict pair (one promoted by
    # refresh_pan_conflicts, or both still conflicts) must be mergeable.
    from app.models.enums import MemberPanConflict

    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user, detected=True)
    source.pan_conflict = MemberPanConflict.OTHER_ACCOUNT
    if target_holds == "pan_lookup_hash":
        target.pan_encrypted, target.pan_lookup_hash = encrypt_pan("BXQPS5678L"), hash_pan("BXQPS5678L")
    else:
        target.detected_pan_encrypted = encrypt_pan("BXQPS5678L")
        target.detected_pan_hash = hash_pan("BXQPS5678L")
        target.pan_conflict = MemberPanConflict.OTHER_ACCOUNT
    target.pan_source = MemberPanSource.CAS
    db.commit()
    source_id = source.id
    merge_member_into(db, user.id, source.id, target.id)
    db.expire_all()
    assert db.get(HouseholdMember, source_id) is None


def test_merge_keeps_twin_rows(db_session):
    """#2: two genuine same-day rows (occurrence 1 and 2) must both survive a
    merge; only a row with the same occurrence is a duplicate."""
    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user)
    t_imp, s_imp = _imp(db, target), _imp(db, source)
    s1 = _scheme(db, "S1")
    t_folio = _folio(db, target, s1, "F1")
    _txn(db, t_folio, t_imp, date(2024, 1, 1), occurrence=1)
    s_same = _folio(db, source, s1, "F1")
    _txn(db, s_same, s_imp, date(2024, 1, 1), occurrence=1)   # duplicate of the target's row
    _txn(db, s_same, s_imp, date(2024, 1, 1), occurrence=2)   # its twin: new to the target

    result = merge_member_into(db, user.id, source.id, target.id)

    assert result.transactions_dropped == 1
    db.expire_all()
    rows = db.query(Transaction).filter_by(folio_id=t_folio.id).all()
    assert sorted(t.occurrence for t in rows) == [1, 2]


def test_merge_matches_folios_by_key_and_moves_links_of_dropped_duplicates(db_session):
    """#4/#5: source "123 / 45" and target "123/45" are one folio; a row both
    hold is kept once and its links (one per import) all end up on the kept row."""
    from app.models.transaction_import import TransactionImport

    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user)
    t_imp, s_imp = _imp(db, target), _imp(db, source)
    s1 = _scheme(db, "S1")
    t_folio = _folio(db, target, s1, "123/45")
    s_folio = _folio(db, source, s1, "123 / 45")
    _txn(db, t_folio, t_imp, date(2024, 1, 1))
    _txn(db, s_folio, s_imp, date(2024, 1, 1))     # same row as the target's
    for folio, imp in ((t_folio, t_imp), (s_folio, s_imp)):
        row = db.query(Transaction).filter_by(folio_id=folio.id).one()
        db.add(TransactionImport(transaction_id=row.id, transaction_date=row.date, import_id=imp.id))
    db.commit()

    result = merge_member_into(db, user.id, source.id, target.id)

    assert result.transactions_dropped == 1
    db.expire_all()
    assert db.query(Folio).count() == 1
    kept = db.query(Transaction).filter_by(folio_id=t_folio.id).one()
    assert {l.import_id for l in db.query(TransactionImport).filter_by(transaction_id=kept.id)} == {t_imp.id, s_imp.id}


def test_merge_drops_source_opening_when_target_has_earlier_history(db_session):
    """Review (Medium): merging a source folio that carries a CAS opening into
    a target folio with real rows before it must not double-count units."""
    from app.models.enums import TransactionOrigin

    db = db_session
    user = _user(db)
    target, source = _target(db, user), _source(db, user)
    t_imp, s_imp = _imp(db, target), _imp(db, source)
    s1 = _scheme(db, "S1")
    t_folio = _folio(db, target, s1, "X/1")
    s_folio = _folio(db, source, s1, "X / 1")
    _txn(db, t_folio, t_imp, date(2016, 5, 5))
    db.add(Transaction(folio_id=s_folio.id, import_id=s_imp.id, type=TransactionType.OPENING_BALANCE,
                       date=date(2025, 4, 1), amount=Decimal("5000"), units=Decimal("100"), nav=Decimal("50"),
                       origin=TransactionOrigin.CAS_OPENING))
    db.commit()

    merge_member_into(db, user.id, source.id, target.id)

    db.expire_all()
    assert db.query(Transaction).filter_by(folio_id=t_folio.id, origin=TransactionOrigin.CAS_OPENING).count() == 0
    assert db.query(Transaction).filter_by(folio_id=t_folio.id).count() == 1

