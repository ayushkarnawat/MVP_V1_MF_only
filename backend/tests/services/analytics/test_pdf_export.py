import time

import pytest

from app.services.analytics.pdf_export import (
    _export_payloads,
    consume_export_payload,
    get_shared_browser,
    store_export_payload,
)


def test_store_then_consume_returns_payload_once():
    _export_payloads.clear()
    token = store_export_payload({"scope": "aggregate"})
    assert consume_export_payload(token) == {"scope": "aggregate"}
    assert consume_export_payload(token) is None


def test_consume_unknown_token_returns_none():
    _export_payloads.clear()
    assert consume_export_payload("does-not-exist") is None


def test_consume_expired_token_returns_none(monkeypatch):
    _export_payloads.clear()
    token = store_export_payload({"scope": "aggregate"})
    # push the stored expiry into the past without waiting out the real TTL
    payload, _expires_at, used = _export_payloads[token]
    _export_payloads[token] = (payload, time.monotonic() - 1, used)
    assert consume_export_payload(token) is None


def test_get_shared_browser_raises_before_started():
    with pytest.raises(RuntimeError, match="not started"):
        get_shared_browser()
