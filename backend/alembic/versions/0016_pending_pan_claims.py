"""pending pan claims

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable, no backfill: every existing PAN is permanent (NULL here).
    op.add_column(
        "household_members",
        sa.Column("pan_pending_until", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("household_members", "pan_pending_until")
