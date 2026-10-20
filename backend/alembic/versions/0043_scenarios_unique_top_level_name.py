"""Guard top-level scenario names after explicit duplicate cleanup."""
from alembic import op
import sqlalchemy as sa

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade():
    scenarios = sa.table("scenarios", sa.column("name", sa.String()), sa.column("parent_scenario_id", sa.Uuid()))
    duplicates = (
        sa.select(scenarios.c.name).where(scenarios.c.parent_scenario_id.is_(None))
        .group_by(scenarios.c.name).having(sa.func.count() > 1).limit(1)
    )
    if op.get_bind().execute(duplicates).first() is not None:
        raise RuntimeError("Duplicate top-level scenario names exist; run scripts/dedupe_scenarios.py --apply first")
    op.create_index(
        "uq_scenarios_top_level_name", "scenarios", ["name"], unique=True,
        postgresql_where=sa.text("parent_scenario_id IS NULL"),
        sqlite_where=sa.text("parent_scenario_id IS NULL"),
    )


def downgrade():
    op.drop_index("uq_scenarios_top_level_name", table_name="scenarios")
