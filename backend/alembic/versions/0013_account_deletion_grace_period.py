"""account deletion survey and five-day grace state

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-11
"""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pending_deletion", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("deletion_scheduled_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_deletion_scheduled_at", "users", ["deletion_scheduled_at"], unique=False)
    op.create_table(
        "account_deletion_surveys",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("account_deletion_surveys")
    op.drop_index("ix_users_deletion_scheduled_at", table_name="users")
    op.drop_column("users", "deletion_scheduled_at")
    op.drop_column("users", "pending_deletion")
