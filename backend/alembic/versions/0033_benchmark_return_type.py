"""benchmark_return_type: add PRICE/TRI dimension to benchmark_index_history (attribute 12)

Revision ID: 0033
Revises: 0032

Additive migration -- existing rows backfill to 'price' via the column
default, so no existing reader (benchmark.py's two call sites) sees any
behavior change. The natural key widens from (index_name, date) to
(index_name, date, return_type) so a TRI row for a date that already has
a PRICE row is a distinct row, not a collision.
"""
from alembic import op
import sqlalchemy as sa

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None

_RETURN_TYPE = sa.Enum("price", "tri", name="benchmarkreturntype")


def upgrade() -> None:
    bind = op.get_bind()
    _RETURN_TYPE.create(bind, checkfirst=True)
    if bind.dialect.name == "sqlite":
        # SQLite can't change a primary key in place: rebuild the table, as
        # 0027 does (tests/test_migrations.py round-trips every migration on
        # SQLite). Verified 9 Oct.
        with op.batch_alter_table("benchmark_index_history", recreate="always") as batch:
            batch.add_column(sa.Column("return_type", _RETURN_TYPE, nullable=False, server_default="price"))
            batch.create_primary_key("benchmark_index_history_pkey", ["index_name", "date", "return_type"])
        return
    op.add_column(
        "benchmark_index_history",
        sa.Column("return_type", _RETURN_TYPE, nullable=False, server_default="price"),
    )
    op.drop_constraint("benchmark_index_history_pkey", "benchmark_index_history", type_="primary")
    op.create_primary_key(
        "benchmark_index_history_pkey", "benchmark_index_history", ["index_name", "date", "return_type"]
    )


def downgrade() -> None:
    bind = op.get_bind()
    # Without return_type a TRI row would collide with the PRICE row for the
    # same (index, date), so TRI rows can't survive a downgrade.
    op.execute("DELETE FROM benchmark_index_history WHERE return_type = 'tri'")
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("benchmark_index_history", recreate="always") as batch:
            batch.drop_column("return_type")
            batch.create_primary_key("benchmark_index_history_pkey", ["index_name", "date"])
    else:
        op.drop_constraint("benchmark_index_history_pkey", "benchmark_index_history", type_="primary")
        op.create_primary_key("benchmark_index_history_pkey", "benchmark_index_history", ["index_name", "date"])
        op.drop_column("benchmark_index_history", "return_type")
    _RETURN_TYPE.drop(bind, checkfirst=True)
