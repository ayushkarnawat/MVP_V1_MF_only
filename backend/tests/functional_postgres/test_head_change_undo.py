"""Task 5.6 on real Postgres: undo, its row locks, and the sign-in guard against an undo."""

from __future__ import annotations

import threading
import time
import uuid

import pytest

from app.models.auth import AuthIdentity, HeadChangeRequest
from app.models.auth import Session as SessionModel
from app.models.enums import AuthIdentityProvider, Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.head_change import HeadChangeError
from tests.functional_postgres.test_head_change_swap import pg_session_factory  # noqa: F401
from tests.services.auth.test_head_change_swap import _household
from tests.services.auth.test_head_change_undo import (
    UNDO_CONTACT_TAKEN,
    UNDO_NOT_FOUND,
    _error_tuple,
    _evidence,
    _swap,
    _taker,
)


def _swapped(factory, monkeypatch, suffix: str):
    """A real swap on Postgres; returns what the threads need (ids and the raw undo token)."""
    db = factory()
    try:
        household = _household(db, suffix=suffix)
        request_id, token, _ = _swap(db, household, monkeypatch)
        new_phone_identity = (
            db.query(AuthIdentity.id)
            .filter(
                AuthIdentity.user_id == household.user.id,
                AuthIdentity.provider == AuthIdentityProvider.PHONE_OTP,
            )
            .scalar()
        )
        return household, request_id, token, new_phone_identity
    finally:
        db.close()


def test_full_undo_runs_on_real_postgres(pg_session_factory, monkeypatch):
    from app.services.auth import head_change

    household, request_id, token, _ = _swapped(pg_session_factory, monkeypatch, "p")
    db = pg_session_factory()
    try:
        result = head_change.undo_head_change(db, token, _evidence())

        db.expire_all()
        assert result.status == "undone"
        user = db.get(User, household.user.id)
        assert (user.phone_number, user.email) == (household.old_phone, household.old_email)
        assert db.query(AuthIdentity).filter_by(user_id=user.id).count() == 4
        assert db.get(HouseholdMember, household.old_head.id).is_head is True
        assert db.get(HouseholdMember, household.old_head.id).relationship == Relationship.SELF
        assert db.get(HouseholdMember, household.new_head.id).is_head is False
        assert db.get(HouseholdMember, household.new_head.id).relationship == Relationship.SPOUSE
        assert db.get(HeadChangeRequest, request_id).status == "undone"
    finally:
        db.close()


def test_undo_blocked_when_contact_taken_on_real_postgres(pg_session_factory, monkeypatch):
    from app.services.auth import head_change

    household, request_id, token, _ = _swapped(pg_session_factory, monkeypatch, "q")
    db = pg_session_factory()
    try:
        _taker(db, "identity_email_column", household)

        with pytest.raises(HeadChangeError) as exc:
            head_change.undo_head_change(db, token, _evidence())

        assert _error_tuple(exc.value) == UNDO_CONTACT_TAKEN
        db.expire_all()
        assert db.get(HeadChangeRequest, request_id).status == "completed"
        assert db.get(User, household.user.id).email == household.new_head.email
    finally:
        db.close()


def test_forced_midway_failure_rolls_back_the_whole_undo_on_real_postgres(
    pg_session_factory, monkeypatch
):
    from app.services.auth import head_change

    household, request_id, token, _ = _swapped(pg_session_factory, monkeypatch, "r")

    def fail_after_member_changes(*_args, **_kwargs):
        raise RuntimeError("forced postgres midway failure")

    monkeypatch.setattr(head_change, "record_consent", fail_after_member_changes)
    db = pg_session_factory()
    try:
        with pytest.raises(RuntimeError, match="forced postgres midway failure"):
            head_change.undo_head_change(db, token, _evidence())

        db.expire_all()
        user = db.get(User, household.user.id)
        assert (user.phone_number, user.email) == (
            household.new_head.phone_number,
            household.new_head.email,
        )
        assert db.get(HouseholdMember, household.new_head.id).is_head is True
        assert db.get(HouseholdMember, household.old_head.id).is_head is False
        assert db.get(HeadChangeRequest, request_id).status == "completed"
        subjects = {i.provider_subject for i in db.query(AuthIdentity).filter_by(user_id=user.id)}
        assert subjects == {household.new_head.phone_number, household.new_head.email}
    finally:
        db.close()


def _pause_the_first_caller_of(head_change, name: str, monkeypatch):
    original = getattr(head_change, name)
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

    monkeypatch.setattr(head_change, name, paused)
    return inside, release


def test_a_second_undo_with_the_same_token_waits_for_the_lock_and_then_finds_it_used(
    pg_session_factory, monkeypatch
):
    from app.services.auth import head_change

    household, request_id, token, _ = _swapped(pg_session_factory, monkeypatch, "s")
    inside, release = _pause_the_first_caller_of(head_change, "record_consent", monkeypatch)
    outcomes: dict[str, object] = {}

    def run_undo(name: str):
        db = pg_session_factory()
        try:
            outcomes[name] = head_change.undo_head_change(db, token, _evidence())
        except Exception as exc:  # captured for the assertions below
            outcomes[name] = exc
        finally:
            db.close()

    first = threading.Thread(target=run_undo, args=("first",), daemon=True)
    second = threading.Thread(target=run_undo, args=("second",), daemon=True)
    first.start()
    assert inside.wait(timeout=15)
    second.start()
    second.join(timeout=0.5)
    assert second.is_alive(), "the second real session did not wait for the account lock"
    release.set()
    first.join(timeout=15)
    second.join(timeout=15)

    assert getattr(outcomes["first"], "status", None) == "undone"
    assert isinstance(outcomes["second"], HeadChangeError)
    assert _error_tuple(outcomes["second"]) == UNDO_NOT_FOUND
    check = pg_session_factory()
    try:
        assert check.get(HeadChangeRequest, request_id).status == "undone"
        assert check.query(AuthIdentity).filter_by(user_id=household.user.id).count() == 4
    finally:
        check.close()


def test_a_login_waiting_behind_the_undo_lock_is_refused_after_the_undo_commits(
    pg_session_factory, monkeypatch
):
    """A sign-in that found the swapped-in head's phone identity just before the undo must not get a
    session once the undo has deleted that identity."""
    from app.services.auth import head_change
    from app.services.auth.session import SessionIdentityChangedError, create_session

    household, _, token, presented = _swapped(pg_session_factory, monkeypatch, "t")
    user_id = household.user.id
    inside, release = _pause_the_first_caller_of(head_change, "record_consent", monkeypatch)
    outcome: dict[str, str] = {}

    def run_undo():
        db = pg_session_factory()
        try:
            head_change.undo_head_change(db, token, _evidence())
            outcome["undo"] = "undone"
        finally:
            db.close()

    def login():
        db = pg_session_factory()
        try:
            create_session(
                db, user_id, AuthIdentityProvider.PHONE_OTP, presented_identity_id=presented
            )
            outcome["login"] = "session created"
        except SessionIdentityChangedError:
            outcome["login"] = "refused"
        finally:
            db.close()

    undo_thread = threading.Thread(target=run_undo, daemon=True)
    login_thread = threading.Thread(target=login, daemon=True)
    undo_thread.start()
    assert inside.wait(timeout=15)  # the undo holds the account lock and has deleted the identities
    login_thread.start()
    time.sleep(1.0)
    assert login_thread.is_alive(), "the login should be waiting behind the undo's lock"
    release.set()
    undo_thread.join(timeout=15)
    login_thread.join(timeout=15)

    assert outcome == {"undo": "undone", "login": "refused"}
    check = pg_session_factory()
    try:
        assert check.query(SessionModel).filter(SessionModel.user_id == user_id).count() == 0
    finally:
        check.close()
