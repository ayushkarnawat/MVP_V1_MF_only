"""Separate the US-Iran phase boundary days without recomputing results."""
from datetime import date

from alembic import op
import sqlalchemy as sa

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None

scenarios = sa.table(
    "scenarios",
    sa.column("name", sa.String()),
    sa.column("parent_scenario_id", sa.Uuid()),
    sa.column("end_date", sa.Date()),
)


def _set_dates(shock: date, recovery: date) -> None:
    for name, end in (
        ("US-Iran war -- Shock", shock),
        ("US-Iran war -- Partial recovery", recovery),
    ):
        op.execute(scenarios.update().where(
            scenarios.c.name == name,
            scenarios.c.parent_scenario_id.is_not(None),
        ).values(end_date=end))


def upgrade() -> None:
    _set_dates(date(2026, 4, 1), date(2026, 7, 7))


def downgrade() -> None:
    _set_dates(date(2026, 4, 2), date(2026, 7, 8))
