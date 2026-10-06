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

    # Task 9 / Q6: consent rows have no FK and append-only triggers; a
    # hard-delete must leave them in place (a cascade would abort on the
    # trigger) -- proven here against real Postgres triggers.
    from app.models.consent import ConsentRecord
    from app.models.enums import ConsentAction, ConsentDocumentType
    from app.services.legal.consent import ConsentEvidence, record_consent
    from app.services.legal.registry import current_document

    record_consent(
        db, user_id=user.id, documents=[current_document(ConsentDocumentType.TERMS_OF_SERVICE)],
        action=ConsentAction.GIVEN, surface="signup_phone",
        evidence=ConsentEvidence(None, None, None, None), recorded_at=now,
    )
    db.commit()

    # Plain values, captured before the delete: after it, reading an
    # attribute off an ORM object whose row is gone raises ObjectDeletedError
    # (commit expires every attribute, and the refresh finds no row).
    user_id, member_id, import_id = user.id, member.id, import_record.id
    phone_number, scheme_id = user.phone_number, scheme.id

    try:
        deleted = hard_delete_expired_accounts(db, now=now)

        assert deleted == 1
        assert db.query(User).filter_by(id=user_id).count() == 0
        assert db.query(HouseholdMember).filter_by(user_id=user_id).count() == 0
        assert db.query(AuthIdentity).filter_by(user_id=user_id).count() == 0
        assert db.query(SessionModel).filter_by(user_id=user_id).count() == 0
        assert db.query(PendingIdentityVerification).filter_by(matched_user_id=user_id).count() == 0
        assert db.query(Transaction).filter_by(import_id=import_id).count() == 0
        assert db.query(Import).filter_by(household_member_id=member_id).count() == 0
        assert db.query(Folio).filter_by(household_member_id=member_id).count() == 0
        assert db.query(PortfolioSnapshot).filter_by(household_member_id=member_id).count() == 0
        assert db.query(AnalyticsSection).filter_by(user_id=user_id).count() == 0
        assert db.query(AnalyticsRecomputeStatus).filter_by(user_id=user_id).count() == 0
        assert db.query(OtpRequest).filter_by(phone_number=phone_number).count() == 0
        assert db.query(AccountDeletionSurvey).count() == 1
        assert db.query(Scheme).filter_by(id=scheme_id).count() == 1
        assert db.query(ConsentRecord).filter_by(user_id=user_id).count() == 1
    finally:
        # Always release the connection: a failed assertion otherwise leaves it
        # idle-in-transaction holding locks, and the next test's
        # `alembic downgrade base` blocks on them forever (seen 2026-09-30).
        db.close()
        db.get_bind().dispose()


def test_delete_household_import_cascades_cleanly_on_postgres(postgres_url, monkeypatch):
    """The SQLite counterpart (tests/api/test_import_history_delete_routes.py)
    exercises the same delete order via PRAGMA foreign_keys=ON. This proves
    it round-trips against a real server too."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from fastapi import BackgroundTasks

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

    # Same reason as the test above: capture plain values before the delete.
    user_id, import_id, folio_id = user.id, import_record.id, folio.id

    try:
        # The route gained a BackgroundTasks param after this test was written
        # (analytics recompute dispatch); a bare instance never runs its tasks,
        # which is fine -- this test checks the synchronous deletes only.
        response = delete_household_import(
            import_id=import_id, background_tasks=BackgroundTasks(), user=user, db=db
        )

        assert response.deleted_transactions_count == 1
        assert db.query(Transaction).filter_by(import_id=import_id).count() == 0
        assert db.query(Import).filter_by(id=import_id).count() == 0
        assert db.query(Folio).filter_by(id=folio_id).count() == 0
        assert db.query(AnalyticsSection).filter_by(user_id=user_id).count() == 0
        status = db.query(AnalyticsRecomputeStatus).filter_by(user_id=user_id).one()
        assert status.generation == 2
    finally:
        db.close()
        db.get_bind().dispose()


def test_0027_merges_duplicate_folios_and_cascades_links_on_postgres(postgres_url, monkeypatch):
    """#4/#5 on a real partitioned Postgres: the 0027 duplicate-folio merge
    with real UUIDs, the composite FK to transactions (id, date), and link
    rows cascading when their transaction or import is deleted."""
    import psycopg2

    monkeypatch.setenv("DATABASE_URL", postgres_url)
    subprocess.run([sys.executable, "-m", "alembic", "downgrade", "base"], cwd=BACKEND_DIR, capture_output=True, text=True)
    up = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "0026"], cwd=BACKEND_DIR, capture_output=True, text=True)
    assert up.returncode == 0, up.stderr
    raw = postgres_url.replace("postgresql+psycopg2://", "postgresql://", 1)
    u, m, s1, fa, fb, i10, ify = (str(uuid.uuid4()) for _ in range(7))
    t1, t2, t3, t4 = (str(uuid.uuid4()) for _ in range(4))
    with psycopg2.connect(raw) as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO users (id, phone_number, created_at) VALUES (%s, '+919800002799', now())", (u,))
        cur.execute("INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source) "
                    "VALUES (%s, %s, 'A', 'self', now(), 'onboarding', 'user_entered')", (m, u))
        cur.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES (%s, 'PG27', 'X', 'A', 'E')", (s1,))
        for fid, num in ((fa, "4400918 / 3"), (fb, "4400918/3")):
            cur.execute("INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type, has_coverage_gap) "
                        "VALUES (%s, %s, %s, %s, 'regular', false)", (fid, m, s1, num))
        for iid in (i10, ify):
            cur.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at) VALUES (%s, %s, 'confirmed', now())", (iid, m))
        for tid, day, fid, iid in ((t1, "2025-05-05", fa, i10), (t2, "2026-05-05", fa, i10),
                                   (t3, "2026-05-05", fb, ify), (t4, "2026-06-05", fb, ify)):
            cur.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, origin, occurrence) "
                        "VALUES (%s, %s, %s, %s, 'purchase_sip', 1000, 10, 100, 'cas_row', 1)", (tid, day, fid, iid))
    up = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND_DIR, capture_output=True, text=True)
    assert up.returncode == 0, up.stderr
    with psycopg2.connect(raw) as conn, conn.cursor() as cur:
        cur.execute("SELECT id::text, folio_key FROM folios WHERE household_member_id = %s", (m,))
        folios = cur.fetchall()
        assert len(folios) == 1 and folios[0][1] == "4400918/3"
        cur.execute("SELECT count(*) FROM transactions WHERE folio_id = %s", (folios[0][0],))
        assert cur.fetchone()[0] == 3
        cur.execute("SELECT count(*) FROM transaction_imports ti JOIN transactions t ON t.id = ti.transaction_id "
                    "WHERE t.date = '2026-05-05' AND t.folio_id = %s", (folios[0][0],))
        assert cur.fetchone()[0] == 2
        # cascades
        cur.execute("SELECT id::text FROM transactions WHERE folio_id = %s AND date = '2025-05-05'", (folios[0][0],))
        lone = cur.fetchone()[0]
        cur.execute("DELETE FROM transactions WHERE id = %s", (lone,))
        cur.execute("SELECT count(*) FROM transaction_imports WHERE transaction_id = %s", (lone,))
        assert cur.fetchone()[0] == 0
        # an import that only holds links (no row has it as its owner) cascades its links away
        extra = str(uuid.uuid4())
        cur.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at) VALUES (%s, %s, 'confirmed', now())", (extra, m))
        cur.execute("SELECT id::text, date FROM transactions WHERE folio_id = %s AND date = '2026-06-05'", (folios[0][0],))
        tid, tdate = cur.fetchone()
        cur.execute("INSERT INTO transaction_imports (transaction_id, transaction_date, import_id) VALUES (%s, %s, %s)", (tid, tdate, extra))
        cur.execute("DELETE FROM imports WHERE id = %s", (extra,))
        cur.execute("SELECT count(*) FROM transaction_imports WHERE import_id = %s", (extra,))
        assert cur.fetchone()[0] == 0
