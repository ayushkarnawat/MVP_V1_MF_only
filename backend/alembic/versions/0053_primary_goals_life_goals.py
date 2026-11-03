"""users.primary_goals: six life goals; drop the single primary_goal column

Revision ID: 0053
Revises: 0052
Create Date: 2026-11-03

The four product goals are replaced by six life goals and no old value maps
onto a new one (plan, Stage S5), so saved goals are cleared, not converted.
That also means users.primary_goal (the deprecated single-goal column kept
since 0019) has nothing to carry over: it is dropped, and so is its native
Postgres enum type. The column is dropped rather than altered because
Postgres cannot remove values from an enum.

The downgrade recreates the type, the column and the old CHECK. Goals are
cleared first because the new codes cannot be represented in the old shape.
"""
from alembic import op
import sqlalchemy as sa

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None

_NEW = '["wealth_creation","retirement","childrens_education","buy_home","financial_freedom","tax_planning"]'
_OLD = '["consolidated_view","understand_holdings","family_management","performance_comparison"]'
_OLD_VALUES = ("consolidated_view", "understand_holdings", "family_management", "performance_comparison")


def _check(allowed: str, max_items: int) -> str:
    # CASE, not AND: Postgres doesn't promise AND evaluation order, and
    # jsonb_array_length raises on a scalar instead of failing the CHECK.
    return (
        "primary_goals IS NULL OR CASE WHEN jsonb_typeof(primary_goals) = 'array'"
        f" THEN jsonb_array_length(primary_goals) BETWEEN 1 AND {max_items} AND primary_goals <@ '{allowed}'::jsonb"
        " ELSE false END"
    )


def upgrade() -> None:
    is_pg = op.get_bind().dialect.name == "postgresql"
    # 1. no old value maps to a new one
    op.execute("UPDATE users SET primary_goals = NULL")
    # 2. swap the CHECK: six codes, 1 to 6 items (SQLite validates in the API)
    if is_pg:
        op.drop_constraint("ck_users_primary_goals_allowed", "users", type_="check")
        op.create_check_constraint("ck_users_primary_goals_allowed", "users", _check(_NEW, 6))
    # 3. drop the single-goal column, then its enum type
    with op.batch_alter_table("users") as batch:
        batch.drop_column("primary_goal")
    if is_pg:
        op.execute("DROP TYPE IF EXISTS primarygoal")


def downgrade() -> None:
    is_pg = op.get_bind().dialect.name == "postgresql"
    op.execute("UPDATE users SET primary_goals = NULL")
    if is_pg:
        op.drop_constraint("ck_users_primary_goals_allowed", "users", type_="check")
    enum = sa.Enum(*_OLD_VALUES, name="primarygoal")
    if is_pg:
        enum.create(op.get_bind(), checkfirst=True)
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("primary_goal", enum, nullable=True))
    if is_pg:
        op.create_check_constraint("ck_users_primary_goals_allowed", "users", _check(_OLD, 4))
