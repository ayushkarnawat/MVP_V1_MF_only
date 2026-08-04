import os
import subprocess
import sys
from pathlib import Path

import pytest
import psycopg2

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

pytestmark = pytest.mark.postgres


@pytest.fixture()
def postgres_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set — no local Postgres to test against")
    return url


def test_transactions_and_nav_history_are_partitioned(postgres_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "base"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr

    conn = psycopg2.connect(postgres_url)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT relname FROM pg_class c JOIN pg_partitioned_table p ON c.oid = p.partrelid"
        )
        partitioned = {row[0] for row in cur.fetchall()}
    conn.close()
    assert {"transactions", "nav_history"}.issubset(partitioned)
