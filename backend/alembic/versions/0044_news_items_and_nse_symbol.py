"""News items (GDELT feed) and stock_master.nse_symbol column (Home News backend).

Chains after 0045, not before: 0045 was already the head when this revision
was written (0043 -> 0045 -> 0044), so alembic's revision graph (which
follows down_revision, not file order) puts this one last.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0044"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "news_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("language", sa.String(8), nullable=False, server_default="en"),
        sa.Column(
            "entity_tags",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.String()), "postgresql"),
            nullable=False, server_default="[]",
        ),
        sa.Column("tier", sa.Integer(), nullable=False),
        sa.UniqueConstraint("url", name="uq_news_items_url"),
        sa.CheckConstraint("tier BETWEEN 1 AND 7", name="ck_news_items_tier_range"),
    )
    op.create_index("ix_news_items_published_at", "news_items", ["published_at"])
    op.add_column("stock_master", sa.Column("nse_symbol", sa.String(32), nullable=True))


def downgrade():
    op.drop_index("ix_news_items_published_at", table_name="news_items")
    op.drop_table("news_items")
    # SQLite cannot DROP COLUMN directly; batch mode rebuilds the table.
    with op.batch_alter_table("stock_master") as batch:
        batch.drop_column("nse_symbol")
