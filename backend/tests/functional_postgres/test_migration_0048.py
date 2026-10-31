"""0048 up/down/up in a rolled-back, private Postgres schema."""
import os
import uuid

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, MetaData, Table, Uuid, create_engine, inspect, text
from tests.test_migrations import _a11_migration, _composite_table_shape


def test_0048_postgres_drops_and_restores_exact_tables_empty():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL unset")
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            transaction = conn.begin()
            try:
                schema = "migration_0048_" + uuid.uuid4().hex
                conn.execute(text(f'CREATE SCHEMA "{schema}"'))
                conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                metadata = MetaData()
                Table("schemes", metadata, Column("id", Uuid, primary_key=True))
                metadata.create_all(conn)
                original, migration = _a11_migration("0034"), _a11_migration("0048")
                with Operations.context(MigrationContext.configure(conn)):
                    original.upgrade()
                    shape = _composite_table_shape(inspect(conn))
                    migration.upgrade()
                    assert set(inspect(conn).get_table_names()) == {"schemes"}
                    migration.downgrade()
                    assert _composite_table_shape(inspect(conn)) == shape
                    for name in shape:
                        assert conn.execute(text(f"SELECT count(*) FROM {name}")).scalar_one() == 0
                    migration.upgrade()
                    assert set(inspect(conn).get_table_names()) == {"schemes"}
            finally:
                transaction.rollback()
    finally:
        engine.dispose()
