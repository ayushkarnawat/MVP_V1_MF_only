import asyncio

import httpx
import pytest

from app.config import settings
from app.services.analytics.pdf_export import (
    render_analytics_pdf,
    start_browser,
    stop_browser,
    store_export_payload,
)

pytestmark = pytest.mark.playwright


@pytest.fixture()
def frontend_reachable():
    """Skip test if frontend dev server is not running."""
    try:
        httpx.get(settings.frontend_base_url, timeout=1.0)
    except (httpx.ConnectError, httpx.TimeoutException):
        pytest.skip(
            f"Frontend dev server not reachable at {settings.frontend_base_url} — "
            "start `npm run dev` to exercise this test"
        )


def test_render_analytics_pdf_produces_real_pdf_bytes(frontend_reachable):
    """Requires `playwright install chromium` and the Vite dev server running
    at settings.frontend_base_url (see Task 8's /print/analytics route)."""

    async def run():
        await start_browser()
        try:
            token = store_export_payload(
                {
                    "scope": "aggregate",
                    "scopeName": "Test Household",
                    "allocation": None,
                    "ter": None,
                    "terComparison": None,
                    "ranking": None,
                    "scoreSummary": None,
                    "portfolioBenchmark": None,
                    "fundBenchmark": None,
                }
            )
            return await render_analytics_pdf(token)
        finally:
            await stop_browser()

    pdf_bytes = asyncio.run(run())
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 500


def test_two_concurrent_first_requests_launch_one_browser(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, Mock
    from app.services.analytics import pdf_export

    browser = SimpleNamespace(is_connected=Mock(return_value=True), close=AsyncMock())
    replacement = SimpleNamespace(is_connected=lambda: True, close=AsyncMock())
    launches = []

    async def launch():
        launches.append(True)
        await asyncio.sleep(0)
        return browser if len(launches) == 1 else replacement

    drivers = []

    async def start():
        driver = SimpleNamespace(chromium=SimpleNamespace(launch=launch), stop=AsyncMock())
        drivers.append(driver)
        return driver

    monkeypatch.setattr(pdf_export, "_browser", None)
    monkeypatch.setattr(pdf_export, "_playwright", None)
    monkeypatch.setattr(pdf_export, "_browser_lock", asyncio.Lock(), raising=False)
    monkeypatch.setattr(pdf_export, "async_playwright", lambda: SimpleNamespace(start=start))

    async def run():
        try:
            first, second = await asyncio.gather(pdf_export.get_shared_browser(), pdf_export.get_shared_browser())
            assert first is second is browser and len(launches) == 1
            assert await pdf_export.get_shared_browser() is browser
            await pdf_export.start_browser()
            assert len(launches) == 1
            browser.is_connected.return_value = False
            assert await pdf_export.get_shared_browser() is replacement
            assert len(launches) == 2
            browser.close.assert_awaited_once()
            drivers[0].stop.assert_awaited_once()
        finally:
            await pdf_export.stop_browser()
        replacement.close.assert_awaited_once()
        drivers[1].stop.assert_awaited_once()

    asyncio.run(run())


def test_shutdown_is_a_no_op_when_the_browser_never_started(monkeypatch):
    from unittest.mock import Mock
    from app.services.analytics import pdf_export

    launcher = Mock(side_effect=AssertionError("shutdown must not start Playwright"))
    monkeypatch.setattr(pdf_export, "_browser", None)
    monkeypatch.setattr(pdf_export, "_playwright", None)
    monkeypatch.setattr(pdf_export, "_browser_lock", asyncio.Lock(), raising=False)
    monkeypatch.setattr(pdf_export, "async_playwright", launcher)

    async def run():
        await pdf_export.stop_browser()
        await pdf_export.stop_browser()

    asyncio.run(run())
    launcher.assert_not_called()
    assert pdf_export._browser is None and pdf_export._playwright is None
