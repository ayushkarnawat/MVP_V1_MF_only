# backend/alembic/versions/0039_disclosure_batches_and_scheme_holdings.py
"""disclosure_batches, scheme_holdings: look-through engine ingestion (sub-project 2, section 00)

Revision ID: 0039
Revises: 0038

One row per (scheme, as_of_date) disclosure event; one scheme_holding row per held
security within that batch, written by delete-all-then-reinsert on every (re)parse --
never a partial upsert. See
Docs/analytics/2026-10-09-sub-project-2-lookthrough-engine-spec.md.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None

_STATUS_VALUES = ("pending", "fetched", "parsed", "written", "failed", "awaiting_manual_upload")
# 8 values (Q8/Q13's decision): DERIVATIVE and OTHER beyond the engine spec's original 6
# are added so futures/options rows and unrecognized-section rows are stored, not dropped.
_ASSET_TYPE_VALUES = (
    "equity_domestic", "equity_international", "debt", "gold_silver", "reit_invit",
    "cash_equivalent", "derivative", "other",
)


def upgrade() -> None:
    op.create_table(
        "disclosure_batches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("amc_name", sa.String(), nullable=False),
        sa.Column("status", sa.Enum(*_STATUS_VALUES, name="disclosurebatchstatus"), nullable=False),
        sa.Column("source_url", sa.String(), nullable=True),
        sa.Column("raw_file_reference", sa.String(), nullable=True),
        sa.Column("match_method", sa.String(), nullable=True),
        sa.Column("match_confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("parse_errors", sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("written_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
        sa.UniqueConstraint("scheme_id", "as_of_date", name="uq_disclosure_batches_scheme_date"),
    )
    op.create_index("ix_disclosure_batches_scheme_id", "disclosure_batches", ["scheme_id"])

    op.create_table(
        "scheme_holdings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("instrument_name", sa.String(), nullable=False),
        sa.Column("isin", sa.String(), nullable=True),
        sa.Column("sector_raw", sa.String(), nullable=True),
        sa.Column("asset_type", sa.Enum(*_ASSET_TYPE_VALUES, name="assettype"), nullable=False),
        sa.Column("quantity", sa.Numeric(20, 4), nullable=True),
        sa.Column("market_value", sa.Numeric(20, 2), nullable=False),
        sa.Column("pct_to_nav", sa.Numeric(6, 3), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["batch_id"], ["disclosure_batches.id"]),
    )
    op.create_index("ix_scheme_holdings_batch", "scheme_holdings", ["batch_id"])
    op.create_index("ix_scheme_holdings_isin", "scheme_holdings", ["isin"])


def downgrade() -> None:
    op.drop_index("ix_scheme_holdings_isin", table_name="scheme_holdings")
    op.drop_index("ix_scheme_holdings_batch", table_name="scheme_holdings")
    op.drop_table("scheme_holdings")
    op.drop_index("ix_disclosure_batches_scheme_id", table_name="disclosure_batches")
    op.drop_table("disclosure_batches")
    sa.Enum(*_ASSET_TYPE_VALUES, name="assettype").drop(op.get_bind(), checkfirst=True)
    sa.Enum(*_STATUS_VALUES, name="disclosurebatchstatus").drop(op.get_bind(), checkfirst=True)
