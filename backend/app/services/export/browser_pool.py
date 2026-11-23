import asyncio
import hashlib
import os
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import BinaryIO, Literal, Protocol, TypeVar, cast
from uuid import UUID

from app.config import settings

MAX_CONCURRENT_EXPORTS = 2
USER_COOLDOWN_SECONDS = 15
IDLE_CLOSE_SECONDS = 120
SLOT_WAIT_SECONDS = 60


class ExportBusyError(Exception):
    def __init__(self, reason: Literal["user_busy", "cooldown", "slots_full"]):
        self.reason = reason
        super().__init__(reason)


class SlotBackend(Protocol):
    def try_claim_slot(self) -> object | None: ...
    def release_slot(self, handle: object) -> None: ...
    def try_lock_user(self, user_key: str) -> object | None: ...
    def release_user(self, handle: object) -> None: ...
    def last_done_age(self, user_key: str) -> float | None: ...
    def mark_done(self, user_key: str) -> None: ...


class FlockSlotBackend:
    def __init__(self, directory: str | Path | None = None):
        try:
            import fcntl
        except ImportError as exc:
            raise RuntimeError("Export file locks require fcntl") from exc
        self._flock = fcntl.flock
        self._exclusive = fcntl.LOCK_EX | fcntl.LOCK_NB
        self.directory = Path(directory if directory is not None else settings.export_lock_dir)
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)

    def _claim(self, name: str) -> BinaryIO | None:
        descriptor = os.open(self.directory / name, os.O_CREAT | os.O_RDWR, 0o600)
        handle = os.fdopen(descriptor, "r+b")
        try:
            self._flock(handle.fileno(), self._exclusive)
        except BlockingIOError:
            handle.close()
            return None
        except BaseException:
            handle.close()
            raise
        return handle

    def try_claim_slot(self) -> object | None:
        for slot in range(MAX_CONCURRENT_EXPORTS):
            handle = self._claim(f"slot-{slot}")
            if handle is not None:
                return handle
        return None

    def release_slot(self, handle: object) -> None:
        cast(BinaryIO, handle).close()

    def try_lock_user(self, user_key: str) -> object | None:
        return self._claim(f"user-{user_key}.lock")

    def release_user(self, handle: object) -> None:
        cast(BinaryIO, handle).close()

    def last_done_age(self, user_key: str) -> float | None:
        try:
            return _clock() - (self.directory / f"user-{user_key}.done").stat().st_mtime
        except FileNotFoundError:
            return None

    def mark_done(self, user_key: str) -> None:
        path = self.directory / f"user-{user_key}.done"
        descriptor = os.open(path, os.O_CREAT | os.O_WRONLY, 0o600)
        os.close(descriptor)
        now = _clock()
        os.utime(path, (now, now))


class Page(Protocol):
    def is_closed(self) -> bool: ...
    async def close(self) -> None: ...


class Browser(Protocol):
    async def new_page(self, **kwargs: object) -> Page: ...
    async def close(self) -> None: ...


async def _default_browser_factory() -> Browser:
    from playwright.async_api import async_playwright

    playwright = await async_playwright().start()
    try:
        browser = await playwright.chromium.launch()
    except BaseException:
        await playwright.stop()
        raise

    class ManagedBrowser:
        async def new_page(self, **kwargs: object) -> Page:
            return await browser.new_page(**kwargs)

        async def close(self) -> None:
            try:
                await browser.close()
            finally:
                await playwright.stop()

    return ManagedBrowser()


_clock: Callable[[], float] = time.time
_factory: Callable[[], Awaitable[Browser]] = _default_browser_factory
_backend: SlotBackend | None = None
_browser: Browser | None = None
_browser_lock = asyncio.Lock()
_active = 0
_idle_task: asyncio.Task[None] | None = None
_T = TypeVar("_T")


def set_browser_factory(factory: Callable[[], Awaitable[Browser]]) -> None:
    global _factory
    _factory = factory


def set_slot_backend(backend: SlotBackend) -> None:
    global _backend
    _backend = backend


def set_clock(fn: Callable[[], float]) -> None:
    global _clock
    _clock = fn


async def _finish_task(task: asyncio.Task[_T]) -> _T:
    # A second cancellation must not interrupt page cleanup or release locks early.
    cancelled = False
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            cancelled = True
    result = task.result()
    if cancelled:
        raise asyncio.CancelledError
    return result


class PooledBrowser:
    def __init__(self, browser: Browser):
        self._browser = browser
        self._pages: list[Page] = []

    async def new_page(self, **kwargs: object) -> Page:
        async def create() -> Page:
            page = await self._browser.new_page(**kwargs)
            self._pages.append(page)
            return page

        task = asyncio.create_task(create())
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            await _finish_task(task)
            raise

    async def _close_pages(self) -> None:
        await asyncio.gather(
            *(page.close() for page in self._pages if not page.is_closed()),
            return_exceptions=True,
        )


def _cancel_idle() -> asyncio.Task[None] | None:
    global _idle_task
    task, _idle_task = _idle_task, None
    if task is not None:
        task.cancel()
    return task


async def _close_browser() -> None:
    global _browser
    browser, _browser = _browser, None
    if browser is not None:
        await browser.close()


async def _close_after_idle(deadline: float) -> None:
    global _idle_task
    try:
        while _clock() < deadline:
            await asyncio.sleep(min(0.25, deadline - _clock()))
        async with _browser_lock:
            if _active == 0:
                await _close_browser()
    finally:
        if _idle_task is asyncio.current_task():
            _idle_task = None


async def _release(
    backend: SlotBackend,
    user_key: str,
    user: object,
    slot: object | None,
    pooled: PooledBrowser | None,
) -> None:
    global _active, _idle_task
    try:
        if pooled is not None:
            await pooled._close_pages()
    finally:
        try:
            if slot is not None:
                backend.release_slot(slot)
        finally:
            try:
                backend.mark_done(user_key)
            finally:
                backend.release_user(user)
                if pooled is not None:
                    async with _browser_lock:
                        _active -= 1
                        if _active == 0 and _browser is not None:
                            _idle_task = asyncio.create_task(
                                _close_after_idle(_clock() + IDLE_CLOSE_SECONDS)
                            )


@asynccontextmanager
async def acquire_browser(user_id: UUID) -> AsyncIterator[PooledBrowser]:
    global _backend, _browser, _active
    if _backend is None:
        _backend = FlockSlotBackend()
    backend = _backend
    user_key = hashlib.sha256(user_id.bytes).hexdigest()[:16]
    user = backend.try_lock_user(user_key)
    if user is None:
        raise ExportBusyError("user_busy")
    try:
        age = backend.last_done_age(user_key)
        if age is not None and age < USER_COOLDOWN_SECONDS:
            raise ExportBusyError("cooldown")
    except BaseException:
        backend.release_user(user)
        raise

    slot = None
    pooled = None
    try:
        deadline = _clock() + SLOT_WAIT_SECONDS
        while True:
            slot = backend.try_claim_slot()
            if slot is not None:
                break
            if _clock() >= deadline:
                raise ExportBusyError("slots_full")
            await asyncio.sleep(0.25)
        async with _browser_lock:
            _cancel_idle()
            if _browser is None:
                _browser = await _factory()
            pooled = PooledBrowser(_browser)
            _active += 1
        yield pooled
    finally:
        await _finish_task(asyncio.create_task(_release(backend, user_key, user, slot, pooled)))


async def close_pool() -> None:
    async with _browser_lock:
        task = _cancel_idle()
        await _close_browser()
    if task is not None:
        with suppress(asyncio.CancelledError):
            await task
