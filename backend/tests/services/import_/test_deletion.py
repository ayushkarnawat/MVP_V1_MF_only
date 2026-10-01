import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
from app.models.enums import (
    ImportStatus, MemberOrigin, PlanType, Relationship, TransactionType,
)
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.snapshot import PortfolioSnapshot
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.import_.crypto import encrypt_pan, hash_pan
from app.services.import_.deletion import (
    ImportNotFoundError, delete_import, delete_member_portfolio,
)

NOW = datetime.now(timezone.utc)
GROUP = uuid.uuid4()
REF = "u/group.pdf"


class FakeStorage:
    def __init__(self):
        self.deleted: list[str] = []

    def save(self, key, data):  # pragma: no cover
        return key

    def read(self, reference):  # pragma: no cover
        return b""

    def delete(self, reference):
        self.deleted.append(reference)


def _world(db):
    """Self + an untouched detected person + a complete person, all in
    one upload group sharing one file; one fund each."""
    user = User(id=uuid.uuid4(), phone_number="+919700000001", created_at=NOW)
    db.add(user)
    db.flush()
    me = HouseholdMember(user_id=user.id, name="Me", relationship=Relationship.SELF, created_at=NOW,
                         pan_encrypted=encrypt_pan("ABCDE1234F"), pan_lookup_hash=hash_pan("ABCDE1234F"))
    detected = HouseholdMember(
        user_id=user.id, name="Detected One", relationship=None, created_at=NOW,
        origin=MemberOrigin.CAS_DETECTED,
    )
    complete = HouseholdMember(user_id=user.id, name="Complete One", relationship=Relationship.SPOUSE, created_at=NOW)
    db.add_all([me, detected, complete])
    db.flush()
    world = {"user": user, "me": me, "detected": detected, "complete": complete, "imports": {}, "folios": {}}
    for key, member in (("me", me), ("detected", detected), ("complete", complete)):
        imp = Import(
            household_member_id=member.id, status=ImportStatus.CONFIRMED, uploaded_at=NOW,
            upload_group_id=GROUP, file_reference=REF, file_expires_at=NOW,
        )
        scheme = Scheme(amfi_code=f"D-{key}-{uuid.uuid4().hex[:4]}", name=key, amc_name="AMC", sebi_category="Equity")
        db.add_all([imp, scheme])
        db.flush()
        folio = Folio(household_member_id=member.id, scheme_id=scheme.id, folio_number=key, plan_type=PlanType.DIRECT)
        db.add(folio)
        db.flush()
        db.add(Transaction(
            folio_id=folio.id, import_id=imp.id, type=TransactionType.PURCHASE, date=date(2024, 1, 1),
            amount=Decimal("100.00"), units=Decimal("1.000"), nav=Decimal("100.0000"),
        ))
        world["imports"][key] = imp
        world["folios"][key] = folio
    db.commit()
    return world


def test_delete_person_scope_keeps_other_people_and_the_file(db_session):
    w = _world(db_session)
    storage = FakeStorage()
    result = delete_import(db_session, w["user"].id, w["imports"]["complete"].id, "person", storage)

    assert result.deleted_transactions_count == 1
    assert result.deleted_file is False and storage.deleted == []
    assert result.removed_member_ids == []  # complete member is kept
    assert db_session.query(Import).count() == 2
    assert db_session.query(Transaction).count() == 2


def test_delete_group_scope_removes_all_rows_and_the_file(db_session):
    w = _world(db_session)
    storage = FakeStorage()
    detected_id = w["detected"].id
    result = delete_import(db_session, w["user"].id, w["imports"]["me"].id, "group", storage)

    assert result.deleted_transactions_count == 3
    assert result.deleted_file is True and storage.deleted == [REF]
    assert db_session.query(Import).count() == 0
    assert db_session.query(Transaction).count() == 0
    assert db_session.query(Folio).count() == 0
    assert result.removed_member_ids == [detected_id]


def test_delete_removes_untouched_detected_member_left_empty_keeps_complete_member(db_session):
    w = _world(db_session)
    detected_id = w["detected"].id
    r1 = delete_import(db_session, w["user"].id, w["imports"]["detected"].id, "person", FakeStorage())
    assert r1.removed_member_ids == [detected_id]
    assert db_session.get(HouseholdMember, detected_id) is None
    r2 = delete_import(db_session, w["user"].id, w["imports"]["complete"].id, "person", FakeStorage())
    assert r2.removed_member_ids == []
    assert db_session.get(HouseholdMember, w["complete"].id) is not None


def test_delete_never_removes_self_or_its_pan(db_session):
    w = _world(db_session)
    me_id = w["me"].id
    result = delete_import(db_session, w["user"].id, w["imports"]["me"].id, "group", FakeStorage())
    assert me_id not in result.removed_member_ids
    me = db_session.get(HouseholdMember, me_id)
    assert me is not None and me.pan_lookup_hash == hash_pan("ABCDE1234F")
    r = delete_member_portfolio(db_session, w["user"].id, me_id, remove_member=True, storage=FakeStorage())
    assert r.removed_member_ids == [] and db_session.get(HouseholdMember, me_id) is not None


def test_delete_member_portfolio_across_statements_with_and_without_remove(db_session):
    w = _world(db_session)
    complete = w["complete"]
    # A second statement for the same member, different file.
    imp2 = Import(household_member_id=complete.id, status=ImportStatus.CONFIRMED, uploaded_at=NOW,
                  upload_group_id=uuid.uuid4(), file_reference="u/other.pdf", file_expires_at=NOW)
    db_session.add(imp2)
    db_session.flush()
    db_session.add(Transaction(
        folio_id=w["folios"]["complete"].id, import_id=imp2.id, type=TransactionType.PURCHASE,
        date=date(2024, 2, 1), amount=Decimal("50.00"), units=Decimal("1.000"), nav=Decimal("50.0000"),
    ))
    db_session.commit()
    storage = FakeStorage()

    keep = delete_member_portfolio(db_session, w["user"].id, complete.id, remove_member=False, storage=storage)

    assert keep.deleted_transactions_count == 2 and keep.removed_member_ids == []
    assert db_session.get(HouseholdMember, complete.id) is not None
    assert storage.deleted == ["u/other.pdf"]  # the shared group file still has 2 referrers
    assert keep.deleted_file is True
    assert db_session.query(Folio).filter_by(household_member_id=complete.id).count() == 0

    gone = delete_member_portfolio(db_session, w["user"].id, complete.id, remove_member=True, storage=storage)
    assert gone.removed_member_ids == [complete.id]
    assert db_session.get(HouseholdMember, complete.id) is None


def test_delete_clears_snapshots_and_analytics_and_bumps_generation(db_session):
    w = _world(db_session)
    complete_id = w["complete"].id
    db_session.add(PortfolioSnapshot(household_member_id=complete_id, snapshot_month=date(2024, 1, 31), total_value=Decimal("1"), computed_at=NOW))
    db_session.add(AnalyticsSection(user_id=w["user"].id, scope_key="combined", section="allocation", payload={}, computed_at=NOW))
    db_session.add(AnalyticsRecomputeStatus(user_id=w["user"].id, started_at=NOW, generation=4))
    db_session.commit()

    delete_import(db_session, w["user"].id, w["imports"]["complete"].id, "person", FakeStorage())

    assert db_session.query(PortfolioSnapshot).count() == 0
    assert db_session.query(AnalyticsSection).count() == 0
    db_session.expire_all()
    assert db_session.get(AnalyticsRecomputeStatus, w["user"].id).generation == 5


def test_storage_delete_runs_after_commit_and_failure_does_not_undo_rows(db_session):
    w = _world(db_session)

    seen: list[int] = []

    class Boom(FakeStorage):
        def delete(self, reference):
            seen.append(db_session.query(Import).count())
            raise OSError("s3 down")

    result = delete_import(db_session, w["user"].id, w["imports"]["me"].id, "group", Boom())
    assert seen == [0]  # rows were gone by the time storage was touched
    assert result.deleted_file is False
    assert db_session.query(Import).count() == 0


def test_delete_unknown_or_foreign_import_raises(db_session):
    w = _world(db_session)
    other = User(id=uuid.uuid4(), phone_number="+919700000002", created_at=NOW)
    db_session.add(other)
    db_session.commit()
    with pytest.raises(ImportNotFoundError):
        delete_import(db_session, other.id, w["imports"]["me"].id, "person", FakeStorage())
    with pytest.raises(ImportNotFoundError):
        delete_member_portfolio(db_session, other.id, w["me"].id, remove_member=False, storage=FakeStorage())


def test_delete_member_portfolio_with_no_imports(db_session):
    w = _world(db_session)
    empty = HouseholdMember(user_id=w["user"].id, name="Empty", relationship=Relationship.CHILD, created_at=NOW)
    db_session.add(empty)
    db_session.commit()
    empty_id = empty.id
    kept = delete_member_portfolio(db_session, w["user"].id, empty_id, remove_member=False, storage=FakeStorage())
    assert kept.removed_member_ids == [] and db_session.get(HouseholdMember, empty_id) is not None
    gone = delete_member_portfolio(db_session, w["user"].id, empty_id, remove_member=True, storage=FakeStorage())
    assert gone.removed_member_ids == [empty_id] and db_session.get(HouseholdMember, empty_id) is None


def _one_detected_member_with_one_import(db, relationship):
    """Self-contained (not _world, which Task 2 rewrites): a CAS-detected
    member with a single import and one fund."""
    user = User(id=uuid.uuid4(), phone_number="+919700000099", created_at=NOW)
    db.add(user)
    db.flush()
    member = HouseholdMember(
        user_id=user.id, name="Detected One", relationship=relationship, created_at=NOW,
        origin=MemberOrigin.CAS_DETECTED,
    )
    db.add(member)
    db.flush()
    imp = Import(
        household_member_id=member.id, status=ImportStatus.CONFIRMED, uploaded_at=NOW,
        upload_group_id=uuid.uuid4(), file_reference="u/detected.pdf", file_expires_at=NOW,
    )
    scheme = Scheme(amfi_code=f"D-det-{uuid.uuid4().hex[:4]}", name="det", amc_name="AMC", sebi_category="Equity")
    db.add_all([imp, scheme])
    db.flush()
    folio = Folio(household_member_id=member.id, scheme_id=scheme.id, folio_number="det", plan_type=PlanType.DIRECT)
    db.add(folio)
    db.flush()
    db.add(Transaction(
        folio_id=folio.id, import_id=imp.id, type=TransactionType.PURCHASE, date=date(2024, 1, 1),
        amount=Decimal("100.00"), units=Decimal("1.000"), nav=Decimal("100.0000"),
    ))
    db.commit()
    return user, member, imp


def test_delete_keeps_detected_member_with_profile_data(db_session):
    # Review Focus 5: a relationship is profile data, so the member stays.
    user, member, imp = _one_detected_member_with_one_import(db_session, Relationship.CHILD)
    member_id = member.id
    result = delete_import(db_session, user.id, imp.id, "person", FakeStorage())
    assert result.removed_member_ids == []
    assert db_session.get(HouseholdMember, member_id) is not None


def test_delete_removes_untouched_detected_member(db_session):
    user, member, imp = _one_detected_member_with_one_import(db_session, None)
    member_id = member.id
    result = delete_import(db_session, user.id, imp.id, "person", FakeStorage())
    assert result.removed_member_ids == [member_id]
    assert db_session.get(HouseholdMember, member_id) is None
