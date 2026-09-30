"""cas member detection: member lock/detection columns, audit tables,
never-relock trigger

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-29

Backfill (added 2026-09-30 for staging, which is not wiped despite M20):
pre-existing household_members rows are marked complete (details_completed_at
= created_at, origin onboarding/manual) before the CHECK constraints are added,
since the constraints would otherwise reject them (details_completed_at NULL
with lock_reason NULL).

Postgres enum types (F2): op.add_column doesn't emit CREATE TYPE, so the four
household_members enum types are created explicitly first. Names follow the
codebase convention (lowercased class name, as enum_column produces and 0001
set the precedent for), not the snake_case names in the spec's schema table.
namechangereason is created by op.create_table itself.

SQLite: relationship nullability, the four CHECK constraints and the
detected_from_import_id FK (F3 -- plain add_column silently skips the FK on
SQLite) go through one batch_alter_table, which rebuilds the table. The
rebuild drops triggers, so the trigger is created after the batch block (F13).

The trigger SQL is a frozen copy of app/db/member_trigger_sql.py as of this
revision -- deliberately not imported, so later edits there can't rewrite
history.
"""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

_RELATIONSHIP = sa.Enum("self", "spouse", "parent", "child", "sibling", "other", name="relationship")
_MEMBER_ORIGIN = sa.Enum("onboarding", "manual", "cas_detected", name="memberorigin")
_MEMBER_NAME_SOURCE = sa.Enum("user_entered", "cas", name="membernamesource")
_MEMBER_PAN_SOURCE = sa.Enum("cas", "user_entered", name="memberpansource")
_MEMBER_LOCK_REASON = sa.Enum("details_needed", "pan_on_other_account", name="memberlockreason")
_NAME_CHANGE_REASON = sa.Enum("cas_variant", "user_corrected_to_cas", "user_edit", name="namechangereason")

_MEMBER_ENUMS = (_MEMBER_ORIGIN, _MEMBER_NAME_SOURCE, _MEMBER_PAN_SOURCE, _MEMBER_LOCK_REASON)

_FK_DETECTED_FROM_IMPORT = "fk_household_members_detected_from_import_id"

_CHECKS = (
    ("ck_member_relationship_when_complete",
     "relationship IS NOT NULL OR details_completed_at IS NULL"),
    ("ck_member_other_label",
     "relationship IS NULL OR relationship <> 'other' OR relationship_other_label IS NOT NULL"),
    ("ck_member_lock_reason",
     "(lock_reason IS NULL AND details_completed_at IS NOT NULL)"
     " OR (lock_reason IS NOT NULL AND details_completed_at IS NULL)"),
    ("ck_member_detected_pan_pair",
     "(detected_pan_encrypted IS NULL) = (detected_pan_hash IS NULL)"),
)

_SQLITE_NEVER_RELOCK = """
CREATE TRIGGER IF NOT EXISTS trg_member_never_relock
BEFORE UPDATE ON household_members
FOR EACH ROW
WHEN OLD.details_completed_at IS NOT NULL
 AND (NEW.details_completed_at IS NULL OR NEW.lock_reason IS NOT NULL)
BEGIN
    SELECT RAISE(ABORT, 'member_already_unlocked');
END
"""

_POSTGRES_NEVER_RELOCK_FN = """
CREATE OR REPLACE FUNCTION member_never_relock() RETURNS trigger AS $$
BEGIN
    IF OLD.details_completed_at IS NOT NULL
       AND (NEW.details_completed_at IS NULL OR NEW.lock_reason IS NOT NULL) THEN
        RAISE EXCEPTION 'member_already_unlocked';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
"""

_POSTGRES_NEVER_RELOCK_TRIGGER = """
DROP TRIGGER IF EXISTS trg_member_never_relock ON household_members;
CREATE TRIGGER trg_member_never_relock
BEFORE UPDATE ON household_members
FOR EACH ROW EXECUTE FUNCTION member_never_relock()
"""


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if _is_postgres():
        bind = op.get_bind()
        for enum_type in _MEMBER_ENUMS:
            enum_type.create(bind, checkfirst=True)

    op.add_column("imports", sa.Column("upload_group_id", sa.Uuid(), nullable=True))
    op.create_index("ix_imports_upload_group_id", "imports", ["upload_group_id"])

    op.add_column(
        "household_members",
        sa.Column("origin", _MEMBER_ORIGIN, nullable=False, server_default="manual"),
    )
    op.add_column(
        "household_members",
        sa.Column("name_source", _MEMBER_NAME_SOURCE, nullable=False, server_default="user_entered"),
    )
    op.add_column("household_members", sa.Column("name_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("household_members", sa.Column("details_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("household_members", sa.Column("lock_reason", _MEMBER_LOCK_REASON, nullable=True))
    op.add_column("household_members", sa.Column("pan_source", _MEMBER_PAN_SOURCE, nullable=True))
    op.add_column("household_members", sa.Column("pan_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("household_members", sa.Column("detected_pan_encrypted", sa.String(), nullable=True))
    op.add_column("household_members", sa.Column("detected_pan_hash", sa.String(), nullable=True))

    # Backfill before the CHECKs: every member that exists before 0018 was
    # created through onboarding or "add member", so it is complete (unlocked).
    # A permanent PAN on such a row can only have come from a CAS parse, so it
    # is recorded as a verified CAS PAN; a still-pending claim is left alone.
    # origin is already 'manual' on every existing row via its server_default.
    # Plain literals only: on Postgres a CASE of string literals resolves to
    # text, which can't be assigned to the enum column without a cast.
    op.execute("UPDATE household_members SET details_completed_at = created_at")
    op.execute("UPDATE household_members SET origin = 'onboarding' WHERE relationship = 'self'")
    op.execute(
        "UPDATE household_members SET pan_source = 'cas', pan_verified_at = created_at"
        " WHERE pan_lookup_hash IS NOT NULL AND pan_pending_until IS NULL"
    )

    with op.batch_alter_table("household_members") as batch_op:
        batch_op.alter_column("relationship", existing_type=_RELATIONSHIP, nullable=True)
        batch_op.add_column(sa.Column("detected_from_import_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            _FK_DETECTED_FROM_IMPORT, "imports",
            ["detected_from_import_id"], ["id"], ondelete="SET NULL",
        )
        for name, condition in _CHECKS:
            batch_op.create_check_constraint(name, condition)

    op.create_index(
        "ix_member_user_detected_pan_hash", "household_members", ["user_id", "detected_pan_hash"],
    )

    op.create_table(
        "household_member_name_changes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "household_member_id", sa.Uuid(),
            sa.ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("old_name", sa.String(), nullable=False),
        sa.Column("new_name", sa.String(), nullable=False),
        sa.Column("reason", _NAME_CHANGE_REASON, nullable=False),
        sa.Column("import_id", sa.Uuid(), sa.ForeignKey("imports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "household_member_merges",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kept_member_id", sa.Uuid(), nullable=False),
        sa.Column("removed_member_id", sa.Uuid(), nullable=False),
        sa.Column("removed_member_name", sa.String(), nullable=False),
        sa.Column("folios_moved", sa.Integer(), nullable=False),
        sa.Column("transactions_dropped", sa.Integer(), nullable=False),
        sa.Column("merged_at", sa.DateTime(timezone=True), nullable=False),
    )

    # After the batch block: on SQLite the batch rebuild would drop it.
    if _is_postgres():
        op.execute(_POSTGRES_NEVER_RELOCK_FN)
        op.execute(_POSTGRES_NEVER_RELOCK_TRIGGER)
    else:
        op.execute(_SQLITE_NEVER_RELOCK)


def downgrade() -> None:
    # Trigger first: it reads details_completed_at/lock_reason, and SQLite
    # refuses to drop columns a trigger references.
    if _is_postgres():
        op.execute("DROP TRIGGER IF EXISTS trg_member_never_relock ON household_members")
        op.execute("DROP FUNCTION IF EXISTS member_never_relock()")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_member_never_relock")

    op.drop_table("household_member_merges")
    op.drop_table("household_member_name_changes")

    op.drop_index("ix_member_user_detected_pan_hash", table_name="household_members")

    # Assumes no row has relationship NULL (i.e. no locked detected people),
    # same no-data assumption as upgrade (M20).
    with op.batch_alter_table("household_members") as batch_op:
        for name, _ in reversed(_CHECKS):
            batch_op.drop_constraint(name, type_="check")
        batch_op.drop_constraint(_FK_DETECTED_FROM_IMPORT, type_="foreignkey")
        batch_op.drop_column("detected_from_import_id")
        batch_op.drop_column("detected_pan_hash")
        batch_op.drop_column("detected_pan_encrypted")
        batch_op.drop_column("pan_verified_at")
        batch_op.drop_column("pan_source")
        batch_op.drop_column("lock_reason")
        batch_op.drop_column("details_completed_at")
        batch_op.drop_column("name_updated_at")
        batch_op.drop_column("name_source")
        batch_op.drop_column("origin")
        batch_op.alter_column("relationship", existing_type=_RELATIONSHIP, nullable=False)

    op.drop_index("ix_imports_upload_group_id", table_name="imports")
    op.drop_column("imports", "upload_group_id")

    if _is_postgres():
        bind = op.get_bind()
        _NAME_CHANGE_REASON.drop(bind, checkfirst=True)
        for enum_type in _MEMBER_ENUMS:
            enum_type.drop(bind, checkfirst=True)
