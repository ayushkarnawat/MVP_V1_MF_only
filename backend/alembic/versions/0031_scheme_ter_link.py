"""schemes.ter_scheme_code: link to the SEBI scheme code in AMFI's TER feed (8 Oct)

Revision ID: 0031
Revises: 0030

AMFI's TER feed has no AMFI code or ISIN, only a scheme name and SEBI's scheme
code (NSDLSchemeCode, one per fund, shared by its Direct and Regular plans).
Fuzzy name matching linked ~1,040 schemes to the wrong fund (8 Oct). A scheme
is now linked once, by an exact name, and every later month joins by code.
ter_link_source is "exact_name" or "manual"; manual links are never replaced
by the job. Nullable, no backfill: the ter-daily job fills it.
"""
from alembic import op
import sqlalchemy as sa

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("schemes") as batch:
        batch.add_column(sa.Column("ter_scheme_code", sa.String(), nullable=True))
        batch.add_column(sa.Column("ter_link_source", sa.String(), nullable=True))
        batch.add_column(sa.Column("ter_linked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_schemes_ter_scheme_code", "schemes", ["ter_scheme_code"])


def downgrade() -> None:
    op.drop_index("ix_schemes_ter_scheme_code", table_name="schemes")
    with op.batch_alter_table("schemes") as batch:
        batch.drop_column("ter_linked_at")
        batch.drop_column("ter_link_source")
        batch.drop_column("ter_scheme_code")
