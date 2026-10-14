"""Explicit affected-test plugin: real HTTP transports are never permitted."""
import httpx
import pytest


@pytest.fixture(autouse=True)
def block_live_http(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("Live HTTP is forbidden in this affected-test run")
    async def async_blocked(*args, **kwargs):
        blocked()
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", blocked)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", async_blocked)
