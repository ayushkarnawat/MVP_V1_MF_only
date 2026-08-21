"""remove password auth: drop auth_identities.password_hash,
auth_identities.email_confirmed_at, pending_identity_verifications.password_hash,
and the password_reset_tokens table entirely.

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-17

Management decision to revert email signup back to email+OTP (decisions.md's
new 2026-08-17 entry reversing that same date's earlier "email signup
reverses to email+password" entry) -- see
Docs/orchestration/remove-password-auth-handoff.md for the full spec.

EMAIL_PASSWORD stays defined in the AuthIdentityProvider enum -- same
can't-cheaply-drop-a-Postgres-enum-value precedent 0006's downgrade already
set for EMAIL_OTP, so no ALTER TYPE here, additive-only in spirit even
though this migration itself is a removal of columns/tables, not the enum
value.
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("password_reset_tokens")

    with op.batch_alter_table("pending_identity_verifications") as batch_op:
        batch_op.drop_column("password_hash")

    with op.batch_alter_table("auth_identities") as batch_op:
        batch_op.drop_column("email_confirmed_at")
        batch_op.drop_column("password_hash")


def downgrade() -> None:
    # Re-add in the same order 0006 originally added them.
    with op.batch_alter_table("auth_identities") as batch_op:
        batch_op.add_column(sa.Column("password_hash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("email_confirmed_at", sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table("pending_identity_verifications") as batch_op:
        batch_op.add_column(sa.Column("password_hash", sa.String(), nullable=True))

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
