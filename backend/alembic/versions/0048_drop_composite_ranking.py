"""Drop the retired composite ranking tables; downgrade restores empty tables.

Revision ID: 0048
Revises: 0047
"""
from alembic import op
import sqlalchemy as sa

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("ranking_weights")
    op.drop_table("scheme_rankings")


def downgrade() -> None:
    # Frozen table definitions copied exactly from 0034; no seed or old scores.
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
