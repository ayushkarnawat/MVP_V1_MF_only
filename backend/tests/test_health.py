from fastapi.testclient import TestClient

from app.main import DEFAULT_LOCAL_CORS_ORIGINS, _allowed_cors_origins, app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_allows_frontend_dev_origin():
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_allows_dynamic_localhost_ports():
    for port in [5173, 5174, 5175, 3000, 8080]:
        origin = f"http://localhost:{port}"
        response = client.options(
            "/auth/signup/email",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin


def test_cors_uses_configured_origins_and_ignores_blank_entries():
    assert _allowed_cors_origins(
        " https://staging.unifolio.example,https://app.unifolio.example, "
    ) == [
        "https://staging.unifolio.example",
        "https://app.unifolio.example",
    ]


def test_cors_uses_existing_local_origins_when_configuration_is_unset():
    assert _allowed_cors_origins("") == DEFAULT_LOCAL_CORS_ORIGINS
