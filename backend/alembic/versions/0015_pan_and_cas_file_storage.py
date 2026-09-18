"""pan persistence and cas file storage

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("household_members", sa.Column("pan_encrypted", sa.String(), nullable=True))
    op.add_column("household_members", sa.Column("pan_lookup_hash", sa.String(), nullable=True))
    # unique=True: closes a TOCTOU race where two concurrent imports of the
    # same PAN under different accounts could both see "no match" and both
    # backfill, corrupting the "one PAN, one member, system-wide" invariant
    # (Fix 6, 2026-09-18 whole-branch review). Safe on a nullable column on
    # both SQLite and Postgres -- both allow multiple NULLs in a unique
    # index; only non-null hash values are constrained to be distinct.
    op.create_index(
        "ix_household_members_pan_lookup_hash",
        "household_members",
        ["pan_lookup_hash"],
        unique=True,
    )
    op.add_column("imports", sa.Column("file_reference", sa.String(), nullable=True))
    op.add_column("imports", sa.Column("file_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("imports", "file_expires_at")
    op.drop_column("imports", "file_reference")
    op.drop_index("ix_household_members_pan_lookup_hash", table_name="household_members")
    op.drop_column("household_members", "pan_lookup_hash")
    op.drop_column("household_members", "pan_encrypted")
