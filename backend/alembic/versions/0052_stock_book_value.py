"""Book value per share from company filings on stock_master (T2.12 Step B).

Revision ID: 0052
Revises: 0051
"""

from alembic import op
import sqlalchemy as sa

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None

_COLUMNS = (
    ("book_value_per_share", sa.Numeric(18, 6)),
    ("book_value_as_of", sa.Date()),
    ("book_value_filing_ref", sa.Text()),
    ("book_value_basis", sa.String()),
)


def upgrade() -> None:
    for name, kind in _COLUMNS:
        op.add_column("stock_master", sa.Column(name, kind, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("stock_master") as batch:
        for name, _ in reversed(_COLUMNS):
            batch.drop_column(name)
