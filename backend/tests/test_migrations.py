import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent


def test_alembic_upgrade_and_downgrade_round_trip(tmp_path, monkeypatch):
    db_path = tmp_path / "alembic_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert upgrade.returncode == 0, upgrade.stderr

    downgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "base"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert downgrade.returncode == 0, downgrade.stderr


def test_alembic_upgrade_creates_all_tables(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "full_schema.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr

    conn = sqlite3.connect(db_path)
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expected = {
        "users", "household_members", "imports", "schemes", "folios",
        "transactions", "nav_history", "scheme_ter", "scheme_aaum",
        "benchmark_index_history", "arn_directory", "portfolio_snapshots",
        "fund_scores", "otp_requests", "sessions",
        "auth_identities", "pending_identity_verifications",
        "account_deletion_surveys",
    }
    assert expected.issubset(tables)
    user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    assert {"pending_deletion", "deletion_scheduled_at"}.issubset(user_columns)
    recompute_columns = {
        row[1] for row in conn.execute("PRAGMA table_info(analytics_recompute_status)")
    }
    assert "generation" in recompute_columns
    # email_confirmation_tokens is dropped outright by 0007 -- the
    # link-based email confirmation mechanism it backed no longer exists.
    assert "email_confirmation_tokens" not in tables
    # password_reset_tokens is dropped outright by 0008 -- password auth
    # itself no longer exists (remove-password-auth handoff spec §1).
    assert "password_reset_tokens" not in tables


def test_transaction_dedupe_constraint_includes_type_after_upgrade(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "dedupe_migration_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert upgrade.returncode == 0, upgrade.stderr

    def _unique_constraint_columns(conn) -> set[str]:
        for row in conn.execute("PRAGMA index_list('transactions')").fetchall():
            # row: (seq, name, unique, origin, partial) — origin 'u' means
            # the index backs a UNIQUE constraint (not a plain CREATE INDEX
            # or the PRIMARY KEY).
            if row[2] == 1 and row[3] == "u":
                index_name = row[1]
                return {r[2] for r in conn.execute(f"PRAGMA index_info('{index_name}')").fetchall()}
        return set()

    conn = sqlite3.connect(db_path)
    assert _unique_constraint_columns(conn) == {"folio_id", "date", "amount", "units", "type", "occurrence"}
    conn.close()

    downgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "0001"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert downgrade.returncode == 0, downgrade.stderr

    conn = sqlite3.connect(db_path)
    assert _unique_constraint_columns(conn) == {"folio_id", "date", "amount", "units"}
    conn.close()


def test_alembic_handles_percent_in_database_url(tmp_path, monkeypatch):
    """configparser interpolates '%' — a URL-encoded credential (e.g. %40 for
    '@') must not crash env.py with ValueError: invalid interpolation syntax."""
    db_path = tmp_path / "pct%40db.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert upgrade.returncode == 0, upgrade.stderr
    assert "interpolation" not in upgrade.stderr

    downgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "base"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert downgrade.returncode == 0, downgrade.stderr


def test_multi_method_auth_migration_round_trip(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "multi_method_auth.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert upgrade.returncode == 0, upgrade.stderr

    conn = sqlite3.connect(db_path)
    otp_columns = {row[1] for row in conn.execute("PRAGMA table_info(otp_requests)")}
    # At head (0007), email is back (re-widened for the email-OTP signup
    # step) — this test only checks the 0004 shape, so stop at 0006 first
    # for the "narrowed" assertion below instead of asserting against head.
    assert "phone_number" in otp_columns
    session_columns = {row[1] for row in conn.execute("PRAGMA table_info(sessions)")}
    assert "auth_method" in session_columns
    conn.close()

    at_0006 = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "0006"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert at_0006.returncode == 0, at_0006.stderr

    conn = sqlite3.connect(db_path)
    otp_columns_at_0006 = {row[1] for row in conn.execute("PRAGMA table_info(otp_requests)")}
    # At 0006, email column is narrowed back out — only phone_number remains
    assert "email" not in otp_columns_at_0006
    conn.close()

    downgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "0005"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert downgrade.returncode == 0, downgrade.stderr


def _alembic(*args):
    """DATABASE_URL comes from the monkeypatched env, same as the tests above."""
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )


def test_backfill_migration_creates_phone_otp_identity_for_preexisting_users(tmp_path, monkeypatch):
    """Migration 0005 (Design Spec §1's Migration note). Without this backfill,
    a `users` row that predates multi-method auth has no `auth_identities` row,
    so the login path reads it as brand-new and tries to INSERT a second `User`
    with the same UNIQUE phone number — an unhandled 500 on an ordinary login."""
    import sqlite3
    import uuid

    db_path = tmp_path / "backfill.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    # Stop at 0004 — schema in place, backfill not yet run — so the row below
    # is created in exactly the state a pre-existing production row is in.
    up_to_0004 = _alembic("upgrade", "0004")
    assert up_to_0004.returncode == 0, up_to_0004.stderr

    legacy_id = uuid.uuid4()
    already_linked_id = uuid.uuid4()
    conn = sqlite3.connect(db_path)
    # sa.Uuid() is CHAR(32) hex on SQLite; DateTime(timezone=True) is a
    # 'YYYY-MM-DD HH:MM:SS.ffffff' string. Raw table access on purpose — the
    # ORM models describe today's schema, not the schema at revision 0004.
    conn.executemany(
        "INSERT INTO users (id, phone_number, created_at) VALUES (?, ?, ?)",
        [
            (legacy_id.hex, "+919876500001", "2026-01-02 03:04:05.000000"),
            (already_linked_id.hex, "+919876500002", "2026-02-03 04:05:06.000000"),
        ],
    )
    # Second user already has its identity — proves upgrade() is re-runnable
    # and does not create a duplicate (which the (provider, provider_subject)
    # UNIQUE constraint would reject anyway).
    conn.execute(
        "INSERT INTO auth_identities"
        " (id, user_id, provider, provider_subject, email, identifier_verified_at, created_at, last_used_at)"
        " VALUES (?, ?, 'phone_otp', ?, NULL, ?, ?, ?)",
        (
            uuid.uuid4().hex, already_linked_id.hex, "+919876500002",
            "2026-02-03 04:05:06.000000", "2026-02-03 04:05:06.000000", "2026-02-03 04:05:06.000000",
        ),
    )
    conn.commit()
    conn.close()

    upgrade = _alembic("upgrade", "head")
    assert upgrade.returncode == 0, upgrade.stderr

    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT user_id, provider, provider_subject, email, identifier_verified_at, created_at, last_used_at"
        " FROM auth_identities ORDER BY provider_subject"
    ).fetchall()
    conn.close()

    assert len(rows) == 2  # one backfilled, one pre-existing and untouched
    backfilled = rows[0]
    assert backfilled[0] == legacy_id.hex
    assert backfilled[1] == "phone_otp"
    assert backfilled[2] == "+919876500001"
    assert backfilled[3] is None  # never users.email — a phone identity has no email claim
    # All three timestamps come from users.created_at, per the spec's note that
    # a verified phone was always a precondition for the User row existing.
    assert backfilled[4] == "2026-01-02 03:04:05.000000"
    assert backfilled[5] == "2026-01-02 03:04:05.000000"
    assert backfilled[6] == "2026-01-02 03:04:05.000000"


def test_backfill_migration_upgrade_is_idempotent(tmp_path, monkeypatch):
    """A second run must be a no-op, not a UNIQUE violation — the migration is
    re-runnable by design (see 0005's downgrade() docstring for why downgrade
    deliberately leaves the rows in place, which makes re-upgrade a real path)."""
    import sqlite3
    import uuid

    db_path = tmp_path / "backfill_idempotent.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    assert _alembic("upgrade", "0004").returncode == 0
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO users (id, phone_number, created_at) VALUES (?, ?, ?)",
        (uuid.uuid4().hex, "+919876500003", "2026-03-04 05:06:07.000000"),
    )
    conn.commit()
    conn.close()

    assert _alembic("upgrade", "head").returncode == 0
    down = _alembic("downgrade", "0004")
    assert down.returncode == 0, down.stderr
    second = _alembic("upgrade", "head")
    assert second.returncode == 0, second.stderr

    conn = sqlite3.connect(db_path)
    count = conn.execute(
        "SELECT COUNT(*) FROM auth_identities WHERE provider_subject = '+919876500003'"
    ).fetchone()[0]
    conn.close()
    assert count == 1


def test_email_password_auth_migration_upgrade_downgrade_upgrade(tmp_path, monkeypatch):
    """0006 → 0005 → 0006 round-trip: email+password auth schema changes."""
    import sqlite3

    db_path = tmp_path / "email_password_auth.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    # Pinned to 0006 (not head) — this test asserts 0006's own shape
    # (otp_requests narrowed, email_confirmation_tokens present), which 0007
    # deliberately changes again. See test_email_otp_signup_migration_round_trip
    # for 0007's own shape.
    upgrade = _alembic("upgrade", "0006")
    assert upgrade.returncode == 0, upgrade.stderr

    conn = sqlite3.connect(db_path)
    # Verify 0006 changes are applied: password_hash, email_confirmed_at on
    # auth_identities; password_hash on pending_identity_verifications; new
    # password_reset_tokens and email_confirmation_tokens tables; email
    # column removed from otp_requests.
    auth_id_columns = {row[1] for row in conn.execute("PRAGMA table_info(auth_identities)")}
    assert "password_hash" in auth_id_columns
    assert "email_confirmed_at" in auth_id_columns

    pending_columns = {row[1] for row in conn.execute("PRAGMA table_info(pending_identity_verifications)")}
    assert "password_hash" in pending_columns

    otp_columns = {row[1] for row in conn.execute("PRAGMA table_info(otp_requests)")}
    assert "email" not in otp_columns

    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "password_reset_tokens" in tables
    assert "email_confirmation_tokens" in tables
    conn.close()

    downgrade = _alembic("downgrade", "0005")
    assert downgrade.returncode == 0, downgrade.stderr

    conn = sqlite3.connect(db_path)
    # At 0005, columns should be gone, email restored to otp_requests
    auth_id_columns = {row[1] for row in conn.execute("PRAGMA table_info(auth_identities)")}
    assert "password_hash" not in auth_id_columns
    assert "email_confirmed_at" not in auth_id_columns

    otp_columns = {row[1] for row in conn.execute("PRAGMA table_info(otp_requests)")}
    assert "email" in otp_columns

    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "password_reset_tokens" not in tables
    assert "email_confirmation_tokens" not in tables
    conn.close()

    re_upgrade = _alembic("upgrade", "0006")
    assert re_upgrade.returncode == 0, re_upgrade.stderr

    conn = sqlite3.connect(db_path)
    # Re-applying 0006 should succeed without errors
    auth_id_columns = {row[1] for row in conn.execute("PRAGMA table_info(auth_identities)")}
    assert "password_hash" in auth_id_columns
    assert "email_confirmed_at" in auth_id_columns
    conn.close()


def test_email_otp_signup_migration_round_trip(tmp_path, monkeypatch):
    """0007 -> 0006 -> 0007 round-trip (2026-08-17 email-otp-signup handoff
    spec §1): otp_requests re-widened to accept email again, plus its CHECK
    constraint, and email_confirmation_tokens dropped outright."""
    import sqlite3

    db_path = tmp_path / "email_otp_signup.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    upgrade = _alembic("upgrade", "head")
    assert upgrade.returncode == 0, upgrade.stderr

    conn = sqlite3.connect(db_path)
    otp_columns = {row[1] for row in conn.execute("PRAGMA table_info(otp_requests)")}
    assert "email" in otp_columns
    assert "phone_number" in otp_columns

    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "email_confirmation_tokens" not in tables
    conn.close()

    # CHECK constraint behavior: exactly one of phone_number/email must be set.
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys=ON")
    import uuid as uuid_module
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()

    def _insert_otp_request(phone_number, email):
        conn.execute(
            "INSERT INTO otp_requests (id, phone_number, email, otp_hash, expires_at, created_at, attempt_count)"
            " VALUES (?, ?, ?, 'hash', ?, ?, 0)",
            (uuid_module.uuid4().hex, phone_number, email, now, now),
        )

    _insert_otp_request("+919999999999", None)  # phone-only: allowed
    conn.commit()
    _insert_otp_request(None, "a@example.com")  # email-only: allowed
    conn.commit()

    with pytest.raises(sqlite3.IntegrityError):
        _insert_otp_request(None, None)  # neither: rejected
    conn.rollback()

    with pytest.raises(sqlite3.IntegrityError):
        _insert_otp_request("+919999999998", "b@example.com")  # both: rejected
    conn.rollback()
    # Clean up the email-only row before downgrading -- 0007's downgrade
    # re-narrows phone_number back to NOT NULL (mirrors 0006's own narrowing),
    # which a real deploy would pre-check for non-empty emails the same way
    # 0006's upgrade() does; this test only exercises the schema round-trip.
    conn.execute("DELETE FROM otp_requests WHERE phone_number IS NULL")
    conn.commit()
    conn.close()

    downgrade = _alembic("downgrade", "0006")
    assert downgrade.returncode == 0, downgrade.stderr

    conn = sqlite3.connect(db_path)
    otp_columns = {row[1] for row in conn.execute("PRAGMA table_info(otp_requests)")}
    assert "email" not in otp_columns

    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "email_confirmation_tokens" in tables
    conn.close()

    re_upgrade = _alembic("upgrade", "head")
    assert re_upgrade.returncode == 0, re_upgrade.stderr

    conn = sqlite3.connect(db_path)
    otp_columns = {row[1] for row in conn.execute("PRAGMA table_info(otp_requests)")}
    assert "email" in otp_columns
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "email_confirmation_tokens" not in tables
    conn.close()


def test_remove_password_auth_migration_round_trip(tmp_path, monkeypatch):
    """0008 -> 0007 -> 0008 round-trip (remove-password-auth handoff spec
    §1): password auth is removed entirely -- auth_identities.password_hash,
    auth_identities.email_confirmed_at, pending_identity_verifications.
    password_hash, and the password_reset_tokens table are all dropped.
    EMAIL_PASSWORD stays defined in the enum (not exercised at the schema
    level -- Postgres-only, and this test runs on SQLite)."""
    import sqlite3

    db_path = tmp_path / "remove_password_auth.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    upgrade = _alembic("upgrade", "head")
    assert upgrade.returncode == 0, upgrade.stderr

    conn = sqlite3.connect(db_path)
    auth_id_columns = {row[1] for row in conn.execute("PRAGMA table_info(auth_identities)")}
    assert "password_hash" not in auth_id_columns
    assert "email_confirmed_at" not in auth_id_columns

    pending_columns = {row[1] for row in conn.execute("PRAGMA table_info(pending_identity_verifications)")}
    assert "password_hash" not in pending_columns

    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "password_reset_tokens" not in tables
    conn.close()

    downgrade = _alembic("downgrade", "0007")
    assert downgrade.returncode == 0, downgrade.stderr

    conn = sqlite3.connect(db_path)
    auth_id_columns = {row[1] for row in conn.execute("PRAGMA table_info(auth_identities)")}
    assert "password_hash" in auth_id_columns
    assert "email_confirmed_at" in auth_id_columns

    pending_columns = {row[1] for row in conn.execute("PRAGMA table_info(pending_identity_verifications)")}
    assert "password_hash" in pending_columns

    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "password_reset_tokens" in tables
    conn.close()

    re_upgrade = _alembic("upgrade", "head")
    assert re_upgrade.returncode == 0, re_upgrade.stderr

    conn = sqlite3.connect(db_path)
    auth_id_columns = {row[1] for row in conn.execute("PRAGMA table_info(auth_identities)")}
    assert "password_hash" not in auth_id_columns
    assert "email_confirmed_at" not in auth_id_columns
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "password_reset_tokens" not in tables
    conn.close()


def test_0018_backfills_preexisting_members_as_unlocked(tmp_path, monkeypatch):
    """Staging has household_members rows from before 0018. Without a backfill
    the lock CHECK constraints reject them (details_completed_at NULL with
    lock_reason NULL) and the upgrade fails on Postgres."""
    import sqlite3

    db_path = tmp_path / "member_backfill.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    up_to_0017 = _alembic("upgrade", "0017")
    assert up_to_0017.returncode == 0, up_to_0017.stderr

    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800000018', '2026-09-01 10:00:00.000000')"
    )
    conn.executemany(
        "INSERT INTO household_members"
        " (id, user_id, name, relationship, created_at, pan_encrypted, pan_lookup_hash, pan_pending_until)"
        " VALUES (?, 'u1', ?, ?, ?, ?, ?, ?)",
        [
            # Self with a permanent PAN claimed from a CAS.
            ("m_self", "Asha Rao", "self", "2026-09-01 10:00:00.000000", "enc1", "hash1", None),
            # Spouse with no PAN.
            ("m_spouse", "Ravi Rao", "spouse", "2026-09-02 11:00:00.000000", None, None, None),
            # Child with a still-pending claim: not a verified PAN yet.
            ("m_child", "Kiran Rao", "child", "2026-09-03 12:00:00.000000", "enc3", "hash3", "2026-09-03 13:05:00.000000"),
        ],
    )
    conn.commit()
    conn.close()

    upgrade = _alembic("upgrade", "0022")  # 0023 drops the lock columns/trigger
    assert upgrade.returncode == 0, upgrade.stderr

    conn = sqlite3.connect(db_path)
    rows = {
        r[0]: r[1:]
        for r in conn.execute(
            "SELECT id, origin, name_source, details_completed_at, lock_reason, pan_source, pan_verified_at"
            " FROM household_members"
        )
    }
    conn.close()

    assert rows["m_self"] == ("onboarding", "user_entered", "2026-09-01 10:00:00.000000", None, "cas", "2026-09-01 10:00:00.000000")
    assert rows["m_spouse"] == ("manual", "user_entered", "2026-09-02 11:00:00.000000", None, None, None)
    assert rows["m_child"] == ("manual", "user_entered", "2026-09-03 12:00:00.000000", None, None, None)


def test_0018_upgrade_creates_trigger_and_downgrade_removes_it(tmp_path, monkeypatch):
    """0018 (CAS member detection): the never-relock trigger must survive the
    batch rebuild of household_members (batch mode drops triggers on SQLite,
    so 0018 creates it after the batch block), and the pre-existing indexes
    on household_members must survive the rebuild too."""
    import sqlite3

    db_path = tmp_path / "member_detection.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    upgrade = _alembic("upgrade", "0022")  # 0023 drops the lock columns/trigger
    assert upgrade.returncode == 0, upgrade.stderr

    def _objects(kind):
        conn = sqlite3.connect(db_path)
        names = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type=?", (kind,))}
        conn.close()
        return names

    assert "trg_member_never_relock" in _objects("trigger")
    assert {"household_member_name_changes", "household_member_merges"}.issubset(_objects("table"))
    indexes = _objects("index")
    assert {
        "ix_member_user_detected_pan_hash",
        "ix_imports_upload_group_id",
        "ix_household_members_pan_lookup_hash",
        "ix_household_members_one_self_per_user",
    }.issubset(indexes)

    conn = sqlite3.connect(db_path)
    # The batch rebuild must keep 0011's partial WHERE clause, otherwise the
    # index would allow only one household member per user.
    self_index_sql = conn.execute(
        "SELECT sql FROM sqlite_master WHERE name='ix_household_members_one_self_per_user'"
    ).fetchone()[0]
    assert "WHERE" in self_index_sql.upper()
    fk_targets = {row[2] for row in conn.execute("PRAGMA foreign_key_list(household_members)")}
    assert "imports" in fk_targets  # F3: FK must exist on SQLite, not be skipped

    # Exercise the migration's own frozen trigger copy (the model tests only
    # cover the create_all copy from app/db/member_trigger_sql.py).
    conn.execute(
        "INSERT INTO users (id, phone_number, created_at) VALUES ('u0018', '+919800001818', '2026-09-29 10:00:00.000000')"
    )
    conn.execute(
        "INSERT INTO household_members (id, user_id, name, relationship, created_at, details_completed_at)"
        " VALUES ('m0018', 'u0018', 'Asha Rao', 'spouse', '2026-09-29 10:00:00.000000', '2026-09-29 10:00:00.000000')"
    )
    conn.commit()
    with pytest.raises(sqlite3.IntegrityError, match="member_already_unlocked"):
        conn.execute(
            "UPDATE household_members SET details_completed_at = NULL, lock_reason = 'details_needed'"
            " WHERE id = 'm0018'"
        )
    conn.rollback()
    conn.execute("DELETE FROM household_members")
    conn.execute("DELETE FROM users")
    conn.commit()
    conn.close()

    downgrade = _alembic("downgrade", "0017")
    assert downgrade.returncode == 0, downgrade.stderr

    assert "trg_member_never_relock" not in _objects("trigger")
    tables = _objects("table")
    assert "household_member_name_changes" not in tables
    assert "household_member_merges" not in tables
    conn = sqlite3.connect(db_path)
    member_columns = {row[1] for row in conn.execute("PRAGMA table_info(household_members)")}
    import_columns = {row[1] for row in conn.execute("PRAGMA table_info(imports)")}
    conn.close()
    assert "details_completed_at" not in member_columns
    assert "upload_group_id" not in import_columns

    re_upgrade = _alembic("upgrade", "0022")  # 0023 drops the lock columns/trigger
    assert re_upgrade.returncode == 0, re_upgrade.stderr
    assert "trg_member_never_relock" in _objects("trigger")


def test_0019_backfills_primary_goals_and_keeps_old_column(tmp_path, monkeypatch):
    import json
    import sqlite3

    db_path = tmp_path / "goals.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0018").returncode == 0
    conn = sqlite3.connect(db_path)
    conn.executemany(
        "INSERT INTO users (id, phone_number, created_at, primary_goal) VALUES (?, ?, '2026-09-01 10:00:00.000000', ?)",
        [("u1", "+919800000191", "family_management"), ("u2", "+919800000192", None)],
    )
    conn.commit()
    conn.close()

    up = _alembic("upgrade", "0019")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    rows = dict(conn.execute("SELECT id, primary_goals FROM users"))
    old = dict(conn.execute("SELECT id, primary_goal FROM users"))
    conn.close()
    assert json.loads(rows["u1"]) == ["family_management"]
    assert rows["u2"] is None
    assert old["u1"] == "family_management"  # contract phase (0021) drops it, not 0019

    down = _alembic("downgrade", "0018")
    assert down.returncode == 0, down.stderr


def test_0020_backfills_statement_period_from_raw_parser_output(tmp_path, monkeypatch):
    """Staging-QA fix 6: no import path ever wrote the statement dates; they
    are recovered from raw_parser_output's statement_period."""
    import sqlite3

    db_path = tmp_path / "period.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    up_0019 = _alembic("upgrade", "0019")
    assert up_0019.returncode == 0, up_0019.stderr
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002001', '2026-09-01 10:00:00.000000')")
    conn.execute(
        "INSERT INTO household_members (id, user_id, name, relationship, created_at, details_completed_at, origin, name_source)"
        " VALUES ('m1', 'u1', 'A', 'self', '2026-09-01 10:00:00.000000', '2026-09-01 10:00:00.000000', 'onboarding', 'user_entered')"
    )
    rows = [
        ("i1", '{"statement_period": {"from_": "01-Apr-2025", "to": "30-Sep-2025"}}'),
        ("i2", '{"statement_period": {"from": "01-Oct-2025", "to": "31-Dec-2025"}}'),
        ("i3", '{"folios": []}'),
        ("i4", "not json"),
    ]
    for iid, raw in rows:
        conn.execute(
            "INSERT INTO imports (id, household_member_id, status, uploaded_at, raw_parser_output)"
            " VALUES (?, 'm1', 'import_successful', '2026-09-01 10:00:00.000000', ?)", (iid, raw),
        )
    conn.commit()
    conn.close()

    up = _alembic("upgrade", "0020")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    got = {r[0]: r[1:] for r in conn.execute("SELECT id, statement_from_date, statement_to_date FROM imports")}
    conn.close()
    assert got["i1"] == ("2025-04-01", "2025-09-30")
    assert got["i2"] == ("2025-10-01", "2025-12-31")
    assert got["i3"] == (None, None)
    assert got["i4"] == (None, None)


def test_0021_adds_and_removes_member_contact_columns(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "contact.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0020").returncode == 0

    def cols():
        conn = sqlite3.connect(db_path)
        try:
            return {r[1]: r[3] for r in conn.execute("PRAGMA table_info(household_members)")}
        finally:
            conn.close()

    assert "phone_number" not in cols()
    up = _alembic("upgrade", "0021")
    assert up.returncode == 0, up.stderr
    c = cols()
    assert c["phone_number"] == 0 and c["email"] == 0  # present, nullable
    down = _alembic("downgrade", "0020")
    assert down.returncode == 0, down.stderr
    c = cols()
    assert "phone_number" not in c and "email" not in c
    conn = sqlite3.connect(db_path)
    try:
        triggers = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
    finally:
        conn.close()
    assert "trg_member_never_relock" in triggers  # batch rebuild must not lose it


def test_0022_creates_append_only_consent_records_and_downgrade_removes_it(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "consent.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    up = _alembic("upgrade", "0022")
    assert up.returncode == 0, up.stderr

    conn = sqlite3.connect(db_path)
    try:
        cols = {r[1]: r[3] for r in conn.execute("PRAGMA table_info(consent_records)")}
        assert cols["user_id"] == 1 and cols["ip_truncated"] == 0 and cols["related_import_id"] == 0
        assert "ip_address" not in cols  # raw IPs are never stored
        triggers = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
        assert {"trg_consent_no_update", "trg_consent_no_delete"}.issubset(triggers)
        indexes = {r[1] for r in conn.execute("PRAGMA index_list(consent_records)")}
        assert "ix_consent_records_user_purpose_recorded" in indexes
        pending_cols = {r[1]: r[3] for r in conn.execute("PRAGMA table_info(pending_identity_verifications)")}
        assert pending_cols["consent_snapshot"] == 0  # Task 8: present, nullable
        conn.execute(
            "INSERT INTO consent_records (id, user_id, action, purpose_code, document_type,"
            " document_version, document_sha256, recorded_at, surface)"
            " VALUES ('a', 'u', 'given', 'service_agreement', 'terms_of_service', 'v', 'h',"
            " '2026-10-01', 's')"
        )
        conn.commit()
        with pytest.raises(sqlite3.DatabaseError, match="consent_records_append_only"):
            conn.execute("UPDATE consent_records SET surface = 'x'")
        with pytest.raises(sqlite3.DatabaseError, match="consent_records_append_only"):
            conn.execute("DELETE FROM consent_records")
    finally:
        conn.close()

    down = _alembic("downgrade", "0021")
    assert down.returncode == 0, down.stderr
    conn = sqlite3.connect(db_path)
    try:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert "consent_records" not in tables
        pending_cols = {r[1] for r in conn.execute("PRAGMA table_info(pending_identity_verifications)")}
        assert "consent_snapshot" not in pending_cols
    finally:
        conn.close()


def test_0023_drops_lock_and_promotes_detected_pans(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "profile.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0022").returncode == 0
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("INSERT INTO users (id, phone_number, created_at, pending_deletion) VALUES ('u1', '+919800000001', '2026-10-01', 0)")
        rows = [
            # locked, details_needed, statement PAN -> promoted
            ("m1", "Ramesh", "2026-10-01 10:00", "enc-a", "hash-a", "details_needed", "cas"),
            # locked, other account -> stays detected, pan_conflict set
            ("m2", "Vikram", "2026-10-01 10:01", "enc-b", "hash-b", "pan_on_other_account", "cas"),
        ]
        for mid, name, created, enc, h, reason, src in rows:
            conn.execute(
                "INSERT INTO household_members (id, user_id, name, created_at, origin, name_source,"
                " details_completed_at, lock_reason, detected_pan_encrypted, detected_pan_hash, pan_source)"
                " VALUES (?, 'u1', ?, ?, 'cas_detected', 'cas', NULL, ?, ?, ?, ?)",
                (mid, name, created, reason, enc, h, src),
            )
        conn.commit()
    finally:
        conn.close()

    up = _alembic("upgrade", "0023")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(household_members)")}
        assert "details_completed_at" not in cols and "lock_reason" not in cols and "pan_conflict" in cols
        got = {r[0]: r[1:] for r in conn.execute(
            "SELECT id, pan_encrypted, pan_lookup_hash, detected_pan_hash, pan_conflict, pan_verified_at IS NOT NULL"
            " FROM household_members")}
        assert got["m1"] == ("enc-a", "hash-a", None, None, 1)
        assert got["m2"] == (None, None, "hash-b", "other_account", 0)
        triggers = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
        assert "trg_member_never_relock" not in triggers
    finally:
        conn.close()
    down = _alembic("downgrade", "0022")
    assert down.returncode == 0, down.stderr


def test_0023_backfill_promotes_only_earliest_duplicate(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "dupes.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0022").returncode == 0
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("INSERT INTO users (id, phone_number, created_at, pending_deletion) VALUES ('u1', '+919800000001', '2026-10-01', 0)")
        conn.execute("INSERT INTO users (id, phone_number, created_at, pending_deletion) VALUES ('u2', '+919800000002', '2026-10-01', 0)")
        for mid, uid, created in (
            ("first", "u1", "2026-10-01 09:00"),
            ("second", "u1", "2026-10-01 09:30"),
            # Final review M-1: another user's leftover with the same hash.
            ("cross", "u2", "2026-10-01 10:00"),
        ):
            conn.execute(
                "INSERT INTO household_members (id, user_id, name, created_at, origin, name_source,"
                " details_completed_at, lock_reason, detected_pan_encrypted, detected_pan_hash, pan_source)"
                " VALUES (?, ?, 'Ramesh', ?, 'cas_detected', 'cas', NULL, 'details_needed', 'enc', 'same-hash', 'cas')",
                (mid, uid, created),
            )
        conn.commit()
    finally:
        conn.close()
    up = _alembic("upgrade", "0023")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    try:
        got = {r[0]: (r[1], r[2], r[3]) for r in conn.execute(
            "SELECT id, pan_lookup_hash, detected_pan_hash, pan_conflict FROM household_members")}
    finally:
        conn.close()
    assert got["first"] == ("same-hash", None, None)
    # left for a merge; never a unique-index crash
    assert got["second"] == (None, "same-hash", None)
    # The PAN is now on u1's account: flagged, not left looking PAN-less.
    assert got["cross"] == (None, "same-hash", "other_account")


def test_0023_marks_locked_row_whose_pan_another_user_holds_as_conflict(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "cross.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0022").returncode == 0
    conn = sqlite3.connect(db_path)
    try:
        for uid, phone in (("u1", "+919800000001"), ("u2", "+919800000002")):
            conn.execute(
                "INSERT INTO users (id, phone_number, created_at, pending_deletion) VALUES (?, ?, '2026-10-01', 0)",
                (uid, phone),
            )
        # u2's own (unlocked) Self already holds the PAN.
        conn.execute(
            "INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source,"
            " details_completed_at, lock_reason, pan_encrypted, pan_lookup_hash, pan_source)"
            " VALUES ('holder', 'u2', 'Vikram', 'self', '2026-10-01 08:00', 'onboarding', 'cas',"
            " '2026-10-01 08:00', NULL, 'enc-x', 'hash-x', 'cas')"
        )
        # u1's locked details_needed row found the same PAN on a statement.
        conn.execute(
            "INSERT INTO household_members (id, user_id, name, created_at, origin, name_source,"
            " details_completed_at, lock_reason, detected_pan_encrypted, detected_pan_hash, pan_source)"
            " VALUES ('locked', 'u1', 'Vikram', '2026-10-01 09:00', 'cas_detected', 'cas',"
            " NULL, 'details_needed', 'enc-x', 'hash-x', 'cas')"
        )
        conn.commit()
    finally:
        conn.close()

    up = _alembic("upgrade", "0023")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    try:
        got = {r[0]: r[1:] for r in conn.execute(
            "SELECT id, pan_conflict, detected_pan_encrypted, detected_pan_hash, pan_lookup_hash"
            " FROM household_members")}
    finally:
        conn.close()
    assert got["locked"] == ("other_account", "enc-x", "hash-x", None)
    assert got["holder"] == (None, None, None, "hash-x")


def test_0025_adds_origin_and_cost_source_and_backfills_manual(tmp_path, monkeypatch):
    import sqlite3, uuid
    db_path = tmp_path / "origin.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0023").returncode == 0
    conn = sqlite3.connect(db_path)
    folio, imp = "f1", "i1"
    ts = "2026-09-01 10:00:00.000000"
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002501', ?)", (ts,))
    conn.execute(
        "INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source)"
        " VALUES ('m1', 'u1', 'A', 'self', ?, 'onboarding', 'user_entered')", (ts,)
    )
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('s1', '100001', 'X', 'A', 'Equity')")
    conn.execute(
        "INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type, has_coverage_gap)"
        " VALUES ('f1', 'm1', 's1', '1/1', 'direct', 0)"
    )
    conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at) VALUES ('i1', 'm1', 'confirmed', ?)", (ts,))
    conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, raw_description) "
                 "VALUES (?, '2020-01-01', ?, ?, 'opening_balance', 100, 10, 10, 'Manual Opening Balance Entry')",
                 (str(uuid.uuid4()), folio, imp))
    conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, raw_description) "
                 "VALUES (?, '2020-02-01', ?, ?, 'purchase', 100, 10, 10, 'Purchase')",
                 (str(uuid.uuid4()), folio, imp))
    conn.commit(); conn.close()

    up = _alembic("upgrade", "0025")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    rows = dict(conn.execute("SELECT type, origin FROM transactions").fetchall())
    assert rows == {"opening_balance": "manual", "purchase": "cas_row"}
    sources = dict(conn.execute("SELECT type, cost_source FROM transactions").fetchall())
    assert sources == {"opening_balance": "manual", "purchase": None}
    conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, origin, cost_source) "
                 "VALUES ('cas-opening', '2021-01-01', 'f1', 'i1', 'opening_balance', 200, 20, 10, 'cas_opening', 'cas_cost')")
    conn.commit()
    conn.close()
    assert _alembic("downgrade", "0023").returncode == 0
    conn = sqlite3.connect(db_path)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(transactions)")}
    assert "origin" not in columns and "cost_source" not in columns
    assert conn.execute("SELECT COUNT(*) FROM transactions WHERE id = 'cas-opening'").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 2
    conn.close()


def test_0026_twin_rows_allowed_with_occurrence(tmp_path, monkeypatch):
    import sqlite3
    db_path = tmp_path / "twins.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0025").returncode == 0
    conn = sqlite3.connect(db_path)
    ts = "2026-09-01 10:00:00.000000"
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002601', ?)", (ts,))
    conn.execute("INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source)"
                 " VALUES ('m1', 'u1', 'A', 'self', ?, 'onboarding', 'user_entered')", (ts,))
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('s1', '1', 'X', 'A', 'E')")
    conn.execute("INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type, has_coverage_gap)"
                 " VALUES ('f1', 'm1', 's1', '1/1', 'direct', 0)")
    conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at) VALUES ('i1', 'm1', 'confirmed', ?)", (ts,))
    conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav) "
                 "VALUES ('t1', '2021-01-05', 'f1', 'i1', 'purchase_sip', 14999.25, 131.342, 114.2)")
    conn.commit(); conn.close()

    up = _alembic("upgrade", "0026")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT occurrence, balance_units FROM transactions WHERE id='t1'").fetchone() == (1, None)
    conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, occurrence, origin) "
                 "VALUES ('t2', '2021-01-05', 'f1', 'i1', 'purchase_sip', 14999.25, 131.342, 114.2, 2, 'cas_row')")
    conn.commit()
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, occurrence, origin) "
                     "VALUES ('t3', '2021-01-05', 'f1', 'i1', 'purchase_sip', 14999.25, 131.342, 114.2, 2, 'cas_row')")
    conn.close()
    down = _alembic("downgrade", "0025")
    assert down.returncode == 0, down.stderr


def test_0027_merges_duplicate_folios_without_duplicate_rows(tmp_path, monkeypatch):
    """#4/#5: "4400918 / 3" and "4400918/3" become one folio; a row both
    contain is kept once and keeps a link to each import that held it."""
    import sqlite3
    db_path = tmp_path / "folkey.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0026").returncode == 0
    conn = sqlite3.connect(db_path)
    ts = "2026-09-01 10:00:00.000000"
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002701', ?)", (ts,))
    conn.execute("INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source)"
                 " VALUES ('m1', 'u1', 'A', 'self', ?, 'onboarding', 'user_entered')", (ts,))
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('s1', '1', 'X', 'A', 'E')")
    for fid, num in (("fa", "4400918 / 3"), ("fb", "4400918/3")):
        conn.execute("INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type, has_coverage_gap)"
                     " VALUES (?, 'm1', 's1', ?, 'regular', 0)", (fid, num))
    for iid in ("i10", "ifY"):
        conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at) VALUES (?, 'm1', 'confirmed', ?)", (iid, ts))
    ins = ("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, origin, occurrence)"
           " VALUES (?, ?, ?, ?, 'purchase_sip', 1000, 10, 100, 'cas_row', 1)")
    conn.execute(ins, ("t1", "2025-05-05", "fa", "i10"))
    conn.execute(ins, ("t2", "2026-05-05", "fa", "i10"))
    conn.execute(ins, ("t3", "2026-05-05", "fb", "ifY"))   # same row as t2
    conn.execute(ins, ("t4", "2026-06-05", "fb", "ifY"))
    conn.commit(); conn.close()

    up = _alembic("upgrade", "0027")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    folios = conn.execute("SELECT id, folio_key FROM folios").fetchall()
    assert len(folios) == 1 and folios[0][1] == "4400918/3"
    kept = folios[0][0]
    rows = conn.execute("SELECT id, date FROM transactions WHERE folio_id = ? ORDER BY date", (kept,)).fetchall()
    assert [r[1] for r in rows] == ["2025-05-05", "2026-05-05", "2026-06-05"]
    links = conn.execute("SELECT transaction_id, import_id FROM transaction_imports").fetchall()
    surviving_may = next(r[0] for r in rows if r[1] == "2026-05-05")
    assert {i for t, i in links if t == surviving_may} == {"i10", "ifY"}
    assert len(links) == 4
    with pytest.raises(sqlite3.IntegrityError):   # new unique key on (member, scheme, folio_key)
        conn.execute("INSERT INTO folios (id, household_member_id, scheme_id, folio_number, folio_key, plan_type, has_coverage_gap)"
                     " VALUES ('fc', 'm1', 's1', '4400918  /3', '4400918/3', 'regular', 0)")
    conn.close()
    down = _alembic("downgrade", "0026")
    assert down.returncode == 0, down.stderr


def test_0027_merge_keeps_at_most_one_valid_cas_opening(tmp_path, monkeypatch):
    """Review HIGH 2: the FY folio ("X / 1") holds a CAS opening at 2025-04-01;
    the 10-year folio ("X/1") has real rows since 2016. After the merge the
    FY opening must be gone (history before it exists); with two openings and
    no earlier rows, only the earliest stays."""
    import sqlite3
    db_path = tmp_path / "openmerge.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0026").returncode == 0
    conn = sqlite3.connect(db_path)
    ts = "2026-09-01 10:00:00.000000"
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002702', ?)", (ts,))
    conn.execute("INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source)"
                 " VALUES ('m1', 'u1', 'A', 'self', ?, 'onboarding', 'user_entered')", (ts,))
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('s1', '1', 'X', 'A', 'E')")
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('s2', '2', 'Y', 'A', 'E')")
    folios = (("fa", "s1", "X / 1"), ("fb", "s1", "X/1"), ("fc", "s2", "Y / 1"), ("fd", "s2", "Y/1"))
    for fid, sid, num in folios:
        conn.execute("INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type, has_coverage_gap)"
                     " VALUES (?, 'm1', ?, ?, 'regular', 0)", (fid, sid, num))
    conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at) VALUES ('i1', 'm1', 'confirmed', ?)", (ts,))
    ins = ("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, origin, occurrence)"
           " VALUES (?, ?, ?, 'i1', ?, 1000, ?, 10, ?, 1)")
    # scheme 1: FY opening (fa) + 10-year history (fb, more rows → kept)
    conn.execute(ins, ("o1", "2025-04-01", "fa", "opening_balance", 100, "cas_opening"))
    conn.execute(ins, ("r1", "2016-05-05", "fb", "purchase", 100, "cas_row"))
    conn.execute(ins, ("r2", "2017-05-05", "fb", "purchase", 5, "cas_row"))
    # scheme 2: two openings, no real rows before either → keep only the earliest
    conn.execute(ins, ("o2", "2025-04-01", "fc", "opening_balance", 30, "cas_opening"))
    conn.execute(ins, ("o3", "2021-04-01", "fd", "opening_balance", 20, "cas_opening"))
    conn.execute(ins, ("r3", "2025-06-01", "fd", "purchase", 1, "cas_row"))
    conn.commit(); conn.close()

    up = _alembic("upgrade", "0027")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    openings = conn.execute("SELECT t.id FROM transactions t WHERE t.origin = 'cas_opening'").fetchall()
    assert [o[0] for o in openings] == ["o3"]
    assert conn.execute("SELECT count(*) FROM transaction_imports WHERE transaction_id IN ('o1', 'o2')").fetchone()[0] == 0
    conn.close()


def test_0027_backfills_links_from_each_imports_stored_cas_output(tmp_path, monkeypatch):
    """Review MEDIUM 3: before 0027 a row only remembered its first writer.
    The FY import (written first) owns the FY-period rows; the 10-year import
    uploaded later also contains them. 0027 must link those rows to the
    10-year import too, so deleting FY afterwards keeps them."""
    import json
    import sqlite3
    db_path = tmp_path / "linkfill.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0026").returncode == 0
    conn = sqlite3.connect(db_path)
    ts = "2026-09-01 10:00:00.000000"
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002703', ?)", (ts,))
    conn.execute("INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source)"
                 " VALUES ('m1', 'u1', 'A', 'self', ?, 'onboarding', 'user_entered')", (ts,))
    conn.execute("INSERT INTO schemes (id, amfi_code, isin, name, amc_name, sebi_category)"
                 " VALUES ('s1', '100', 'INF1', 'X Fund - Direct - Growth', 'A', 'E')")
    conn.execute("INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type, has_coverage_gap)"
                 " VALUES ('f1', 'm1', 's1', 'X / 1', 'direct', 0)")
    raw = lambda: json.dumps({"folios": [{"folio": "X/1", "amc": "A", "schemes": [
        {"scheme": "X Fund - Direct - Growth", "isin": "INF1", "amfi": "100"}]}]})
    conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at, raw_parser_output,"
                 " statement_from_date, statement_to_date) VALUES ('ify', 'm1', 'confirmed', ?, ?, '2025-04-01', '2026-03-31')",
                 (ts, raw()))
    conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at, raw_parser_output,"
                 " statement_from_date, statement_to_date) VALUES ('i10', 'm1', 'confirmed', ?, ?, '2016-04-01', '2026-03-31')",
                 (ts, raw()))
    conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at, raw_parser_output,"
                 " statement_from_date, statement_to_date) VALUES ('iother', 'm1', 'confirmed', ?, ?, '2016-04-01', '2026-03-31')",
                 (ts, json.dumps({"folios": [{"folio": "Z/9", "amc": "A", "schemes": []}]})))
    ins = ("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, origin, occurrence)"
           " VALUES (?, ?, 'f1', ?, 'purchase', 1000, 10, 100, ?, 1)")
    conn.execute(ins, ("t_fy", "2025-06-01", "ify", "cas_row"))      # written by FY, also in the 10-year file
    conn.execute(ins, ("t_old", "2018-06-01", "i10", "cas_row"))     # only in the 10-year file
    conn.execute(ins, ("t_man", "2025-07-01", "ify", "manual"))      # manual rows aren't on any CAS
    conn.commit(); conn.close()

    up = _alembic("upgrade", "0027")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    links = {}
    for tid, iid in conn.execute("SELECT transaction_id, import_id FROM transaction_imports"):
        links.setdefault(tid, set()).add(iid)
    conn.close()
    assert links["t_fy"] == {"ify", "i10"}
    assert links["t_old"] == {"i10"}
    assert links["t_man"] == {"ify"}


def test_0027_backfill_skips_ambiguous_name_only_matches(tmp_path, monkeypatch):
    """Review L1: two schemes in one folio key whose names normalise the same
    (no isin/amfi to tell them apart) get no extra links from a name match."""
    import json
    import sqlite3
    db_path = tmp_path / "ambig.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0026").returncode == 0
    conn = sqlite3.connect(db_path)
    ts = "2026-09-01 10:00:00.000000"
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002704', ?)", (ts,))
    conn.execute("INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source)"
                 " VALUES ('m1', 'u1', 'A', 'self', ?, 'onboarding', 'user_entered')", (ts,))
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('sg', '1', 'X Fund (Growth)', 'A', 'E')")
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('si', '2', 'X Fund (IDCW)', 'A', 'E')")
    for fid, sid in (("fg", "sg"), ("fi", "si")):
        conn.execute("INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type, has_coverage_gap)"
                     " VALUES (?, 'm1', ?, 'X/1', 'direct', 0)", (fid, sid))
    raw = json.dumps({"folios": [{"folio": "X/1", "amc": "A", "schemes": [{"scheme": "X Fund (Growth)"}]}]})
    for iid in ("i1", "i2"):
        conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at, raw_parser_output,"
                     " statement_from_date, statement_to_date) VALUES (?, 'm1', 'confirmed', ?, ?, '2020-01-01', '2026-01-01')",
                     (iid, ts, raw))
    conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, origin, occurrence)"
                 " VALUES ('ti', '2021-01-01', 'fi', 'i1', 'purchase', 1, 1, 1, 'cas_row', 1)")
    conn.commit(); conn.close()
    up = _alembic("upgrade", "0027")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    assert {r[0] for r in conn.execute("SELECT import_id FROM transaction_imports WHERE transaction_id = 'ti'")} == {"i1"}
    conn.close()



def test_0028_scheme_master_columns_and_nullable_code(tmp_path, monkeypatch):
    import sqlite3
    db_path = tmp_path / "master.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0027").returncode == 0
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('s1', '100001', 'X', 'A', 'E')")
    conn.commit(); conn.close()
    up = _alembic("upgrade", "0028")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT source, is_active FROM schemes WHERE id='s1'").fetchone() == ("amfi", 1)
    for scheme_id in ("s2", "s3"):
        conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category, source, is_active) VALUES (?, NULL, 'Closed', 'A', 'E', 'cas_only', 0)", (scheme_id,))
    assert "plan_verified" in {r[1] for r in conn.execute("PRAGMA table_info(folios)")}
    assert {"ix_schemes_isin", "ix_schemes_isin_reinvest", "ix_schemes_amc_base"}.issubset({r[1] for r in conn.execute("PRAGMA index_list(schemes)")})
    conn.commit(); conn.close()
    down = _alembic("downgrade", "0027")
    assert down.returncode != 0 and "downgrade would orphan" in down.stderr
    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT count(*) FROM schemes WHERE amfi_code IS NULL").fetchone()[0] == 2
    conn.execute("DELETE FROM schemes WHERE amfi_code IS NULL")
    conn.commit(); conn.close()
    assert _alembic("downgrade", "0027").returncode == 0


@pytest.mark.postgres
def test_0028_postgres_master_nullable_code_and_native_enums(monkeypatch):
    import os
    import psycopg2
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL unset")
    monkeypatch.setenv("DATABASE_URL", url)
    up = _alembic("upgrade", "head")
    assert up.returncode == 0, up.stderr
    conn = psycopg2.connect(url.replace("postgresql+psycopg2://", "postgresql://"))
    with conn.cursor() as cur:
        cur.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category, source, plan_type, is_active) VALUES (gen_random_uuid(), NULL, 'Closed PG test', 'A', 'E', 'cas_only', 'direct', false) RETURNING id")
        scheme_id = cur.fetchone()[0]
    conn.commit()
    down = _alembic("downgrade", "0027")
    assert down.returncode != 0 and "downgrade would orphan" in down.stderr
    with conn.cursor() as cur:
        cur.execute("SELECT source, plan_type, is_active FROM schemes WHERE id=%s", (scheme_id,))
        assert cur.fetchone() == ("cas_only", "direct", False)
        cur.execute("DELETE FROM schemes WHERE id=%s", (scheme_id,))
    conn.commit(); conn.close()
    down = _alembic("downgrade", "0027")
    assert down.returncode == 0, down.stderr
    assert _alembic("upgrade", "head").returncode == 0


def test_0029_snapshot_fields_and_preview_sessions(tmp_path, monkeypatch):
    import sqlite3
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'phase6.db'}")
    assert _alembic("upgrade", "0028").returncode == 0
    result = _alembic("upgrade", "0029")
    assert result.returncode == 0, result.stderr
    conn = sqlite3.connect(tmp_path / "phase6.db")
    assert {"invested_value", "is_partial", "missing_scheme_ids", "data_version"} <= {r[1] for r in conn.execute("PRAGMA table_info(portfolio_snapshots)")}
    assert "preview_state" in {r[1] for r in conn.execute("PRAGMA table_info(imports)")}
    conn.execute("INSERT INTO imports(id,household_member_id,status,uploaded_at,preview_state) VALUES('preview','member','previewing','2026-10-06','encrypted')")
    conn.commit(); conn.close()
    result = _alembic("downgrade", "0028")
    assert result.returncode == 0, result.stderr
    conn = sqlite3.connect(tmp_path / "phase6.db")
    assert conn.execute("SELECT count(*) FROM imports WHERE id='preview'").fetchone()[0] == 0
    assert "data_version" not in {r[1] for r in conn.execute("PRAGMA table_info(portfolio_snapshots)")}
    assert "preview_state" not in {r[1] for r in conn.execute("PRAGMA table_info(imports)")}
    conn.close()



@pytest.mark.postgres
def test_0029_postgres_snapshot_epoch_and_review_roundtrip(monkeypatch):
    import os,uuid
    import psycopg2
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL unset")
    monkeypatch.setenv("DATABASE_URL",url)
    result = _alembic("upgrade","head")
    assert result.returncode == 0,result.stderr
    user,member,preview = (str(uuid.uuid4()) for _ in range(3))
    conn = psycopg2.connect(url.replace("postgresql+psycopg2://","postgresql://",1))
    with conn.cursor() as cur:
        cur.execute("SELECT data_type FROM information_schema.columns WHERE table_name='portfolio_snapshots' AND column_name='data_version'")
        assert cur.fetchone()[0] == "bigint"
        cur.execute("SELECT data_type FROM information_schema.columns WHERE table_name='portfolio_snapshots' AND column_name='missing_scheme_ids'")
        assert cur.fetchone()[0] == "jsonb"
        cur.execute("INSERT INTO users(id,phone_number,created_at) VALUES(%s,%s,now())",(user,"+91"+str(uuid.uuid4().int % 10**10).zfill(10)))
        cur.execute("INSERT INTO household_members(id,user_id,name,relationship,created_at) VALUES(%s,%s,'Snapshot test','self',now())",(member,user))
        cur.execute("INSERT INTO imports(id,household_member_id,status,uploaded_at,preview_state) VALUES(%s,%s,'previewing',now(),'test ciphertext')",(preview,member))
        cur.execute("INSERT INTO portfolio_snapshots(household_member_id,snapshot_month,total_value,computed_at,invested_value,is_partial,missing_scheme_ids,data_version) VALUES(%s,'2026-09-30',200,now(),100,true,'[\"missing\"]',1791288000123)",(member,))
        cur.execute("SELECT invested_value,is_partial,missing_scheme_ids,data_version FROM portfolio_snapshots WHERE household_member_id=%s",(member,))
        assert cur.fetchone() == (100,True,["missing"],1791288000123)
    conn.commit();conn.close()
    result = _alembic("downgrade","0028")
    assert result.returncode == 0,result.stderr
    result = _alembic("upgrade","head")
    assert result.returncode == 0,result.stderr
    conn = psycopg2.connect(url.replace("postgresql+psycopg2://","postgresql://",1))
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM imports WHERE id=%s",(preview,))
        assert cur.fetchone()[0] == 0
        cur.execute("DELETE FROM portfolio_snapshots WHERE household_member_id=%s",(member,))
        cur.execute("DELETE FROM household_members WHERE id=%s",(member,))
        cur.execute("DELETE FROM users WHERE id=%s",(user,))
    conn.commit();conn.close()


def test_0034_ranking_tables_seed_and_singleton_roundtrip(tmp_path, monkeypatch):
    import sqlite3
    db_path = tmp_path / "ranking.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    up = _alembic("upgrade", "0034")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"scheme_rankings", "ranking_weights"} <= tables
    assert conn.execute("SELECT id, CAST(weight_return_3y AS TEXT), CAST(weight_return_5y AS TEXT), CAST(weight_category_relative AS TEXT), CAST(weight_low_volatility AS TEXT), CAST(weight_low_ter AS TEXT) FROM ranking_weights").fetchone() == (1, "0.25", "0.25", "0.2", "0.15", "0.15")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO ranking_weights(id) VALUES(false)")
    conn.rollback()
    conn.close()
    down = _alembic("downgrade", "0033")
    assert down.returncode == 0, down.stderr
    conn = sqlite3.connect(db_path)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert not ({"scheme_rankings", "ranking_weights"} & tables)
    conn.close()
