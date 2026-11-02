"""Run 5 review fixes that only show on real Postgres: a cancel or an expiry must not overwrite a
swap that is completing at the same moment."""

from __future__ import annotations

import threading

from app.models.auth import HeadChangeRequest
from app.models.user import User
from app.services.auth.head_change import HeadChangeError
from tests.functional_postgres.test_head_change_swap import pg_session_factory  # noqa: F401
from tests.services.auth.test_head_change_swap import _evidence, _household, _ready_request


def _swap_paused_inside_its_lock(pg_session_factory, monkeypatch, suffix, *, prepare=None, extras=None):
    """Starts a real swap in a thread and pauses it inside its transaction (it holds the account
    lock). `prepare(db, household)` may add rows committed BEFORE the swap starts; what it returns
    is copied into the `extras` dict."""
    from app.services.auth import head_change

    setup = pg_session_factory()
    household = _household(setup, suffix=suffix)
    request_id = _ready_request(setup, household)
    user_id = household.user.id
    if prepare is not None:
        extras.update(prepare(setup, household))
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


# ---- sign-in flows that read the old head's identity before the swap and write after it -------

def _prepare_links(db, household):
    from datetime import datetime, timedelta, timezone

    from app.models.auth import AuthIdentity
    from app.models.auth import Session as SessionModel
    from app.models.enums import AuthIdentityProvider
    from app.services.auth.identity import create_pending_verification

    phone_identity = (
        db.query(AuthIdentity)
        .filter_by(user_id=household.user.id, provider=AuthIdentityProvider.PHONE_OTP)
        .one()
    )
    _, matched = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "late-google-matched", household.old_email, True,
        matched_user_id=household.user.id,
    )
    _, open_link = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "late-google-open", None, False, matched_user_id=None
    )
    now = datetime.now(timezone.utc)
    session = SessionModel(
        user_id=household.user.id,
        session_token_hash="old-head-session-hash",
        auth_method=AuthIdentityProvider.PHONE_OTP,
        created_at=now,
        expires_at=now + timedelta(days=30),
        last_active_at=now,
    )
    db.add(session)
    db.commit()
    return {
        "matched_token": matched,
        "open_token": open_link,
        "phone_identity_id": phone_identity.id,
        "session_id": session.id,
        "old_email": household.old_email,
    }


def _run_behind_the_swap(pg_session_factory, monkeypatch, suffix, action):
    """Runs `action(db, extras)` in a thread that must wait for the swap's lock; returns what it
    returned or raised, plus the swap thread's outcome, after the swap has committed."""
    extras: dict = {}
    head_change, user_id, request_id, release, swap_thread, outcome = _swap_paused_inside_its_lock(
        pg_session_factory, monkeypatch, suffix, prepare=_prepare_links, extras=extras
    )
    result: dict[str, object] = {}

    def run():
        db = pg_session_factory()
        try:
            result["value"] = action(db, extras, user_id)
        except Exception as exc:  # the assertions below look at the type
            result["value"] = exc
        finally:
            db.close()

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    thread.join(timeout=1.5)
    assert thread.is_alive(), "the sign-in flow did not wait for the swap's account lock"
    release.set()
    swap_thread.join(timeout=15)
    thread.join(timeout=15)
    assert getattr(outcome["swap"], "status", None) == "completed"
    return result["value"], user_id


def _subjects_on_the_account(pg_session_factory, user_id):
    from app.models.auth import AuthIdentity

    check = pg_session_factory()
    try:
        return {row.provider_subject for row in check.query(AuthIdentity).filter_by(user_id=user_id)}
    finally:
        check.close()


def test_a_pending_link_attach_that_started_before_the_swap_is_refused_after_it(
    pg_session_factory, monkeypatch
):
    from app.services.auth.identity import ACCOUNT_CHANGED_MESSAGE, PendingVerificationError, attach_pending_identity

    def action(db, extras, user_id):
        return attach_pending_identity(db, extras["matched_token"], user_id)

    value, user_id = _run_behind_the_swap(pg_session_factory, monkeypatch, "l1", action)

    assert isinstance(value, PendingVerificationError)
    assert str(value) == ACCOUNT_CHANGED_MESSAGE
    assert "late-google-matched" not in _subjects_on_the_account(pg_session_factory, user_id)


def test_a_phone_gate_attach_whose_identity_the_swap_deleted_is_refused(
    pg_session_factory, monkeypatch
):
    from app.services.auth.identity import PendingVerificationError, attach_pending_identity

    def action(db, extras, user_id):
        # The old head's phone identity authenticated this flow; the open link names no account.
        return attach_pending_identity(
            db, extras["open_token"], user_id, presented_identity_id=extras["phone_identity_id"]
        )

    value, user_id = _run_behind_the_swap(pg_session_factory, monkeypatch, "l2", action)

    assert isinstance(value, PendingVerificationError)
    assert "late-google-open" not in _subjects_on_the_account(pg_session_factory, user_id)


def test_a_google_auto_link_that_matched_before_the_swap_does_not_attach_after_it(
    pg_session_factory, monkeypatch
):
    from app.models.enums import AuthIdentityProvider
    from app.services.auth.identity import resolve_new_verified_identity

    def action(db, extras, user_id):
        # A new Google account whose verified email is the old head's email: before the swap
        # that email matches an identity of this account, so the flow auto-links and logs in.
        return resolve_new_verified_identity(
            db, AuthIdentityProvider.GOOGLE, "auto-google-sub", extras["old_email"], True
        )

    value, user_id = _run_behind_the_swap(pg_session_factory, monkeypatch, "l3", action)

    assert not isinstance(value, Exception)
    assert value.kind != "login"
    assert "auto-google-sub" not in _subjects_on_the_account(pg_session_factory, user_id)


def test_a_contact_change_that_checked_its_session_before_the_swap_is_refused_after_it(
    pg_session_factory, monkeypatch
):
    from app.services.auth.session import SessionIdentityChangedError, require_session_still_active

    def action(db, extras, user_id):
        return require_session_still_active(db, user_id, extras["session_id"])

    value, _ = _run_behind_the_swap(pg_session_factory, monkeypatch, "l4", action)

    assert isinstance(value, SessionIdentityChangedError)
