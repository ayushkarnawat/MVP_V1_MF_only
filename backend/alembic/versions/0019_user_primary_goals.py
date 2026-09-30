"""users.primary_goals (expand phase): multi-select onboarding goal

Revision ID: 0019
Revises: 0018
Create Date: 2026-09-30

Staging-QA fix 2. JSONB on Postgres with a containment CHECK (the enum type
used to reject unknown values; this keeps that guarantee), plain JSON on
SQLite (validated by the API). users.primary_goal is deliberately kept: a
rolling ECS deploy runs old tasks that still read it. Revision 0021 drops it
in a later release. The downgrade loses nothing because the old column is
still there.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

_ALLOWED = '["consolidated_view","understand_holdings","family_management","performance_comparison"]'


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    op.add_column(
        "users",
        sa.Column("primary_goals", postgresql.JSONB() if is_pg else sa.JSON(), nullable=True),
    )
    if is_pg:
        op.execute("UPDATE users SET primary_goals = jsonb_build_array(primary_goal::text) WHERE primary_goal IS NOT NULL")
        op.create_check_constraint(
            "ck_users_primary_goals_allowed",
            "users",
            # CASE, not AND: Postgres doesn't promise AND evaluation order, and
            # jsonb_array_length raises on a scalar instead of failing the CHECK.
            "primary_goals IS NULL OR CASE WHEN jsonb_typeof(primary_goals) = 'array'"
            f" THEN jsonb_array_length(primary_goals) BETWEEN 1 AND 4 AND primary_goals <@ '{_ALLOWED}'::jsonb"
            " ELSE false END",
        )
    else:
        op.execute("UPDATE users SET primary_goals = json_array(primary_goal) WHERE primary_goal IS NOT NULL")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint("ck_users_primary_goals_allowed", "users", type_="check")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("primary_goals")
