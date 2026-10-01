"""household_members phone_number / email contact columns

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-01

Contact details only, unverified, not unique (decision Q8). Both nullable.
"""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


# Frozen copy of 0018's SQLite trigger (don't import app modules). The batch
# rebuild below recreates household_members, which drops its triggers.
_SQLITE_NEVER_RELOCK = """
CREATE TRIGGER IF NOT EXISTS trg_member_never_relock
BEFORE UPDATE ON household_members
FOR EACH ROW
WHEN OLD.details_completed_at IS NOT NULL
 AND (NEW.details_completed_at IS NULL OR NEW.lock_reason IS NOT NULL)
BEGIN
    SELECT RAISE(ABORT, 'member_already_unlocked');
END
"""


def upgrade() -> None:
    op.add_column("household_members", sa.Column("phone_number", sa.String(), nullable=True))
    op.add_column("household_members", sa.Column("email", sa.String(), nullable=True))


def downgrade() -> None:
    # batch_alter_table: SQLite cannot DROP COLUMN on older versions.
    with op.batch_alter_table("household_members") as batch:
        batch.drop_column("email")
        batch.drop_column("phone_number")
    if op.get_bind().dialect.name == "sqlite":
        op.execute(_SQLITE_NEVER_RELOCK)
