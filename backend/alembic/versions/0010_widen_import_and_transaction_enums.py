"""widen import status and transaction type values

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-02

Bring the database constraints into line with the application enums.  The
literal values are frozen here deliberately; migrations must not import live
model definitions.

``imports.status`` is a native PostgreSQL ENUM.  The partitioned PostgreSQL
``transactions`` table created by 0001 is the exception: its ``type`` column
is VARCHAR guarded by a CHECK constraint.  Upgrade both physical forms, and
also widen a native ``transactiontype`` if one exists in a database created
through a non-partitioned/custom path.
"""

from alembic import op


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


_IMPORT_STATUS_VALUES_TO_ADD = (
    "not_started",
    "requesting_cas",
    "waiting_for_user",
    "upload_started",
    "password_required",
    "validation_failed",
    "processing",
    "retry_pending",
    "import_successful",
    "import_failed",
    "expired",
)

_TRANSACTION_TYPE_VALUES = (
    "purchase",
    "purchase_sip",
    "redemption",
    "switch_in",
    "switch_out",
    "dividend_payout",
    "dividend_reinvest",
    "segregation",
    "stt",
    "stamp_duty",
    "misc",
    "opening_balance",
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # Existing precedent (0003 and 0006): SQLite persists these enums as
        # unconstrained VARCHAR columns, so additive values need no DDL.
        return

    # PostgreSQL 16 permits ADD VALUE inside a transaction, but the new value
    # cannot be used until that transaction commits.  This revision only
    # changes schema; callers use the values after Alembic commits it.
    for value in _IMPORT_STATUS_VALUES_TO_ADD:
        op.execute(f"ALTER TYPE importstatus ADD VALUE IF NOT EXISTS '{value}'")

    # A native transactiontype exists on SQLite's SQLAlchemy schema path but
    # not in 0001's partitioned PostgreSQL path.  Retain support for a native
    # type if a custom/legacy PostgreSQL database has one.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactiontype') THEN
                ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'opening_balance';
            END IF;
        END $$;
        """
    )

    # 0001 creates transactions.type as VARCHAR + this automatically named
    # CHECK because the table is RANGE-partitioned.  0003's attempted enum
    # widening was therefore a no-op on PostgreSQL.  Rebuild only that CHECK,
    # preserving the actual partitioned layout.
    values = ", ".join(f"'{value}'" for value in _TRANSACTION_TYPE_VALUES)
    op.execute(
        "ALTER TABLE transactions "
        "DROP CONSTRAINT IF EXISTS transactions_type_check"
    )
    op.execute(
        "ALTER TABLE transactions "
        "ADD CONSTRAINT transactions_type_check "
        f"CHECK (type IN ({values}))"
    )


def downgrade() -> None:
    """Deliberately retain the added values on PostgreSQL and SQLite.

    PostgreSQL has no ``ALTER TYPE ... DROP VALUE``.  Removing the eleven
    native ``importstatus`` labels would require replacing the type and every
    dependent column, which is disproportionate and can destroy rows that use
    a newly added value.  Narrowing the transactions CHECK independently would
    create an inconsistent partial rollback and can likewise reject existing
    ``opening_balance`` rows.

    This follows 0006's additive-enum downgrade precedent: ``alembic
    downgrade -1`` may move the recorded revision back to 0009, but the wider
    accepted-value set intentionally remains in place and re-upgrade is safe
    because every native ADD VALUE uses IF NOT EXISTS.
    """

