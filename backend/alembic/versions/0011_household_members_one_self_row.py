"""enforce one 'self' household_member row per user

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-02

F3 (compliance audit): nothing stopped a user from creating more than one
`relationship = 'self'` household member. A read-only check against the dev
DB before this migration found zero existing violations (39 self-rows across
46 users), so no data-remediation step is needed here.

A single partial unique index, dialect-branched via SQLAlchemy's
`sqlite_where`/`postgresql_where` construct kwargs, does the job on both
engines without a runtime dialect check in application code.
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

_INDEX_NAME = "ix_household_members_one_self_per_user"
_WHERE = sa.text("relationship = 'self'")


def upgrade() -> None:
    op.create_index(
        _INDEX_NAME,
        "household_members",
        ["user_id"],
        unique=True,
        sqlite_where=_WHERE,
        postgresql_where=_WHERE,
    )


def downgrade() -> None:
    op.drop_index(_INDEX_NAME, table_name="household_members")
