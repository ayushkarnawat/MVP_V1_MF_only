"""otp_requests.consent_snapshot: phone sign-up consent captured at "Get OTP"

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-07

Phone sign-up has no pending-verification record when "Get OTP" is pressed
(it is created only after the phone OTP verifies), so the T&C + Privacy
agreement made by that click is held on the OTP request row until verify,
which copies it onto the pending record. Same snapshot shape as
pending_identity_verifications.consent_snapshot (0022). Nullable and
additive: logins, resends without consent and legacy clients leave it NULL.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("otp_requests") as batch:
        batch.add_column(
            sa.Column(
                "consent_snapshot",
                sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True), "postgresql"),
                nullable=True,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("otp_requests") as batch:
        batch.drop_column("consent_snapshot")
