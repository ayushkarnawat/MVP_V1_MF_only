from unittest.mock import AsyncMock

import pytest

from app import main


@pytest.mark.parametrize(
    ("environment", "enabled", "secret", "refuses"),
    [
        ("production", True, "", True),
        ("production", False, "", False),
        ("production", True, "synthetic-test-key", False),
        ("staging", True, "", False),
        ("development", True, "", False),
    ],
)
def test_auth_guard_secret_startup_requirement(monkeypatch, environment, enabled, secret, refuses):
    monkeypatch.setattr(main.settings, "environment", environment)
    monkeypatch.setitem(main.settings.__dict__, "auth_guard_enabled", enabled)
    monkeypatch.setitem(main.settings.__dict__, "auth_guard_secret", secret)
    # The export pass guard (Batch I) also runs in production; give it a valid secret so this test stays about the auth guard.
    monkeypatch.setitem(main.settings.__dict__, "export_pass_secret", "k3Jx9QvT7mPz2LwR8aYdN5cBf6HsU4eG")
    monkeypatch.setitem(main.settings.__dict__, "export_api_origin", "https://api.example.test")
    monkeypatch.setitem(main.settings.__dict__, "frontend_base_url", "https://app.example.test")
    start = AsyncMock()
    stop = AsyncMock()
    monkeypatch.setattr(main, "start_browser", start)
    monkeypatch.setattr(main, "stop_browser", stop)

    async def boot():
        async with main.lifespan(main.app):
            pass

    # The patched browser calls complete immediately, so no event loop is needed.
    if refuses:
        with pytest.raises(RuntimeError, match="AUTH_GUARD_SECRET"):
            boot().send(None)
        start.assert_not_awaited()
    else:
        with pytest.raises(StopIteration):
            boot().send(None)
        start.assert_awaited_once()
        stop.assert_awaited_once()


@pytest.mark.parametrize("environment", ["staging", "production"])
@pytest.mark.parametrize("secret", ["", "changeme", "a" * 40, "ab" * 20])
def test_export_pass_secret_weak_values_refused_outside_development(monkeypatch, environment, secret):
    monkeypatch.setattr(main.settings, "environment", environment)
    monkeypatch.setitem(main.settings.__dict__, "export_pass_secret", secret)
    with pytest.raises(RuntimeError, match="EXPORT_PASS_SECRET"):
        main._assert_export_pass_secret_configured()


def test_export_settings_not_checked_in_development(monkeypatch):
    monkeypatch.setattr(main.settings, "environment", "development")
    monkeypatch.setitem(main.settings.__dict__, "export_pass_secret", "")
    monkeypatch.setitem(main.settings.__dict__, "export_api_origin", "")
    main._assert_export_pass_secret_configured()
    main._assert_export_api_origin_configured()


def test_export_api_origin_must_be_https_on_staging(monkeypatch):
    monkeypatch.setattr(main.settings, "environment", "staging")
    monkeypatch.setitem(main.settings.__dict__, "export_api_origin", "http://api.example.test")
    with pytest.raises(RuntimeError, match="EXPORT_API_ORIGIN"):
        main._assert_export_api_origin_configured()


def test_export_requires_https_frontend_address_outside_development(monkeypatch):
    monkeypatch.setattr(main.settings, "environment", "staging")
    monkeypatch.setitem(main.settings.__dict__, "export_api_origin", "https://api.example.test")
    monkeypatch.setitem(main.settings.__dict__, "frontend_base_url", "https://app.example.test")
    monkeypatch.setitem(main.settings.__dict__, "frontend_base_url", "http://localhost:5173")
    with pytest.raises(RuntimeError, match="EXPORT_API_ORIGIN"):
        main._assert_export_api_origin_configured()
    monkeypatch.setitem(main.settings.__dict__, "frontend_base_url", "https://app.example.test")
    main._assert_export_api_origin_configured()
