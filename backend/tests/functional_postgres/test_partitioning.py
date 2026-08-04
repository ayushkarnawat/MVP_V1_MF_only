import os
import subprocess
import sys
from pathlib import Path

import pytest
import psycopg2

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

pytestmark = pytest.mark.postgres


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

    conn = psycopg2.connect(postgres_url)
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
    db.add_all([user, member, scheme, folio, imp])
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
