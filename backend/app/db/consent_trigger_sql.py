"""DDL for the append-only triggers on ``consent_records`` (consent rows are
never updated or deleted, including by account hard-delete -- decision Q6).

Used by the ``after_create`` hooks on ``ConsentRecord.__table__`` so that
``Base.metadata.create_all`` (the test fixtures, functional_postgres) gets the
triggers too. Migration 0022 keeps its own frozen copy of these strings on
purpose -- edits here must not rewrite migration history.

Postgres strings are re-runnable (F13): ``drop_all`` drops the table (and so
the trigger) but never the function, so a second ``create_all`` against the
same database would fail on a plain ``CREATE FUNCTION``.

No ``%`` characters anywhere: SQLAlchemy's ``DDL`` applies %-formatting.
"""

SQLITE_APPEND_ONLY_UPDATE = """
CREATE TRIGGER IF NOT EXISTS trg_consent_no_update BEFORE UPDATE ON consent_records
BEGIN SELECT RAISE(ABORT, 'consent_records_append_only'); END
"""

SQLITE_APPEND_ONLY_DELETE = """
CREATE TRIGGER IF NOT EXISTS trg_consent_no_delete BEFORE DELETE ON consent_records
BEGIN SELECT RAISE(ABORT, 'consent_records_append_only'); END
"""

POSTGRES_APPEND_ONLY_FN = """
CREATE OR REPLACE FUNCTION consent_records_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'consent_records_append_only';
END;
$$ LANGUAGE plpgsql
"""

POSTGRES_APPEND_ONLY_TRIGGER = """
DROP TRIGGER IF EXISTS trg_consent_append_only ON consent_records;
CREATE TRIGGER trg_consent_append_only BEFORE UPDATE OR DELETE ON consent_records
FOR EACH ROW EXECUTE FUNCTION consent_records_append_only()
"""
