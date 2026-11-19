"""Store short-lived, keyed hashes for the auth request guard.

Revision ID: 0054
Revises: 0053
Create Date: 2026-11-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_request_guard",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("ip_hash", sa.String(64), nullable=False),
        sa.Column("identifier_hash", sa.String(64), nullable=False),
        sa.Column("route", sa.String(), nullable=False),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("code_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("ip_hash", "identifier_hash", name="uq_auth_request_guard_ip_identifier"),
    )
    op.create_index(
        "ix_auth_request_guard_ip_hash_created_at", "auth_request_guard", ["ip_hash", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_auth_request_guard_ip_hash_created_at", table_name="auth_request_guard")
    op.drop_table("auth_request_guard")
