"""fund_page.router isn't registered on app.main.app until T3 (see handoff
D-table), so this can't use the shared `client` fixture yet -- a standalone
FastAPI app with only this router proves the auth dependency is wired."""
from __future__ import annotations

import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import fund_page
from app.db.session import get_db
from tests.services.fund_page.factories import make_session


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(fund_page.router)
    app.dependency_overrides[get_db] = make_session
    return TestClient(app)


def test_endpoints_require_session():
    response = _client().get(f"/fund-page/{uuid.uuid4()}/summary")
    assert response.status_code == 401
