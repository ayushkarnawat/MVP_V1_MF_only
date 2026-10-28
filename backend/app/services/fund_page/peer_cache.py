from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from datetime import date, datetime
from decimal import Decimal
from typing import Generic, TypeVar
from zoneinfo import ZoneInfo


T = TypeVar("T")

# Keys carry the IST request date, so the stored-day check must use IST too.
_IST = ZoneInfo("Asia/Kolkata")


class PeerCache(Generic[T]):
    def __init__(
        self,
        clock: Callable[[], int | Decimal] = time.monotonic,
        day: Callable[[], date] = lambda: datetime.now(_IST).date(),
    ) -> None:
        self._clock = clock
        self._day = day
        self._entries: dict[tuple, tuple[int | Decimal, date, T]] = {}
        self._locks: dict[tuple, asyncio.Lock] = {}

    def clear(self) -> None:
        self._entries.clear()
        self._locks.clear()

    def _fresh(self, key: tuple, ttl_seconds: int) -> T | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        stored_at, stored_day, value = entry
        if stored_day != self._day() or self._clock() - stored_at > ttl_seconds:
            self._entries.pop(key, None)
            return None
        return value

    async def get_or_compute(
        self,
        key: tuple,
        compute: Callable[[], Awaitable[T]],
        ttl_seconds: int = 21600,
    ) -> T:
        cached = self._fresh(key, ttl_seconds)
        if cached is not None:
            return cached
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._fresh(key, ttl_seconds)
            if cached is not None:
                return cached
            value = await compute()
            self._entries[key] = (self._clock(), self._day(), value)
            return value


peer_cache: PeerCache = PeerCache()
