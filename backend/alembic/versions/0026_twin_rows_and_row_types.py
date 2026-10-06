"""twin same-day rows (balance_units, occurrence) and new row types (#2, #3)

Revision ID: 0026
Revises: 0025

transactions is RANGE-partitioned on Postgres: the new unique key keeps the
partition key `date`, and `type` is VARCHAR + CHECK there (see 0010), so the
CHECK is rebuilt with the four new values. No data backfill: existing rows get
occurrence 1 and a NULL balance, which confirm's matcher heals on overlap.
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None

OLD = "uq_transactions_folio_date_amount_units_type"
NEW = "uq_transactions_folio_date_amount_units_type_occ"
_TYPES = ("purchase", "purchase_sip", "redemption", "switch_in", "switch_out", "dividend_payout",
          "dividend_reinvest", "segregation", "stt", "stamp_duty", "misc", "opening_balance",
          "reversal", "gift_in", "gift_out", "bonus")
_OLD_TYPES = _TYPES[:12]


def _check(values):
    return f"CHECK (type IN ({', '.join(repr(v) for v in values)}))"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE transactions ADD COLUMN balance_units NUMERIC(18,3)")
        op.execute("ALTER TABLE transactions ADD COLUMN occurrence SMALLINT NOT NULL DEFAULT 1")
        op.execute(f"ALTER TABLE transactions DROP CONSTRAINT {OLD}")
        op.execute(f"ALTER TABLE transactions ADD CONSTRAINT {NEW} UNIQUE (folio_id, date, amount, units, type, occurrence)")
        op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check")
        op.execute(f"ALTER TABLE transactions ADD CONSTRAINT transactions_type_check {_check(_TYPES)}")
        op.execute("""
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactiontype') THEN
                ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'reversal';
                ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'gift_in';
                ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'gift_out';
                ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'bonus';
              END IF;
            END $$;""")
    else:
        with op.batch_alter_table("transactions", recreate="always") as batch:
            batch.add_column(sa.Column("balance_units", sa.Numeric(18, 3), nullable=True))
            batch.add_column(sa.Column("occurrence", sa.SmallInteger(), nullable=False, server_default="1"))
            batch.drop_constraint(OLD, type_="unique")
            batch.create_unique_constraint(NEW, ["folio_id", "date", "amount", "units", "type", "occurrence"])


def downgrade() -> None:
    bind = op.get_bind()
    # Twins (occurrence > 1) and new-type rows can't satisfy the old schema;
    # drop them before restoring it. Downgrade is a rescue path, not routine.
    op.execute("DELETE FROM transactions WHERE occurrence > 1 OR type IN ('reversal','gift_in','gift_out','bonus')")
    if bind.dialect.name == "postgresql":
        op.execute(f"ALTER TABLE transactions DROP CONSTRAINT {NEW}")
        op.execute(f"ALTER TABLE transactions ADD CONSTRAINT {OLD} UNIQUE (folio_id, date, amount, units, type)")
        op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check")
        op.execute(f"ALTER TABLE transactions ADD CONSTRAINT transactions_type_check {_check(_OLD_TYPES)}")
        op.execute("ALTER TABLE transactions DROP COLUMN occurrence")
        op.execute("ALTER TABLE transactions DROP COLUMN balance_units")
    else:
        with op.batch_alter_table("transactions", recreate="always") as batch:
            batch.drop_constraint(NEW, type_="unique")
            batch.create_unique_constraint(OLD, ["folio_id", "date", "amount", "units", "type"])
            batch.drop_column("occurrence")
            batch.drop_column("balance_units")
