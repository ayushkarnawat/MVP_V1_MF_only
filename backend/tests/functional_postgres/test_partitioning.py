import os
import subprocess
import sys
from pathlib import Path

import pytest
import psycopg2

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

pytestmark = pytest.mark.postgres


def _psycopg2_url(url: str) -> str:
    """Translate the SQLAlchemy driver URL used by CI for raw psycopg2."""
    return url.replace("postgresql+psycopg2://", "postgresql://", 1)


@pytest.fixture()
def postgres_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set — no local Postgres to test against")
    return url


def test_transactions_and_nav_history_are_partitioned(postgres_url, monkeypatch):
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

    conn = psycopg2.connect(_psycopg2_url(postgres_url))
    with conn.cursor() as cur:
        cur.execute(
            "SELECT relname FROM pg_class c JOIN pg_partitioned_table p ON c.oid = p.partrelid"
        )
        partitioned = {row[0] for row in cur.fetchall()}
    conn.close()
    assert {"transactions", "nav_history"}.issubset(partitioned)


def test_transaction_orm_insert_round_trips_on_partitioned_table(postgres_url, monkeypatch):
    """The ORM must send the enum's lowercase '.value' — the raw partitioned
    transactions DDL constrains `type` with CHECK (type IN ('purchase', ...))."""
    import uuid
    from datetime import date, datetime, timezone
    from decimal import Decimal

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.models.enums import ImportStatus, Relationship, TransactionType
    from app.models.folio import Folio
    from app.models.imports import Import
    from app.models.reference import Scheme
    from app.models.transaction import Transaction
    from app.models.user import HouseholdMember, User

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

    now = datetime.now(timezone.utc)
    db = sessionmaker(bind=create_engine(postgres_url))()
    user = User(id=uuid.uuid4(), phone_number="+919000000001", created_at=now)
    member = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Self",
        relationship=Relationship.SELF, created_at=now,
    )
    scheme = Scheme(
        id=uuid.uuid4(), amfi_code="120503", name="Test Fund",
        amc_name="Test AMC", sebi_category="Flexi Cap",
    )
    folio = Folio(
        id=uuid.uuid4(), household_member_id=member.id,
        scheme_id=scheme.id, folio_number="12345/67",
    )
    imp = Import(
        id=uuid.uuid4(), household_member_id=member.id,
        status=ImportStatus.CONFIRMED, raw_parser_output={"folios": []},
        uploaded_at=now,
    )
    # These models expose foreign-key ids but no ORM relationships, so flush
    # them in dependency order instead of relying on unit-of-work sorting.
    db.add(user)
    db.commit()
    db.add_all([member, scheme])
    db.commit()
    db.add_all([folio, imp])
    db.commit()

    txn_id = uuid.uuid4()
    db.add(Transaction(
        id=txn_id, folio_id=folio.id, import_id=imp.id,
        type=TransactionType.PURCHASE, date=date(2024, 5, 17),
        amount=Decimal("10000.00"), units=Decimal("312.456"), nav=Decimal("32.0045"),
    ))
    db.commit()
    db.expunge_all()

    fetched = db.get(Transaction, {"id": txn_id, "date": date(2024, 5, 17)})
    assert fetched.type is TransactionType.PURCHASE
    assert fetched.amount == Decimal("10000.00")
    db.close()


def test_enum_drift_values_are_writable_after_migration(postgres_url, monkeypatch):
    """All values introduced by migration 0010 are accepted by Postgres.

    ``imports.status`` is a native enum.  The partitioned Postgres
    ``transactions.type`` column is VARCHAR plus a CHECK constraint, despite
    the SQLAlchemy model using TransactionType, so exercise both physical
    representations with real inserts.
    """
    import uuid
    from datetime import date, datetime, timezone

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

    new_import_statuses = (
        "not_started",
        "requesting_cas",
        "waiting_for_user",
        "upload_started",
        "password_required",
        "validation_failed",
        "processing",
        "retry_pending",
        "import_successful",
        "import_failed",
        "expired",
    )

    now = datetime.now(timezone.utc)
    user_id = str(uuid.uuid4())
    member_id = str(uuid.uuid4())
    scheme_id = str(uuid.uuid4())
    folio_id = str(uuid.uuid4())
    import_ids = [str(uuid.uuid4()) for _ in new_import_statuses]

    conn = psycopg2.connect(_psycopg2_url(postgres_url))
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, phone_number, created_at) VALUES (%s, %s, %s)",
                (user_id, "+919000000010", now),
            )
            cur.execute(
                "INSERT INTO household_members (id, user_id, name, relationship, created_at) "
                "VALUES (%s, %s, %s, %s, %s)",
                (member_id, user_id, "Enum Test", "self", now),
            )
            cur.execute(
                "INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) "
                "VALUES (%s, %s, %s, %s, %s)",
                (scheme_id, "enum-test-001", "Enum Test Fund", "Test AMC", "Test Category"),
            )
            cur.execute(
                "INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type) "
                "VALUES (%s, %s, %s, %s, %s)",
                (folio_id, member_id, scheme_id, "enum-test-folio", "unclassified"),
            )

            for import_id, status in zip(import_ids, new_import_statuses, strict=True):
                cur.execute(
                    "INSERT INTO imports (id, household_member_id, status, uploaded_at) "
                    "VALUES (%s, %s, %s, %s)",
                    (import_id, member_id, status, now),
                )

            cur.execute(
                "INSERT INTO transactions "
                "(id, folio_id, import_id, type, date, amount, units, nav) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    str(uuid.uuid4()), folio_id, import_ids[0], "opening_balance",
                    date(2024, 1, 1), "100.00", "10.000", "10.0000",
                ),
            )

            cur.execute(
                "SELECT status::text FROM imports WHERE household_member_id = %s "
                "ORDER BY status::text",
                (member_id,),
            )
            assert {row[0] for row in cur.fetchall()} == set(new_import_statuses)
            cur.execute(
                "SELECT type FROM transactions WHERE folio_id = %s AND type = %s",
                (folio_id, "opening_balance"),
            )
            assert cur.fetchone() == ("opening_balance",)
    conn.close()


def test_upsert_nav_history_is_conflict_safe_on_postgres(postgres_url, monkeypatch):
    """`_upsert_nav_history`'s dialect-dispatched insert has only ever been
    exercised against SQLite (`tests/services/dashboard/test_nav.py`) — this
    is the Postgres counterpart, proving the `postgresql_insert(...)
    .on_conflict_do_nothing(...)` branch actually compiles and round-trips
    against a real server, not just SQLite's."""
    import asyncio
    import uuid
    from datetime import date
    from decimal import Decimal

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.models.reference import NavHistory, Scheme
    from app.services.dashboard.nav import _upsert_nav_history

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

    db = sessionmaker(bind=create_engine(postgres_url))()
    scheme = Scheme(
        id=uuid.uuid4(), amfi_code="pg-nav-001", name="PG NAV Test Fund",
        amc_name="Test AMC", sebi_category="Flexi Cap",
    )
    db.add(scheme)
    db.commit()

    row = [(date(2024, 1, 15), Decimal("50.1234"))]
    asyncio.run(_upsert_nav_history(db, scheme.id, row))
    # Re-inserting the same (scheme_id, date) must hit ON CONFLICT DO NOTHING,
    # not raise a unique-violation.
    asyncio.run(_upsert_nav_history(db, scheme.id, row))

    assert db.query(NavHistory).filter_by(scheme_id=scheme.id).count() == 1
    db.close()


def test_household_members_one_self_row_per_user_on_postgres(postgres_url, monkeypatch):
    """Migration 0011's partial unique index has only ever been exercised
    against SQLite's `sqlite_where` branch (`tests/services/dashboard/
    test_household_members.py`) — this proves the `postgresql_where` branch
    actually compiles and enforces the constraint against a real server."""
    import uuid
    from datetime import datetime, timezone

    from sqlalchemy import create_engine
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import sessionmaker

    from app.models.enums import Relationship
    from app.models.user import HouseholdMember, User

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

    db = sessionmaker(bind=create_engine(postgres_url))()
    user = User(id=uuid.uuid4(), phone_number="+919000000001", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.commit()

    db.add(HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Ayush",
        relationship=Relationship.SELF, created_at=datetime.now(timezone.utc),
    ))
    db.commit()

    # A second, non-self relationship for the same user must still be allowed.
    db.add(HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Spouse",
        relationship=Relationship.SPOUSE, created_at=datetime.now(timezone.utc),
    ))
    db.commit()

    db.add(HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Ayush Again",
        relationship=Relationship.SELF, created_at=datetime.now(timezone.utc),
    ))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    assert db.query(HouseholdMember).filter_by(user_id=user.id).count() == 2
    db.close()
