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
    }
    assert expected.issubset(tables)
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
