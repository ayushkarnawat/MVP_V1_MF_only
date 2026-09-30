"""imports statement period backfill (data only)

Revision ID: 0020
Revises: 0019
Create Date: 2026-09-30

Staging-QA fix 6: no import path ever wrote imports.statement_from_date /
statement_to_date. Every confirmed import kept casparser's statement_period
inside raw_parser_output (_person_raw_output preserves top-level keys), so
the dates are recovered from there. Pydantic dumps the key as "from_"; "from"
is accepted too. Unreadable rows stay NULL. No schema change, so the
downgrade is a no-op.
"""
import json
from datetime import datetime

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def _date(value):
    if not isinstance(value, str):
        return None
    # Slice to each format's own length so a trailing time ("…T00:00") is ignored.
    for fmt, width in (("%d-%b-%Y", 11), ("%Y-%m-%d", 10)):
        try:
            return datetime.strptime(value.strip()[:width], fmt).date()
        except ValueError:
            continue
    return None


def upgrade() -> None:
    bind = op.get_bind()
    # raw_parser_output is JSON/JSONB in the model; read it as text so a row
    # holding invalid JSON (only possible on SQLite) is skipped, not fatal.
    imports = sa.table(
        "imports",
        sa.column("id"),
        sa.column("raw_parser_output", sa.Text()),
        sa.column("statement_from_date", sa.Date()),
        sa.column("statement_to_date", sa.Date()),
    )
    raw_text = sa.cast(imports.c.raw_parser_output, sa.Text())
    rows = bind.execute(
        sa.select(imports.c.id, raw_text).where(imports.c.statement_from_date.is_(None))
    ).all()
    for row_id, raw in rows:
        try:
            data = json.loads(raw or "")
        except (TypeError, ValueError):
            continue
        period = data.get("statement_period") if isinstance(data, dict) else None
        if not isinstance(period, dict):
            continue
        start, end = _date(period.get("from_", period.get("from"))), _date(period.get("to"))
        if start and end:
            bind.execute(
                imports.update().where(imports.c.id == row_id)
                .values(statement_from_date=start, statement_to_date=end)
            )


def downgrade() -> None:
    pass
