import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def pytest_collection_modifyitems(config, items):
    for item in items:
        if "functional_postgres" in str(item.fspath):
            item.add_marker("postgres")


@pytest.fixture()
def client():
    """A TestClient backed by an isolated in-memory DB — StaticPool so every
    request in a test shares the same connection/data, autoflush=False to
    match production's real session config (see Global Constraints)."""
    from app.db.base import Base
    from app.db.session import get_db
    from app.main import app
    from fastapi.testclient import TestClient

    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestSessionLocal = sessionmaker(autoflush=False, bind=engine)

    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)
