import asyncio
import hashlib
import importlib.util
import inspect
import types
import multiprocessing
import sys
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from uuid import UUID

import pytest

from app.services.export import browser_pool as pool


class Clock:
    now = 1000.0

    def __call__(self):
        return self.now


class FakeSlotBackend:
    def __init__(self, clock):
        self.clock = clock
        self.slots = set()
        self.users = set()
        self.done = {}

    def try_claim_slot(self):
        for slot in range(2):
            if slot not in self.slots:
                self.slots.add(slot)
                return slot
        return None

    def release_slot(self, handle):
        self.slots.remove(handle)

    def try_lock_user(self, user_key):
        if user_key in self.users:
            return None
        self.users.add(user_key)
        return user_key

    def release_user(self, handle):
        self.users.remove(handle)

    def last_done_age(self, user_key):
        done = self.done.get(user_key)
        return None if done is None else self.clock() - done

    def mark_done(self, user_key):
        self.done[user_key] = self.clock()


class FakePage:
    def __init__(self):
        self.closed = False

    def is_closed(self):
        return self.closed

    async def close(self):
        self.closed = True


class FakeBrowser:
    def __init__(self):
        self.pages = []
        self.closed = False

    async def new_page(self, **kwargs):
        page = FakePage()
        self.pages.append(page)
        return page

    async def close(self):
        self.closed = True


@dataclass
class Rig:
    clock: Clock = field(default_factory=Clock)
    browsers: list = field(default_factory=list)

    def __post_init__(self):
        self.backend = FakeSlotBackend(self.clock)

    async def factory(self):
        browser = FakeBrowser()
        self.browsers.append(browser)
        return browser

    def run(self, scenario):
        async def run():
            pool.set_clock(self.clock)
            pool.set_slot_backend(self.backend)
            pool.set_browser_factory(self.factory)
            try:
                await scenario()
            finally:
                await pool.close_pool()
        asyncio.run(run())


@pytest.fixture
def rig(monkeypatch):
    for name in ("_clock", "_factory", "_backend"):
        monkeypatch.setattr(pool, name, getattr(pool, name))
    return Rig()


async def settle():
    await asyncio.sleep(0.3)


def test_one_browser_started_on_first_use(rig):
    async def scenario():
        assert rig.browsers == []
        async with pool.acquire_browser(UUID(int=1)) as first:
            async with pool.acquire_browser(UUID(int=2)) as second:
                assert len(rig.browsers) == 1
                assert await first.new_page() is not await second.new_page()
        assert all(page.closed for page in rig.browsers[0].pages)
    rig.run(scenario)


def test_two_at_once_third_waits(rig):
    async def scenario():
        entered = asyncio.Event()
        async def third():
            async with pool.acquire_browser(UUID(int=3)):
                entered.set()
        async with pool.acquire_browser(UUID(int=1)):
            async with pool.acquire_browser(UUID(int=2)):
                task = asyncio.create_task(third())
                await settle()
                assert not entered.is_set()
            await asyncio.wait_for(task, 2)
            assert entered.is_set()
    rig.run(scenario)


def test_third_waiter_gets_slots_full_after_the_wait_limit(rig):
    async def scenario():
        async with AsyncExitStack() as stack:
            await stack.enter_async_context(pool.acquire_browser(UUID(int=1)))
            await stack.enter_async_context(pool.acquire_browser(UUID(int=2)))
            task = asyncio.create_task(pool.acquire_browser(UUID(int=3)).__aenter__())
            await asyncio.sleep(0)
            rig.clock.now += 61
            with pytest.raises(pool.ExportBusyError) as exc:
                await asyncio.wait_for(task, 2)
            assert exc.value.reason == "slots_full"
            assert len(rig.backend.users) == 2
    rig.run(scenario)


def test_same_user_second_export_rejected(rig):
    async def scenario():
        async with pool.acquire_browser(UUID(int=1)):
            with pytest.raises(pool.ExportBusyError) as exc:
                async with pool.acquire_browser(UUID(int=1)):
                    pytest.fail("same user entered twice")
            assert exc.value.reason == "user_busy"
    rig.run(scenario)


def test_cooldown(rig):
    async def scenario():
        async with pool.acquire_browser(UUID(int=1)):
            pass
        rig.clock.now += 14
        with pytest.raises(pool.ExportBusyError) as exc:
            async with pool.acquire_browser(UUID(int=1)):
                pytest.fail("cooldown bypassed")
        assert exc.value.reason == "cooldown"
        assert not rig.backend.users
        rig.clock.now += 1
        async with pool.acquire_browser(UUID(int=1)):
            pass
    rig.run(scenario)


def test_browser_closes_after_quiet_period(rig):
    async def scenario():
        async with pool.acquire_browser(UUID(int=1)):
            pass
        await asyncio.sleep(0)
        rig.clock.now += 119
        await settle()
        assert not rig.browsers[0].closed
        async with pool.acquire_browser(UUID(int=2)):
            rig.clock.now += 2
            await settle()
            assert not rig.browsers[0].closed
        await asyncio.sleep(0)
        rig.clock.now += 119
        await settle()
        assert not rig.browsers[0].closed
        rig.clock.now += 1
        await settle()
        assert rig.browsers[0].closed
        async with pool.acquire_browser(UUID(int=3)):
            assert len(rig.browsers) == 2
    rig.run(scenario)


def test_failed_export_closes_its_page(rig):
    async def scenario():
        with pytest.raises(ValueError, match="invented failure"):
            async with pool.acquire_browser(UUID(int=1)) as browser:
                page = await browser.new_page()
                raise ValueError("invented failure")
        assert page.closed
        assert not rig.backend.slots and not rig.backend.users
        assert len(rig.backend.done) == 1
    rig.run(scenario)


def test_cancelled_export_releases_slot(rig):
    async def scenario():
        entered = asyncio.Event()
        async def export():
            async with pool.acquire_browser(UUID(int=1)) as browser:
                await browser.new_page()
                entered.set()
                await asyncio.Event().wait()
        task = asyncio.create_task(export())
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert rig.browsers[0].pages[0].closed
        assert not rig.backend.slots and not rig.backend.users
        with pytest.raises(pool.ExportBusyError) as exc:
            async with pool.acquire_browser(UUID(int=1)):
                pytest.fail("cancel did not start cooldown")
        assert exc.value.reason == "cooldown"
    rig.run(scenario)


def test_user_lock_released_so_next_user_can_run(rig):
    async def scenario():
        async with pool.acquire_browser(UUID(int=1)):
            pass
        assert not rig.backend.users
        async with pool.acquire_browser(UUID(int=2)):
            assert len(rig.backend.users) == 1
        assert not rig.backend.users and not rig.backend.slots
    rig.run(scenario)


def test_close_pool_closes_the_browser_and_is_safe_twice(rig):
    async def scenario():
        async with pool.acquire_browser(UUID(int=1)):
            pass
        await pool.close_pool()
        await pool.close_pool()
        assert rig.browsers[0].closed
    rig.run(scenario)


def test_old_pipeline_start_browser_untouched(monkeypatch):
    # Playwright is installed in the image but not on every developer machine: a stub keeps this test about our code.
    if importlib.util.find_spec("playwright") is None:
        fake = types.ModuleType("playwright.async_api")
        for name in ("Browser", "Playwright", "async_playwright"):
            setattr(fake, name, object)
        monkeypatch.setitem(sys.modules, "playwright", types.ModuleType("playwright"))
        monkeypatch.setitem(sys.modules, "playwright.async_api", fake)
        monkeypatch.delitem(sys.modules, "app.services.analytics.pdf_export", raising=False)
    from app.services.analytics import pdf_export
    for name in ("start_browser", "stop_browser", "get_shared_browser"):
        assert callable(getattr(pdf_export, name))
    assert "browser_pool" not in inspect.getsource(pdf_export)


def _claim_in_child(directory, connection):
    backend = pool.FlockSlotBackend(directory)
    handle = backend.try_claim_slot()
    connection.send(handle is not None)
    if handle is not None:
        connection.recv()
    connection.close()


@pytest.mark.skipif(sys.platform == "win32", reason="fcntl is Unix-only")
def test_flock_backend_limits_hold_across_processes(tmp_path):
    directory = tmp_path / "locks"
    backend = pool.FlockSlotBackend(directory)
    parent_slot = backend.try_claim_slot()
    assert parent_slot is not None
    context = multiprocessing.get_context("spawn")
    processes = []
    connections = []
    try:
        for expected in (True, False):
            parent, child = context.Pipe()
            process = context.Process(target=_claim_in_child, args=(directory, child))
            process.start()
            child.close()
            processes.append(process)
            connections.append(parent)
            assert parent.poll(10), "child did not report its claim"
            assert parent.recv() is expected
        processes[1].join(10)
        assert processes[1].exitcode == 0
        assert backend.try_claim_slot() is None
        processes[0].kill()
        processes[0].join(10)
        recovered = backend.try_claim_slot()
        assert recovered is not None
        backend.release_slot(recovered)
        user_key = hashlib.sha256(UUID(int=1).bytes).hexdigest()[:16]
        user = backend.try_lock_user(user_key)
        assert user is not None
        assert pool.FlockSlotBackend(directory).try_lock_user(user_key) is None
        backend.mark_done(user_key)
        assert 0 <= backend.last_done_age(user_key) < 15
        backend.release_user(user)
        assert directory.stat().st_mode & 0o777 == 0o700
    finally:
        backend.release_slot(parent_slot)
        for process in processes:
            if process.is_alive():
                process.kill()
            process.join(10)
        for connection in connections:
            connection.close()
