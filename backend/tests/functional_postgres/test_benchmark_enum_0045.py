"""0045 benchmark enum widening on real Postgres."""

import os
import subprocess
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

pytestmark = pytest.mark.postgres


@pytest.fixture()
def postgres_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set — no local Postgres to test against")
    return url


def _alembic(*args):
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )


def test_0045_new_benchmark_values_are_writable_and_upgrade_is_idempotent(
    postgres_url, monkeypatch
):
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    reset = _alembic("downgrade", "base")
    assert reset.returncode == 0, reset.stderr
    up = _alembic("upgrade", "head")
    assert up.returncode == 0, up.stderr

    engine = create_engine(postgres_url)
    db = sessionmaker(bind=engine)()
    try:
        new_indices = (
            BenchmarkIndex.NIFTY_NEXT_50,
            BenchmarkIndex.NIFTY_SMALLCAP_250,
            BenchmarkIndex.NIFTY_100,
            BenchmarkIndex.NIFTY_200,
        )
        for index in new_indices:
            db.add(
                BenchmarkIndexHistory(
                    index_name=index,
                    date=date(2026, 10, 23),
                    return_type=BenchmarkReturnType.TRI,
                    value=Decimal("100.00"),
                )
            )
        db.commit()
        assert {row.index_name for row in db.query(BenchmarkIndexHistory).all()} == set(new_indices)
    finally:
        db.close()
        engine.dispose()

    down = _alembic("downgrade", "0043")
    assert down.returncode == 0, down.stderr
    again = _alembic("upgrade", "head")
    assert again.returncode == 0, again.stderr
