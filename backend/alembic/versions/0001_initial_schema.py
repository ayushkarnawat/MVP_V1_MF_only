"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-04
"""
import sys
from pathlib import Path

from alembic import op

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.base import Base
import app.models  # noqa: F401 — populates Base.metadata
from app.models.enums import TransactionType

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# transactions and nav_history are partitioned on Postgres per
# Database-Schema-Unifolio.md v1.1 — created via hand-written DDL below
# instead of the shared metadata.create_all() path so each dialect can get
# its own physical layout while every other table stays a single source of
# truth (the SQLAlchemy models).
_PARTITIONED_TABLES = {"transactions", "nav_history"}


def upgrade() -> None:
    bind = op.get_bind()
    tables = [t for name, t in Base.metadata.tables.items() if name not in _PARTITIONED_TABLES]
    Base.metadata.create_all(bind=bind, tables=tables)

    if bind.dialect.name == "postgresql":
        _create_transactions_postgres()
        _create_nav_history_postgres()
    else:
        _create_transactions_plain()
        _create_nav_history_plain()


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TABLE IF EXISTS transactions CASCADE")
        op.execute("DROP TABLE IF EXISTS nav_history CASCADE")
    else:
        op.drop_table("transactions")
        op.drop_table("nav_history")

    tables = [t for name, t in Base.metadata.tables.items() if name not in _PARTITIONED_TABLES]
    Base.metadata.drop_all(bind=bind, tables=tables)


def _create_transactions_plain() -> None:
    import sqlalchemy as sa

    op.create_table(
        "transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("folio_id", sa.Uuid(), sa.ForeignKey("folios.id"), nullable=False),
        sa.Column("import_id", sa.Uuid(), sa.ForeignKey("imports.id"), nullable=False),
        sa.Column("type", sa.Enum(TransactionType, name="transactiontype"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("units", sa.Numeric(14, 3), nullable=False),
        sa.Column("nav", sa.Numeric(10, 4), nullable=False),
        sa.Column("raw_description", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id", "date"),
        sa.UniqueConstraint("folio_id", "date", "amount", "units"),
    )


def _create_transactions_postgres() -> None:
    # ponytail: enum-shaped column uses VARCHAR + CHECK here instead of a
    # native Postgres ENUM type, to avoid a separate CREATE TYPE lifecycle in
    # this one hand-written DDL path. Every non-partitioned table still gets
    # a real native enum via SQLAlchemy's Enum type above. Upgrade path: if
    # this column needs native-enum behavior later, create the type
    # explicitly with postgresql.ENUM(...).create(bind) before this call.
    #
    # Assumes Postgres 13+ (RDS default for new instances), where
    # gen_random_uuid() is built into core — no pgcrypto extension needed.
    values = ", ".join(f"'{v.value}'" for v in TransactionType)
    op.execute(f"""
        CREATE TABLE transactions (
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            folio_id UUID NOT NULL REFERENCES folios(id),
            import_id UUID NOT NULL REFERENCES imports(id),
            type VARCHAR NOT NULL CHECK (type IN ({values})),
            date DATE NOT NULL,
            amount NUMERIC(14,2) NOT NULL,
            units NUMERIC(14,3) NOT NULL,
            nav NUMERIC(10,4) NOT NULL,
            raw_description VARCHAR,
            PRIMARY KEY (id, date),
            UNIQUE (folio_id, date, amount, units)
        ) PARTITION BY RANGE (date);
    """)
    for year in range(2020, 2027):
        op.execute(f"""
            CREATE TABLE transactions_{year} PARTITION OF transactions
            FOR VALUES FROM ('{year}-01-01') TO ('{year + 1}-01-01');
        """)
    op.execute("CREATE TABLE transactions_default PARTITION OF transactions DEFAULT;")


def _create_nav_history_plain() -> None:
    import sqlalchemy as sa

    op.create_table(
        "nav_history",
        sa.Column("scheme_id", sa.Uuid(), sa.ForeignKey("schemes.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("nav", sa.Numeric(10, 4), nullable=False),
        sa.PrimaryKeyConstraint("scheme_id", "date"),
    )


def _create_nav_history_postgres() -> None:
    op.execute("""
        CREATE TABLE nav_history (
            scheme_id UUID NOT NULL REFERENCES schemes(id),
            date DATE NOT NULL,
            nav NUMERIC(10,4) NOT NULL,
            PRIMARY KEY (scheme_id, date)
        ) PARTITION BY RANGE (date);
    """)
    for year in range(2015, 2027):
        op.execute(f"""
            CREATE TABLE nav_history_{year} PARTITION OF nav_history
            FOR VALUES FROM ('{year}-01-01') TO ('{year + 1}-01-01');
        """)
    op.execute("CREATE TABLE nav_history_default PARTITION OF nav_history DEFAULT;")
