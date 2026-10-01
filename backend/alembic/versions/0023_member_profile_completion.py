"""Member profile completion: drop the detected-member lock

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-01

Spec: Docs/orchestration/member-profile-completion-map.html. Detected members
are no longer locked: details_completed_at, lock_reason, their CHECKs and
trg_member_never_relock go. A detected PAN moves into the same unique,
encrypted columns as Self's (a column copy: detected_pan_* already hold
encrypt_pan / hash_pan output), except a PAN another account holds, which
stays in detected_pan_* with pan_conflict = 'other_account'.

Backfill (Review Focus 1): ix_member_user_detected_pan_hash is non-unique,
so two locked rows can share a hash; only the earliest per hash is promoted,
and only when no row already holds that hash in pan_lookup_hash. Later
duplicates keep detected_pan_* and can be merged.

Trigger SQL below is a frozen copy for downgrade only (don't import app code).
"""
from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

_PAN_CONFLICT = sa.Enum("other_account", name="memberpanconflict")
_LOCK_REASON = sa.Enum("details_needed", "pan_on_other_account", name="memberlockreason")

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
_PG_NEVER_RELOCK_FN = """
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
_PG_NEVER_RELOCK_TRIGGER = """
CREATE TRIGGER trg_member_never_relock
BEFORE UPDATE ON household_members
FOR EACH ROW EXECUTE FUNCTION member_never_relock()
"""


def _pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    bind = op.get_bind()
    if _pg():
        _PAN_CONFLICT.create(bind, checkfirst=True)
        # PG 12+: allowed in a transaction; the value isn't used in this one.
        op.execute("ALTER TYPE membernamesource ADD VALUE IF NOT EXISTS 'user_edited'")
        op.execute("DROP TRIGGER IF EXISTS trg_member_never_relock ON household_members")
        op.execute("DROP FUNCTION IF EXISTS member_never_relock()")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_member_never_relock")

    op.add_column("household_members", sa.Column("pan_conflict", _PAN_CONFLICT, nullable=True))
    cast = "::memberpanconflict" if _pg() else ""
    op.execute(
        f"UPDATE household_members SET pan_conflict = 'other_account'{cast} "
        "WHERE lock_reason = 'pan_on_other_account' AND detected_pan_hash IS NOT NULL"
    )
    # A still-locked details_needed row whose PAN another account already
    # holds can't be promoted either: mark it as a conflict too, so it keeps
    # detected_pan_* and shows the banner instead of looking PAN-less.
    op.execute(
        f"UPDATE household_members SET pan_conflict = 'other_account'{cast} "
        "WHERE detected_pan_hash IS NOT NULL AND pan_conflict IS NULL AND pan_lookup_hash IS NULL"
        " AND EXISTS (SELECT 1 FROM household_members h4"
        "             WHERE h4.pan_lookup_hash = household_members.detected_pan_hash"
        "               AND h4.user_id <> household_members.user_id)"
    )
    src_cast = "::memberpansource" if _pg() else ""
    op.execute(
        "UPDATE household_members SET "
        " pan_encrypted = detected_pan_encrypted,"
        " pan_lookup_hash = detected_pan_hash,"
        " pan_pending_until = NULL,"
        f" pan_source = COALESCE(pan_source, 'cas'{src_cast}),"
        f" pan_verified_at = CASE WHEN COALESCE(pan_source, 'cas'{src_cast}) = 'cas'{src_cast}"
        "   THEN CURRENT_TIMESTAMP ELSE NULL END,"
        " detected_pan_encrypted = NULL,"
        " detected_pan_hash = NULL "
        "WHERE detected_pan_hash IS NOT NULL"
        " AND pan_conflict IS NULL"
        " AND pan_lookup_hash IS NULL"
        " AND NOT EXISTS (SELECT 1 FROM household_members h2"
        "                 WHERE h2.pan_lookup_hash = household_members.detected_pan_hash)"
        " AND id = (SELECT h3.id FROM household_members h3"
        "           WHERE h3.detected_pan_hash = household_members.detected_pan_hash"
        "           ORDER BY h3.created_at, h3.id LIMIT 1)"
    )

    with op.batch_alter_table("household_members") as batch:
        batch.drop_constraint("ck_member_relationship_when_complete", type_="check")
        batch.drop_constraint("ck_member_lock_reason", type_="check")
        batch.drop_column("lock_reason")
        batch.drop_column("details_completed_at")
        batch.create_check_constraint(
            "ck_member_pan_conflict_has_pan", "pan_conflict IS NULL OR detected_pan_hash IS NOT NULL"
        )
    if _pg():
        _LOCK_REASON.drop(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    if _pg():
        _LOCK_REASON.create(bind, checkfirst=True)
    op.add_column("household_members", sa.Column("details_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("household_members", sa.Column("lock_reason", _LOCK_REASON, nullable=True))
    lr_cast = "::memberlockreason" if _pg() else ""
    # Best effort: everyone is unlocked except pan-conflict rows, which go
    # back to the locked pan_on_other_account state they came from.
    op.execute("UPDATE household_members SET details_completed_at = created_at WHERE pan_conflict IS NULL")
    op.execute(
        f"UPDATE household_members SET lock_reason = 'pan_on_other_account'{lr_cast} WHERE pan_conflict IS NOT NULL"
    )
    # A NULL relationship on an unlocked row would break the restored CHECK.
    op.execute(
        "UPDATE household_members SET details_completed_at = NULL, lock_reason = 'details_needed'"
        f"{lr_cast} WHERE relationship IS NULL AND pan_conflict IS NULL"
    )
    ns_cast = "::membernamesource" if _pg() else ""
    op.execute(f"UPDATE household_members SET name_source = 'user_entered'{ns_cast} WHERE name_source = 'user_edited'{ns_cast}")
    with op.batch_alter_table("household_members") as batch:
        batch.drop_constraint("ck_member_pan_conflict_has_pan", type_="check")
        batch.drop_column("pan_conflict")
        batch.create_check_constraint(
            "ck_member_relationship_when_complete", "relationship IS NOT NULL OR details_completed_at IS NULL"
        )
        batch.create_check_constraint(
            "ck_member_lock_reason",
            "(lock_reason IS NULL AND details_completed_at IS NOT NULL)"
            " OR (lock_reason IS NOT NULL AND details_completed_at IS NULL)",
        )
    if _pg():
        _PAN_CONFLICT.drop(bind, checkfirst=True)
        op.execute(_PG_NEVER_RELOCK_FN)
        op.execute(_PG_NEVER_RELOCK_TRIGGER)
    else:
        op.execute(_SQLITE_NEVER_RELOCK)
