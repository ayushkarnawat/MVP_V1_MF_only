import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from tests.api.test_search_index import NOW, assert_family_shape, seed_search_household
from app.services.search.index import build_search_index


def test_shape_on_partitioned_transactions():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL unset; Postgres unavailable")
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                assert connection.execute(text(
                    "SELECT count(*) FROM pg_partitioned_table WHERE partrelid = 'transactions'::regclass"
                )).scalar_one() == 1
                with Session(bind=connection, autoflush=False) as db:
                    family = seed_search_household(db)
                    body = build_search_index(db, family.user.id, NOW.date()).model_dump(mode="json")
                    assert_family_shape(body, family)
            finally:
                transaction.rollback()
    finally:
        engine.dispose()
