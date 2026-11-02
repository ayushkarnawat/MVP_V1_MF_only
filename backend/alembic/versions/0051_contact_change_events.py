"""Contact-change events: the "this wasn't me" link and the 7-day cooling-off.

Revision ID: 0051
Revises: 0050
"""

from alembic import op
import sqlalchemy as sa

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contact_change_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.String(), nullable=False),
        sa.Column("old_value", sa.String(), nullable=True),
        sa.Column("new_value", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_contact_change_events_user_id", "contact_change_events", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_contact_change_events_user_id", table_name="contact_change_events")
    op.drop_table("contact_change_events")
