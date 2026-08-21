"""scheme_ter.ter_value nullable

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-20

NULL now means "checked this scheme against this period's AMFI feed, found
no usable TER" -- distinct from no row at all ("never checked"). Lets
`_missing_current_month_ter` (ter.py) stop treating a permanently-
unmatchable scheme (e.g. a matured FMP no longer in AMFI's feed) as
perpetually missing coverage, which was re-triggering a full AMFI
national-feed rescan on every 15-minute backoff window forever.
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("scheme_ter") as batch_op:
        batch_op.alter_column("ter_value", existing_type=sa.Numeric(5, 2), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("scheme_ter") as batch_op:
        batch_op.alter_column("ter_value", existing_type=sa.Numeric(5, 2), nullable=False)
