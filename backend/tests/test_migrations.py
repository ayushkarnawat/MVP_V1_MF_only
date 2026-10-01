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
    assert _unique_constraint_columns(conn) == {"folio_id", "date", "amount", "units", "type"}
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
