"""analytics_sections + analytics_recompute_status

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-02

Backs Docs/superpowers/specs/2026-09-02-analytics-precompute-architecture-design.md.
Replaces on-request live compute for the 7 Analytics sections with
precomputed rows, one per (user, scope, section); analytics_recompute_status
is a one-row-per-user "is a recompute currently running" flag consulted
before dispatching a new one.

Renumbered 0010 -> 0012 during the 2026-09-03 merge of feat/enhanced-ui: a
parallel session's enum-drift migration had already landed as 0010 (with 0011
chained on top of it) while this branch's own 0010 was still uncommitted to
main -- slotted in after both rather than renumbering already-integrated work.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analytics_sections",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("scope_key", sa.String(), primary_key=True),
        sa.Column("section", sa.String(), primary_key=True),
        sa.Column("household_member_id", sa.Uuid(), sa.ForeignKey("household_members.id"), nullable=True),
        sa.Column("payload", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "analytics_recompute_status",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("analytics_recompute_status")
    op.drop_table("analytics_sections")
