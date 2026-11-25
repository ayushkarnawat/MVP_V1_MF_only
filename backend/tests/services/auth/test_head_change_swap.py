from __future__ import annotations

import json
import logging
import secrets
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Query, sessionmaker

from app.models.analytics import AnalyticsSection
from app.models.auth import (
    AuthIdentity,
    HeadChangeRequest,
    PendingIdentityVerification,
    Session as SessionModel,
)
from app.models.consent import ConsentRecord
from app.models.enums import (
    AuthIdentityProvider,
    ConsentAction,
    ImportStatus,
    InvestorType,
    PrimaryGoal,
    Relationship,
)
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.user import HouseholdMember, User
from app.services.auth.account_deletion import hard_delete_expired_accounts
from app.services.auth.head_change import HeadChangeError
from app.services.legal.consent import ConsentEvidence
from app.services.import_.pan_claims import PENDING_PAN_TTL, claim_pan_for_member
from app.services.import_.preview_store import save as save_review


NOW = datetime(2026, 11, 2, 10, 0, tzinfo=timezone.utc)


@dataclass
class Household:
    user: User
    old_head: HouseholdMember
    new_head: HouseholdMember
    other_member: HouseholdMember
    old_phone: str
    old_email: str
    old_other_emails: set[str]


def _identity(
    user: User,
    provider: AuthIdentityProvider,
    subject: str,
    *,
    email: str | None = None,
) -> AuthIdentity:
    return AuthIdentity(
        user_id=user.id,
        provider=provider,
        provider_subject=subject,
        email=email,
        identifier_verified_at=NOW,
        created_at=NOW,
        last_used_at=NOW,
    )


def _household(db, *, suffix: str = "1") -> Household:
    old_phone = f"+9197000000{suffix}"
    old_email = f"old-head-{suffix}@example.com"
    user = User(
        id=uuid.uuid4(),
        phone_number=old_phone,
        email=old_email,
        created_at=NOW,
        onboarding_step="complete",
        onboarding_completed_at=NOW,
        investor_type=InvestorType.SELF_DIRECTED,
        primary_goals=[PrimaryGoal.RETIREMENT.value],
    )
    old_head = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=f"Old Head {suffix}",
        relationship=Relationship.SELF,
        is_head=True,
        email=f"old-member-before-{suffix}@example.com",
        phone_number=f"+9196000000{suffix}",
        created_at=NOW,
    )
    new_head = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=f"New Head {suffix}",
        relationship=Relationship.SPOUSE,
        is_head=False,
        email=f"new-head-{suffix}@example.com",
        phone_number=f"+9187000000{suffix}",
        pan_encrypted=f"encrypted-pan-{suffix}",
        pan_lookup_hash=f"pan-hash-{suffix}",
        created_at=NOW,
    )
    other_member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=f"Other Member {suffix}",
        relationship=Relationship.PARENT,
        is_head=False,
        created_at=NOW,
    )
    google_email = f"old-google-{suffix}@example.com"
    legacy_email = f"old-legacy-{suffix}@example.com"
    db.add(user)
    db.flush()
    db.add_all([old_head, new_head, other_member])
    db.flush()
    db.add_all(
        [
            _identity(user, AuthIdentityProvider.PHONE_OTP, old_phone),
            _identity(
                user,
                AuthIdentityProvider.EMAIL_OTP,
                old_email,
                email=old_email,
            ),
            _identity(
                user,
                AuthIdentityProvider.GOOGLE,
                f"google-sub-{suffix}",
                email=google_email,
            ),
            _identity(
                user,
                AuthIdentityProvider.EMAIL_PASSWORD,
                legacy_email,
                email=legacy_email,
            ),
            SessionModel(
                user_id=user.id,
                session_token_hash=f"session-a-{suffix}",
                auth_method=AuthIdentityProvider.PHONE_OTP,
                created_at=NOW,
                expires_at=NOW + timedelta(days=30),
                last_active_at=NOW,
            ),
            SessionModel(
                user_id=user.id,
                session_token_hash=f"session-b-{suffix}",
                auth_method=AuthIdentityProvider.GOOGLE,
                created_at=NOW,
                expires_at=NOW + timedelta(days=30),
                last_active_at=NOW,
            ),
            PendingIdentityVerification(
                provider=AuthIdentityProvider.GOOGLE,
                provider_subject=f"pending-google-{suffix}",
                email=google_email,
                email_verified=True,
                matched_user_id=user.id,
                token_hash=f"pending-token-{suffix}",
                expires_at=NOW + timedelta(minutes=10),
                created_at=NOW,
            ),
        ]
    )
    db.commit()
    return Household(
        user=user,
        old_head=old_head,
        new_head=new_head,
        other_member=other_member,
        old_phone=old_phone,
        old_email=old_email,
        old_other_emails={google_email, legacy_email},
    )


def _evidence() -> ConsentEvidence:
    return ConsentEvidence(
        ip_truncated="203.0.113.0/24",
        ip_hmac="evidence-hmac",
        user_agent="pytest",
        device_id="test-device",
    )


def _start(db, household: Household):
    from app.services.auth import head_change

    _, start_code = head_change.request_head_change_start_code(
        db, household.user, household.new_head.id
    )
    assert start_code is not None
    return head_change.start_head_change(
        db, household.user, household.new_head.id, start_code
    )


def _verify_remaining(db, household: Household, started, *, count: int = 3):
    from app.services.auth import head_change

    codes = [code for code in started.codes if not code.verified]
    for code in codes[:count]:
        assert code.otp is not None
        head_change.verify_head_change_code(
            db,
            household.user,
            started.request.id,
            code.party,
            code.channel,
            code.otp,
        )
    return started.request.id


def _ready_request(db, household: Household):
    return _verify_remaining(db, household, _start(db, household))


def _complete(db, household: Household, request_id):
    from app.services.auth import head_change

    return head_change.complete_head_change(
        db, household.user, request_id, _evidence()
    )


def _assert_unswapped(db, household: Household) -> None:
    db.expire_all()
    user = db.get(User, household.user.id)
    old_head = db.get(HouseholdMember, household.old_head.id)
    new_head = db.get(HouseholdMember, household.new_head.id)
    assert (user.phone_number, user.email) == (household.old_phone, household.old_email)
    assert old_head.is_head is True
    assert old_head.relationship == Relationship.SELF
    assert new_head.is_head is False
    assert new_head.relationship == Relationship.SPOUSE
    assert db.query(AuthIdentity).filter_by(user_id=user.id).count() == 4
    assert db.query(SessionModel).filter_by(user_id=user.id).count() == 2


def test_complete_discards_a_live_review_and_releases_its_pan_claim(db_session):
    household = _household(db_session)
    request_id = _ready_request(db_session, household)
    member = household.other_member
    pan = "ABCDE1234F"
    claim_pan_for_member(db_session, member, pan, pending=True)
    review_id = uuid.uuid4()
    save_review(db_session, {
        "session_id": review_id.hex, "household_member_id": member.id,
        "created_at": datetime.now(timezone.utc), "pending_claims": [(member.id, pan)],
    })
    db_session.commit()

    result = _complete(db_session, household, request_id)

    assert result.discarded_review is True
    assert db_session.get(Import, review_id) is None
    db_session.refresh(member)
    assert (member.pan_encrypted, member.pan_lookup_hash, member.pan_pending_until) == (None, None, None)


def test_complete_reports_no_discard_when_no_review_existed(db_session):
    household = _household(db_session)
    result = _complete(db_session, household, _ready_request(db_session, household))
    assert result.discarded_review is False


def test_complete_discards_reviews_of_two_members_and_reports_one_flag(db_session):
    household = _household(db_session)
    request_id = _ready_request(db_session, household)
    ids = [uuid.uuid4(), uuid.uuid4()]
    for member, review_id in zip([household.new_head, household.other_member], ids):
        db_session.add(Import(id=review_id, household_member_id=member.id,
                              status=ImportStatus.PREVIEWING, uploaded_at=datetime.now(timezone.utc)))
    db_session.commit()

    result = _complete(db_session, household, request_id)

    assert result.discarded_review is True
    assert all(db_session.get(Import, review_id) is None for review_id in ids)


def test_complete_answers_statement_being_saved_while_a_confirm_is_processing(db_session):
    from app.models.auth import OtpRequest

    household = _household(db_session)
    request_id = _ready_request(db_session, household)
    request = db_session.get(HeadChangeRequest, request_id)
    before = (request.snapshot, request.current_email_verified_at, request.current_phone_verified_at,
              request.new_email_verified_at, request.new_phone_verified_at)
    codes_before = [(row.id, row.otp_hash, row.attempt_count) for row in db_session.query(OtpRequest).all()]
    review = Import(id=uuid.uuid4(), household_member_id=household.new_head.id,
                    status=ImportStatus.PROCESSING, uploaded_at=datetime.now(timezone.utc))
    db_session.add(review)
    db_session.commit()

    with pytest.raises(HeadChangeError) as exc:
        _complete(db_session, household, request_id)

    assert (exc.value.status_code, exc.value.code, exc.value.message) == (
        409, "statement_being_saved", "A statement is being saved. Try again in a minute.")
    _assert_unswapped(db_session, household)
    request = db_session.get(HeadChangeRequest, request_id)
    assert request.status == "pending"
    assert (request.snapshot, request.current_email_verified_at, request.current_phone_verified_at,
            request.new_email_verified_at, request.new_phone_verified_at) == before
    assert [(row.id, row.otp_hash, row.attempt_count) for row in db_session.query(OtpRequest).all()] == codes_before
    assert db_session.get(Import, review.id).status == ImportStatus.PROCESSING


def test_complete_answers_statement_being_saved_when_the_import_row_lock_is_not_available(
    db_session, monkeypatch
):
    from app.models.auth import OtpRequest

    household = _household(db_session)
    request_id = _ready_request(db_session, household)
    request = db_session.get(HeadChangeRequest, request_id)
    verified_before = (request.current_email_verified_at, request.current_phone_verified_at,
                       request.new_email_verified_at, request.new_phone_verified_at)
    codes_before = [(row.id, row.otp_hash, row.attempt_count) for row in db_session.query(OtpRequest).all()]

    class LockNotAvailable(Exception):
        pgcode = "55P03"

    error = OperationalError("SELECT imports FOR UPDATE NOWAIT", {}, LockNotAvailable())
    original_all = Query.all

    def all_with_locked_import(query):
        if query.column_descriptions[0]["entity"] is Import:
            raise error
        return original_all(query)

    monkeypatch.setattr(Query, "all", all_with_locked_import)

    with pytest.raises(HeadChangeError) as exc:
        _complete(db_session, household, request_id)

    assert (exc.value.status_code, exc.value.code, exc.value.message) == (
        409, "statement_being_saved", "A statement is being saved. Try again in a minute.")
    _assert_unswapped(db_session, household)
    request = db_session.get(HeadChangeRequest, request_id)
    assert request.status == "pending"
    assert all(value is not None for value in verified_before)
    assert (request.current_email_verified_at, request.current_phone_verified_at,
            request.new_email_verified_at, request.new_phone_verified_at) == verified_before
    assert [(row.id, row.otp_hash, row.attempt_count) for row in db_session.query(OtpRequest).all()] == codes_before


def test_other_operational_errors_are_not_swallowed(db_session, monkeypatch):
    household = _household(db_session)
    request_id = _ready_request(db_session, household)

    class SerializationFailure(Exception):
        pgcode = "40001"

    error = OperationalError("SELECT imports FOR UPDATE NOWAIT", {}, SerializationFailure())
    original_all = Query.all

    def all_with_failed_import(query):
        if query.column_descriptions[0]["entity"] is Import:
            raise error
        return original_all(query)

    monkeypatch.setattr(Query, "all", all_with_failed_import)

    with pytest.raises(OperationalError) as exc:
        _complete(db_session, household, request_id)

    assert exc.value is error
    _assert_unswapped(db_session, household)


def test_retry_after_the_saving_answer_succeeds_once_the_confirm_finished(db_session):
    household = _household(db_session)
    request_id = _ready_request(db_session, household)
    review = Import(id=uuid.uuid4(), household_member_id=household.new_head.id,
                    status=ImportStatus.PROCESSING, uploaded_at=datetime.now(timezone.utc))
    db_session.add(review)
    db_session.commit()
    with pytest.raises(HeadChangeError) as exc:
        _complete(db_session, household, request_id)
    assert exc.value.code == "statement_being_saved"
    review.status = ImportStatus.CONFIRMED
    db_session.commit()

    result = _complete(db_session, household, request_id)

    assert result.request_id == request_id
    assert result.status == "completed"
    assert result.discarded_review is False
    assert db_session.get(Import, review.id).status == ImportStatus.CONFIRMED


def test_a_stale_processing_row_is_discarded_not_blocking(db_session):
    household = _household(db_session)
    request_id = _ready_request(db_session, household)
    member = household.other_member
    pan = "ABCDE1234F"
    claim_pan_for_member(db_session, member, pan, pending=True)
    review_id = uuid.uuid4()
    save_review(db_session, {
        "session_id": review_id.hex, "household_member_id": member.id,
        "created_at": datetime.now(timezone.utc) - PENDING_PAN_TTL - timedelta(minutes=1),
        "pending_claims": [(member.id, pan)],
    })
    db_session.get(Import, review_id).status = ImportStatus.PROCESSING
    db_session.commit()

    result = _complete(db_session, household, request_id)

    assert result.discarded_review is True
    assert db_session.get(Import, review_id) is None
    db_session.refresh(member)
    assert (member.pan_encrypted, member.pan_lookup_hash, member.pan_pending_until) == (None, None, None)


def test_change_leaves_import_rows_and_pan_fields_untouched(db_session):
    household = _household(db_session)
    request_id = _ready_request(db_session, household)
    member = household.other_member
    member.pan_encrypted = "encrypted-permanent-pan"
    member.pan_lookup_hash = "permanent-pan-hash"
    pan_fields = [column.key for column in HouseholdMember.__table__.columns if "pan" in column.key]
    rows = [Import(id=uuid.uuid4(), household_member_id=member.id, status=status,
                   source_tab="request" if status == ImportStatus.WAITING_FOR_USER else "upload",
                   uploaded_at=datetime.now(timezone.utc),
                   expires_at=datetime.now(timezone.utc) + timedelta(hours=48))
            for status in (ImportStatus.CONFIRMED, ImportStatus.FAILED, ImportStatus.EXPIRED,
                           ImportStatus.WAITING_FOR_USER)]
    db_session.add_all(rows)
    db_session.commit()
    before = [{column.key: getattr(row, column.key) for column in Import.__table__.columns} for row in rows]
    pans_before = {m.id: {field: getattr(m, field) for field in pan_fields}
                   for m in (household.old_head, household.new_head, member)}

    result = _complete(db_session, household, request_id)

    assert result.discarded_review is False
    db_session.expire_all()
    assert [{column.key: getattr(db_session.get(Import, row.id), column.key)
             for column in Import.__table__.columns} for row in rows] == before
    assert {mid: {field: getattr(db_session.get(HouseholdMember, mid), field) for field in pan_fields}
            for mid in pans_before} == pans_before


def test_undo_works_while_a_cams_request_waits(db_session, monkeypatch):
    from tests.services.auth.test_head_change_undo import _swap, _undo

    household = _household(db_session)
    row = Import(id=uuid.uuid4(), household_member_id=household.new_head.id,
                 status=ImportStatus.WAITING_FOR_USER, source_tab="request",
                 uploaded_at=datetime.now(timezone.utc),
                 expires_at=datetime.now(timezone.utc) + timedelta(hours=48))
    db_session.add(row)
    db_session.commit()
    _, token, _ = _swap(db_session, household, monkeypatch)

    assert _undo(db_session, token).status == "undone"
    assert db_session.get(Import, row.id).status == ImportStatus.WAITING_FOR_USER
    assert db_session.get(HouseholdMember, household.old_head.id).is_head is True


def test_import_started_after_start_does_not_fail_the_final_step(db_session):
    household = _household(db_session)
    started = _start(db_session, household)
    row = Import(id=uuid.uuid4(), household_member_id=household.new_head.id,
                 status=ImportStatus.PREVIEWING, uploaded_at=datetime.now(timezone.utc))
    db_session.add(row)
    db_session.commit()
    request_id = _verify_remaining(db_session, household, started)

    result = _complete(db_session, household, request_id)

    assert result.status == "completed"
    assert result.discarded_review is True
    assert db_session.get(Import, row.id) is None


def test_swap_leaves_user_id_portfolio_and_analytics_rows_untouched(db_session):
    household = _household(db_session)
    scheme = Scheme(
        name="Test Fund",
        amc_name="Test AMC",
        sebi_category="Equity",
    )
    db_session.add(scheme)
    db_session.flush()
    folio = Folio(
        household_member_id=household.old_head.id,
        scheme_id=scheme.id,
        folio_number="123 / 4",
    )
    analytics = AnalyticsSection(
        user_id=household.user.id,
        scope_key=str(household.old_head.id),
        section="overview",
        household_member_id=household.old_head.id,
        payload={"value": "123.45"},
        computed_at=NOW,
    )
    db_session.add_all([folio, analytics])
    db_session.commit()
    original = (household.user.id, household.old_head.id, folio.id, analytics.scope_key)

    result = _complete(db_session, household, _ready_request(db_session, household))

    db_session.expire_all()
    assert result.status == "completed"
    assert (
        db_session.get(User, original[0]).id,
        db_session.get(HouseholdMember, original[1]).id,
        db_session.get(Folio, original[2]).id,
        db_session.get(AnalyticsSection, (original[0], original[3], "overview")).scope_key,
    ) == original


def test_google_identity_cannot_sign_in_afterwards_and_old_contact_becomes_free(db_session):
    household = _household(db_session, suffix="2")
    request_id = _ready_request(db_session, household)

    _complete(db_session, household, request_id)

    assert (
        db_session.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.GOOGLE, provider_subject="google-sub-2")
        .first()
        is None
    )
    replacement = User(
        phone_number=household.old_phone,
        email=household.old_email,
        created_at=NOW,
    )
    db_session.add(replacement)
    db_session.flush()
    db_session.add_all(
        [
            _identity(replacement, AuthIdentityProvider.PHONE_OTP, household.old_phone),
            _identity(
                replacement,
                AuthIdentityProvider.EMAIL_OTP,
                household.old_email,
                email=household.old_email,
            ),
        ]
    )
    db_session.commit()


def test_one_self_index_order_never_violates_and_failure_midway_rolls_back_everything(
    db_session, monkeypatch
):
    household = _household(db_session, suffix="3")
    request_id = _ready_request(db_session, household)
    from app.services.auth import head_change

    def fail_after_member_changes(*_args, **_kwargs):
        raise RuntimeError("forced midway failure")

    monkeypatch.setattr(
        head_change, "record_consent", fail_after_member_changes, raising=False
    )
    with pytest.raises(RuntimeError, match="forced midway failure"):
        _complete(db_session, household, request_id)
    _assert_unswapped(db_session, household)

    monkeypatch.undo()
    _complete(db_session, household, request_id)
    db_session.expire_all()
    assert db_session.get(HouseholdMember, household.old_head.id).relationship != Relationship.SELF
    assert db_session.get(HouseholdMember, household.new_head.id).relationship == Relationship.SELF


def test_sessions_are_all_deleted_including_the_callers(db_session):
    household = _household(db_session, suffix="4")
    _complete(db_session, household, _ready_request(db_session, household))

    assert db_session.query(SessionModel).filter_by(user_id=household.user.id).count() == 0
    assert (
        db_session.query(PendingIdentityVerification)
        .filter_by(matched_user_id=household.user.id)
        .count()
        == 0
    )


def test_labels_flip_per_the_table_and_the_old_heads_contact_lands_on_their_row(db_session):
    household = _household(db_session, suffix="5")
    _complete(db_session, household, _ready_request(db_session, household))
    db_session.expire_all()

    old_head = db_session.get(HouseholdMember, household.old_head.id)
    new_head = db_session.get(HouseholdMember, household.new_head.id)
    other = db_session.get(HouseholdMember, household.other_member.id)
    assert (old_head.is_head, old_head.relationship, old_head.relationship_other_label) == (
        False,
        Relationship.SPOUSE,
        None,
    )
    assert (old_head.email, old_head.phone_number) == (
        household.old_email,
        household.old_phone,
    )
    assert (new_head.is_head, new_head.relationship, new_head.relationship_other_label) == (
        True,
        Relationship.SELF,
        None,
    )
    assert (other.relationship, other.relationship_other_label) == (
        Relationship.OTHER,
        "parent-in-law",
    )


def test_onboarding_answers_and_created_at_are_kept(db_session):
    household = _household(db_session, suffix="6")
    before = (
        household.user.created_at,
        household.user.onboarding_step,
        household.user.onboarding_completed_at,
        household.user.investor_type,
        list(household.user.primary_goals),
    )

    _complete(db_session, household, _ready_request(db_session, household))
    db_session.expire_all()
    user = db_session.get(User, household.user.id)
    assert (
        user.created_at,
        user.onboarding_step,
        user.onboarding_completed_at,
        user.investor_type,
        user.primary_goals,
    ) == before


def test_consent_withdrawn_so_new_head_must_accept_terms(db_session):
    household = _household(db_session, suffix="7")
    _complete(db_session, household, _ready_request(db_session, household))

    rows = db_session.query(ConsentRecord).filter_by(user_id=household.user.id).all()
    assert len(rows) == 3
    assert {row.action for row in rows} == {ConsentAction.WITHDRAWN}
    assert {row.surface for row in rows} == {"head_change"}


def test_email_failure_does_not_undo_the_swap(db_session, monkeypatch):
    household = _household(db_session, suffix="8")
    request_id = _ready_request(db_session, household)
    from app.services.auth import head_change

    class FailingProvider:
        def send_email(self, *_args, **_kwargs):
            raise RuntimeError("mailbox unavailable")

    monkeypatch.setattr(
        head_change, "get_email_provider", lambda: FailingProvider(), raising=False
    )
    result = _complete(db_session, household, request_id)

    assert result.status == "completed"
    db_session.expire_all()
    assert db_session.get(User, household.user.id).email == household.new_head.email
    request = db_session.get(HeadChangeRequest, request_id)
    assert request.status == "completed"
    assert request.snapshot["notices"]["failed_roles"]


def test_account_deletion_removes_the_new_request_table_rows():
    from app.db.base import Base

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(autoflush=False, bind=engine)()
    household = _household(db, suffix="9")
    request_id = _start(db, household).request.id
    household.user.pending_deletion = True
    household.user.deletion_scheduled_at = NOW - timedelta(seconds=1)
    db.commit()

    assert hard_delete_expired_accounts(db, now=NOW) == 1
    assert db.get(HeadChangeRequest, request_id) is None
    db.close()
    engine.dispose()


def test_swap_with_only_three_of_four_codes_verified_refuses(db_session):
    household = _household(db_session, suffix="a")
    request_id = _verify_remaining(db_session, household, _start(db_session, household), count=2)

    with pytest.raises(HeadChangeError) as exc:
        _complete(db_session, household, request_id)

    assert (exc.value.status_code, exc.value.code, exc.value.message) == (
        409,
        "request_not_ready",
        "Enter all four codes before confirming the change.",
    )
    _assert_unswapped(db_session, household)


def test_expired_request_refuses_and_changes_no_account_data(db_session):
    household = _household(db_session, suffix="b")
    request_id = _ready_request(db_session, household)
    request = db_session.get(HeadChangeRequest, request_id)
    request.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    with pytest.raises(HeadChangeError) as exc:
        _complete(db_session, household, request_id)

    assert (exc.value.status_code, exc.value.code, exc.value.message) == (
        410,
        "request_expired",
        "The codes expired. Nothing has changed. Start again.",
    )
    _assert_unswapped(db_session, household)
    assert db_session.get(HeadChangeRequest, request_id).status == "expired"


def test_changed_contact_refuses_and_changes_nothing(db_session):
    household = _household(db_session, suffix="c")
    request_id = _ready_request(db_session, household)
    household.new_head.email = "changed-after-code@example.com"
    db_session.commit()

    with pytest.raises(HeadChangeError) as exc:
        _complete(db_session, household, request_id)

    assert (exc.value.status_code, exc.value.code, exc.value.message) == (
        409,
        "request_changed",
        "Something changed since you started. Nothing has changed. Start again.",
    )
    _assert_unswapped(db_session, household)


def test_undo_link_appears_only_in_the_previous_heads_emails(db_session, monkeypatch):
    household = _household(db_session, suffix="d")
    request_id = _ready_request(db_session, household)
    from app.services.auth import head_change

    sent = []

    class RecordingProvider:
        def send_email(self, to, subject, body, html_body=None):
            sent.append({"to": to, "subject": subject, "body": body, "html": html_body})

    monkeypatch.setattr(
        head_change, "get_email_provider", lambda: RecordingProvider(), raising=False
    )
    _complete(db_session, household, request_id)

    new_messages = [item for item in sent if item["to"] == household.new_head.email]
    old_addresses = {household.old_email, *household.old_other_emails}
    old_messages = [item for item in sent if item["to"] in old_addresses]
    assert len(new_messages) == 1
    assert "undo-head-change" not in new_messages[0]["body"]
    assert all(
        "undo-head-change" not in item["body"]
        for item in old_messages
        if item["subject"] == "The Head of Family on Unifolio has changed."
    )
    assert {
        item["to"]
        for item in old_messages
        if item["subject"] == "Undo the Head of Family change."
        and "/undo-head-change#token=" in item["body"]
    } == old_addresses
    # The three messages are worded for their own reader, and the sign-in notices carry no button.
    assert "You’re now the Head of Family." in new_messages[0]["body"]
    old_notices = [
        item for item in old_messages if item["subject"] == "The Head of Family on Unifolio has changed."
    ]
    assert old_notices and all(
        "The Head of Family for your Unifolio account has changed." in item["body"]
        and "separate email" in item["body"]
        # The B-9 layout: the notice carries no button and no link of its own (the support address is the only mailto).
        and "undo-head-change" not in item["html"]
        and "Undo Head of Family Change" not in item["html"]
        for item in old_notices
    )
    assert all(
        "valid until" in item["body"] and "IST" in item["body"]
        for item in old_messages
        if item["subject"] == "Undo the Head of Family change."
    )


def test_snapshot_and_logs_contain_no_raw_token_and_no_code(db_session, monkeypatch, caplog):
    household = _household(db_session, suffix="e")
    started = _start(db_session, household)
    raw_codes = {code.otp for code in started.codes if code.otp}
    request_id = _verify_remaining(db_session, household, started)
    from app.services.auth import head_change

    raw_token = "raw-undo-token-that-must-not-be-stored-or-logged"
    monkeypatch.setattr(secrets, "token_urlsafe", lambda _size: raw_token)
    caplog.set_level(logging.INFO)

    result = _complete(db_session, household, request_id)

    assert set(asdict(result)) == {
        "request_id",
        "user_id",
        "from_member_id",
        "to_member_id",
        "status",
        "discarded_review",
    }
    snapshot_text = json.dumps(db_session.get(HeadChangeRequest, request_id).snapshot)
    assert raw_token not in snapshot_text
    assert all(code not in snapshot_text for code in raw_codes)
    assert raw_token not in caplog.text
    assert all(code not in caplog.text for code in raw_codes)


def test_integrity_error_at_final_commit_answers_contact_in_use(db_session, monkeypatch):
    household = _household(db_session, suffix="f")
    request_id = _ready_request(db_session, household)

    def fail_commit():
        raise IntegrityError("forced commit race", {}, RuntimeError("unique rule"))

    monkeypatch.setattr(db_session, "commit", fail_commit)
    with pytest.raises(HeadChangeError) as exc:
        _complete(db_session, household, request_id)

    assert (exc.value.status_code, exc.value.code) == (409, "contact_in_use")



def test_a_missing_email_provider_after_the_commit_does_not_fail_the_request(db_session, monkeypatch):
    """The swap is already committed when the notices go out; an unconfigured or broken provider
    must never turn that into an error (the undo link is lost, so every role is recorded as failed)."""
    household = _household(db_session, suffix="9")
    request_id = _ready_request(db_session, household)
    from app.services.auth import head_change
    from app.services.auth.email_provider import NoEmailProviderConfiguredError

    def no_provider():
        raise NoEmailProviderConfiguredError("not configured")

    monkeypatch.setattr(head_change, "get_email_provider", no_provider, raising=False)
    result = _complete(db_session, household, request_id)

    assert result.status == "completed"
    db_session.expire_all()
    assert db_session.get(User, household.user.id).email == household.new_head.email
    request = db_session.get(HeadChangeRequest, request_id)
    assert request.status == "completed"
    assert set(request.snapshot["notices"]["failed_roles"]) >= {"new_head_changed", "old_head_changed", "old_head_undo"}
