import time
from unittest.mock import AsyncMock, patch

import pytest

from app.services.analytics import pdf_export
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


def test_render_analytics_pdf_navigates_and_returns_bytes():
    fake_page = AsyncMock()
    fake_page.pdf = AsyncMock(return_value=b"%PDF-1.4 fake bytes")
    fake_browser = AsyncMock()
    fake_browser.new_page = AsyncMock(return_value=fake_page)

    with patch.object(pdf_export, "get_shared_browser", return_value=fake_browser):
        import asyncio

        result = asyncio.run(pdf_export.render_analytics_pdf("tok-123"))

    assert result == b"%PDF-1.4 fake bytes"
    fake_page.goto.assert_awaited_once_with(
        "http://localhost:5173/print/analytics?token=tok-123"
    )
    fake_page.wait_for_selector.assert_awaited_once_with(
        '[data-print-ready="true"]', timeout=15000
    )
    fake_page.close.assert_awaited_once()
