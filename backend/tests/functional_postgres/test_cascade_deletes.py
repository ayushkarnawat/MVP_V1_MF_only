import os
import subprocess
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

pytestmark = pytest.mark.postgres


@pytest.fixture()
def postgres_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set — no local Postgres to test against")
    return url


def _migrate(postgres_url: str, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "base"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr


def test_hard_delete_expired_accounts_cascades_cleanly_on_postgres(postgres_url, monkeypatch):
    """The SQLite counterpart (tests/services/auth/test_account_deletion.py)
    enforces FK ordering via PRAGMA foreign_keys=ON -- a good but not
    identical proxy for Postgres's real FK/deferred-constraint semantics.
    This proves the same delete order round-trips against a real server."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.models.account_deletion import AccountDeletionSurvey
    from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
    from app.models.auth import AuthIdentity, OtpRequest, PendingIdentityVerification
    from app.models.auth import Session as SessionModel
    from app.models.enums import AuthIdentityProvider, ImportStatus, PlanType, Relationship, TransactionType
    from app.models.folio import Folio
    from app.models.imports import Import
    from app.models.reference import Scheme
    from app.models.snapshot import PortfolioSnapshot
    from app.models.transaction import Transaction
    from app.models.user import HouseholdMember, User
    from app.services.auth.account_deletion import hard_delete_expired_accounts

    _migrate(postgres_url, monkeypatch)

    now = datetime.now(timezone.utc)
    db = sessionmaker(bind=create_engine(postgres_url))()

    user = User(
        id=uuid.uuid4(), phone_number="+919000000099", created_at=now - timedelta(days=30),
        pending_deletion=True, deletion_scheduled_at=now - timedelta(seconds=1),
    )
    db.add(user)
    db.commit()

    member = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Alice",
        relationship=Relationship.SELF, created_at=now,
    )
    db.add(member)
    db.commit()

    scheme = Scheme(
        id=uuid.uuid4(), amfi_code="PG-HARD-DELETE", name="Delete Fund",
        amc_name="AMC", sebi_category="Equity",
    )
    db.add(scheme)
    db.commit()

    import_record = Import(
        id=uuid.uuid4(), household_member_id=member.id,
        status=ImportStatus.IMPORT_SUCCESSFUL, uploaded_at=now,
    )
    folio = Folio(
        id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id,
        folio_number="PG-DELETE-ME", plan_type=PlanType.DIRECT,
    )
    db.add_all([import_record, folio])
    db.commit()

    db.add_all([
        AuthIdentity(
            id=uuid.uuid4(), user_id=user.id, provider=AuthIdentityProvider.PHONE_OTP,
            provider_subject=user.phone_number, identifier_verified_at=now,
            created_at=now, last_used_at=now,
        ),
        SessionModel(
            id=uuid.uuid4(), user_id=user.id, session_token_hash="pg-hash",
            auth_method=AuthIdentityProvider.PHONE_OTP, created_at=now,
            expires_at=now + timedelta(days=1), last_active_at=now,
        ),
        PendingIdentityVerification(
            id=uuid.uuid4(), provider=AuthIdentityProvider.EMAIL_OTP,
            provider_subject="pg-pending@example.com", email="pg-pending@example.com",
            email_verified=True, matched_user_id=user.id, token_hash="pg-pending-hash",
            expires_at=now + timedelta(hours=1), created_at=now,
        ),
        Transaction(
            id=uuid.uuid4(), folio_id=folio.id, import_id=import_record.id,
            type=TransactionType.PURCHASE, date=date(2024, 8, 1),
            amount=Decimal("100.00"), units=Decimal("10.000"), nav=Decimal("10.0000"),
        ),
        PortfolioSnapshot(
            household_member_id=member.id, snapshot_month=date(2024, 8, 1),
            total_value=Decimal("100.00"), computed_at=now,
        ),
        AnalyticsSection(
            user_id=user.id, scope_key=str(member.id), section="allocation",
            household_member_id=member.id, payload={"total_value": "100.00"}, computed_at=now,
        ),
        AnalyticsSection(
            user_id=user.id, scope_key="combined", section="allocation",
            payload={"total_value": "100.00"}, computed_at=now,
        ),
        AnalyticsRecomputeStatus(user_id=user.id, started_at=now, generation=4),
        AccountDeletionSurvey(reason="other", feedback="Leaving", created_at=now),
        OtpRequest(
            phone_number=user.phone_number, otp_hash="pg-hash",
            expires_at=now + timedelta(minutes=5), created_at=now,
        ),
    ])
    db.commit()

    deleted = hard_delete_expired_accounts(db, now=now)

    assert deleted == 1
    assert db.query(User).filter_by(id=user.id).count() == 0
    assert db.query(HouseholdMember).filter_by(user_id=user.id).count() == 0
    assert db.query(AuthIdentity).filter_by(user_id=user.id).count() == 0
    assert db.query(SessionModel).filter_by(user_id=user.id).count() == 0
    assert db.query(PendingIdentityVerification).filter_by(matched_user_id=user.id).count() == 0
    assert db.query(Transaction).filter_by(import_id=import_record.id).count() == 0
    assert db.query(Import).filter_by(household_member_id=member.id).count() == 0
    assert db.query(Folio).filter_by(household_member_id=member.id).count() == 0
    assert db.query(PortfolioSnapshot).filter_by(household_member_id=member.id).count() == 0
    assert db.query(AnalyticsSection).filter_by(user_id=user.id).count() == 0
    assert db.query(AnalyticsRecomputeStatus).filter_by(user_id=user.id).count() == 0
    assert db.query(OtpRequest).filter_by(phone_number=user.phone_number).count() == 0
    assert db.query(AccountDeletionSurvey).count() == 1
    assert db.query(Scheme).filter_by(id=scheme.id).count() == 1
    db.close()


def test_delete_household_import_cascades_cleanly_on_postgres(postgres_url, monkeypatch):
    """The SQLite counterpart (tests/api/test_import_history_delete_routes.py)
    exercises the same delete order via PRAGMA foreign_keys=ON. This proves
    it round-trips against a real server too."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.api.imports import delete_household_import
    from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
    from app.models.enums import ImportStatus, PlanType, Relationship, TransactionType
    from app.models.folio import Folio
    from app.models.imports import Import
    from app.models.reference import Scheme
    from app.models.transaction import Transaction
    from app.models.user import HouseholdMember, User

    _migrate(postgres_url, monkeypatch)

    now = datetime.now(timezone.utc)
    db = sessionmaker(bind=create_engine(postgres_url))()

    user = User(id=uuid.uuid4(), phone_number="+919000000098", created_at=now)
    db.add(user)
    db.commit()

    member = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Bob",
        relationship=Relationship.SELF, created_at=now,
    )
    db.add(member)
    db.commit()

    scheme = Scheme(
        id=uuid.uuid4(), amfi_code="PG-IMPORT-DELETE", name="Test",
        amc_name="AMC", sebi_category="Equity",
    )
    db.add(scheme)
    db.commit()

    import_record = Import(
        id=uuid.uuid4(), household_member_id=member.id,
        status=ImportStatus.IMPORT_SUCCESSFUL, uploaded_at=now,
    )
    folio = Folio(
        id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id,
        folio_number="PG-F1", plan_type=PlanType.DIRECT,
    )
    db.add_all([import_record, folio])
    db.commit()

    db.add(Transaction(
        id=uuid.uuid4(), folio_id=folio.id, import_id=import_record.id,
        type=TransactionType.PURCHASE, date=date(2024, 1, 1),
        amount=Decimal("100.00"), units=Decimal("1.000"), nav=Decimal("100.0000"),
    ))
    db.add(AnalyticsSection(
        user_id=user.id, scope_key="combined", section="allocation",
        payload={}, computed_at=now,
    ))
    db.add(AnalyticsRecomputeStatus(user_id=user.id, started_at=now, generation=1))
    db.commit()

    response = delete_household_import(import_id=import_record.id, user=user, db=db)

    assert response.deleted_transactions_count == 1
    assert db.query(Transaction).filter_by(import_id=import_record.id).count() == 0
    assert db.query(Import).filter_by(id=import_record.id).count() == 0
    assert db.query(Folio).filter_by(id=folio.id).count() == 0
    assert db.query(AnalyticsSection).filter_by(user_id=user.id).count() == 0
    status = db.query(AnalyticsRecomputeStatus).filter_by(user_id=user.id).one()
    assert status.generation == 2
    db.close()
