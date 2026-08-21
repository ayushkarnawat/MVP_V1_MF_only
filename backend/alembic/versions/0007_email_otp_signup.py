"""email-otp signup: widen otp_requests back to accept email, drop the
link-based email_confirmation_tokens table.

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-17

Mirrors the shape migration 0004 had before 0006 re-narrowed it: exactly
one of otp_requests.phone_number/email is required again, via the same
CHECK constraint (this time the email+password signup flow's own inline
email-OTP confirmation step is the caller, not a since-removed EMAIL_OTP
identity provider). email_confirmation_tokens is dropped outright, not
left as inert dead schema -- the link-based confirmation mechanism it
backed is being deleted, not toggled off (2026-08-17 email-otp-signup
handoff spec §1).
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("otp_requests") as batch_op:
        batch_op.alter_column("phone_number", existing_type=sa.String(), nullable=True)
        batch_op.add_column(sa.Column("email", sa.String(), nullable=True))
        batch_op.create_check_constraint(
            "ck_otp_requests_exactly_one_identifier",
            "(phone_number IS NOT NULL) != (email IS NOT NULL)",
        )

    op.drop_table("email_confirmation_tokens")


def downgrade() -> None:
    op.create_table(
        "email_confirmation_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    with op.batch_alter_table("otp_requests") as batch_op:
        batch_op.drop_constraint("ck_otp_requests_exactly_one_identifier", type_="check")
        batch_op.drop_column("email")
        batch_op.alter_column("phone_number", existing_type=sa.String(), nullable=False)
