"""nav_history_wider_nav: NUMERIC(10,4) -> NUMERIC(14,4) for nav_history.nav (attribute 11 close-out)

Revision ID: 0038
Revises: 0037

IL&FS Infrastructure Debt Fund units have a Rs 10 lakh face value (NAV 2,185,944.3803 on
31 Mar 2024), which overflowed NUMERIC(10,4) and aborted the scheme-wide NAV backfill on its
first batch (local trial, 10 Oct). On Postgres, raising a numeric's precision at the same
scale needs no table rewrite. SQLite ignores numeric precision, so nothing to do there.
"""
from alembic import op
import sqlalchemy as sa

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    op.alter_column("nav_history", "nav", type_=sa.Numeric(14, 4), existing_type=sa.Numeric(10, 4),
                    existing_nullable=False)


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    # Rows that only fit the wider column can't survive the narrower one.
    op.execute("DELETE FROM nav_history WHERE nav >= 1000000")
    op.alter_column("nav_history", "nav", type_=sa.Numeric(10, 4), existing_type=sa.Numeric(14, 4),
                    existing_nullable=False)
