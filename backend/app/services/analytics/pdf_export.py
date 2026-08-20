import secrets
import time
from typing import Any

from playwright.async_api import Browser, Playwright, async_playwright

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


async def start_browser() -> None:
    global _playwright, _browser
    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.launch()


async def stop_browser() -> None:
    global _playwright, _browser
    if _browser is not None:
        await _browser.close()
        _browser = None
    if _playwright is not None:
        await _playwright.stop()
        _playwright = None


def get_shared_browser() -> Browser:
    if _browser is None:
        raise RuntimeError("Playwright browser not started")
    return _browser
