"""transactions.origin and transactions.cost_source (#1 opening balance)

Revision ID: 0025
Revises: 0023

transactions is RANGE-partitioned on Postgres and its enum-like columns are
VARCHAR + CHECK there (see 0010), so these follow suit. ADD COLUMN on the
partitioned parent propagates to every partition. Values frozen here.
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0023"
branch_labels = None
depends_on = None

_ORIGINS = ("cas_row", "cas_opening", "manual")
_COST_SOURCES = ("cas_cost", "nav_on_start", "manual")


def _in(values):
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE transactions ADD COLUMN origin VARCHAR(16) NOT NULL DEFAULT 'cas_row'")
        op.execute("ALTER TABLE transactions ADD COLUMN cost_source VARCHAR(16)")
        op.execute(f"ALTER TABLE transactions ADD CONSTRAINT transactions_origin_check CHECK (origin IN ({_in(_ORIGINS)}))")
        op.execute(
            "ALTER TABLE transactions ADD CONSTRAINT transactions_cost_source_check "
            f"CHECK (cost_source IS NULL OR cost_source IN ({_in(_COST_SOURCES)}))"
        )
    else:
        op.add_column("transactions", sa.Column("origin", sa.String(16), nullable=False, server_default="cas_row"))
        op.add_column("transactions", sa.Column("cost_source", sa.String(16), nullable=True))
    # Every existing opening_balance row was written by the manual
    # OpeningBalanceModal (the parser never emitted one before #1).
    op.execute("UPDATE transactions SET origin = 'manual', cost_source = 'manual' WHERE type = 'opening_balance'")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_cost_source_check")
        op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_origin_check")
        # CAS opening rows can't exist before 0025; drop them so old code
        # doesn't count them twice once it re-learns opening_balance.
        op.execute("DELETE FROM transactions WHERE origin = 'cas_opening'")
        op.execute("ALTER TABLE transactions DROP COLUMN cost_source")
        op.execute("ALTER TABLE transactions DROP COLUMN origin")
    else:
        op.execute("DELETE FROM transactions WHERE origin = 'cas_opening'")
        with op.batch_alter_table("transactions", recreate="always") as batch:
            batch.drop_column("cost_source")
            batch.drop_column("origin")
