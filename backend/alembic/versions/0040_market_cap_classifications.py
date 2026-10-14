"""AMFI effective-dated market-cap reference data.

Revision ID: 0040
Revises: 0039
"""
from alembic import op
import sqlalchemy as sa

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "market_cap_classifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("isin", sa.String(12), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("bucket", sa.Enum("LARGE", "MID", "SMALL", name="marketcapbucket"), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("source_period", sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("isin", "effective_date", name="uq_market_cap_isin_date"),
    )
    op.create_index("ix_market_cap_classifications_isin", "market_cap_classifications", ["isin"])


def downgrade() -> None:
    op.drop_index("ix_market_cap_classifications_isin", table_name="market_cap_classifications")
    op.drop_table("market_cap_classifications")
    sa.Enum("LARGE", "MID", "SMALL", name="marketcapbucket").drop(op.get_bind(), checkfirst=True)
