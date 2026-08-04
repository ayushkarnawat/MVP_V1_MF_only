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
    }
    assert expected.issubset(tables)
