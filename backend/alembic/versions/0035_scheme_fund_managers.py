"""scheme_fund_managers: per-scheme fund manager attribution (attribute 04)

Revision ID: 0035
Revises: 0034

One row per (scheme, manager, reference_period) -- a scheme with 2 managers
gets 2 rows, never merged (Review Focus #1). manager_name/role/managing_since
are sourced verbatim from AMFI/AMC factsheets; match_method records how the
link to `scheme_id` was made ("EXACT"/"FUZZY"/"MANUAL").
"""
from alembic import op
import sqlalchemy as sa

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scheme_fund_managers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("manager_name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("sequence_order", sa.Integer(), nullable=False),
        sa.Column("managing_since_raw", sa.String(), nullable=True),
        sa.Column("managing_since", sa.Date(), nullable=True),
        sa.Column("reference_period", sa.Date(), nullable=False),
        sa.Column("match_method", sa.String(), nullable=False),
        sa.Column("match_confidence", sa.Numeric(4, 3), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
        sa.UniqueConstraint(
            "scheme_id", "manager_name", "reference_period",
            name="uq_scheme_fund_managers_scheme_manager_period",
        ),
    )
    op.create_index("ix_scheme_fund_managers_scheme_id", "scheme_fund_managers", ["scheme_id"])


def downgrade() -> None:
    op.drop_index("ix_scheme_fund_managers_scheme_id", table_name="scheme_fund_managers")
    op.drop_table("scheme_fund_managers")
