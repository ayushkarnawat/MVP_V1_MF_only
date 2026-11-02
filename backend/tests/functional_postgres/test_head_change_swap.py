from __future__ import annotations

import os
import threading
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.auth import HeadChangeRequest
from app.models.enums import Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.head_change import HeadChangeError
from tests.services.auth.test_head_change_swap import (
    _complete,
    _household,
    _ready_request,
)


@pytest.fixture()
def pg_session_factory():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL unset; Postgres unavailable")
    admin = create_engine(url)
    schema = "head_swap_" + uuid.uuid4().hex
    with admin.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(
        url,
        connect_args={"options": f"-csearch_path={schema}"},
        pool_size=5,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(autoflush=False, bind=engine)
    try:
        yield factory
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin.dispose()


def test_full_swap_runs_on_real_postgres(pg_session_factory):
    db = pg_session_factory()
    try:
        household = _household(db, suffix="p")
        request_id = _ready_request(db, household)

        result = _complete(db, household, request_id)

        db.expire_all()
        assert result.status == "completed"
        assert db.get(User, household.user.id).email == household.new_head.email
        assert db.get(HouseholdMember, household.old_head.id).relationship == Relationship.SPOUSE
        assert db.get(HouseholdMember, household.new_head.id).relationship == Relationship.SELF
        assert db.get(HeadChangeRequest, request_id).status == "completed"
    finally:
        db.close()


def test_forced_midway_failure_rolls_back_everything_on_real_postgres(
    pg_session_factory, monkeypatch
):
    db = pg_session_factory()
    try:
        household = _household(db, suffix="q")
        request_id = _ready_request(db, household)
        from app.services.auth import head_change

        def fail_after_member_changes(*_args, **_kwargs):
            raise RuntimeError("forced postgres midway failure")

        monkeypatch.setattr(
            head_change, "record_consent", fail_after_member_changes, raising=False
        )
        with pytest.raises(RuntimeError, match="forced postgres midway failure"):
            _complete(db, household, request_id)

        db.expire_all()
        assert (db.get(User, household.user.id).phone_number, db.get(User, household.user.id).email) == (
            household.old_phone,
            household.old_email,
        )
        assert db.get(HouseholdMember, household.old_head.id).relationship == Relationship.SELF
        assert db.get(HouseholdMember, household.new_head.id).relationship == Relationship.SPOUSE
        assert db.get(HeadChangeRequest, request_id).status == "pending"
    finally:
        db.close()


def test_concurrent_second_swap_for_the_same_account_is_blocked(
    pg_session_factory, monkeypatch
):
    setup = pg_session_factory()
    household = _household(setup, suffix="r")
    request_id = _ready_request(setup, household)
    user_id = household.user.id
    setup.close()

    from app.services.auth import head_change

    original_record_identity = head_change.record_identity
    first_inside_transaction = threading.Event()
    allow_first_to_finish = threading.Event()
    call_lock = threading.Lock()
    first_call = True

    def pause_first_swap(*args, **kwargs):
        nonlocal first_call
        with call_lock:
            should_pause = first_call
            first_call = False
        if should_pause:
            first_inside_transaction.set()
            assert allow_first_to_finish.wait(timeout=10)
        return original_record_identity(*args, **kwargs)

    monkeypatch.setattr(head_change, "record_identity", pause_first_swap)
    outcomes: dict[str, object] = {}

    def run_swap(name: str):
        db = pg_session_factory()
        try:
            user = db.get(User, user_id)
            outcomes[name] = head_change.complete_head_change(
                db,
                user,
                request_id,
                evidence=_evidence(),
            )
        except Exception as exc:  # captured for assertions in the controller thread
            outcomes[name] = exc
        finally:
            db.close()

    first = threading.Thread(target=run_swap, args=("first",), daemon=True)
    second = threading.Thread(target=run_swap, args=("second",), daemon=True)
    first.start()
    assert first_inside_transaction.wait(timeout=10)
    second.start()
    second.join(timeout=0.25)
    assert second.is_alive(), "the second real session did not wait for the row lock"
    allow_first_to_finish.set()
    first.join(timeout=10)
    second.join(timeout=10)

    assert getattr(outcomes["first"], "status", None) == "completed"
    assert isinstance(outcomes["second"], HeadChangeError)
    assert (
        outcomes["second"].status_code,
        outcomes["second"].code,
        outcomes["second"].message,
    ) == (404, "request_not_found", "Head change request not found.")


def _evidence():
    from app.services.legal.consent import ConsentEvidence

    return ConsentEvidence(
        ip_truncated="203.0.113.0/24",
        ip_hmac="postgres-evidence-hmac",
        user_agent="pytest-postgres",
        device_id="postgres-device",
    )



def test_a_login_waiting_behind_the_swap_lock_is_refused_after_the_swap_commits(pg_session_factory):
    """The race: a login found the old phone identity, the swap locks the account and deletes it,
    the login's session insert waits for the lock, and must then refuse instead of creating a session."""
    import time

    from app.models.auth import AuthIdentity
    from app.models.auth import Session as SessionModel
    from app.models.enums import AuthIdentityProvider
    from app.services.auth.session import SessionIdentityChangedError, create_session

    setup = pg_session_factory()
    household = _household(setup, suffix="r")
    presented = (
        setup.query(AuthIdentity.id)
        .filter(AuthIdentity.user_id == household.user.id, AuthIdentity.provider == AuthIdentityProvider.PHONE_OTP)
        .scalar()
    )
    user_id = household.user.id
    setup.query(SessionModel).filter(SessionModel.user_id == user_id).delete()
    setup.commit()
    setup.close()

    swap = pg_session_factory()
    swap.query(User).filter(User.id == user_id).with_for_update().one()
    swap.query(AuthIdentity).filter(AuthIdentity.user_id == user_id).delete(synchronize_session=False)
    swap.flush()  # the swap holds the account lock and has deleted the identities, not yet committed

    outcome: dict = {}

    def login():
        db = pg_session_factory()
        try:
            create_session(db, user_id, AuthIdentityProvider.PHONE_OTP, presented_identity_id=presented)
            outcome["result"] = "session created"
        except SessionIdentityChangedError:
            outcome["result"] = "refused"
        finally:
            db.close()

    thread = threading.Thread(target=login)
    thread.start()
    time.sleep(1.0)
    assert thread.is_alive(), "the login should be waiting behind the swap's lock"
    swap.commit()
    thread.join(timeout=15)
    assert outcome == {"result": "refused"}

    check = pg_session_factory()
    assert check.query(SessionModel).filter(SessionModel.user_id == user_id).count() == 0
    check.close()
    swap.close()
