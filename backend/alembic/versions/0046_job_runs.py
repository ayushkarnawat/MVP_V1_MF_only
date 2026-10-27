"""job_runs: one row per batch job holding its last successful run time.

Additive only. First user is refresh_news, so the Home news route can report
feed freshness as "last successful refresh" rather than "newest inserted
article" (a healthy run that finds only duplicates inserts nothing).
"""
from alembic import op
import sqlalchemy as sa

revision = "0046"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "job_runs",
        sa.Column("job_name", sa.String(64), primary_key=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("job_runs")
