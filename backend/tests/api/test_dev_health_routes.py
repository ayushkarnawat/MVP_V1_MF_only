from fastapi import FastAPI

from app.api.dev_health import register_dev_routes
from api.import_helpers import _authed_headers_and_member


def test_not_registered_in_production():
    app = FastAPI()
    assert register_dev_routes(app, "production") is False
    assert not any(getattr(r, "path", "").startswith("/dev") for r in app.routes)


def test_registered_in_staging():
    app = FastAPI()
    assert register_dev_routes(app, "staging") is True
    assert "/dev/import-health" in app.openapi()["paths"]


def test_status_route(client):
    headers, _ = _authed_headers_and_member(client, "+919800000101")
    assert client.get("/dev/status", headers=headers).json() == {"enabled": True}


def test_import_health_empty_household(client):
    headers, _ = _authed_headers_and_member(client, "+919800000102")
    body = client.get("/dev/import-health", headers=headers).json()
    assert body["folios"] == [] and body["last_import_at"] is None


def test_import_health_other_users_member_is_404(client):
    _, other_member = _authed_headers_and_member(client, "+919800000103")
    headers, _ = _authed_headers_and_member(client, "+919800000104")
    assert client.get(f"/dev/import-health?household_member_id={other_member}", headers=headers).status_code == 404


def test_import_health_requires_auth(client):
    assert client.get("/dev/import-health").status_code == 401
