from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.models.user import User
from app.services.auth.account_deletion import (
    hard_delete_expired_accounts,
    reactivate_account,
    schedule_account_deletion,
)


def test_schedule_account_deletion_records_anonymous_survey_and_five_day_deadline(db_session):
    from app.models.account_deletion import AccountDeletionSurvey

    now = datetime(2026, 9, 11, 8, 0, tzinfo=timezone.utc)
    user = User(phone_number="+919100000001", created_at=now)
    db_session.add(user)
    db_session.flush()

    scheduled_at = schedule_account_deletion(
        db_session,
        user,
        reason="missing_feature",
        feedback="I need capital-gains reports.",
        now=now,
    )

    assert user.pending_deletion is True
    assert scheduled_at == now + timedelta(days=5)
    persisted_deadline = user.deletion_scheduled_at
    if persisted_deadline.tzinfo is None:  # SQLite drops timezone metadata on reload.
        persisted_deadline = persisted_deadline.replace(tzinfo=timezone.utc)
    assert persisted_deadline == scheduled_at
    survey = db_session.query(AccountDeletionSurvey).one()
    assert survey.reason == "missing_feature"
    assert survey.feedback == "I need capital-gains reports."


def test_reactivate_account_clears_pending_deletion_without_other_side_effects(db_session):
    now = datetime(2026, 9, 11, 8, 0, tzinfo=timezone.utc)
    user = User(
        phone_number="+919100000002",
        created_at=now,
        pending_deletion=True,
        deletion_scheduled_at=now + timedelta(days=5),
    )
    db_session.add(user)
    db_session.commit()

    reactivate_account(db_session, user)

    assert user.pending_deletion is False
    assert user.deletion_scheduled_at is None
    assert db_session.get(User, user.id) is user


def test_hard_delete_removes_expired_household_and_preserves_anonymous_survey(db_session, monkeypatch):
    from app.models.account_deletion import AccountDeletionSurvey
    from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
    from app.models.auth import AuthIdentity, OtpRequest, PendingIdentityVerification, Session
    from app.models.enums import AuthIdentityProvider, ImportStatus, PlanType, Relationship, TransactionType
    from app.models.folio import Folio
    from app.models.imports import Import
    from app.models.reference import Scheme
    from app.models.snapshot import PortfolioSnapshot
    from app.models.transaction import Transaction
    from app.models.user import HouseholdMember
    from app.services.analytics.recompute import bump_recompute_generation as real_bump
    import app.services.auth.account_deletion as account_deletion_service

    now = datetime(2026, 9, 20, 8, 0, tzinfo=timezone.utc)
    user = User(
        phone_number="+919100000003",
        created_at=now - timedelta(days=30),
        pending_deletion=True,
        deletion_scheduled_at=now - timedelta(seconds=1),
    )
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(
        user_id=user.id,
        name="Alice",
        relationship=Relationship.SELF,
        created_at=user.created_at,
    )
    db_session.add(member)
    db_session.flush()
    scheme = Scheme(amfi_code="HARD-DELETE", name="Delete Fund", amc_name="AMC", sebi_category="Equity")
    db_session.add(scheme)
    db_session.flush()
    import_record = Import(
        household_member_id=member.id,
        status=ImportStatus.IMPORT_SUCCESSFUL,
        uploaded_at=user.created_at,
    )
    folio = Folio(
        household_member_id=member.id,
        scheme_id=scheme.id,
        folio_number="DELETE-ME",
        plan_type=PlanType.DIRECT,
    )
    db_session.add_all([import_record, folio])
    db_session.flush()
    db_session.add_all([
        AuthIdentity(
            user_id=user.id,
            provider=AuthIdentityProvider.PHONE_OTP,
            provider_subject=user.phone_number,
            identifier_verified_at=user.created_at,
            created_at=user.created_at,
            last_used_at=user.created_at,
        ),
        Session(
            user_id=user.id,
            session_token_hash="hash",
            auth_method=AuthIdentityProvider.PHONE_OTP,
            created_at=user.created_at,
            expires_at=now + timedelta(days=1),
            last_active_at=user.created_at,
        ),
        PendingIdentityVerification(
            provider=AuthIdentityProvider.EMAIL_OTP,
            provider_subject="pending@example.com",
            email="pending@example.com",
            email_verified=True,
            matched_user_id=user.id,
            token_hash="pending-hash",
            expires_at=now + timedelta(hours=1),
            created_at=user.created_at,
        ),
        Transaction(
            folio_id=folio.id,
            import_id=import_record.id,
            type=TransactionType.PURCHASE,
            date=date(2026, 8, 1),
            amount=Decimal("100.00"),
            units=Decimal("10.000"),
            nav=Decimal("10.0000"),
        ),
        PortfolioSnapshot(
            household_member_id=member.id,
            snapshot_month=date(2026, 8, 1),
            total_value=Decimal("100.00"),
            computed_at=user.created_at,
        ),
        AnalyticsSection(
            user_id=user.id,
            scope_key=str(member.id),
            section="allocation",
            household_member_id=member.id,
            payload={"total_value": "100.00"},
            computed_at=user.created_at,
        ),
        AnalyticsSection(
            user_id=user.id,
            scope_key="combined",
            section="allocation",
            payload={"total_value": "100.00"},
            computed_at=user.created_at,
        ),
        AnalyticsRecomputeStatus(user_id=user.id, started_at=user.created_at, generation=4),
        AccountDeletionSurvey(reason="other", feedback="Leaving", created_at=user.created_at),
        OtpRequest(
            phone_number=user.phone_number,
            otp_hash="hash",
            expires_at=user.created_at + timedelta(minutes=5),
            created_at=user.created_at,
        ),
    ])
    db_session.commit()

    generation_bumped = False

    def observe_bump(db, user_id):
        nonlocal generation_bumped
        assert db.get(AnalyticsRecomputeStatus, user_id).generation == 4
        real_bump(db, user_id)
        assert db.get(AnalyticsRecomputeStatus, user_id).generation == 5
        generation_bumped = True

    monkeypatch.setattr(account_deletion_service, "bump_recompute_generation", observe_bump)

    deleted = hard_delete_expired_accounts(db_session, now=now)

    assert deleted == 1
    assert db_session.query(User).count() == 0
    assert db_session.query(HouseholdMember).count() == 0
    assert db_session.query(AuthIdentity).count() == 0
    assert db_session.query(Session).count() == 0
    assert db_session.query(PendingIdentityVerification).count() == 0
    assert db_session.query(Transaction).count() == 0
    assert db_session.query(Import).count() == 0
    assert db_session.query(Folio).count() == 0
    assert db_session.query(PortfolioSnapshot).count() == 0
    assert db_session.query(AnalyticsSection).count() == 0
    assert db_session.query(AnalyticsRecomputeStatus).count() == 0
    assert db_session.query(OtpRequest).count() == 0
    assert generation_bumped is True
    assert db_session.query(AccountDeletionSurvey).count() == 1
    assert db_session.query(Scheme).count() == 1
