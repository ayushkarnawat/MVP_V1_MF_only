import uuid
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app


def _client():
    return TestClient(app)


def test_export_pdf_404_when_member_not_owned():
    from app.db.session import get_db
    from app.services.auth.session import get_current_user

    fake_db = type("DB", (), {"query": lambda self, *a: type(
        "Q", (), {"filter_by": lambda self, **kw: type("F", (), {"first": lambda self: None})()}
    )()})()
    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"id": uuid.uuid4()})()
    app.dependency_overrides[get_db] = lambda: fake_db
    client = _client()
    try:
        response = client.post(
            "/analytics/export/pdf",
            json={"scope": "member", "member_id": str(uuid.uuid4()), "payload": {}},
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_export_pdf_aggregate_scope_skips_member_ownership_check():
    from app.db.session import get_db
    from app.services.auth.session import get_current_user

    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"id": uuid.uuid4()})()
    app.dependency_overrides[get_db] = lambda: object()
    client = _client()
    try:
        with patch(
            "app.api.analytics.render_analytics_pdf",
            new=AsyncMock(return_value=b"%PDF-1.4 fake"),
        ):
            response = client.post(
                "/analytics/export/pdf",
                json={"scope": "aggregate", "member_id": None, "payload": {"allocation": {}}},
            )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content == b"%PDF-1.4 fake"
    finally:
        app.dependency_overrides.clear()


def test_get_export_payload_returns_stored_blob_once():
    from app.services.analytics.pdf_export import store_export_payload

    token = store_export_payload({"scope": "aggregate", "allocation": {"total_value": "100"}})
    client = _client()
    first = client.get(f"/analytics/export/payload/{token}")
    assert first.status_code == 200
    assert first.json() == {"scope": "aggregate", "allocation": {"total_value": "100"}}

    second = client.get(f"/analytics/export/payload/{token}")
    assert second.status_code == 404


def test_get_export_payload_404_for_unknown_token():
    client = _client()
    response = client.get("/analytics/export/payload/does-not-exist")
    assert response.status_code == 404
