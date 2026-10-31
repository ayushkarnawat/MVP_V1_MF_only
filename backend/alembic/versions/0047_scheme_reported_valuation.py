"""Scheme-reported valuations and stock valuation provenance.

Revision ID: 0047
Revises: 0046
"""
from alembic import op
import sqlalchemy as sa

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "scheme_reported_valuation",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("scheme_id", sa.Uuid(), sa.ForeignKey("schemes.id"), nullable=False),
        sa.Column("reference_period", sa.Date(), nullable=False),
        sa.Column("metric", sa.Text(), nullable=False),
        sa.Column("value", sa.Numeric(14, 4), nullable=False),
        sa.Column("basis", sa.Text(), nullable=False),
        sa.Column("method", sa.Text(), nullable=False),
        sa.Column("source_file", sa.Text(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("parsed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("scheme_id", "reference_period", "metric",
                            name="uq_scheme_reported_valuation_scheme_period_metric"),
        sa.CheckConstraint("metric IN ('pe', 'pb')", name="ck_scheme_reported_valuation_metric"),
        sa.CheckConstraint("basis IN ('trailing', 'forward', 'not_stated')",
                           name="ck_scheme_reported_valuation_basis"),
        sa.CheckConstraint("method IN ('harmonic', 'weighted_average', 'not_stated')",
                           name="ck_scheme_reported_valuation_method"),
    )
    # The unique key serves scheme-first lookups; this serves cross-scheme monthly reads.
    op.create_index("ix_scheme_reported_valuation_reference_period",
                    "scheme_reported_valuation", ["reference_period"])
    op.add_column("stock_master", sa.Column("bse_scrip_code", sa.String(), nullable=True))
    op.add_column("stock_master", sa.Column("pe_as_of", sa.Date(), nullable=True))
    op.add_column("stock_master", sa.Column("pb_as_of", sa.Date(), nullable=True))
    op.add_column("stock_master", sa.Column("pe_source", sa.String(), nullable=True))


def downgrade():
    op.drop_column("stock_master", "pe_source")
    op.drop_column("stock_master", "pb_as_of")
    op.drop_column("stock_master", "pe_as_of")
    op.drop_column("stock_master", "bse_scrip_code")
    op.drop_index("ix_scheme_reported_valuation_reference_period",
                  table_name="scheme_reported_valuation")
    op.drop_table("scheme_reported_valuation")
