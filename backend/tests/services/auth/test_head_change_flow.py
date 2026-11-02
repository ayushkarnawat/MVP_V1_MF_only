import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import HeadChangeRequest, OtpRequest
from app.models.enums import ImportStatus, MemberPanConflict, Relationship
from app.models.imports import Import
from app.models.user import HouseholdMember, User


NOW = datetime(2026, 11, 2, tzinfo=timezone.utc)


def _session():
    from app.db.base import Base

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _household(db, *, suffix: str = "1"):
    user = User(
        id=uuid.uuid4(),
        phone_number=f"+9190000000{suffix}",
        email=f"head{suffix}@example.com",
        created_at=NOW,
    )
    head = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=f"Head {suffix}",
        relationship=Relationship.SELF,
        is_head=True,
        created_at=NOW,
    )
    candidate = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=f"Candidate {suffix}",
        relationship=Relationship.SPOUSE,
        is_head=False,
        email=f"candidate{suffix}@example.com",
        phone_number=f"+9180000000{suffix}",
        pan_encrypted=f"encrypted-pan-{suffix}",
        pan_lookup_hash=f"pan-hash-{suffix}",
        created_at=NOW,
    )
    db.add_all([user, head, candidate])
    db.commit()
    return user, head, candidate


def _head_change():
    from app.services.auth import head_change

    return head_change


def _start_code(db, user, candidate):
    _, otp = _head_change().request_head_change_start_code(db, user, candidate.id)
    assert otp is not None
    return otp


def _start(db, user, candidate):
    return _head_change().start_head_change(
        db, user, candidate.id, _start_code(db, user, candidate)
    )


def _code(result, party, channel):
    return next(
        item.otp
        for item in result.codes
        if item.party == party and item.channel == channel
    )


def _assert_error(exc, *, status, code, message):
    assert exc.value.status_code == status
    assert exc.value.code == code
    assert exc.value.message == message


def _record_email(monkeypatch):
    from app.config import settings
    from app.services.auth import otp as otp_module

    sent = []

    class RecordingProvider:
        def send_email(self, to, subject, body, html_body=None):
            sent.append(
                {"to": to, "subject": subject, "body": body, "html_body": html_body}
            )

    monkeypatch.setattr(settings, "email_delivery_mode", "ses")
    monkeypatch.setattr(otp_module, "generate_otp", lambda: "555555")
    monkeypatch.setattr(otp_module, "get_email_provider", lambda: RecordingProvider())
    return sent


def test_start_code_email_names_the_candidate_and_uses_current_head_wording(monkeypatch):
    db = _session()
    user, _, candidate = _household(db)
    candidate.name = 'Candidate <Admin> & "Lead"'
    db.commit()
    sent = _record_email(monkeypatch)

    _head_change().request_head_change_start_code(db, user, candidate.id)

    assert len(sent) == 1
    email = sent[0]
    assert email["subject"] == "Confirm a change of Head of Family."
    headline = "Your confirmation code to change the Head of Family on Unifolio is below."
    note = (
        "This code expires in 10 minutes. It will make Candidate <Admin> & \"Lead\" "
        "the Head of Family and move sign-in to them. If you did not ask for this, "
        "do not share the code and contact support@unifolio.in."
    )
    assert headline in email["body"]
    assert note in email["body"]
    assert headline in email["html_body"]
    assert "Candidate &lt;Admin&gt; &amp; &quot;Lead&quot;" in email["html_body"]
    assert note not in email["html_body"]
    assert "to sign in to Unifolio" not in email["html_body"]
    assert "Your Unifolio verification code" not in email["subject"]
    assert "sign in" not in email["subject"].lower()
    assert "sign in" not in headline.lower()


def test_new_head_email_names_the_current_head_and_uses_new_head_wording(monkeypatch):
    db = _session()
    user, head, candidate = _household(db)
    head.name = 'Head <Owner> & "Lead"'
    db.commit()
    start_code = _start_code(db, user, candidate)
    sent = _record_email(monkeypatch)

    _head_change().start_head_change(db, user, candidate.id, start_code)

    assert len(sent) == 1
    email = sent[0]
    assert email["to"] == candidate.email
    assert email["subject"] == "Confirm you are becoming Head of Family."
    headline = "Your confirmation code to become Head of Family on Unifolio is below."
    note = (
        "This code expires in 10 minutes. Head <Owner> & \"Lead\" asked to hand this "
        "family's account to you. After you both confirm, you will sign in with this "
        "email and phone number. If this is unexpected, ignore this email."
    )
    assert headline in email["body"]
    assert note in email["body"]
    assert headline in email["html_body"]
    assert "Head &lt;Owner&gt; &amp; &quot;Lead&quot;" in email["html_body"]
    assert note not in email["html_body"]
    assert "to sign in to Unifolio" not in email["html_body"]
    assert "Your Unifolio verification code" not in email["subject"]
    assert "sign in" not in email["subject"].lower()
    assert "sign in" not in headline.lower()


def test_start_code_rejects_own_data_problem_without_creating_a_code():
    db = _session()
    user, _, candidate = _household(db)
    candidate.email = None
    db.commit()

    with pytest.raises(_head_change().HeadChangeError) as exc:
        _head_change().request_head_change_start_code(db, user, candidate.id)

    _assert_error(
        exc,
        status=409,
        code="member_not_eligible",
        message="Add an email address and a phone number first.",
    )
    assert db.query(OtpRequest).filter(OtpRequest.purpose.like("head_change%")).count() == 0


def test_start_code_does_not_disclose_other_account_conflicts():
    db = _session()
    user, _, candidate = _household(db)
    db.add(
        User(
            id=uuid.uuid4(),
            phone_number=candidate.phone_number,
            email=candidate.email,
            created_at=NOW,
        )
    )
    candidate.pan_encrypted = candidate.pan_lookup_hash = None
    candidate.detected_pan_encrypted = "encrypted-conflict"
    candidate.detected_pan_hash = "conflicting-pan"
    candidate.pan_conflict = MemberPanConflict.OTHER_ACCOUNT
    db.commit()

    request, raw_otp = _head_change().request_head_change_start_code(
        db, user, candidate.id
    )

    assert request.purpose == f"head_change_start:{candidate.id}"
    assert raw_otp is not None


def _second_candidate(db, user, suffix="2"):
    other = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=f"Other candidate {suffix}",
        relationship=Relationship.SIBLING,
        is_head=False,
        email=f"other-candidate{suffix}@example.com",
        phone_number=f"+9170000000{suffix}",
        pan_encrypted=f"encrypted-pan-other-{suffix}",
        pan_lookup_hash=f"pan-hash-other-{suffix}",
        created_at=NOW,
    )
    db.add(other)
    db.commit()
    return other


def test_a_start_code_requested_for_one_member_cannot_start_a_change_to_another():
    # Found in the Run 5 review: the start code's email says "It will make <X> the Head of
    # Family", but the code used to start a change to anyone.
    db = _session()
    user, _, candidate = _household(db)
    other = _second_candidate(db, user)
    code_for_candidate = _start_code(db, user, candidate)

    with pytest.raises(_head_change().HeadChangeError) as exc:
        _head_change().start_head_change(db, user, other.id, code_for_candidate)

    assert exc.value.code == "wrong_code"
    assert db.query(HeadChangeRequest).count() == 0
    # The same code still starts the change it was issued for.
    started = _head_change().start_head_change(db, user, candidate.id, code_for_candidate)
    assert started.request.to_member_id == candidate.id


def test_a_resent_current_head_email_code_is_not_a_start_code():
    db = _session()
    user, _, candidate = _household(db)
    started = _start(db, user, candidate)
    request_id = started.request.id
    # Make the resend allowed, then get a fresh "current head, email" code for the open request.
    row = db.query(OtpRequest).filter(OtpRequest.purpose == "head_change").first()
    if row is not None:
        row.created_at = datetime.now(timezone.utc) - timedelta(seconds=61)
        db.commit()
    resent = _head_change().resend_head_change_code(db, user, request_id, "current", "email")

    # The request is still open on purpose: with the old shared purpose this code would verify and
    # the answer would be "head_change_already_open"; now the code is simply not a start code.
    with pytest.raises(_head_change().HeadChangeError) as exc:
        _head_change().start_head_change(db, user, candidate.id, resent.code.otp)

    assert exc.value.code != "head_change_already_open"
    assert exc.value.code in {"wrong_code", "code_expired"}


def test_resend_new_head_email_keeps_the_new_head_wording(monkeypatch):
    db = _session()
    user, head, candidate = _household(db)
    result = _start(db, user, candidate)
    new_email_code = (
        db.query(OtpRequest)
        .filter_by(email=candidate.email, purpose="head_change")
        .one()
    )
    new_email_code.created_at = datetime.now(timezone.utc) - timedelta(seconds=61)
    db.commit()
    sent = _record_email(monkeypatch)

    _head_change().resend_head_change_code(
        db, user, result.request.id, "new", "email"
    )

    assert len(sent) == 1
    email = sent[0]
    assert email["subject"] == "Confirm you are becoming Head of Family."
    assert head.name in email["body"]
    assert "Your confirmation code to become Head of Family on Unifolio is below." in email[
        "html_body"
    ]


def test_resend_current_head_email_keeps_the_current_head_wording(monkeypatch):
    db = _session()
    user, _, candidate = _household(db)
    result = _start(db, user, candidate)
    sent = _record_email(monkeypatch)

    _head_change().resend_head_change_code(
        db, user, result.request.id, "current", "email"
    )

    assert len(sent) == 1
    email = sent[0]
    assert email["subject"] == "Confirm a change of Head of Family."
    assert candidate.name in email["body"]
    assert "Your confirmation code to change the Head of Family on Unifolio is below." in email[
        "html_body"
    ]


def test_start_requires_a_fresh_confirmation_from_the_current_head():
    db = _session()
    user, _, candidate = _household(db)
    from app.services.auth.otp import create_otp_request

    _, login_code = create_otp_request(
        db, user.email, channel="email", purpose="login"
    )

    with pytest.raises(_head_change().HeadChangeError) as exc:
        _head_change().start_head_change(db, user, candidate.id, login_code)

    _assert_error(
        exc,
        status=401,
        code="wrong_code",
        message="That code is not right.",
    )
    assert db.query(HeadChangeRequest).count() == 0

    result = _head_change().start_head_change(
        db, user, candidate.id, _start_code(db, user, candidate)
    )
    assert result.status.verified_count == 1
    assert result.status.current_email_verified is True


def test_start_twice_returns_409_while_one_is_open():
    db = _session()
    user, _, candidate = _household(db)
    _start(db, user, candidate)

    with pytest.raises(_head_change().HeadChangeError) as exc:
        _head_change().start_head_change(
            db, user, candidate.id, _start_code(db, user, candidate)
        )

    _assert_error(
        exc,
        status=409,
        code="head_change_already_open",
        message="A change is already waiting for codes. Cancel it or wait for it to expire.",
    )


def test_wrong_code_increments_attempts_and_locks_at_five():
    db = _session()
    user, _, candidate = _household(db)
    result = _start(db, user, candidate)

    for expected_attempts in range(1, 6):
        with pytest.raises(_head_change().HeadChangeError) as exc:
            _head_change().verify_head_change_code(
                db, user, result.request.id, "current", "phone", "000000"
            )
        _assert_error(
            exc,
            status=401,
            code="wrong_code",
            message="That code is not right.",
        )
        row = db.query(OtpRequest).filter_by(
            phone_number=user.phone_number, purpose="head_change"
        ).one()
        assert row.attempt_count == expected_attempts

    with pytest.raises(_head_change().HeadChangeError) as exc:
        _head_change().verify_head_change_code(
            db,
            user,
            result.request.id,
            "current",
            "phone",
            _code(result, "current", "phone"),
        )
    _assert_error(
        exc,
        status=401,
        code="code_locked",
        message="Too many incorrect attempts. Ask for another code.",
    )


def test_expired_request_changes_nothing():
    db = _session()
    user, head, candidate = _household(db)
    result = _start(db, user, candidate)
    result.request.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    with pytest.raises(_head_change().HeadChangeError) as exc:
        _head_change().verify_head_change_code(
            db,
            user,
            result.request.id,
            "current",
            "phone",
            _code(result, "current", "phone"),
        )

    _assert_error(
        exc,
        status=410,
        code="request_expired",
        message="The codes expired. Nothing has changed. Start again.",
    )
    db.refresh(result.request)
    db.refresh(head)
    db.refresh(candidate)
    assert result.request.status == "expired"
    assert result.request.current_phone_verified_at is None
    assert head.is_head is True
    assert candidate.is_head is False


def test_all_four_codes_are_required_any_three_leave_heads_unchanged():
    db = _session()
    user, head, candidate = _household(db)
    result = _start(db, user, candidate)

    status = _head_change().verify_head_change_code(
        db,
        user,
        result.request.id,
        "current",
        "phone",
        _code(result, "current", "phone"),
    )
    status = _head_change().verify_head_change_code(
        db,
        user,
        result.request.id,
        "new",
        "email",
        _code(result, "new", "email"),
    )

    assert status.verified_count == 3
    assert status.ready is False
    assert status.status == "pending"
    db.refresh(head)
    db.refresh(candidate)
    assert head.is_head is True
    assert candidate.is_head is False


def test_four_verified_codes_report_ready_without_swapping_heads():
    db = _session()
    user, head, candidate = _household(db)
    result = _start(db, user, candidate)

    for party, channel in [
        ("current", "phone"),
        ("new", "email"),
        ("new", "phone"),
    ]:
        status = _head_change().verify_head_change_code(
            db,
            user,
            result.request.id,
            party,
            channel,
            _code(result, party, channel),
        )

    assert status.verified_count == 4
    assert status.ready is True
    assert status.status == "ready"
    db.refresh(result.request)
    db.refresh(head)
    db.refresh(candidate)
    assert result.request.status == "pending"
    assert head.is_head is True
    assert candidate.is_head is False


def test_cancel_frees_the_slot():
    db = _session()
    user, _, candidate = _household(db)
    first = _start(db, user, candidate)

    cancelled = _head_change().cancel_head_change(db, user)
    second = _head_change().start_head_change(
        db, user, candidate.id, _start_code(db, user, candidate)
    )

    assert cancelled.status == "cancelled"
    assert first.request.status == "cancelled"
    assert second.request.status == "pending"
    assert second.request.id != first.request.id


def test_expired_pending_request_does_not_block_a_new_start():
    db = _session()
    user, _, candidate = _household(db)
    first = _start(db, user, candidate)
    first.request.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    second = _head_change().start_head_change(
        db, user, candidate.id, _start_code(db, user, candidate)
    )

    db.refresh(first.request)
    assert first.request.status == "expired"
    assert second.request.status == "pending"


def test_foreign_request_id_behaves_like_an_unknown_id():
    db = _session()
    user_a, _, candidate_a = _household(db, suffix="1")
    user_b, _, _ = _household(db, suffix="2")
    result = _start(db, user_a, candidate_a)

    failures = []
    for request_id in [result.request.id, uuid.uuid4()]:
        with pytest.raises(_head_change().HeadChangeError) as exc:
            _head_change().verify_head_change_code(
                db, user_b, request_id, "current", "phone", "000000"
            )
        failures.append((exc.value.status_code, exc.value.code, exc.value.message))

    assert failures == [
        (404, "request_not_found", "Head change request not found."),
        (404, "request_not_found", "Head change request not found."),
    ]


def test_wrong_code_is_counted_even_when_the_surrounding_request_fails():
    db = _session()
    user, _, candidate = _household(db)
    result = _start(db, user, candidate)

    with pytest.raises(_head_change().HeadChangeError):
        _head_change().verify_head_change_code(
            db, user, result.request.id, "current", "phone", "000000"
        )
    db.rollback()

    row = db.query(OtpRequest).filter_by(
        phone_number=user.phone_number, purpose="head_change"
    ).one()
    assert row.attempt_count == 1


@pytest.mark.parametrize(
    ("case", "status", "code", "message"),
    [
        (
            "no_email",
            409,
            "member_not_eligible",
            "Add an email address and a phone number first.",
        ),
        (
            "no_pan",
            409,
            "member_not_eligible",
            "Add their PAN in their profile first.",
        ),
        (
            "same_email",
            409,
            "contact_same_as_head",
            "This email is the same as yours, so a code to it proves nothing. Use a different one.",
        ),
        (
            "email_in_use",
            409,
            "contact_in_use",
            "This email already belongs to another Unifolio account. They would need to use a different one. Contact support if you think this is a mistake.",
        ),
        (
            "pan_elsewhere",
            409,
            "pan_registered_elsewhere",
            "This person's PAN is already on another Unifolio account, so they cannot become head.",
        ),
        (
            "import",
            409,
            "import_in_progress",
            "Finish or cancel the statement you are importing, then try again.",
        ),
        (
            "label",
            409,
            "member_not_eligible",
            "The change cannot start until the new head's label is set.",
        ),
    ],
)
def test_each_error_code_returns_its_own_message(case, status, code, message):
    db = _session()
    user, head, candidate = _household(db)
    if case == "no_email":
        candidate.email = None
    elif case == "no_pan":
        candidate.pan_encrypted = candidate.pan_lookup_hash = None
    elif case == "same_email":
        candidate.email = user.email
    elif case == "email_in_use":
        db.add(
            User(
                id=uuid.uuid4(),
                phone_number="+917000000099",
                email=candidate.email,
                created_at=NOW,
            )
        )
    elif case == "pan_elsewhere":
        candidate.pan_encrypted = candidate.pan_lookup_hash = None
        candidate.detected_pan_encrypted = "encrypted-conflict"
        candidate.detected_pan_hash = "conflicting-pan"
        candidate.pan_conflict = MemberPanConflict.OTHER_ACCOUNT
    elif case == "import":
        db.add(
            Import(
                id=uuid.uuid4(),
                household_member_id=head.id,
                status=ImportStatus.PREVIEWING,
                uploaded_at=NOW,
            )
        )
    elif case == "label":
        candidate.relationship = None
    db.commit()

    with pytest.raises(_head_change().HeadChangeError) as exc:
        _head_change().start_head_change(
            db, user, candidate.id, _start_code(db, user, candidate)
        )

    _assert_error(exc, status=status, code=code, message=message)


def test_failed_email_delivery_saves_no_request_or_new_code_and_uses_no_throttle(monkeypatch):
    db = _session()
    user, _, candidate = _household(db)
    start_code = _start_code(db, user, candidate)
    from app.config import settings
    from app.services.auth import otp as otp_module
    from app.services.auth.email_provider import EmailSendError

    class FailingProvider:
        def send_email(self, **_kwargs):
            raise EmailSendError("provider failed")

    monkeypatch.setattr(settings, "email_delivery_mode", "ses")
    monkeypatch.setattr(otp_module, "get_email_provider", lambda: FailingProvider())

    with pytest.raises(_head_change().HeadChangeError) as exc:
        _head_change().start_head_change(db, user, candidate.id, start_code)

    _assert_error(
        exc,
        status=502,
        code="email_send_failed",
        message="We could not send the email just now. Try again in a minute.",
    )
    assert db.query(HeadChangeRequest).count() == 0
    assert db.query(OtpRequest).filter_by(
        phone_number=user.phone_number, purpose="head_change"
    ).count() == 0
    assert db.query(OtpRequest).filter_by(
        email=candidate.email, purpose="head_change"
    ).count() == 0

    monkeypatch.setattr(settings, "email_delivery_mode", "stub")
    retry_code = _start_code(db, user, candidate)
    retry = _head_change().start_head_change(db, user, candidate.id, retry_code)
    assert retry.request.status == "pending"


def test_pending_read_expires_a_stale_request_and_returns_none():
    db = _session()
    user, _, candidate = _household(db)
    result = _start(db, user, candidate)
    result.request.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    assert _head_change().get_pending_head_change(db, user) is None
    db.refresh(result.request)
    assert result.request.status == "expired"


def test_a_race_at_the_one_open_request_index_answers_409_not_a_server_error(monkeypatch):
    """Two starts can both pass the eligibility read; the database index decides, and the loser gets 409."""
    db = _session()
    user, head, candidate = _household(db)
    start_code = _start_code(db, user, candidate)
    db.add(
        HeadChangeRequest(
            user_id=user.id,
            from_member_id=head.id,
            to_member_id=candidate.id,
            status="pending",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            snapshot={"destinations": {"current": {"email": user.email, "phone": user.phone_number},
                                       "new": {"email": candidate.email, "phone": candidate.phone_number}}},
        )
    )
    db.commit()
    head_change = _head_change()
    monkeypatch.setattr(head_change, "member_eligibility", lambda *args, **kwargs: [])

    with pytest.raises(head_change.HeadChangeError) as exc:
        head_change.start_head_change(db, user, candidate.id, start_code)

    _assert_error(
        exc,
        status=409,
        code="head_change_already_open",
        message="A change is already waiting for codes. Cancel it or wait for it to expire.",
    )
    assert db.query(HeadChangeRequest).count() == 1


def _verify_all(db, user, result):
    for party, channel in [
        ("current", "phone"),
        ("new", "email"),
        ("new", "phone"),
    ]:
        _head_change().verify_head_change_code(
            db,
            user,
            result.request.id,
            party,
            channel,
            _code(result, party, channel),
        )


def test_preview_matches_what_complete_does_to_the_labels():
    from app.services.legal.consent import ConsentEvidence

    db = _session()
    user, head, candidate = _household(db, suffix="pv1")
    parent = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Parent 1",
        relationship=Relationship.PARENT,
        is_head=False,
        created_at=NOW + timedelta(seconds=1),
    )
    child = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Child 1",
        relationship=Relationship.CHILD,
        is_head=False,
        created_at=NOW + timedelta(seconds=2),
    )
    sibling = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Sibling 1",
        relationship=Relationship.SIBLING,
        is_head=False,
        created_at=NOW + timedelta(seconds=3),
    )
    db.add_all([parent, child, sibling])
    db.commit()

    result = _start(db, user, candidate)
    _verify_all(db, user, result)

    preview = _head_change().preview_head_change(db, user, result.request.id)

    # Complete the change
    _head_change().complete_head_change(
        db,
        user,
        result.request.id,
        evidence=ConsentEvidence(
            ip_truncated="127.0.0.0",
            ip_hmac="test",
            user_agent="pytest",
            device_id=None,
        ),
    )

    db.refresh(head)
    db.refresh(candidate)
    db.refresh(parent)
    db.refresh(child)
    db.refresh(sibling)

    # Old head:
    assert preview.old_head.member_id == head.id
    assert preview.old_head.name == head.name
    assert preview.old_head_new_label == head.relationship.value

    # New head:
    assert preview.new_head.member_id == candidate.id
    assert preview.new_head.name == candidate.name
    assert preview.new_head.email == candidate.email
    assert preview.new_head.phone_number == candidate.phone_number

    # Old head is NOT in preview.members
    assert all(m.member_id != head.id for m in preview.members)

    # Every member in preview.members matches what complete_head_change did to the labels in DB
    preview_by_id = {m.member_id: m for m in preview.members}
    for member in [candidate, parent, child, sibling]:
        p = preview_by_id[member.id]
        expected_label = member.relationship.value if member.relationship else None
        assert p.label_after == expected_label
        assert p.label_after_other == member.relationship_other_label

    assert preview.everyone_signed_out is True


def test_preview_writes_nothing_and_sends_nothing(monkeypatch):
    db = _session()
    user, head, candidate = _household(db, suffix="pv2")
    result = _start(db, user, candidate)
    sent = _record_email(monkeypatch)

    req_status_before = result.request.status
    req_expires_before = result.request.expires_at

    preview = _head_change().preview_head_change(db, user, result.request.id)

    assert len(sent) == 0
    assert not db.dirty
    assert not db.new
    assert not db.deleted

    db.refresh(result.request)
    assert result.request.status == req_status_before
    assert result.request.expires_at == req_expires_before
    assert preview.request_id == result.request.id


def test_preview_marks_review_recommended_and_cleared():
    db = _session()
    user, head, candidate = _household(db, suffix="pv3")  # candidate is SPOUSE
    child = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Child 1",
        relationship=Relationship.CHILD,
        is_head=False,
        created_at=NOW + timedelta(seconds=1),
    )
    uncle = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Uncle 1",
        relationship=Relationship.OTHER,
        relationship_other_label="Uncle",
        is_head=False,
        created_at=NOW + timedelta(seconds=2),
    )
    friend = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Friend 1",
        relationship=Relationship.OTHER,
        relationship_other_label="Friend",
        is_head=False,
        created_at=NOW + timedelta(seconds=3),
    )
    db.add_all([child, uncle, friend])
    db.commit()

    result = _start(db, user, candidate)
    preview = _head_change().preview_head_change(db, user, result.request.id)

    p_map = {m.member_id: m for m in preview.members}

    # Child becomes child with review_recommended=True (stepchild case)
    assert p_map[child.id].label_before == "child"
    assert p_map[child.id].label_after == "child"
    assert p_map[child.id].review_recommended is True
    assert p_map[child.id].cleared is False

    # Uncle has asymmetric free text ("Uncle"), which is cleared (label_after is None)
    assert p_map[uncle.id].label_before == "other"
    assert p_map[uncle.id].label_before_other == "Uncle"
    assert p_map[uncle.id].label_after is None
    assert p_map[uncle.id].label_after_other is None
    assert p_map[uncle.id].cleared is True
    assert p_map[uncle.id].review_recommended is False

    # Friend has symmetric free text ("Friend"), which is kept
    assert p_map[friend.id].label_before == "other"
    assert p_map[friend.id].label_before_other == "Friend"
    assert p_map[friend.id].label_after == "other"
    assert p_map[friend.id].label_after_other == "Friend"
    assert p_map[friend.id].cleared is False
    assert p_map[friend.id].review_recommended is False

    # Candidate becomes self
    assert p_map[candidate.id].label_before == "spouse"
    assert p_map[candidate.id].label_after == "self"
    assert p_map[candidate.id].cleared is False
    assert p_map[candidate.id].review_recommended is False



def test_preview_refuses_like_the_final_step_when_the_new_heads_label_is_no_longer_usable():
    db = _session()
    user, _, candidate = _household(db, suffix="pv4")
    result = _start(db, user, candidate)
    # Changed after the request began (the member's profile can be edited at any time).
    candidate.relationship = Relationship.OTHER
    candidate.relationship_other_label = "friend"
    db.commit()

    with pytest.raises(_head_change().HeadChangeError) as exc:
        _head_change().preview_head_change(db, user, result.request.id)

    _assert_error(
        exc,
        status=409,
        code="member_not_eligible",
        message="The change cannot start until the new head's label is set.",
    )
