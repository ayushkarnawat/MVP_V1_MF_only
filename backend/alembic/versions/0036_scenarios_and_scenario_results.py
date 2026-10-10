"""scenarios_and_scenario_results: drawdown/stress-test scenario library (attribute 11)

Revision ID: 0036
Revises: 0035

Four tables backing Option B's precompute-once/serve-cheap design: scenarios
(the library itself, including multi-phase rows via parent_scenario_id and
the Franklin Templeton redemption-freeze flag), scenario_scheme_results
(Step 2's per-scheme output, one row per scheme per non-hypothetical
scenario -- real or proxied, never missing), scenario_category_averages
(an intermediate table the proxy pass reads from, real-data-only),
scenario_hypothetical_assumptions (admin-entered per-asset-class assumed
moves for category-D scenarios, no NAV data at all).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scenarios",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("scenario_type", sa.String(), nullable=False, server_default="CRASH"),
        sa.Column("is_ongoing", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("display_rank", sa.Integer(), nullable=True),
        sa.Column("parent_scenario_id", sa.Uuid(), nullable=True),
        sa.Column("phase_label", sa.String(), nullable=True),
        sa.Column("phase_order", sa.Integer(), nullable=True),
        sa.Column("had_redemption_freeze_schemes", sa.JSON().with_variant(postgresql.ARRAY(sa.Text()), "postgresql"), nullable=True),
        sa.Column("quick_market_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("quick_equity_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("quick_debt_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("quick_weight_quarter", sa.Date(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["parent_scenario_id"], ["scenarios.id"]),
        sa.CheckConstraint(
            "scenario_type IN ('CRASH', 'BULL_RUN', 'POLICY_RATE', 'HYPOTHETICAL')",
            name="ck_scenarios_type",
        ),
    )
    op.create_table(
        "scenario_scheme_results",
        sa.Column("scenario_id", sa.Uuid(), nullable=False),
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("pct_change", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_proxied", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("proxy_basis", sa.String(), nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("scenario_id", "scheme_id"),
        sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"]),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
    )
    op.create_index(
        "ix_scenario_scheme_results_scheme_id", "scenario_scheme_results", ["scheme_id"]
    )
    op.create_table(
        "scenario_category_averages",
        sa.Column("scenario_id", sa.Uuid(), nullable=False),
        sa.Column("sebi_category", sa.String(), nullable=False),
        sa.Column("avg_pct_change", sa.Numeric(10, 2), nullable=False),
        sa.Column("scheme_count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("scenario_id", "sebi_category"),
        sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"]),
    )
    op.create_table(
        "scenario_hypothetical_assumptions",
        sa.Column("scenario_id", sa.Uuid(), nullable=False),
        sa.Column("asset_class", sa.String(), nullable=False),
        sa.Column("assumed_pct_change", sa.Numeric(6, 2), nullable=False),
        sa.Column("assumption_note", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("scenario_id", "asset_class"),
        sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"]),
        sa.CheckConstraint(
            "asset_class IN ('Equity', 'Index/ETF', 'Gold', 'Silver', 'Overseas', "
            "'Debt-short', 'Debt-long', 'Hybrid', 'Other')",
            name="ck_scenario_hypothetical_assumptions_asset_class",
        ),
    )


def downgrade() -> None:
    op.drop_table("scenario_hypothetical_assumptions")
    op.drop_table("scenario_category_averages")
    op.drop_table("scenario_scheme_results")
    op.drop_table("scenarios")
