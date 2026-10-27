"""0044 news_items table and stock_master.nse_symbol on real Postgres."""

import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.news import NewsItem

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


def test_0044_news_items_insert_and_downgrade_upgrade_roundtrip(postgres_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    up = _alembic("upgrade", "head")
    assert up.returncode == 0, up.stderr

    engine = create_engine(postgres_url)
    db = sessionmaker(bind=engine)()
    now = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)
    item_id = uuid.uuid4()
    try:
        db.add(
            NewsItem(
                id=item_id,
                source="Moneycontrol",
                title="0044 Postgres roundtrip test",
                url=f"https://www.moneycontrol.com/news/{item_id}.html",
                published_at=now,
                ingested_at=now,
                tier=7,
                entity_tags=[],
            )
        )
        db.commit()
        assert db.query(NewsItem).filter_by(id=item_id).one().entity_tags == []
    finally:
        db.query(NewsItem).filter_by(id=item_id).delete()
        db.commit()
        db.close()
        engine.dispose()

    down = _alembic("downgrade", "0043")
    assert down.returncode == 0, down.stderr
    again = _alembic("upgrade", "head")
    assert again.returncode == 0, again.stderr
