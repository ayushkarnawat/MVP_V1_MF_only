"""analytics recompute mutation generation

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-11
"""
from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "analytics_recompute_status",
        sa.Column("generation", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("analytics_recompute_status", "generation")
