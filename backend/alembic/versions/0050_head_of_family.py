"""Head of Family flag, request lifecycle, and OTP purpose.

Revision ID: 0050
Revises: 0049
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0050"
# The predecessor file is 0049_benchmark_index_registry.py; its declared
# Alembic revision identifier is "0049".
down_revision = "0049"
branch_labels = None
depends_on = None

_HEAD_INDEX = "ix_household_members_one_head_per_user"
_OPEN_REQUEST_INDEX = "ix_head_change_requests_one_pending_per_user"
_HEAD_WHERE = sa.text("is_head")
_OPEN_WHERE = sa.text("status = 'pending'")


def upgrade() -> None:
    op.add_column(
        "household_members",
        sa.Column("is_head", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Only the existing account-holder row becomes head. Accounts that never
    # completed onboarding and have no Self row deliberately remain headless.
    op.execute(sa.text("UPDATE household_members SET is_head = true WHERE relationship = 'self'"))
    op.create_index(
        _HEAD_INDEX,
        "household_members",
        ["user_id"],
        unique=True,
        sqlite_where=_HEAD_WHERE,
        postgresql_where=_HEAD_WHERE,
    )

    op.add_column("otp_requests", sa.Column("purpose", sa.String(), nullable=True))

    snapshot_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.create_table(
        "head_change_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "from_member_id",
            sa.Uuid(),
            sa.ForeignKey("household_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "to_member_id",
            sa.Uuid(),
            sa.ForeignKey("household_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("current_email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_phone_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("new_email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("new_phone_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("undo_token_hash", sa.String(), nullable=True),
        sa.Column("undo_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("snapshot", snapshot_type, nullable=True),
    )
    op.create_index(
        _OPEN_REQUEST_INDEX,
        "head_change_requests",
        ["user_id"],
        unique=True,
        sqlite_where=_OPEN_WHERE,
        postgresql_where=_OPEN_WHERE,
    )


def downgrade() -> None:
    op.drop_index(_OPEN_REQUEST_INDEX, table_name="head_change_requests")
    op.drop_table("head_change_requests")
    op.drop_column("otp_requests", "purpose")
    op.drop_index(_HEAD_INDEX, table_name="household_members")
    op.drop_column("household_members", "is_head")
