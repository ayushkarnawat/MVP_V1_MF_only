"""The per-address guard under simultaneous requests, on real Postgres (separate connections, real transactions).

Independent review of B-2, finding 2 (owner decision 18 Nov 2026: fix it completely before it is deployed, not at the production
gate). Every thread sleeps right after it has counted, which is exactly the window the old count-then-write left open: without the
per-address lock, all of them count before any of them writes.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

import pytest

from app.config import settings
from app.models.auth import AuthRequestGuard
from app.services.auth import request_guard as guard
from tests.functional_postgres.test_head_change_swap import pg_session_factory  # noqa: F401

CLIENT_ADDRESS = "192.0.2.77"
THREADS = 12


@pytest.fixture(autouse=True)
def guard_settings(monkeypatch):
    monkeypatch.setattr(settings, "auth_guard_enabled", True)
    monkeypatch.setattr(settings, "auth_guard_secret", "synthetic-test-key")
    monkeypatch.setattr(settings, "auth_guard_window_minutes", 10)
    monkeypatch.setattr(settings, "auth_guard_check_limit", 4)
    monkeypatch.setattr(settings, "auth_guard_code_limit", 100)


def _slow_count(monkeypatch):
    """Widen the gap between 'counted' and 'written' so an unprotected check cannot get lucky."""
    original = guard._limit_wait

    def slow(*args, **kwargs):
        result = original(*args, **kwargs)
        time.sleep(0.15)
        return result

    monkeypatch.setattr(guard, "_limit_wait", slow)


def _run(threads_work):
    results: list[str] = []
    lock = threading.Lock()

    def wrapped(work):
        outcome = work()
        with lock:
            results.append(outcome)

    workers = [threading.Thread(target=wrapped, args=(work,)) for work in threads_work]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=60)
    assert all(not worker.is_alive() for worker in workers), "a request hung"
    return results


def test_simultaneous_distinct_addresses_never_pass_the_check_limit(pg_session_factory, monkeypatch):
    _slow_count(monkeypatch)

    def attempt(number):
        def work():
            db = pg_session_factory()
            try:
                guard.begin(
                    db, client_ip=CLIENT_ADDRESS, identifier=f"user{number}@example.com", channel="email", route="test",
                )
                return "admitted"
            except guard.RequestGuardLimited:
                return "limited"
            finally:
                db.close()
        return work

    results = _run([attempt(number) for number in range(THREADS)])

    assert results.count("admitted") == 4
    assert results.count("limited") == THREADS - 4
    check = pg_session_factory()
    try:
        assert check.query(AuthRequestGuard).count() == 4
    finally:
        check.close()


def test_simultaneous_repeats_of_one_identifier_leave_one_row(pg_session_factory, monkeypatch):
    _slow_count(monkeypatch)

    def attempt():
        db = pg_session_factory()
        try:
            guard.begin(db, client_ip=CLIENT_ADDRESS, identifier="same@example.com", channel="email", route="test")
            return "admitted"
        finally:
            db.close()

    results = _run([attempt] * THREADS)

    assert results.count("admitted") == THREADS
    check = pg_session_factory()
    try:
        assert check.query(AuthRequestGuard).count() == 1
    finally:
        check.close()


def test_simultaneous_code_requests_never_pass_the_code_limit(pg_session_factory, monkeypatch):
    monkeypatch.setattr(settings, "auth_guard_check_limit", 100)
    monkeypatch.setattr(settings, "auth_guard_code_limit", 3)
    _slow_count(monkeypatch)

    def attempt(number):
        def work():
            db = pg_session_factory()
            try:
                ticket = guard.begin(
                    db, client_ip=CLIENT_ADDRESS, identifier=f"user{number}@example.com", channel="email", route="test",
                )
                guard.before_code(db, ticket)
                time.sleep(0.2)  # the route sends the code here; the outcome is recorded only afterwards
                guard.record_outcome(db, ticket, "code_sent")
                return "code"
            except guard.RequestGuardLimited:
                return "limited"
            finally:
                db.close()
        return work

    results = _run([attempt(number) for number in range(THREADS)])

    assert results.count("code") == 3
    assert results.count("limited") == THREADS - 3


def test_the_lock_is_per_address_so_other_addresses_are_not_slowed_or_counted(pg_session_factory, monkeypatch):
    _slow_count(monkeypatch)
    started = time.monotonic()

    def attempt(number):
        def work():
            db = pg_session_factory()
            try:
                guard.begin(
                    db, client_ip=f"192.0.2.{100 + number}", identifier="one@example.com", channel="email", route="test",
                )
                return "admitted"
            finally:
                db.close()
        return work

    results = _run([attempt(number) for number in range(6)])

    assert results == ["admitted"] * 6
    assert time.monotonic() - started < 0.15 * 6  # six different addresses ran side by side, not one after another


def test_a_stuck_holder_makes_the_guard_fail_open_instead_of_hanging(pg_session_factory, monkeypatch):
    monkeypatch.setattr(guard, "LOCK_WAIT", "300ms")
    holder = pg_session_factory()
    ticket_hash = guard._digest("synthetic-test-key", "ip", CLIENT_ADDRESS)
    guard._lock_address(holder, ticket_hash)  # held until this session's transaction ends
    waiter = pg_session_factory()
    try:
        started = time.monotonic()
        ticket = guard.begin(waiter, client_ip=CLIENT_ADDRESS, identifier="late@example.com", channel="email", route="test")
        assert ticket is None  # failed open, the request carries on unguarded
        assert time.monotonic() - started < 5
    finally:
        waiter.close()
        holder.rollback()
        holder.close()
    assert datetime.now(timezone.utc)  # keep the import used
