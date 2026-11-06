"""Task 5.6: undo of a Head of Family change (the mirror image of the swap in test_head_change_swap)."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.auth import (
    AuthIdentity,
    HeadChangeRequest,
    OtpRequest,
    PendingIdentityVerification,
    Session as SessionModel,
)
from app.models.consent import ConsentRecord
from app.models.enums import AuthIdentityProvider, ConsentAction, Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.head_change import HeadChangeError
from tests.services.auth.test_head_change_swap import (
    NOW,
    Household,
    _complete,
    _evidence,
    _household,
    _identity,
    _ready_request,
    _start,
)


UNDO_NOT_FOUND = (404, "undo_not_found", "This undo link is not valid.")
UNDO_EXPIRED = (410, "undo_expired", "The 24-hour undo window has closed.")
UNDO_CONTACT_TAKEN = (
    409,
    "undo_contact_taken",
    "The old phone or email has been taken since the change, so it cannot be undone.",
)
REQUEST_CHANGED = (
    409,
    "request_changed",
    "Something changed since you started. Nothing has changed. Start again.",
)
REVERSED_SUBJECT = "The Head of Family on Unifolio has been changed back."


class Mailbox:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send_email(self, to, subject, body, html_body=None):
        self.sent.append({"to": to, "subject": subject, "body": body, "html": html_body})


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _error_tuple(exc: HeadChangeError) -> tuple[int, str, str]:
    return (exc.status_code, exc.code, exc.message)


def _swap(db, household: Household, monkeypatch) -> tuple[uuid.UUID, str, Mailbox]:
    """Run the real swap and return (request id, the raw undo token from the email, the mailbox)."""
    from app.services.auth import head_change

    mailbox = Mailbox()
    monkeypatch.setattr(head_change, "get_email_provider", lambda: mailbox, raising=False)
    request_id = _ready_request(db, household)
    _complete(db, household, request_id)
    links = [
        item["body"]
        for item in mailbox.sent
        if item["subject"] == "Undo the Head of Family change."
    ]
    assert links, "the swap should have emailed an undo link"
    token = links[0].split("/undo-head-change#token=")[1].strip()
    mailbox.sent.clear()
    return request_id, token, mailbox


def _undo(db, token: str):
    from app.services.auth import head_change

    return head_change.undo_head_change(db, token, _evidence())


def _assert_still_swapped(db, household: Household, request_id) -> None:
    db.expire_all()
    user = db.get(User, household.user.id)
    assert user.email == household.new_head.email
    assert user.phone_number == household.new_head.phone_number
    assert db.get(HouseholdMember, household.new_head.id).is_head is True
    assert db.get(HouseholdMember, household.old_head.id).is_head is False
    assert db.get(HeadChangeRequest, request_id).status == "completed"
    subjects = {i.provider_subject for i in db.query(AuthIdentity).filter_by(user_id=user.id)}
    assert subjects == {household.new_head.phone_number, household.new_head.email}


def test_undo_restores_identities_contact_and_the_swaps_own_labels(db_session, monkeypatch):
    household = _household(db_session)
    request_id, token, _ = _swap(db_session, household, monkeypatch)

    result = _undo(db_session, token)

    db_session.expire_all()
    assert result.status == "undone"
    assert result.request_id == request_id
    assert result.user_id == household.user.id
    user = db_session.get(User, household.user.id)
    assert (user.phone_number, user.email) == (household.old_phone, household.old_email)
    identities = db_session.query(AuthIdentity).filter_by(user_id=user.id).all()
    assert {(i.provider, i.provider_subject, i.email) for i in identities} == {
        (AuthIdentityProvider.PHONE_OTP, household.old_phone, None),
        (AuthIdentityProvider.EMAIL_OTP, household.old_email, household.old_email),
        (AuthIdentityProvider.GOOGLE, "google-sub-1", "old-google-1@example.com"),
        (AuthIdentityProvider.EMAIL_PASSWORD, "old-legacy-1@example.com", "old-legacy-1@example.com"),
    }
    for identity in identities:
        assert _utc(identity.created_at) == NOW
        assert _utc(identity.identifier_verified_at) == NOW
        assert _utc(identity.last_used_at) == NOW

    old_head = db_session.get(HouseholdMember, household.old_head.id)
    new_head = db_session.get(HouseholdMember, household.new_head.id)
    other = db_session.get(HouseholdMember, household.other_member.id)
    assert (old_head.is_head, old_head.relationship, old_head.relationship_other_label) == (
        True,
        Relationship.SELF,
        None,
    )
    assert (old_head.email, old_head.phone_number) == (
        "old-member-before-1@example.com",
        "+91960000001",
    )
    assert (new_head.is_head, new_head.relationship, new_head.relationship_other_label) == (
        False,
        Relationship.SPOUSE,
        None,
    )
    assert (new_head.email, new_head.phone_number) == (
        "new-head-1@example.com",
        "+91870000001",
    )
    assert (other.relationship, other.relationship_other_label) == (Relationship.PARENT, None)
    request = db_session.get(HeadChangeRequest, request_id)
    assert request.status == "undone"


def test_later_member_edits_are_kept(db_session, monkeypatch):
    household = _household(db_session, suffix="2")
    _, token, _ = _swap(db_session, household, monkeypatch)
    other = db_session.get(HouseholdMember, household.other_member.id)
    old_head = db_session.get(HouseholdMember, household.old_head.id)
    # The swap made the parent "other: parent-in-law". These two are the user's own later edits.
    other.relationship = Relationship.CHILD
    other.relationship_other_label = None
    old_head.phone_number = "+919999999999"
    db_session.commit()

    _undo(db_session, token)

    db_session.expire_all()
    other = db_session.get(HouseholdMember, household.other_member.id)
    old_head = db_session.get(HouseholdMember, household.old_head.id)
    assert (other.relationship, other.relationship_other_label) == (Relationship.CHILD, None)
    assert old_head.phone_number == "+919999999999"
    # What the user did not touch is still restored.
    assert old_head.email == "old-member-before-2@example.com"
    assert old_head.is_head is True
    assert old_head.relationship == Relationship.SELF


def test_a_label_edited_only_in_its_free_text_is_kept_as_one_unit(db_session, monkeypatch):
    household = _household(db_session, suffix="3")
    _, token, _ = _swap(db_session, household, monkeypatch)
    other = db_session.get(HouseholdMember, household.other_member.id)
    # Only the free text is edited: the relationship still equals what the swap set. The label
    # and its free text are restored together or kept together, never split into "parent" with
    # someone's own wording left over.
    other.relationship_other_label = "my own wording"
    db_session.commit()

    _undo(db_session, token)

    db_session.expire_all()
    other = db_session.get(HouseholdMember, household.other_member.id)
    assert (other.relationship, other.relationship_other_label) == (
        Relationship.OTHER,
        "my own wording",
    )


def test_the_restored_head_is_always_self_even_if_their_label_was_edited(db_session, monkeypatch):
    household = _household(db_session, suffix="3b")
    _, token, _ = _swap(db_session, household, monkeypatch)
    old_head = db_session.get(HouseholdMember, household.old_head.id)
    old_head.relationship = Relationship.SIBLING  # a later edit of the demoted head's label
    db_session.commit()

    _undo(db_session, token)

    db_session.expire_all()
    old_head = db_session.get(HouseholdMember, household.old_head.id)
    assert (old_head.is_head, old_head.relationship, old_head.relationship_other_label) == (
        True,
        Relationship.SELF,
        None,
    )
    assert db_session.get(HouseholdMember, household.new_head.id).relationship == Relationship.SPOUSE


def _taker(db, kind: str, household: Household, suffix: str = "4") -> User:
    phone = f"+9198888000{suffix}1"
    email = f"taker-{suffix}@example.com"
    identities: list[tuple[AuthIdentityProvider, str, str | None]] = []
    if kind == "phone":
        phone = household.old_phone
    elif kind == "phone_other_format":
        phone = household.old_phone.removeprefix("+91")
    elif kind == "email":
        email = household.old_email
    elif kind == "email_other_case":
        email = household.old_email.upper()
    elif kind == "identity_email_column":
        identities.append((AuthIdentityProvider.GOOGLE, "someone-else-sub", household.old_email))
    elif kind == "identity_subject_email":
        identities.append((AuthIdentityProvider.EMAIL_OTP, household.old_email, household.old_email))
    elif kind == "google_sub":
        identities.append((AuthIdentityProvider.GOOGLE, f"google-sub-{suffix}", None))
    elif kind == "restored_google_email":
        email = f"old-google-{suffix}@example.com"
    elif kind == "restored_legacy_email_on_identity":
        identities.append(
            (AuthIdentityProvider.GOOGLE, "another-sub", f"old-legacy-{suffix}@example.com")
        )
    else:  # pragma: no cover - guards the parametrisation
        raise AssertionError(kind)
    taker = User(id=uuid.uuid4(), phone_number=phone, email=email, created_at=NOW)
    db.add(taker)
    db.flush()
    for provider, subject, identity_email in identities:
        db.add(_identity(taker, provider, subject, email=identity_email))
    db.commit()
    return taker


@pytest.mark.parametrize(
    "kind",
    [
        "phone",
        "phone_other_format",
        "email",
        "email_other_case",
        "identity_email_column",
        "identity_subject_email",
        "google_sub",
        "restored_google_email",
        "restored_legacy_email_on_identity",
    ],
)
def test_undo_blocked_when_contact_taken(db_session, monkeypatch, kind):
    suffix = "4"
    household = _household(db_session, suffix=suffix)
    household.old_phone = f"+91970000000{suffix}"
    household.user.phone_number = household.old_phone
    old_phone_identity = (
        db_session.query(AuthIdentity)
        .filter_by(user_id=household.user.id, provider=AuthIdentityProvider.PHONE_OTP)
        .one()
    )
    old_phone_identity.provider_subject = household.old_phone
    db_session.commit()
    request_id, token, mailbox = _swap(db_session, household, monkeypatch)
    taker = _taker(db_session, kind, household, suffix=suffix)

    with pytest.raises(HeadChangeError) as exc:
        _undo(db_session, token)

    assert _error_tuple(exc.value) == UNDO_CONTACT_TAKEN
    _assert_still_swapped(db_session, household, request_id)
    assert (
        db_session.query(ConsentRecord).filter_by(surface="head_change_undo").count() == 0
    )
    assert mailbox.sent == []

    # The failed attempt did not use the link up: once the contact is free the undo works.
    db_session.query(AuthIdentity).filter_by(user_id=taker.id).delete()
    db_session.delete(taker)
    db_session.commit()
    assert _undo(db_session, token).status == "undone"


def test_undo_blocked_after_24_hours(db_session, monkeypatch):
    household = _household(db_session, suffix="5")
    request_id, token, _ = _swap(db_session, household, monkeypatch)
    request = db_session.get(HeadChangeRequest, request_id)
    request.undo_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    with pytest.raises(HeadChangeError) as exc:
        _undo(db_session, token)

    assert _error_tuple(exc.value) == UNDO_EXPIRED
    _assert_still_swapped(db_session, household, request_id)


def test_the_token_is_single_use_and_a_used_token_answers_like_an_unknown_one(
    db_session, monkeypatch
):
    household = _household(db_session, suffix="6")
    request_id, token, _ = _swap(db_session, household, monkeypatch)

    assert _undo(db_session, token).status == "undone"

    with pytest.raises(HeadChangeError) as used:
        _undo(db_session, token)
    with pytest.raises(HeadChangeError) as unknown:
        _undo(db_session, "a-token-nobody-was-ever-given")
    with pytest.raises(HeadChangeError) as empty:
        _undo(db_session, "")
    assert _error_tuple(used.value) == UNDO_NOT_FOUND
    assert _error_tuple(unknown.value) == UNDO_NOT_FOUND
    assert _error_tuple(empty.value) == UNDO_NOT_FOUND
    request = db_session.get(HeadChangeRequest, request_id)
    assert request.status == "undone"
    assert request.undo_token_hash is None


def test_a_request_that_is_not_completed_cannot_be_undone_with_its_old_token(
    db_session, monkeypatch
):
    household = _household(db_session, suffix="7")
    request_id, token, _ = _swap(db_session, household, monkeypatch)
    request = db_session.get(HeadChangeRequest, request_id)
    request.status = "cancelled"
    db_session.commit()

    with pytest.raises(HeadChangeError) as exc:
        _undo(db_session, token)

    assert _error_tuple(exc.value) == UNDO_NOT_FOUND


def test_an_undo_of_a_request_that_is_not_the_latest_completed_change_refuses(
    db_session, monkeypatch
):
    household = _household(db_session, suffix="8")
    request_id, token, _ = _swap(db_session, household, monkeypatch)
    first = db_session.get(HeadChangeRequest, request_id)
    later = HeadChangeRequest(
        user_id=household.user.id,
        from_member_id=household.new_head.id,
        to_member_id=household.old_head.id,
        status="completed",
        expires_at=NOW,
        undo_token_hash="not-the-first-hash",
        undo_expires_at=_utc(first.undo_expires_at) + timedelta(hours=1),
        snapshot={},
    )
    db_session.add(later)
    db_session.commit()

    with pytest.raises(HeadChangeError) as exc:
        _undo(db_session, token)

    assert _error_tuple(exc.value) == REQUEST_CHANGED
    _assert_still_swapped(db_session, household, request_id)


def test_undo_refuses_when_the_swapped_in_head_is_no_longer_the_head(db_session, monkeypatch):
    household = _household(db_session, suffix="9")
    request_id, token, _ = _swap(db_session, household, monkeypatch)
    new_head = db_session.get(HouseholdMember, household.new_head.id)
    other = db_session.get(HouseholdMember, household.other_member.id)
    new_head.is_head = False
    db_session.flush()
    other.is_head = True
    db_session.commit()

    with pytest.raises(HeadChangeError) as exc:
        _undo(db_session, token)

    assert _error_tuple(exc.value) == REQUEST_CHANGED
    db_session.expire_all()
    assert db_session.get(HeadChangeRequest, request_id).status == "completed"
    assert db_session.get(HouseholdMember, household.old_head.id).is_head is False


def test_undo_refuses_on_an_account_that_is_pending_deletion(db_session, monkeypatch):
    household = _household(db_session, suffix="a")
    request_id, token, _ = _swap(db_session, household, monkeypatch)
    user = db_session.get(User, household.user.id)
    user.pending_deletion = True
    user.deletion_scheduled_at = datetime.now(timezone.utc) + timedelta(days=30)
    db_session.commit()

    with pytest.raises(HeadChangeError) as exc:
        _undo(db_session, token)

    assert _error_tuple(exc.value) == (
        403,
        "account_pending_deletion",
        "This account is scheduled for deletion. Reactivate it first.",
    )
    _assert_still_swapped(db_session, household, request_id)
    # The refusal did not use the link up: when the new head reactivates the account inside the
    # 24 hours, the same link works (orchestrator decision, T5.6).
    assert db_session.get(HeadChangeRequest, request_id).undo_token_hash is not None
    user = db_session.get(User, household.user.id)
    user.pending_deletion = False
    user.deletion_scheduled_at = None
    db_session.commit()
    assert _undo(db_session, token).status == "undone"


def test_a_later_edit_of_a_members_email_is_kept_and_the_rest_is_restored(
    db_session, monkeypatch
):
    household = _household(db_session, suffix="2b")
    _, token, _ = _swap(db_session, household, monkeypatch)
    old_head = db_session.get(HouseholdMember, household.old_head.id)
    # The swap put the old account email on the demoted head's member row. This is the user's
    # own later edit of that email; the phone was not touched.
    old_head.email = "edited-later@example.com"
    db_session.commit()

    _undo(db_session, token)

    db_session.expire_all()
    old_head = db_session.get(HouseholdMember, household.old_head.id)
    assert old_head.email == "edited-later@example.com"
    assert old_head.phone_number == "+91960000002b"
    assert old_head.is_head is True


def test_sessions_pending_links_and_head_change_codes_are_deleted_but_not_login_codes(
    db_session, monkeypatch
):
    household = _household(db_session, suffix="b")
    _, token, _ = _swap(db_session, household, monkeypatch)
    user_id = household.user.id
    new_email = household.new_head.email
    db_session.add_all(
        [
            SessionModel(
                user_id=user_id,
                session_token_hash="session-after-swap",
                auth_method=AuthIdentityProvider.PHONE_OTP,
                created_at=NOW,
                expires_at=NOW + timedelta(days=30),
                last_active_at=NOW,
            ),
            PendingIdentityVerification(
                provider=AuthIdentityProvider.GOOGLE,
                provider_subject="pending-after-swap",
                email=None,
                email_verified=False,
                matched_user_id=user_id,
                token_hash="pending-hash-after-swap",
                expires_at=NOW + timedelta(minutes=10),
                created_at=NOW,
            ),
            OtpRequest(
                email=new_email,
                otp_hash="head-change-hash",
                expires_at=NOW + timedelta(minutes=10),
                created_at=NOW,
                purpose="head_change",
            ),
            OtpRequest(
                email=new_email,
                otp_hash="login-hash",
                expires_at=NOW + timedelta(minutes=5),
                created_at=NOW,
                purpose="login",
            ),
        ]
    )
    db_session.commit()

    _undo(db_session, token)

    assert db_session.query(SessionModel).filter_by(user_id=user_id).count() == 0
    assert (
        db_session.query(PendingIdentityVerification).filter_by(matched_user_id=user_id).count()
        == 0
    )
    remaining = {row.otp_hash for row in db_session.query(OtpRequest).filter_by(email=new_email)}
    assert remaining == {"login-hash"}


def test_undo_records_a_consent_withdrawal_and_never_edits_older_rows(db_session, monkeypatch):
    household = _household(db_session, suffix="c")
    _, token, _ = _swap(db_session, household, monkeypatch)
    before = {
        row.id: (row.action, row.surface, row.recorded_at)
        for row in db_session.query(ConsentRecord).filter_by(user_id=household.user.id)
    }
    assert len(before) == 3

    _undo(db_session, token)

    rows = db_session.query(ConsentRecord).filter_by(user_id=household.user.id).all()
    undo_rows = [row for row in rows if row.surface == "head_change_undo"]
    assert len(rows) == 6
    assert len(undo_rows) == 3
    assert {row.action for row in undo_rows} == {ConsentAction.WITHDRAWN}
    assert {row.document_type.value for row in undo_rows} == {"terms_of_service", "privacy_policy"}
    for row in rows:
        if row.id in before:
            assert (row.action, row.surface, row.recorded_at) == before[row.id]


def test_a_failure_midway_rolls_back_the_whole_undo_and_the_link_still_works(
    db_session, monkeypatch
):
    household = _household(db_session, suffix="d")
    request_id, token, _ = _swap(db_session, household, monkeypatch)
    from app.services.auth import head_change

    def fail_after_members_changed(*_args, **_kwargs):
        raise RuntimeError("forced midway failure")

    monkeypatch.setattr(head_change, "record_consent", fail_after_members_changed)
    with pytest.raises(RuntimeError, match="forced midway failure"):
        _undo(db_session, token)
    _assert_still_swapped(db_session, household, request_id)
    assert db_session.get(HeadChangeRequest, request_id).undo_token_hash is not None

    monkeypatch.undo()
    monkeypatch.setattr(head_change, "get_email_provider", lambda: Mailbox(), raising=False)
    assert _undo(db_session, token).status == "undone"


def test_an_integrity_error_at_the_final_commit_answers_undo_contact_taken(
    db_session, monkeypatch
):
    household = _household(db_session, suffix="e")
    request_id, token, _ = _swap(db_session, household, monkeypatch)

    def fail_commit():
        raise IntegrityError("forced commit race", {}, RuntimeError("unique rule"))

    monkeypatch.setattr(db_session, "commit", fail_commit)
    with pytest.raises(HeadChangeError) as exc:
        _undo(db_session, token)

    assert _error_tuple(exc.value) == UNDO_CONTACT_TAKEN
    monkeypatch.undo()
    _assert_still_swapped(db_session, household, request_id)


def test_the_reversal_notice_goes_to_both_people_with_no_link(db_session, monkeypatch):
    household = _household(db_session, suffix="f")
    _, token, mailbox = _swap(db_session, household, monkeypatch)

    _undo(db_session, token)

    assert {item["subject"] for item in mailbox.sent} == {REVERSED_SUBJECT}
    recipients = {item["to"] for item in mailbox.sent}
    assert recipients == {household.new_head.email, household.old_email, *household.old_other_emails}
    assert len(mailbox.sent) == len(recipients)
    for item in mailbox.sent:
        assert token not in item["body"] and token not in item["html"]
        assert "http" not in item["body"] and "<a " not in item["html"]


def test_a_missing_email_provider_does_not_fail_the_undo(db_session, monkeypatch):
    household = _household(db_session, suffix="g")
    request_id, token, _ = _swap(db_session, household, monkeypatch)
    from app.services.auth import head_change
    from app.services.auth.email_provider import NoEmailProviderConfiguredError

    def no_provider():
        raise NoEmailProviderConfiguredError("not configured")

    monkeypatch.setattr(head_change, "get_email_provider", no_provider, raising=False)

    result = _undo(db_session, token)

    assert result.status == "undone"
    db_session.expire_all()
    request = db_session.get(HeadChangeRequest, request_id)
    assert request.status == "undone"
    assert set(request.snapshot["undo_notices"]["failed_roles"]) == {
        "new_head_reversed",
        "old_head_reversed",
    }
    assert db_session.get(User, household.user.id).email == household.old_email


def test_a_failing_email_provider_does_not_undo_the_undo(db_session, monkeypatch):
    household = _household(db_session, suffix="h")
    request_id, token, _ = _swap(db_session, household, monkeypatch)
    from app.services.auth import head_change

    class FailingProvider:
        def send_email(self, *_args, **_kwargs):
            raise RuntimeError("mailbox unavailable")

    monkeypatch.setattr(head_change, "get_email_provider", lambda: FailingProvider(), raising=False)

    assert _undo(db_session, token).status == "undone"
    db_session.expire_all()
    assert db_session.get(HeadChangeRequest, request_id).status == "undone"
    assert db_session.get(User, household.user.id).phone_number == household.old_phone


def test_the_snapshot_and_logs_never_hold_the_raw_token(db_session, monkeypatch, caplog):
    household = _household(db_session, suffix="i")
    request_id, token, _ = _swap(db_session, household, monkeypatch)
    caplog.set_level(logging.INFO)

    _undo(db_session, token)

    db_session.expire_all()
    snapshot_text = json.dumps(db_session.get(HeadChangeRequest, request_id).snapshot)
    assert token not in snapshot_text
    assert token not in caplog.text


def test_the_sign_in_guard_refuses_a_session_for_an_identity_the_undo_deleted(
    db_session, monkeypatch
):
    from app.services.auth.session import SessionIdentityChangedError, create_session

    household = _household(db_session, suffix="j")
    _, token, _ = _swap(db_session, household, monkeypatch)
    new_phone_identity = (
        db_session.query(AuthIdentity)
        .filter_by(user_id=household.user.id, provider=AuthIdentityProvider.PHONE_OTP)
        .one()
    )
    presented = new_phone_identity.id

    _undo(db_session, token)

    with pytest.raises(SessionIdentityChangedError):
        create_session(
            db_session,
            household.user.id,
            AuthIdentityProvider.PHONE_OTP,
            presented_identity_id=presented,
        )
    assert db_session.query(SessionModel).filter_by(user_id=household.user.id).count() == 0


def _give_old_head_a_pan(db, household: Household) -> None:
    old_head = db.get(HouseholdMember, household.old_head.id)
    old_head.pan_encrypted = "encrypted-pan-old-head"
    old_head.pan_lookup_hash = "pan-hash-old-head"
    db.commit()


def _too_soon_message(completed_at: datetime) -> str:
    allowed = completed_at + timedelta(days=7)
    return (
        "The Head of Family was changed recently. "
        f"You can change it again on {allowed.day} {allowed:%B %Y}."
    )


def _set_completed_at(db, request_id, completed_at: datetime) -> None:
    request = db.get(HeadChangeRequest, request_id)
    request.undo_expires_at = completed_at + timedelta(hours=24)
    db.commit()


def test_change_back_limited_to_once_per_7_days(db_session, monkeypatch):
    from app.services.auth import head_change

    household = _household(db_session, suffix="k")
    request_id, token, _ = _swap(db_session, household, monkeypatch)
    _give_old_head_a_pan(db_session, household)
    user = db_session.get(User, household.user.id)
    completed_at = datetime.now(timezone.utc) - timedelta(hours=2)
    _set_completed_at(db_session, request_id, completed_at)
    expected = (409, "head_change_too_soon", _too_soon_message(completed_at))

    with pytest.raises(HeadChangeError) as start_code:
        head_change.request_head_change_start_code(db_session, user, household.old_head.id)
    with pytest.raises(HeadChangeError) as start:
        head_change.start_head_change(db_session, user, household.old_head.id, "000000")

    assert _error_tuple(start_code.value) == expected
    assert _error_tuple(start.value) == expected
    assert db_session.query(OtpRequest).filter_by(purpose="head_change").count() == 0
    assert db_session.query(HeadChangeRequest).filter_by(status="pending").count() == 0

    # Undo itself is exempt from the rule, and a change that was undone still counts.
    assert _undo(db_session, token).status == "undone"
    user = db_session.get(User, household.user.id)
    with pytest.raises(HeadChangeError) as after_undo:
        head_change.request_head_change_start_code(db_session, user, household.new_head.id)
    assert _error_tuple(after_undo.value) == expected


def test_change_back_is_allowed_again_after_7_days(db_session, monkeypatch):
    from app.services.auth import head_change

    household = _household(db_session, suffix="l")
    request_id, _, _ = _swap(db_session, household, monkeypatch)
    _give_old_head_a_pan(db_session, household)
    user = db_session.get(User, household.user.id)
    _set_completed_at(db_session, request_id, datetime.now(timezone.utc) - timedelta(days=8))

    _, otp = head_change.request_head_change_start_code(db_session, user, household.old_head.id)

    assert otp is not None


@pytest.mark.parametrize("status", ["cancelled", "expired"])
def test_a_cancelled_or_expired_request_does_not_start_the_7_day_clock(
    db_session, monkeypatch, status
):
    from app.services.auth import head_change

    household = _household(db_session, suffix="m")
    request_id, _, _ = _swap(db_session, household, monkeypatch)
    _give_old_head_a_pan(db_session, household)
    request = db_session.get(HeadChangeRequest, request_id)
    request.status = status
    db_session.commit()
    user = db_session.get(User, household.user.id)

    _, otp = head_change.request_head_change_start_code(db_session, user, household.old_head.id)

    assert otp is not None


def test_peek_pending_ignores_an_expired_row_and_writes_nothing(db_session):
    from app.services.auth import head_change

    household = _household(db_session, suffix="n")
    started = _start(db_session, household)
    request = db_session.get(HeadChangeRequest, started.request.id)
    assert head_change.peek_pending_head_change(db_session, household.user).status == "pending"

    request.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    otp_rows_before = db_session.query(OtpRequest).count()

    assert head_change.peek_pending_head_change(db_session, household.user) is None
    db_session.expire_all()
    assert db_session.get(HeadChangeRequest, started.request.id).status == "pending"
    assert db_session.query(OtpRequest).count() == otp_rows_before


def test_the_reversed_email_builder_is_plain_and_has_no_link():
    from app.services.auth.email_templates import head_change_reversed_email

    subject, text, html = head_change_reversed_email(
        restored_head_name="Old <b>Head</b>", other_head_name="New Head"
    )

    assert subject == REVERSED_SUBJECT
    assert "Old <b>Head</b>" in text
    assert "Old &lt;b&gt;Head&lt;/b&gt;" in html
    assert "http" not in text and "<a " not in html
    assert "support@unifolio.in" in text


def test_the_old_head_cannot_be_removed_during_the_7_days_after_a_change(db_session, monkeypatch):
    from app.services.import_.deletion import MemberRemovalBlockedError, delete_member_portfolio

    household = _household(db_session, suffix="n")
    request_id, token, _ = _swap(db_session, household, monkeypatch)

    # The database deletes the head-change request when either member row goes, which would
    # erase the undo link and the 7-day rule. So the removal is refused before anything changes.
    with pytest.raises(MemberRemovalBlockedError):
        delete_member_portfolio(
            db_session, household.user.id, household.old_head.id, remove_member=True
        )
    with pytest.raises(MemberRemovalBlockedError):
        delete_member_portfolio(
            db_session, household.user.id, household.new_head.id, remove_member=True
        )

    db_session.expire_all()
    assert db_session.get(HouseholdMember, household.old_head.id) is not None
    assert db_session.get(HeadChangeRequest, request_id).status == "completed"
    assert _undo(db_session, token).status == "undone"


def test_a_member_of_a_change_older_than_7_days_can_be_removed(db_session, monkeypatch):
    from app.services.import_.deletion import delete_member_portfolio

    household = _household(db_session, suffix="o")
    request_id, _, _ = _swap(db_session, household, monkeypatch)
    _set_completed_at(db_session, request_id, datetime.now(timezone.utc) - timedelta(days=8))

    result = delete_member_portfolio(
        db_session, household.user.id, household.old_head.id, remove_member=True
    )

    assert result.removed_member_ids == [household.old_head.id]


def test_an_unrelated_member_can_still_be_removed_right_after_a_change(db_session, monkeypatch):
    from app.services.import_.deletion import delete_member_portfolio

    household = _household(db_session, suffix="p")
    _swap(db_session, household, monkeypatch)

    result = delete_member_portfolio(
        db_session, household.user.id, household.other_member.id, remove_member=True
    )

    assert result.removed_member_ids == [household.other_member.id]


def test_member_head_change_lock_until_is_completed_at_plus_seven_days(db_session, monkeypatch):
    from app.services.auth.head_change import member_head_change_lock_until

    household = _household(db_session, suffix="q")
    request_id, _, _ = _swap(db_session, household, monkeypatch)
    completed_at = datetime.now(timezone.utc) - timedelta(days=2)
    _set_completed_at(db_session, request_id, completed_at)

    for member in (household.old_head, household.new_head):
        lock = member_head_change_lock_until(db_session, member.id)
        assert lock is not None and lock.tzinfo is not None
        assert abs((lock - (completed_at + timedelta(days=7))).total_seconds()) < 5


def test_member_head_change_lock_until_is_none_when_older_than_seven_days(db_session, monkeypatch):
    from app.services.auth.head_change import member_head_change_lock_until

    household = _household(db_session, suffix="r")
    request_id, _, _ = _swap(db_session, household, monkeypatch)
    _set_completed_at(db_session, request_id, datetime.now(timezone.utc) - timedelta(days=8))

    assert member_head_change_lock_until(db_session, household.old_head.id) is None


def test_lock_until_is_set_exactly_when_member_in_recent_head_change_is_true(db_session, monkeypatch):
    from app.services.auth.head_change import (
        member_head_change_lock_until,
        member_in_recent_head_change,
    )

    household = _household(db_session, suffix="s")
    request_id, _, _ = _swap(db_session, household, monkeypatch)

    for age_days in (0, 3, 6, 8, 30):
        _set_completed_at(
            db_session, request_id, datetime.now(timezone.utc) - timedelta(days=age_days)
        )
        for member in (household.old_head, household.new_head):
            assert (member_head_change_lock_until(db_session, member.id) is not None) == (
                member_in_recent_head_change(db_session, member.id)
            )


def test_removal_refusal_carries_the_date_it_ends_and_names_it_in_india_time(db_session, monkeypatch):
    from app.core.time_format import format_ist_date
    from app.services.import_.deletion import MemberRemovalBlockedError, delete_member_portfolio

    household = _household(db_session, suffix="t")
    _swap(db_session, household, monkeypatch)

    with pytest.raises(MemberRemovalBlockedError) as raised:
        delete_member_portfolio(
            db_session, household.user.id, household.old_head.id, remove_member=True
        )

    available_after = raised.value.available_after
    assert available_after.tzinfo is not None
    assert raised.value.message == (
        "This person was part of a recent Head of Family change, so they cannot be removed yet. "
        f"You can remove them on {format_ist_date(available_after)}."
    )
