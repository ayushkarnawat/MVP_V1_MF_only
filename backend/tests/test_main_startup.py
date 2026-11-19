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
