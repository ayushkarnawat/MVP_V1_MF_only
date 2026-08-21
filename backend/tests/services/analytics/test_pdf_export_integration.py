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
