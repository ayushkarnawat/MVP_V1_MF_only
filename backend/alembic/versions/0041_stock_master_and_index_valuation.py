"""Stock fundamentals and index valuation series (attribute 15)."""
from alembic import op
import sqlalchemy as sa

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        # Values are used only after the migration transaction commits.
        op.execute("ALTER TYPE benchmarkreturntype ADD VALUE IF NOT EXISTS 'pe'")
        op.execute("ALTER TYPE benchmarkreturntype ADD VALUE IF NOT EXISTS 'pb'")
    else:
        # 0033 persists an unconstrained VARCHAR on SQLite. Add the explicit
        # enum check while preserving the existing three-column primary key.
        with op.batch_alter_table("benchmark_index_history", recreate="always") as batch:
            batch.create_check_constraint("benchmarkreturntype", "return_type IN ('price','tri','pe','pb')")
    op.create_table(
        "stock_master",
        sa.Column("isin", sa.String(12), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("sector", sa.String()),
        sa.Column("pe_ratio", sa.Numeric(18, 6)),
        sa.Column("pb_ratio", sa.Numeric(18, 6)),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("pb_source", sa.String()),
        sa.Column("footnote", sa.Text()),
    )


def downgrade():
    op.drop_table("stock_master")
    op.execute("DELETE FROM benchmark_index_history WHERE return_type IN ('pe','pb')")
    if op.get_bind().dialect.name == "postgresql":
        # PostgreSQL cannot DROP VALUE; rebuild the type after removing its rows.
        op.execute("ALTER TABLE benchmark_index_history ALTER COLUMN return_type DROP DEFAULT")
        op.execute("ALTER TABLE benchmark_index_history ALTER COLUMN return_type TYPE varchar USING return_type::text")
        op.execute("DROP TYPE benchmarkreturntype")
        op.execute("CREATE TYPE benchmarkreturntype AS ENUM ('price','tri')")
        op.execute("ALTER TABLE benchmark_index_history ALTER COLUMN return_type TYPE benchmarkreturntype USING return_type::benchmarkreturntype")
        op.execute("ALTER TABLE benchmark_index_history ALTER COLUMN return_type SET DEFAULT 'price'")
    else:
        with op.batch_alter_table("benchmark_index_history", recreate="always") as batch:
            batch.drop_constraint("benchmarkreturntype", type_="check")
