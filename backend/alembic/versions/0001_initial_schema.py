"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-04

A migration is an immutable snapshot of schema history: everything below is
frozen, hand-held DDL. Deliberately no imports from `app.models` — if this file
read the live models, its DDL would silently drift every time a model changed
and replaying history from empty would no longer reproduce the schema each
later revision was written against.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# Frozen copy of TransactionType's values as of this revision.
_TRANSACTION_TYPES = (
    "purchase", "purchase_sip", "redemption", "switch_in", "switch_out",
    "dividend_payout", "dividend_reinvest", "segregation", "stt",
    "stamp_duty", "misc",
)

# Native Postgres ENUM types created as a side effect of the sa.Enum columns
# below. op.drop_table() can't clean these up (it builds a column-less Table),
# so downgrade() drops them explicitly — otherwise a re-upgrade fails with
# "type already exists".
_PG_ENUM_TYPES = (
    "arnstatus", "benchmarkindex", "plannamevariant", "investortype",
    "primarygoal", "relationship", "plantype", "importstatus",
    "sourcecastype", "importerrortype",
)


def upgrade() -> None:
    op.create_table(
        "arn_directory",
        sa.Column("arn_code", sa.String(), nullable=False),
        sa.Column("distributor_name", sa.String(), nullable=True),
        sa.Column("status", sa.Enum("active", "suspended", "invalid", "unresolved", name="arnstatus"), nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("arn_code"),
    )
    op.create_table(
        "benchmark_index_history",
        sa.Column("index_name", sa.Enum("nifty_50", "nifty_500", "nifty_largemidcap_250", "nifty_midcap_150", name="benchmarkindex"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("value", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.PrimaryKeyConstraint("index_name", "date"),
    )
    op.create_table(
        "otp_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("phone_number", sa.String(), nullable=False),
        sa.Column("otp_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "schemes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("amfi_code", sa.String(), nullable=False),
        sa.Column("isin", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("amc_name", sa.String(), nullable=False),
        sa.Column("sebi_category", sa.String(), nullable=False),
        sa.Column("plan_name_variant", sa.Enum("direct", "regular", "unresolved", name="plannamevariant"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("amfi_code"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("phone_number", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("onboarding_step", sa.String(), nullable=True),
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("investor_type", sa.Enum("self_directed", "advisor_assisted", "mixed", "beginner", name="investortype"), nullable=True),
        sa.Column("primary_goal", sa.Enum("consolidated_view", "understand_holdings", "family_management", "performance_comparison", name="primarygoal"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("phone_number"),
    )
    op.create_table(
        "fund_scores",
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("risk_adjusted_tier", sa.Integer(), nullable=False),
        sa.Column("cost_adjustment", sa.Numeric(precision=3, scale=2), nullable=False),
        sa.Column("final_score", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
        sa.PrimaryKeyConstraint("scheme_id", "computed_at"),
    )
    op.create_table(
        "household_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("relationship", sa.Enum("self", "spouse", "parent", "child", "sibling", "other", name="relationship"), nullable=False),
        sa.Column("relationship_other_label", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "scheme_aaum",
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("reference_period", sa.Date(), nullable=False),
        sa.Column("aaum_value", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
        sa.PrimaryKeyConstraint("scheme_id", "reference_period"),
    )
    op.create_table(
        "scheme_ter",
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("reference_period", sa.Date(), nullable=False),
        sa.Column("ter_value", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
        sa.PrimaryKeyConstraint("scheme_id", "reference_period"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("session_token_hash", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_info", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "folios",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_member_id", sa.Uuid(), nullable=False),
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("folio_number", sa.String(), nullable=False),
        sa.Column("arn_code", sa.String(), nullable=True),
        sa.Column("plan_type", sa.Enum("direct", "regular", "unclassified", name="plantype"), nullable=False),
        sa.ForeignKeyConstraint(["household_member_id"], ["household_members.id"]),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("household_member_id", "scheme_id", "folio_number", name="uq_folio_member_scheme_number"),
    )
    op.create_table(
        "imports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_member_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.Enum("pending", "confirmed", "failed", name="importstatus"), nullable=False),
        sa.Column("source_cas_type", sa.Enum("cams", "kfintech", name="sourcecastype"), nullable=True),
        sa.Column("raw_parser_output", sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"), nullable=True),
        sa.Column("error_type", sa.Enum("wrong_password", "scanned_pdf", "wrong_cas_type", "generic", name="importerrortype"), nullable=True),
        sa.Column("new_transactions_count", sa.Integer(), nullable=True),
        sa.Column("duplicate_transactions_count", sa.Integer(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["household_member_id"], ["household_members.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "portfolio_snapshots",
        sa.Column("household_member_id", sa.Uuid(), nullable=False),
        sa.Column("snapshot_month", sa.Date(), nullable=False),
        sa.Column("total_value", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["household_member_id"], ["household_members.id"]),
        sa.PrimaryKeyConstraint("household_member_id", "snapshot_month"),
    )

    # transactions and nav_history are RANGE-partitioned by year on Postgres per
    # Database-Schema-Unifolio.md v1.1, so each dialect gets its own physical
    # layout via hand-written DDL below.
    if op.get_bind().dialect.name == "postgresql":
        _create_transactions_postgres()
        _create_nav_history_postgres()
    else:
        _create_transactions_plain()
        _create_nav_history_plain()


def downgrade() -> None:
    is_postgres = op.get_bind().dialect.name == "postgresql"
    if is_postgres:
        op.execute("DROP TABLE IF EXISTS transactions CASCADE")
        op.execute("DROP TABLE IF EXISTS nav_history CASCADE")
    else:
        op.drop_table("transactions")
        op.drop_table("nav_history")

    # children before parents
    op.drop_table("portfolio_snapshots")
    op.drop_table("imports")
    op.drop_table("folios")
    op.drop_table("sessions")
    op.drop_table("scheme_ter")
    op.drop_table("scheme_aaum")
    op.drop_table("household_members")
    op.drop_table("fund_scores")
    op.drop_table("users")
    op.drop_table("schemes")
    op.drop_table("otp_requests")
    op.drop_table("benchmark_index_history")
    op.drop_table("arn_directory")

    if is_postgres:
        for type_name in _PG_ENUM_TYPES:
            op.execute(f"DROP TYPE IF EXISTS {type_name}")


def _create_transactions_plain() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("folio_id", sa.Uuid(), sa.ForeignKey("folios.id"), nullable=False),
        sa.Column("import_id", sa.Uuid(), sa.ForeignKey("imports.id"), nullable=False),
        sa.Column("type", sa.Enum(*_TRANSACTION_TYPES, name="transactiontype"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("units", sa.Numeric(14, 3), nullable=False),
        sa.Column("nav", sa.Numeric(10, 4), nullable=False),
        sa.Column("raw_description", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id", "date"),
        sa.UniqueConstraint("folio_id", "date", "amount", "units"),
    )


def _create_transactions_postgres() -> None:
    # ponytail: enum-shaped column uses VARCHAR + CHECK here instead of a
    # native Postgres ENUM type, to avoid a separate CREATE TYPE lifecycle in
    # this one hand-written DDL path. Every non-partitioned table still gets
    # a real native enum via SQLAlchemy's Enum type above. Upgrade path: if
    # this column needs native-enum behavior later, create the type
    # explicitly with postgresql.ENUM(...).create(bind) before this call.
    #
    # Assumes Postgres 13+ (RDS default for new instances), where
    # gen_random_uuid() is built into core — no pgcrypto extension needed.
    values = ", ".join(f"'{v}'" for v in _TRANSACTION_TYPES)
    op.execute(f"""
        CREATE TABLE transactions (
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            folio_id UUID NOT NULL REFERENCES folios(id),
            import_id UUID NOT NULL REFERENCES imports(id),
            type VARCHAR NOT NULL CHECK (type IN ({values})),
            date DATE NOT NULL,
            amount NUMERIC(14,2) NOT NULL,
            units NUMERIC(14,3) NOT NULL,
            nav NUMERIC(10,4) NOT NULL,
            raw_description VARCHAR,
            PRIMARY KEY (id, date),
            UNIQUE (folio_id, date, amount, units)
        ) PARTITION BY RANGE (date);
    """)
    for year in range(2020, 2027):
        op.execute(f"""
            CREATE TABLE transactions_{year} PARTITION OF transactions
            FOR VALUES FROM ('{year}-01-01') TO ('{year + 1}-01-01');
        """)
    op.execute("CREATE TABLE transactions_default PARTITION OF transactions DEFAULT;")


def _create_nav_history_plain() -> None:
    op.create_table(
        "nav_history",
        sa.Column("scheme_id", sa.Uuid(), sa.ForeignKey("schemes.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("nav", sa.Numeric(10, 4), nullable=False),
        sa.PrimaryKeyConstraint("scheme_id", "date"),
    )


def _create_nav_history_postgres() -> None:
    op.execute("""
        CREATE TABLE nav_history (
            scheme_id UUID NOT NULL REFERENCES schemes(id),
            date DATE NOT NULL,
            nav NUMERIC(10,4) NOT NULL,
            PRIMARY KEY (scheme_id, date)
        ) PARTITION BY RANGE (date);
    """)
    for year in range(2015, 2027):
        op.execute(f"""
            CREATE TABLE nav_history_{year} PARTITION OF nav_history
            FOR VALUES FROM ('{year}-01-01') TO ('{year + 1}-01-01');
        """)
    op.execute("CREATE TABLE nav_history_default PARTITION OF nav_history DEFAULT;")
