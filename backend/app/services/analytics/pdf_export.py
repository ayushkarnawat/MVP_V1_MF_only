import asyncio
import secrets
import time
from contextlib import suppress
from typing import Any

from playwright.async_api import Browser, Playwright, async_playwright

from app.config import settings

_TOKEN_TTL_SECONDS = 120

# ponytail: in-process dict, not shared across worker processes and lost on
# restart — fine for a single-Uvicorn-process deployment (current state);
# move to Redis/similar if/when this backend ever runs multiple workers.
_export_payloads: dict[str, tuple[dict[str, Any], float, bool]] = {}


def store_export_payload(payload: dict[str, Any]) -> str:
    token = secrets.token_urlsafe(32)
    _export_payloads[token] = (payload, time.monotonic() + _TOKEN_TTL_SECONDS, False)
    return token


def consume_export_payload(token: str) -> dict[str, Any] | None:
    entry = _export_payloads.pop(token, None)
    if entry is None:
        return None
    payload, expires_at, _used = entry
    if time.monotonic() > expires_at:
        return None
    return payload


_playwright: Playwright | None = None
_browser: Browser | None = None
_browser_lock = asyncio.Lock()


async def start_browser() -> None:
    await get_shared_browser()


async def _stop_browser_unlocked() -> None:
    global _playwright, _browser
    browser, playwright = _browser, _playwright
    _browser, _playwright = None, None
    try:
        if browser is not None:
            await browser.close()
    finally:
        if playwright is not None:
            await playwright.stop()


async def stop_browser() -> None:
    async with _browser_lock:
        await _stop_browser_unlocked()


async def get_shared_browser() -> Browser:
    global _playwright, _browser
    async with _browser_lock:
        if _browser is not None and _browser.is_connected():
            return _browser
        with suppress(Exception):
            await _stop_browser_unlocked()
        playwright = await async_playwright().start()
        try:
            browser = await playwright.chromium.launch()
        except BaseException:
            with suppress(Exception):
                await playwright.stop()
            raise
        _playwright, _browser = playwright, browser
        return browser


async def render_analytics_pdf(token: str) -> bytes:
    browser = await get_shared_browser()
    page = await browser.new_page()
    try:
        await page.goto(f"{settings.frontend_base_url}/print/analytics?token={token}")
        marker = await page.wait_for_selector(
            '[data-print-ready="true"], [data-print-error="true"]', timeout=15000
        )
        if marker is None or await marker.get_attribute("data-print-error") == "true":
            raise RuntimeError("Analytics print page failed to load export data")
        return await page.pdf(format="A4", print_background=True)
    finally:
        await page.close()
