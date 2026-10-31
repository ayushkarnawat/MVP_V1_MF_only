"""0049 SQLite round trip, and Postgres enum conversion in a private schema."""
import os
import uuid
from decimal import Decimal

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from tests.test_migrations import _a11_migration


@pytest.mark.parametrize("dialect", ["sqlite", "postgres"])
def test_migration_converts_enum_to_text_and_keeps_existing_rows(dialect):
    url = os.environ.get("TEST_DATABASE_URL") if dialect == "postgres" else "sqlite://"
    if not url:
        pytest.skip("TEST_DATABASE_URL unset; Postgres unavailable")
    engine = create_engine(url)
    with engine.connect() as conn:
        txn = conn.begin()
        try:
            if dialect == "postgres":
                schema = "benchmark_0049_" + uuid.uuid4().hex
                conn.execute(text(f'CREATE SCHEMA "{schema}"'))
                conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                conn.execute(text("CREATE TYPE benchmarkindex AS ENUM ('nifty_50', 'nifty_500', 'nifty_largemidcap_250', 'nifty_midcap_150', 'nifty_next_50', 'nifty_smallcap_250', 'nifty_100', 'nifty_200')"))
            kind = "benchmarkindex" if dialect == "postgres" else "VARCHAR(21)"
            conn.execute(text(f"CREATE TABLE benchmark_index_history (index_name {kind} NOT NULL, date DATE NOT NULL, return_type VARCHAR(5) NOT NULL DEFAULT 'price', value NUMERIC(12,2) NOT NULL, PRIMARY KEY (index_name,date,return_type))"))
            conn.execute(text("INSERT INTO benchmark_index_history VALUES ('nifty_50','2026-10-30','tri',12345.67)"))
            migration = _a11_migration("0049")
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()
                assert "benchmark_index_master" in inspect(conn).get_table_names()
                assert str(inspect(conn).get_columns("benchmark_index_history")[0]["type"]).upper() == "TEXT"
                assert Decimal(conn.execute(text("SELECT CAST(value AS TEXT) FROM benchmark_index_history WHERE index_name='nifty_50'")).scalar_one()) == Decimal("12345.67")
                assert len(inspect(conn).get_pk_constraint("benchmark_index_history")["constrained_columns"]) == 3
                conn.execute(text("INSERT INTO benchmark_index_history VALUES ('new_index','2026-10-30','tri',0.123456)"))
                assert Decimal(conn.execute(text("SELECT CAST(value AS TEXT) FROM benchmark_index_history WHERE index_name='new_index'")).scalar_one()) == Decimal("0.123456")
                # Downgrade refuses to silently delete new text-key history.
                with pytest.raises(ValueError, match="new index keys"):
                    migration.downgrade()
                conn.execute(text("DELETE FROM benchmark_index_history WHERE index_name='new_index'"))
                migration.downgrade()
                assert "benchmark_index_master" not in inspect(conn).get_table_names()
                assert conn.execute(text("SELECT count(*) FROM benchmark_index_history")).scalar_one() == 1
                migration.upgrade()
        finally:
            txn.rollback()
    engine.dispose()
