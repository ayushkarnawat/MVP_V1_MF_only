"""transactions.stamp_duty: stamp duty charged on a purchase (7 Oct)

Revision ID: 0032
Revises: 0031

The CAS prints stamp duty (0.005% from 1 Jul 2020) as its own unit-less row,
which the parser used to drop. It is now kept on the purchase it was charged
on, so cost and cash flows can include it and Total Invested equals the CAS
cost. Nullable, no default, no backfill: older rows stay NULL. On Postgres the
table is RANGE-partitioned (0010); ADD COLUMN on the parent reaches every
partition without a rewrite.
"""
from alembic import op
import sqlalchemy as sa

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE transactions ADD COLUMN stamp_duty NUMERIC(14,2)")
    else:
        with op.batch_alter_table("transactions") as batch:
            batch.add_column(sa.Column("stamp_duty", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE transactions DROP COLUMN stamp_duty")
    else:
        with op.batch_alter_table("transactions") as batch:
            batch.drop_column("stamp_duty")
