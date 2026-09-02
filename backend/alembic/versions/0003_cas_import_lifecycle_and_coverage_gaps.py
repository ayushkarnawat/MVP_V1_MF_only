"""CAS import lifecycle, coverage gaps, and opening balance transaction type

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-10

Implements Updated-CAS-PRD FR-5 (lifecycle states & history metadata) and
FR-7 (coverage gap flags & opening balance transaction type).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _upgrade_postgres()
    else:
        _upgrade_sqlite()


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _downgrade_postgres()
    else:
        _downgrade_sqlite()


def _upgrade_sqlite() -> None:
    with op.batch_alter_table("imports") as batch_op:
        batch_op.add_column(sa.Column("error_code", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("error_message", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("source_tab", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("statement_from_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("statement_to_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index("ix_imports_member_uploaded_at", ["household_member_id", "uploaded_at"])

    with op.batch_alter_table("folios") as batch_op:
        batch_op.add_column(sa.Column("has_coverage_gap", sa.Boolean(), server_default=sa.text("0"), nullable=False))
        batch_op.add_column(sa.Column("coverage_gap_details", sa.JSON(), nullable=True))


def _downgrade_sqlite() -> None:
    with op.batch_alter_table("folios") as batch_op:
        batch_op.drop_column("coverage_gap_details")
        batch_op.drop_column("has_coverage_gap")

    with op.batch_alter_table("imports") as batch_op:
        batch_op.drop_index("ix_imports_member_uploaded_at")
        batch_op.drop_column("expires_at")
        batch_op.drop_column("statement_to_date")
        batch_op.drop_column("statement_from_date")
        batch_op.drop_column("source_tab")
        batch_op.drop_column("error_message")
        batch_op.drop_column("error_code")


def _upgrade_postgres() -> None:
    # Add new values to PostgreSQL native enum types if they exist or update check constraints
    op.execute(
        """
        DO $$
        BEGIN
            -- Transaction type opening_balance
            IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'transactiontype' AND e.enumlabel = 'opening_balance') THEN
                ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'opening_balance';
            END IF;
        EXCEPTION
            WHEN undefined_object THEN NULL;
        END $$;
        """
    )

    op.add_column("imports", sa.Column("error_code", sa.String(), nullable=True))
    op.add_column("imports", sa.Column("error_message", sa.String(), nullable=True))
    op.add_column("imports", sa.Column("source_tab", sa.String(), nullable=True))
    op.add_column("imports", sa.Column("statement_from_date", sa.Date(), nullable=True))
    op.add_column("imports", sa.Column("statement_to_date", sa.Date(), nullable=True))
    op.add_column("imports", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_imports_member_uploaded_at", "imports", ["household_member_id", "uploaded_at"])

    op.add_column("folios", sa.Column("has_coverage_gap", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column(
        "folios",
        sa.Column("coverage_gap_details", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=True),
    )


def _downgrade_postgres() -> None:
    op.drop_column("folios", "coverage_gap_details")
    op.drop_column("folios", "has_coverage_gap")

    op.drop_index("ix_imports_member_uploaded_at", table_name="imports")
    op.drop_column("imports", "expires_at")
    op.drop_column("imports", "statement_to_date")
    op.drop_column("imports", "statement_from_date")
    op.drop_column("imports", "source_tab")
    op.drop_column("imports", "error_message")
    op.drop_column("imports", "error_code")
