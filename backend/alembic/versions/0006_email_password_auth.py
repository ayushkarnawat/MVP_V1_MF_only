"""email+password auth: EMAIL_PASSWORD provider, password_hash/email_confirmed_at
on auth_identities and pending_identity_verifications, password_reset_tokens,
email_confirmation_tokens, and narrowing otp_requests back to phone-only.

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-17

Design Spec: Docs/superpowers/specs/2026-08-17-email-password-signup-design.md §5.

One migration, not several — all changes are part of the same product
change and land together, matching how 0004 bundled the original
multi-method-auth schema in one revision.

EMAIL_OTP is never removed or renamed (§1) — Postgres enum values can't be
cheaply dropped, so EMAIL_PASSWORD is added alongside it via ADD VALUE,
additive-only.

Deliberately no imports from `app.models` — SQLAlchemy Core table literals
only, same convention as every migration since 0001.
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # --- 1. Add EMAIL_PASSWORD to the AuthIdentityProvider enum ---
    if bind.dialect.name == "postgresql":
        # ALTER TYPE ... ADD VALUE cannot run inside a transaction block on
        # older Postgres versions; op.execute here matches how this repo has
        # no prior enum-widening migration to pattern-match against, so this
        # is the standard, documented Postgres approach for additive enum
        # values.
        op.execute("ALTER TYPE authidentityprovider ADD VALUE IF NOT EXISTS 'email_password'")
    # SQLite stores the enum as a plain VARCHAR (see app.models.enums.enum_column's
    # docstring) — no schema change needed there for a new allowed value.

    # --- 2. auth_identities: password_hash, email_confirmed_at ---
    with op.batch_alter_table("auth_identities") as batch_op:
        batch_op.add_column(sa.Column("password_hash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("email_confirmed_at", sa.DateTime(timezone=True), nullable=True))

    # --- 3. pending_identity_verifications: password_hash ---
    with op.batch_alter_table("pending_identity_verifications") as batch_op:
        batch_op.add_column(sa.Column("password_hash", sa.String(), nullable=True))

    # --- 4. New table: password_reset_tokens ---
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # --- 5. New table: email_confirmation_tokens ---
    op.create_table(
        "email_confirmation_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # --- 6. Narrow otp_requests back to phone-only ---
    # Confirm no non-empty email rows exist before dropping the column — this
    # is a genuine narrowing (Design Spec §5). Safe on every environment this
    # migration has actually run against so far (dev SQLite has none), and
    # becomes a real pre-deploy check once Postgres is live per the Migration
    # Plan's readiness checklist.
    otp_requests = sa.table("otp_requests", sa.column("email", sa.String()))
    non_empty_emails = bind.execute(
        sa.select(sa.func.count()).select_from(otp_requests).where(otp_requests.c.email.isnot(None))
    ).scalar()
    if non_empty_emails:
        raise RuntimeError(
            f"otp_requests has {non_empty_emails} row(s) with a non-NULL email — "
            "cannot safely drop the column. Investigate before re-running this migration."
        )

    with op.batch_alter_table("otp_requests") as batch_op:
        batch_op.drop_constraint("ck_otp_requests_exactly_one_identifier", type_="check")
        batch_op.drop_column("email")
        batch_op.alter_column("phone_number", existing_type=sa.String(), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("otp_requests") as batch_op:
        batch_op.alter_column("phone_number", existing_type=sa.String(), nullable=True)
        batch_op.add_column(sa.Column("email", sa.String(), nullable=True))
        batch_op.create_check_constraint(
            "ck_otp_requests_exactly_one_identifier",
            "(phone_number IS NOT NULL) != (email IS NOT NULL)",
        )

    op.drop_table("email_confirmation_tokens")
    op.drop_table("password_reset_tokens")

    with op.batch_alter_table("pending_identity_verifications") as batch_op:
        batch_op.drop_column("password_hash")

    with op.batch_alter_table("auth_identities") as batch_op:
        batch_op.drop_column("email_confirmed_at")
        batch_op.drop_column("password_hash")

    # EMAIL_PASSWORD is NOT removed from the Postgres enum type on downgrade —
    # Postgres has no DROP VALUE, only a full type recreation, which risks
    # destroying live data if any row still uses it. Leaving the enum value
    # defined is harmless (same reasoning as never removing EMAIL_OTP).
