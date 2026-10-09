"""scheme_rankings_and_ranking_weights: 5-factor composite fund ranking (attribute 09)

Revision ID: 0034
Revises: 0033

scheme_rankings: one row per scheme per day the ranking was computed,
structurally parallel to fund_scores (Scorer v1's own table) but a distinct
table -- these are two different formulas (decisions.md 2026-10-06: "not a
Scorer conflict") and must never share one row shape. ranking_weights: a
singleton config table seeded with the PDF's own 25/25/20/15/15 split,
editable directly in the DB (no admin UI, per decisions.md 2026-10-06); an
empty table is not a failure mode -- the service layer falls back to the
same hardcoded defaults this migration seeds.
"""
from alembic import op
import sqlalchemy as sa

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scheme_rankings",
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("composite_score", sa.Numeric(5, 2), nullable=False),
        sa.Column("category_rank", sa.Integer(), nullable=True),
        sa.Column("category_size", sa.Integer(), nullable=False),
        sa.Column("percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("return_1y", sa.Numeric(8, 6), nullable=True),
        sa.Column("return_3y", sa.Numeric(8, 6), nullable=True),
        sa.Column("return_5y", sa.Numeric(8, 6), nullable=True),
        sa.Column("category_relative", sa.Numeric(8, 6), nullable=True),
        sa.Column("downside_deviation", sa.Numeric(8, 6), nullable=True),
        sa.Column("ter_value", sa.Numeric(5, 2), nullable=True),
        sa.Column("return_3y_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("return_5y_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("category_relative_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("volatility_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("ter_percentile", sa.Numeric(5, 2), nullable=True),
        sa.PrimaryKeyConstraint("scheme_id", "computed_at"),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
    )
    op.create_table(
        "ranking_weights",
        sa.Column("id", sa.Boolean(), nullable=False),
        sa.Column("weight_return_3y", sa.Numeric(4, 3), nullable=False, server_default="0.25"),
        sa.Column("weight_return_5y", sa.Numeric(4, 3), nullable=False, server_default="0.25"),
        sa.Column("weight_category_relative", sa.Numeric(4, 3), nullable=False, server_default="0.20"),
        sa.Column("weight_low_volatility", sa.Numeric(4, 3), nullable=False, server_default="0.15"),
        sa.Column("weight_low_ter", sa.Numeric(4, 3), nullable=False, server_default="0.15"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = true", name="ck_ranking_weights_singleton"),
    )
    op.execute(
        "INSERT INTO ranking_weights (id, weight_return_3y, weight_return_5y, "
        "weight_category_relative, weight_low_volatility, weight_low_ter) "
        "VALUES (true, 0.25, 0.25, 0.20, 0.15, 0.15)"
    )


def downgrade() -> None:
    op.drop_table("ranking_weights")
    op.drop_table("scheme_rankings")
