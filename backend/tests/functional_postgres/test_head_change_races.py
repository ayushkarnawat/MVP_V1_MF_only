"""Run 5 review fixes that only show on real Postgres: a cancel or an expiry must not overwrite a
swap that is completing at the same moment."""

from __future__ import annotations

import threading

from app.models.auth import HeadChangeRequest
from app.models.user import User
from app.services.auth.head_change import HeadChangeError
from tests.functional_postgres.test_head_change_swap import pg_session_factory  # noqa: F401
from tests.services.auth.test_head_change_swap import _evidence, _household, _ready_request


def _swap_paused_inside_its_lock(pg_session_factory, monkeypatch, suffix):
    from app.services.auth import head_change

    setup = pg_session_factory()
    household = _household(setup, suffix=suffix)
    request_id = _ready_request(setup, household)
    user_id = household.user.id
    setup.close()

    original = head_change.record_consent
    inside = threading.Event()
    release = threading.Event()
    guard = threading.Lock()
    state = {"first": True}

    def paused(*args, **kwargs):
        with guard:
            should_pause = state["first"]
            state["first"] = False
        if should_pause:
            inside.set()
            assert release.wait(timeout=15)
        return original(*args, **kwargs)

    monkeypatch.setattr(head_change, "record_consent", paused)
    outcome: dict[str, object] = {}

    def run_swap():
        db = pg_session_factory()
        try:
            user = db.get(User, user_id)
            outcome["swap"] = head_change.complete_head_change(db, user, request_id, _evidence())
        finally:
            db.close()

    thread = threading.Thread(target=run_swap, daemon=True)
    thread.start()
    assert inside.wait(timeout=15)  # the swap holds the account and request locks
    return head_change, user_id, request_id, release, thread, outcome


def test_a_cancel_waiting_behind_the_swap_does_not_overwrite_completed(
    pg_session_factory, monkeypatch
):
    head_change, user_id, request_id, release, swap_thread, outcome = _swap_paused_inside_its_lock(
        pg_session_factory, monkeypatch, "cx"
    )
    result: dict[str, object] = {}

    def run_cancel():
        db = pg_session_factory()
        try:
            user = db.get(User, user_id)
            result["cancel"] = head_change.cancel_head_change(db, user)
        except HeadChangeError as exc:
            result["cancel"] = exc
        finally:
            db.close()

    cancel_thread = threading.Thread(target=run_cancel, daemon=True)
    cancel_thread.start()
    cancel_thread.join(timeout=1.0)
    assert cancel_thread.is_alive(), "the cancel did not wait for the swap's lock"
    release.set()
    swap_thread.join(timeout=15)
    cancel_thread.join(timeout=15)

    assert getattr(outcome["swap"], "status", None) == "completed"
    assert isinstance(result["cancel"], HeadChangeError)
    assert result["cancel"].code == "request_not_found"
    check = pg_session_factory()
    try:
        assert check.get(HeadChangeRequest, request_id).status == "completed"
    finally:
        check.close()


def test_an_expiry_check_waiting_behind_the_swap_does_not_overwrite_completed(
    pg_session_factory, monkeypatch
):
    head_change, user_id, request_id, release, swap_thread, outcome = _swap_paused_inside_its_lock(
        pg_session_factory, monkeypatch, "ex"
    )
    # As far as the second caller can tell the request is past its time, but the swap that started
    # just before it is still completing (the swap already passed its own expiry check).
    from datetime import datetime

    monkeypatch.setattr(head_change, "datetime", _FutureClock(datetime))

    def run_expire():
        db = pg_session_factory()
        try:
            user = db.get(User, user_id)
            head_change._expire_stale_request(db, user)
        finally:
            db.close()

    expire_thread = threading.Thread(target=run_expire, daemon=True)
    expire_thread.start()
    expire_thread.join(timeout=1.0)
    assert expire_thread.is_alive(), "the expiry check did not wait for the swap's lock"
    release.set()
    swap_thread.join(timeout=15)
    expire_thread.join(timeout=15)

    assert getattr(outcome["swap"], "status", None) == "completed"
    check = pg_session_factory()
    try:
        assert check.get(HeadChangeRequest, request_id).status == "completed"
    finally:
        check.close()


class _FutureClock:
    """`datetime` whose now() is an hour ahead, so a pending request reads as past its time."""

    def __init__(self, real):
        self._real = real

    def now(self, tz=None):
        from datetime import timedelta

        return self._real.now(tz) + timedelta(hours=1)

    def __getattr__(self, name):
        return getattr(self._real, name)
