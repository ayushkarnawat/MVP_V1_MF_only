"""multi-method auth: identities, pending verifications, widened otp_requests

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-14

Adds `auth_identities` (verification source of truth, one row per linked
method) and `pending_identity_verifications` (holds a verified Google/email
identity until its mandatory phone step or step-up link completes).
`users.phone_number` is UNCHANGED — it stays UNIQUE NOT NULL, per Design
Spec §1's reversal of an earlier draft that would have made it nullable.
`otp_requests` widens to accept email as an alternative to phone_number
(exactly one required, via CHECK constraint). `sessions` gains
`auth_method`, backfilled to 'phone_otp' for existing rows since every
session created before this migration was phone-authenticated.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

_PROVIDER_VALUES = ("phone_otp", "email_otp", "google")


def upgrade() -> None:
    op.create_table(
        "auth_identities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.Enum(*_PROVIDER_VALUES, name="authidentityprovider"), nullable=False),
        sa.Column("provider_subject", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("identifier_verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "provider_subject", name="uq_auth_identities_provider_subject"),
    )

    op.create_table(
        "pending_identity_verifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.Enum(*_PROVIDER_VALUES, name="authidentityprovider"), nullable=False),
        sa.Column("provider_subject", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("email_verified", sa.Boolean(), nullable=False),
        sa.Column("matched_user_id", sa.Uuid(), nullable=True),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["matched_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    with op.batch_alter_table("otp_requests") as batch_op:
        batch_op.alter_column("phone_number", existing_type=sa.String(), nullable=True)
        batch_op.add_column(sa.Column("email", sa.String(), nullable=True))
        batch_op.create_check_constraint(
            "ck_otp_requests_exactly_one_identifier",
            "(phone_number IS NOT NULL) != (email IS NOT NULL)",
        )

    with op.batch_alter_table("sessions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "auth_method",
                sa.Enum(*_PROVIDER_VALUES, name="authidentityprovider"),
                nullable=False,
                server_default="phone_otp",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.drop_column("auth_method")

    with op.batch_alter_table("otp_requests") as batch_op:
        batch_op.drop_constraint("ck_otp_requests_exactly_one_identifier", type_="check")
        batch_op.drop_column("email")
        batch_op.alter_column("phone_number", existing_type=sa.String(), nullable=False)

    op.drop_table("pending_identity_verifications")
    op.drop_table("auth_identities")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE authidentityprovider")
