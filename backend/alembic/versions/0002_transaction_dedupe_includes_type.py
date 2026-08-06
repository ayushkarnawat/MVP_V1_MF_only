"""widen transaction dedupe key to include type

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-06

Real bug, not a preemptive hardening: a same-day purchase and redemption of
equal amount/units used to have opposite signs (a CAS-parser normalization
bug, since fixed at its own root cause) and couldn't collide on the old
4-column key. Once both were normalized to positive magnitudes, they could
— and the import pipeline would silently drop the second one as a false
duplicate. This migration widens the key to (folio_id, date, amount, units,
type) so type-distinct transactions are never conflated. No data
transformation — existing rows are untouched, this only changes what counts
as a duplicate going forward.
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

NEW_CONSTRAINT_NAME = "uq_transactions_folio_date_amount_units_type"
OLD_CONSTRAINT_NAME_FALLBACK = "uq_transactions_folio_date_amount_units"


def _postgres_unique_constraint_name(conn) -> str | None:
    result = conn.exec_driver_sql(
        """
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'transactions' AND constraint_type = 'UNIQUE'
        """
    ).fetchall()
    return result[0][0] if result else None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _upgrade_postgres(bind)
    else:
        _upgrade_sqlite(bind)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _downgrade_postgres()
    else:
        _downgrade_sqlite(bind)


def _upgrade_sqlite(bind) -> None:
    # 0001 created the UNIQUE constraint unnamed, and SQLite doesn't expose
    # constraint names via PRAGMA (even named ones are backed by
    # sqlite_autoindex_* indexes) — the name only exists in the CREATE TABLE
    # SQL, which the SQLAlchemy inspector parses for us. Unnamed constraints
    # reflect with name None; the naming_convention below gives those a
    # deterministic name batch mode can drop. Named ones (e.g. re-upgrading
    # after a downgrade created the named fallback) keep their real name.
    constraints = sa.inspect(bind).get_unique_constraints("transactions")
    convention = "uq_%(table_name)s_%(column_0_name)s"
    with op.batch_alter_table(
        "transactions",
        recreate="always",
        naming_convention={"uq": convention},
    ) as batch_op:
        for uc in constraints:
            name = uc["name"] or f"uq_transactions_{uc['column_names'][0]}"
            batch_op.drop_constraint(name, type_="unique")
        batch_op.create_unique_constraint(
            NEW_CONSTRAINT_NAME, ["folio_id", "date", "amount", "units", "type"]
        )


def _downgrade_sqlite(bind) -> None:
    with op.batch_alter_table("transactions", recreate="always") as batch_op:
        batch_op.drop_constraint(NEW_CONSTRAINT_NAME, type_="unique")
        batch_op.create_unique_constraint(
            OLD_CONSTRAINT_NAME_FALLBACK, ["folio_id", "date", "amount", "units"]
        )


def _upgrade_postgres(bind) -> None:
    old_name = _postgres_unique_constraint_name(bind)
    if old_name:
        op.execute(f'ALTER TABLE transactions DROP CONSTRAINT "{old_name}"')
    op.execute(
        f"ALTER TABLE transactions ADD CONSTRAINT {NEW_CONSTRAINT_NAME} "
        "UNIQUE (folio_id, date, amount, units, type)"
    )


def _downgrade_postgres() -> None:
    op.execute(f"ALTER TABLE transactions DROP CONSTRAINT {NEW_CONSTRAINT_NAME}")
    op.execute(
        f"ALTER TABLE transactions ADD CONSTRAINT {OLD_CONSTRAINT_NAME_FALLBACK} "
        "UNIQUE (folio_id, date, amount, units)"
    )
