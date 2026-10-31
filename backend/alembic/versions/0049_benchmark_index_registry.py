"""Benchmark registry and extensible history keys.

Revision ID: 0049
Revises: 0048
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None

_LEGACY = ("nifty_50", "nifty_500", "nifty_largemidcap_250", "nifty_midcap_150",
           "nifty_next_50", "nifty_smallcap_250", "nifty_100", "nifty_200")
_INITIAL = [{'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_50',
  'nse_name': 'Nifty 50'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_500',
  'nse_name': 'Nifty 500'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_largemidcap_250',
  'nse_name': 'NIFTY LARGEMID250'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_midcap_150',
  'nse_name': 'Nifty Midcap 150'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_next_50',
  'nse_name': 'Nifty Next 50'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_smallcap_250',
  'nse_name': 'Nifty Smallcap 250'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_100',
  'nse_name': 'Nifty 100'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_200',
  'nse_name': 'Nifty 200'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_bank',
  'nse_name': 'Nifty Bank'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_it',
  'nse_name': 'Nifty IT'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_financial_services',
  'nse_name': 'Nifty Financial Services'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_india_consumption',
  'nse_name': 'Nifty India Consumption'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_india_manufacturing',
  'nse_name': 'Nifty India Manufacturing'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_energy',
  'nse_name': 'Nifty Energy'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_total_market',
  'nse_name': 'Nifty Total Market'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_private_bank',
  'nse_name': 'Nifty Private Bank'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_infrastructure',
  'nse_name': 'Nifty Infrastructure'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_midcap_100',
  'nse_name': 'Nifty Midcap 100'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_smallcap_100',
  'nse_name': 'Nifty Smallcap 100'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_smallcap_50',
  'nse_name': 'Nifty Smallcap 50'},
 {'family': 'equity',
  'source': 'tri_endpoint',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty500_multicap_50_25_25',
  'nse_name': 'Nifty500 Multicap 50:25:25'},
 {'family': 'arbitrage',
  'source': 'price_endpoint_verified',
  'return_type': 'tri',
  'active': True,
  'key': 'nifty_50_arbitrage',
  'nse_name': 'Nifty 50 Arbitrage'},
 {'family': 'money_market',
  'source': 'price_endpoint_verified',
  'return_type': 'tri',
  'active': False,
  'key': 'nifty_1d_rate',
  'nse_name': 'Nifty 1D Rate Index'}]


def _change_history(to_text: bool) -> None:
    conn = op.get_bind()
    postgres = conn.dialect.name == "postgresql"
    old = postgresql.ENUM(*_LEGACY, name="benchmarkindex", create_type=False) if postgres else sa.String(21)
    target = sa.Text() if to_text else old
    # Rebuild the composite primary key along with its changed key column.
    if postgres:
        pk = sa.inspect(conn).get_pk_constraint("benchmark_index_history")["name"]
        op.drop_constraint(pk, "benchmark_index_history", type_="primary")
        op.alter_column("benchmark_index_history", "index_name", type_=target,
                        postgresql_using="index_name::text" if to_text else "index_name::benchmarkindex")
        op.alter_column("benchmark_index_history", "value", type_=sa.Numeric(18, 6) if to_text else sa.Numeric(12, 2))
        op.create_primary_key(pk, "benchmark_index_history", ["index_name", "date", "return_type"])
    else:
        with op.batch_alter_table("benchmark_index_history", recreate="always") as batch:
            batch.alter_column("index_name", existing_type=old if to_text else sa.Text(), type_=target, existing_nullable=False)
            batch.alter_column("value", existing_type=sa.Numeric(12, 2) if to_text else sa.Numeric(18, 6),
                               type_=sa.Numeric(18, 6) if to_text else sa.Numeric(12, 2), existing_nullable=False)


def upgrade() -> None:
    table = op.create_table(
        "benchmark_index_master",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("nse_name", sa.Text(), nullable=False),
        sa.Column("family", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("return_type", sa.Text(), nullable=False, server_default="tri"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("source IN ('tri_endpoint', 'price_endpoint_verified')", name="ck_benchmark_index_source"),
        sa.CheckConstraint("return_type = 'tri'", name="ck_benchmark_index_return_type"),
    )
    op.bulk_insert(table, _INITIAL)
    # 6 decimal places avoid rounding small daily moves to zero. 12 integer
    # places also leave more headroom than the former ten; no float conversion.
    _change_history(True)


def downgrade() -> None:
    conn = op.get_bind()
    keys = set(conn.execute(sa.text("SELECT DISTINCT index_name FROM benchmark_index_history")).scalars())
    if keys - set(_LEGACY):
        raise ValueError("Cannot downgrade with new index keys in history; archive those rows first")
    _change_history(False)
    op.drop_table("benchmark_index_master")
