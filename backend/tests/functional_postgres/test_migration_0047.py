"""Migration 0047 constraints on Postgres, isolated from existing tables."""
import importlib.util
import os
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, MetaData, String, Table, Uuid, create_engine, text
from sqlalchemy.exc import IntegrityError


def test_unique_key_rejects_a_duplicate_metric_month():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL unset")
    from app.models.reference import SchemeReportedValuation

    spec = importlib.util.spec_from_file_location(
        "migration_0047", Path(__file__).resolve().parents[2] /
        "alembic/versions/0047_scheme_reported_valuation.py",
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine(url)
    schema = "migration_0047_" + uuid.uuid4().hex
    # All DDL and data live in one rolled-back transaction and a unique schema.
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            metadata = MetaData()
            schemes = Table("schemes", metadata, Column("id", Uuid, primary_key=True))
            Table("stock_master", metadata, Column("isin", String(12), primary_key=True))
            metadata.create_all(conn)
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()
            scheme_id = uuid.uuid4()
            conn.execute(schemes.insert().values(id=scheme_id))
            table = SchemeReportedValuation.__table__
            row = dict(scheme_id=scheme_id, reference_period=date(2026, 9, 1),
                       metric="pe", value=Decimal("18.1234"), basis="trailing",
                       method="harmonic", source_file="synthetic.pdf", page=1,
                       parsed_at=datetime(2026, 10, 1, tzinfo=timezone.utc))
            conn.execute(table.insert().values(id=uuid.uuid4(), **row))
            assert conn.execute(table.select()).one().value == Decimal("18.1234")
            with pytest.raises(IntegrityError), conn.begin_nested():
                conn.execute(table.insert().values(id=uuid.uuid4(), **row))
            conn.execute(table.insert().values(id=uuid.uuid4(), **{**row, "metric": "pb"}))
            conn.execute(table.insert().values(id=uuid.uuid4(), **{
                **row, "reference_period": date(2026, 10, 1),
            }))
            with Operations.context(MigrationContext.configure(conn)):
                migration.downgrade()
                migration.upgrade()
        finally:
            transaction.rollback()
    engine.dispose()
