"""0046 job_runs table on real Postgres."""

import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.news import JobRun

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
        [sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, capture_output=True, text=True,
    )


def test_0046_job_runs_insert_and_downgrade_upgrade_roundtrip(postgres_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    up = _alembic("upgrade", "head")
    assert up.returncode == 0, up.stderr

    engine = create_engine(postgres_url)
    db = sessionmaker(bind=engine)()
    when = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)
    try:
        db.add(JobRun(job_name="roundtrip_test", last_success_at=when))
        db.commit()
        assert db.query(JobRun).filter_by(job_name="roundtrip_test").one().last_success_at == when
    finally:
        db.query(JobRun).filter_by(job_name="roundtrip_test").delete()
        db.commit()
        db.close()
        engine.dispose()

    down = _alembic("downgrade", "0044")
    assert down.returncode == 0, down.stderr
    again = _alembic("upgrade", "head")
    assert again.returncode == 0, again.stderr
