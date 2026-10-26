"""Add four benchmark index enum members."""

from alembic import op

revision = "0045"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE benchmarkindex ADD VALUE IF NOT EXISTS 'nifty_next_50'")
            op.execute("ALTER TYPE benchmarkindex ADD VALUE IF NOT EXISTS 'nifty_smallcap_250'")
            op.execute("ALTER TYPE benchmarkindex ADD VALUE IF NOT EXISTS 'nifty_100'")
            op.execute("ALTER TYPE benchmarkindex ADD VALUE IF NOT EXISTS 'nifty_200'")


def downgrade():
    # PostgreSQL cannot remove enum values; SQLite needs no schema change.
    pass
