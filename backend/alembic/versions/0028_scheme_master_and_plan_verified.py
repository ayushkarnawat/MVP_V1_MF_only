"""AMFI scheme master and verified folio plans."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def _types():
    if op.get_bind().dialect.name == "postgresql":
        return (postgresql.ENUM("amfi", "casparser", "cas_only", name="schemesource", create_type=False),
                postgresql.ENUM("direct", "regular", name="schemeplantype", create_type=False))
    return sa.String(16), sa.String(16)


def upgrade():
    source, plan = _types()
    if op.get_bind().dialect.name == "postgresql":
        source.create(op.get_bind(), checkfirst=True)
        plan.create(op.get_bind(), checkfirst=True)
    op.add_column("schemes", sa.Column("isin_reinvest", sa.String(), nullable=True))
    op.add_column("schemes", sa.Column("base_name", sa.String(), nullable=True))
    op.add_column("schemes", sa.Column("plan_type", plan, nullable=True))
    op.add_column("schemes", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("schemes", sa.Column("source", source, nullable=False, server_default="amfi"))
    op.add_column("folios", sa.Column("plan_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column("schemes", "amfi_code", nullable=True)
    else:
        with op.batch_alter_table("schemes", recreate="always") as batch:
            batch.alter_column("amfi_code", existing_type=sa.String(), nullable=True)
    op.create_index("ix_schemes_isin", "schemes", ["isin"])
    op.create_index("ix_schemes_isin_reinvest", "schemes", ["isin_reinvest"])
    op.create_index("ix_schemes_amc_base", "schemes", ["amc_name", "base_name"])


def downgrade():
    nulls = op.get_bind().execute(sa.text("SELECT count(*) FROM schemes WHERE amfi_code IS NULL")).scalar()
    if nulls:
        raise RuntimeError(f"{nulls} closed-fund schemes have no AMFI code; downgrade would orphan their folios")
    source, plan = _types()
    for index in ("ix_schemes_amc_base", "ix_schemes_isin_reinvest", "ix_schemes_isin"):
        op.drop_index(index, table_name="schemes")
    with op.batch_alter_table("folios") as batch:
        batch.drop_column("plan_verified")
    with op.batch_alter_table("schemes", recreate="auto") as batch:
        batch.alter_column("amfi_code", existing_type=sa.String(), nullable=False)
        for column in ("source", "is_active", "plan_type", "base_name", "isin_reinvest"):
            batch.drop_column(column)
    if op.get_bind().dialect.name == "postgresql":
        plan.drop(op.get_bind(), checkfirst=True)
        source.drop(op.get_bind(), checkfirst=True)
