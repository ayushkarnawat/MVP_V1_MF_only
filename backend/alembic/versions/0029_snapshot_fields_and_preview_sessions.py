"""Snapshot history fields and encrypted review sessions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE importstatus ADD VALUE IF NOT EXISTS 'previewing'")
    op.add_column("portfolio_snapshots", sa.Column("invested_value", sa.Numeric(18, 2), nullable=True))
    op.add_column("portfolio_snapshots", sa.Column("is_partial", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("portfolio_snapshots", sa.Column("missing_scheme_ids", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=True))
    op.add_column("portfolio_snapshots", sa.Column("data_version", sa.BigInteger(), nullable=False, server_default="0"))
    op.add_column("imports", sa.Column("preview_state", sa.Text(), nullable=True))


def downgrade():
    # Transient review rows are discarded; PostgreSQL retains the enum value,
    # following migration 0010's precedent.
    op.execute("DELETE FROM imports WHERE status = 'previewing'")
    with op.batch_alter_table("imports") as batch:
        batch.drop_column("preview_state")
    with op.batch_alter_table("portfolio_snapshots") as batch:
        for name in ("data_version", "missing_scheme_ids", "is_partial", "invested_value"):
            batch.drop_column(name)
