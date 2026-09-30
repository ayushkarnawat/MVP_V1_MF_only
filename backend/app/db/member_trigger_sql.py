"""DDL for ``trg_member_never_relock`` (I15: an unlocked household member is
never locked again).

Used by the ``after_create`` hook on ``HouseholdMember.__table__`` so that
``Base.metadata.create_all`` (the test fixtures, functional_postgres) gets the
trigger too. Migration 0018 keeps its own frozen copy of these strings on
purpose -- edits here must not rewrite migration history.

Postgres strings are re-runnable (F13): ``drop_all`` drops the table (and so
the trigger) but never the function, so a second ``create_all`` against the
same database would fail on a plain ``CREATE FUNCTION``.

No ``%`` characters anywhere: SQLAlchemy's ``DDL`` applies %-formatting.
"""

SQLITE_NEVER_RELOCK = """
CREATE TRIGGER IF NOT EXISTS trg_member_never_relock
BEFORE UPDATE ON household_members
FOR EACH ROW
WHEN OLD.details_completed_at IS NOT NULL
 AND (NEW.details_completed_at IS NULL OR NEW.lock_reason IS NOT NULL)
BEGIN
    SELECT RAISE(ABORT, 'member_already_unlocked');
END
"""

POSTGRES_NEVER_RELOCK_FN = """
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

POSTGRES_NEVER_RELOCK_TRIGGER = """
DROP TRIGGER IF EXISTS trg_member_never_relock ON household_members;
CREATE TRIGGER trg_member_never_relock
BEFORE UPDATE ON household_members
FOR EACH ROW EXECUTE FUNCTION member_never_relock()
"""
