"""consent_records: append-only consent ledger (consent core)

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-01

No foreign keys on purpose (decision Q6): a user hard-delete must never try
to UPDATE or DELETE these rows, and they are kept indefinitely for now.

The append-only trigger SQL is a frozen copy of app/db/consent_trigger_sql.py
as of this revision -- deliberately not imported, so later edits there can't
rewrite history. No batch_alter_table on consent_records, ever: on SQLite the
table rebuild would silently drop the triggers.

Postgres enum types are created by op.create_table itself and dropped
explicitly in downgrade (drop_table leaves them behind).

Also adds pending_identity_verifications.consent_snapshot (Task 8): the sign-up
consent captured at the first step, held until the account is created. Folded
into this revision rather than a new one because 0022 is not deployed yet.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

_CONSENT_ACTION = sa.Enum("given", "withdrawn", name="consentaction")
_CONSENT_PURPOSE = sa.Enum(
    "service_agreement", "account_and_authentication", "portfolio_tracking_analytics",
    "cas_pan_processing",
    name="consentpurpose",
)
_CONSENT_DOCUMENT_TYPE = sa.Enum(
    "terms_of_service", "privacy_policy", "pan_disclaimer", name="consentdocumenttype",
)

_SQLITE_APPEND_ONLY_UPDATE = """
CREATE TRIGGER IF NOT EXISTS trg_consent_no_update BEFORE UPDATE ON consent_records
BEGIN SELECT RAISE(ABORT, 'consent_records_append_only'); END
"""

_SQLITE_APPEND_ONLY_DELETE = """
CREATE TRIGGER IF NOT EXISTS trg_consent_no_delete BEFORE DELETE ON consent_records
BEGIN SELECT RAISE(ABORT, 'consent_records_append_only'); END
"""

_POSTGRES_APPEND_ONLY_FN = """
CREATE OR REPLACE FUNCTION consent_records_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'consent_records_append_only';
END;
$$ LANGUAGE plpgsql
"""

_POSTGRES_APPEND_ONLY_TRIGGER = """
DROP TRIGGER IF EXISTS trg_consent_append_only ON consent_records;
CREATE TRIGGER trg_consent_append_only BEFORE UPDATE OR DELETE ON consent_records
FOR EACH ROW EXECUTE FUNCTION consent_records_append_only()
"""


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # batch_alter_table is fine here (pending_identity_verifications has no
    # triggers); it's only consent_records that must never be rebuilt.
    with op.batch_alter_table("pending_identity_verifications") as batch:
        batch.add_column(
            sa.Column(
                "consent_snapshot",
                sa.JSON(none_as_null=True).with_variant(postgresql.JSONB(none_as_null=True), "postgresql"),
                nullable=True,
            )
        )

    op.create_table(
        "consent_records",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("action", _CONSENT_ACTION, nullable=False),
        sa.Column("purpose_code", _CONSENT_PURPOSE, nullable=False),
        sa.Column("document_type", _CONSENT_DOCUMENT_TYPE, nullable=False),
        sa.Column("document_version", sa.String(), nullable=False),
        sa.Column("document_sha256", sa.String(64), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("surface", sa.String(), nullable=False),
        sa.Column("ip_truncated", sa.String(), nullable=True),
        sa.Column("ip_hmac", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("device_id", sa.String(), nullable=True),
        sa.Column("related_import_id", sa.Uuid(), nullable=True),
        sa.Column("related_file_sha256", sa.String(64), nullable=True),
    )
    op.create_index("ix_consent_records_user_id", "consent_records", ["user_id"])
    op.create_index(
        "ix_consent_records_user_purpose_recorded", "consent_records",
        ["user_id", "purpose_code", "recorded_at"],
    )

    if _is_postgres():
        op.execute(_POSTGRES_APPEND_ONLY_FN)
        op.execute(_POSTGRES_APPEND_ONLY_TRIGGER)
    else:
        op.execute(_SQLITE_APPEND_ONLY_UPDATE)
        op.execute(_SQLITE_APPEND_ONLY_DELETE)


def downgrade() -> None:
    if _is_postgres():
        op.execute("DROP TRIGGER IF EXISTS trg_consent_append_only ON consent_records")
        op.execute("DROP FUNCTION IF EXISTS consent_records_append_only()")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_consent_no_update")
        op.execute("DROP TRIGGER IF EXISTS trg_consent_no_delete")

    op.drop_index("ix_consent_records_user_purpose_recorded", table_name="consent_records")
    op.drop_index("ix_consent_records_user_id", table_name="consent_records")
    op.drop_table("consent_records")

    if _is_postgres():
        bind = op.get_bind()
        for enum_type in (_CONSENT_DOCUMENT_TYPE, _CONSENT_PURPOSE, _CONSENT_ACTION):
            enum_type.drop(bind, checkfirst=True)

    with op.batch_alter_table("pending_identity_verifications") as batch:
        batch.drop_column("consent_snapshot")
