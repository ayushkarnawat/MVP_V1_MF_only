import subprocess
import sys
from pathlib import Path

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
    assert "email" in otp_columns
    session_columns = {row[1] for row in conn.execute("PRAGMA table_info(sessions)")}
    assert "auth_method" in session_columns
    conn.close()

    downgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "0003"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert downgrade.returncode == 0, downgrade.stderr
