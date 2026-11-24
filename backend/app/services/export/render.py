import asyncio
import base64
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from contextlib import suppress
from typing import TYPE_CHECKING, Awaitable, Callable, Literal, TypedDict, cast
from urllib.parse import quote, urlsplit

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.config import settings
from app.models.enums import Relationship
from app.models.user import HouseholdMember, User
from app.services.export import jobs
from app.services.export.browser_pool import ExportBusyError, _finish_task, acquire_browser
from app.services.export.pass_token import issue_export_pass
from app.services.export.pdf_pages import extract_page_texts, section_pages

if TYPE_CHECKING:
    from playwright.async_api import Page, Route

MAX_PDF_BYTES = 40 * 1024 * 1024
READY_WAIT_SECONDS = 90
SECOND_PASS_TIMEOUT_SECONDS = 10
_logger = logging.getLogger(__name__)
_clock: Callable[[], float] = time.monotonic


class PrintMember(TypedDict):
    id: str
    name: str


class PrintMeta(TypedDict):
    holderName: str | None
    scopeName: str
    memberCount: int


class ExportOptions(BaseModel):
    scope: str
    section_ids: list[str] = Field(min_length=1, max_length=40)
    cover: bool = True
    data_dates: bool = True
    show_folios: Literal["full", "masked", "none"] = "full"

    @field_validator("section_ids")
    @classmethod
    def valid_sections(cls, ids: list[str]) -> list[str]:
        import re
        if any(re.fullmatch(r"[a-z0-9][a-z0-9-]{0,59}", section) is None for section in ids):
            raise ValueError("Invalid section ids.")
        return list(dict.fromkeys(ids))


def build_print_meta(db: Session, user: User, scope: str) -> tuple[list[PrintMember], PrintMeta]:
    rows = db.query(HouseholdMember).filter(HouseholdMember.user_id == user.id).order_by(HouseholdMember.created_at, HouseholdMember.id).all()
    holder = next((row.name for row in rows if row.relationship == Relationship.SELF), None)
    selected = rows if scope == "family" else [row for row in rows if str(row.id) == scope]
    if scope != "family" and not selected:
        raise ValueError("Not allowed.")
    members: list[PrintMember] = [{"id": str(row.id), "name": row.name} for row in selected]
    # scopeName is never empty (the print page rejects an empty one): a family report with no known holder says "Your family",
    # the cover's own rule for a missing name; with a holder the front end writes "<holder> and family" from holderName.
    meta: PrintMeta = {"holderName": holder, "scopeName": (holder or "Your family") if scope == "family" else selected[0].name,
                       "memberCount": len(selected)}
    return members, meta


def origin(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
        raise ValueError("Invalid export origin.")
    port = parts.port
    host = parts.hostname.lower()
    if ":" in host:
        host = "[" + host + "]"
    suffix = "" if port is None or (parts.scheme, port) in (("http", 80), ("https", 443)) else ":" + str(port)
    return parts.scheme + "://" + host + suffix


def network_guard(frontend: str, api: str, proof: str) -> tuple[Callable[["Route"], Awaitable[None]], list[int]]:
    blocked = [0]

    async def handler(route: "Route") -> None:
        request = route.request
        headers = {name.lower(): value for name, value in request.headers.items() if name.lower() != "x-export-proof"}
        parts = urlsplit(request.url)
        if parts.scheme in ("data", "blob"):
            await route.continue_(headers=headers)
            return
        try:
            target = origin(request.url)
        except ValueError:
            target = ""
        if target not in (frontend, api):
            blocked[0] += 1
            await route.abort()
            return
        # A permitted API fetch must not turn into a top-level navigation.
        if hasattr(request, "is_navigation_request") and request.is_navigation_request():
            if request.frame.parent_frame is None and target != frontend:
                blocked[0] += 1
                await route.abort()
                return
        if target == api:
            headers["x-export-proof"] = proof
        # Route.continue_ can forward custom headers through HTTP redirects.
        # Fetch without following redirects so neither proof nor network policy escapes.
        try:
            response = await route.fetch(headers=headers, max_redirects=0)
            if 300 <= response.status < 400:
                blocked[0] += 1
                await route.abort()
                return
            await route.fulfill(response=response)
        except Exception:
            # Playwright request exceptions can include headers; never let them escape.
            blocked[0] += 1
            with suppress(Exception):
                await route.abort()

    return handler, blocked


class _PrintError(Exception):
    pass


class _Cancelled(Exception):
    pass


def _check(job_id: str, navigated: asyncio.Event) -> None:
    job = jobs.read_job(job_id)
    if job is None or job["cancel"] or job["status"] == "cancelled":
        raise _Cancelled()
    if job["status"] != "preparing":
        raise _PrintError()
    if navigated.is_set():
        raise _PrintError()


async def _second_pdf(page: "Page", first_pdf: bytes, section_ids: list[str],
                      job_id: str, navigated: asyncio.Event) -> bytes | None:
    texts = extract_page_texts(first_pdf)
    pages = section_pages(texts)
    if not (set(section_ids) | {"notes"}).issubset(pages):
        return None
    if not await page.evaluate("typeof window.__unifolioSetPrintPages === 'function'"):
        return None
    _check(job_id, navigated)
    await page.evaluate("pages => window.__unifolioSetPrintPages(pages)", pages)
    _check(job_id, navigated)
    second_pdf = await page.pdf(format="A4", print_background=True, prefer_css_page_size=True)
    if len(extract_page_texts(second_pdf)) != len(texts):
        return None
    return second_pdf


async def run_export(job_id: str, user_id: uuid.UUID, options: ExportOptions,
                     members: list[PrintMember], meta: PrintMeta) -> None:
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError

    started = _clock()
    page = None
    context = None
    blocked = [0]
    size = 0
    two_pass = False
    scope_kind = "family" if options.scope == "family" else "member"
    try:
        async with acquire_browser(user_id) as browser:
            try:
                frontend = origin(settings.frontend_base_url)
                api = origin(settings.export_api_origin)
                if frontend == api:
                    raise _PrintError()
                issued = issue_export_pass(user_id, options.scope, job_id, datetime.now(timezone.utc))
                # Playwright Browser.new_page creates a fresh context with these options.
                page = cast("Page", await browser.new_page(
                    viewport={"width": 680, "height": 1000}, color_scheme="light", reduced_motion="reduce",
                    java_script_enabled=True, accept_downloads=False, locale="en-IN", service_workers="block",
                ))
                context = page.context
                handler, blocked = network_guard(frontend, api, issued.proof)
                await context.route("**/*", handler)
                navigated = asyncio.Event()

                def on_navigation(frame) -> None:
                    if frame.url == "about:blank":
                        return
                    try:
                        if origin(frame.url) != frontend:
                            navigated.set()
                    except ValueError:
                        navigated.set()

                page.on("framenavigated", on_navigation)
                _check(job_id, navigated)
                fragment = {"scope": options.scope, "sectionIds": options.section_ids, "cover": options.cover,
                            "dataDates": options.data_dates, "showFolios": options.show_folios, "jobId": job_id,
                            "members": members, "meta": meta}
                encoded = base64.urlsafe_b64encode(json.dumps(fragment, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).rstrip(b"=").decode("ascii")
                url = settings.frontend_base_url.rstrip("/") + "/print/report#pass=" + quote(issued.token, safe="") + "&opts=" + encoded
                jobs.update_job(job_id, stage="collecting")
                await page.goto(url, timeout=30000)
                _check(job_id, navigated)
                jobs.update_job(job_id, stage="building")
                wait = asyncio.create_task(page.wait_for_function(
                    "() => document.documentElement.dataset.printError === 'true' ? 'error' : (document.documentElement.dataset.printReady === 'true' ? 'ready' : false)",
                    timeout=READY_WAIT_SECONDS * 1000,
                ))
                try:
                    deadline = _clock() + READY_WAIT_SECONDS
                    while not wait.done():
                        _check(job_id, navigated)
                        remaining = deadline - _clock()
                        if remaining <= 0:
                            raise TimeoutError()
                        await asyncio.wait({wait}, timeout=min(1, remaining))
                    marker = await wait
                    if await marker.json_value() != "ready":
                        raise _PrintError()
                finally:
                    if not wait.done():
                        wait.cancel()
                    await asyncio.gather(wait, return_exceptions=True)
                _check(job_id, navigated)
                jobs.update_job(job_id, stage="finishing")
                await page.emulate_media(media="print")
                data = await page.pdf(format="A4", print_background=True, prefer_css_page_size=True)
                _check(job_id, navigated)
                if options.cover:
                    try:
                        candidate = await asyncio.wait_for(
                            _second_pdf(page, data, options.section_ids, job_id, navigated),
                            timeout=SECOND_PASS_TIMEOUT_SECONDS,
                        )
                    except Exception:
                        # Contents are optional: never expose parser or browser diagnostics.
                        candidate = None
                    _check(job_id, navigated)
                    if candidate is not None:
                        data = candidate
                        two_pass = True
                size = len(data)
                if size > MAX_PDF_BYTES:
                    jobs.update_job(job_id, status="failed", error_code="too_large")
                else:
                    jobs.store_pdf(job_id, data)
                    jobs.update_job(job_id, status="ready", pdf_bytes=size)
            finally:
                async def cleanup() -> None:
                    try:
                        if page is not None:
                            await page.close()
                    finally:
                        if context is not None:
                            await context.close()
                await _finish_task(asyncio.create_task(cleanup()))
    except ExportBusyError:
        jobs.update_job(job_id, status="failed", error_code="busy")
    except (TimeoutError, PlaywrightTimeoutError):
        jobs.update_job(job_id, status="failed", error_code="timeout")
    except _Cancelled:
        jobs.request_cancel(job_id)
    except asyncio.CancelledError:
        jobs.request_cancel(job_id)
        raise
    except _PrintError:
        jobs.update_job(job_id, status="failed", error_code="print_error")
    except Exception:
        jobs.update_job(job_id, status="failed", error_code="internal")
    finally:
        job = jobs.read_job(job_id)
        status = job["status"] if job else "failed"
        _logger.info("export finished: status=%s scope_kind=%s sections=%d duration_ms=%d pdf_bytes=%d blocked_requests=%d two_pass=%s",
                     status, scope_kind, len(options.section_ids), int((_clock() - started) * 1000), size, blocked[0], "yes" if two_pass else "no")
