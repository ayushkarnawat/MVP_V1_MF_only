import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.auth import AuthIdentity, HeadChangeRequest
from app.models.enums import (
    AuthIdentityProvider,
    ImportStatus,
    MemberPanConflict,
    Relationship,
)
from app.models.imports import Import
from app.models.user import HouseholdMember, User
from app.services.auth.head_eligibility import member_eligibility
from app.services.dashboard.member_details import MemberNotFoundError


NOW = datetime(2026, 11, 2, tzinfo=timezone.utc)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _member(
    user: User,
    *,
    name: str,
    relationship: Relationship | None,
    is_head: bool = False,
    email: str | None = None,
    phone: str | None = None,
    pan_hash: str | None = None,
) -> HouseholdMember:
    return HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=name,
        relationship=relationship,
        is_head=is_head,
        email=email,
        phone_number=phone,
        pan_encrypted="encrypted-pan" if pan_hash else None,
        pan_lookup_hash=pan_hash,
        created_at=NOW,
    )


def _eligible_household():
    db = _session()
    user = User(
        id=uuid.uuid4(),
        phone_number="+919000000001",
        email="head@example.com",
        created_at=NOW,
    )
    head = _member(user, name="Head", relationship=Relationship.SELF, is_head=True)
    candidate = _member(
        user,
        name="Candidate",
        relationship=Relationship.SPOUSE,
        email="candidate@example.com",
        phone="+919000000002",
        pan_hash="candidate-pan-hash",
    )
    db.add_all([user, head, candidate])
    db.commit()
    return db, user, head, candidate


def _other_user(db, *, email="other@example.com", phone="+919000000099") -> User:
    user = User(id=uuid.uuid4(), phone_number=phone, email=email, created_at=NOW)
    db.add(user)
    db.flush()
    return user


def _identity(db, user, *, subject, email=None, provider=AuthIdentityProvider.EMAIL_OTP):
    db.add(
        AuthIdentity(
            id=uuid.uuid4(),
            user_id=user.id,
            provider=provider,
            provider_subject=subject,
            email=email,
            identifier_verified_at=NOW,
            created_at=NOW,
            last_used_at=NOW,
        )
    )
    db.flush()


def test_eligible_member_has_no_reasons():
    db, user, _, candidate = _eligible_household()

    assert member_eligibility(db, user, candidate.id) == []


def test_no_email():
    db, user, _, candidate = _eligible_household()
    candidate.email = None

    assert member_eligibility(db, user, candidate.id) == ["no_email"]


def test_no_phone():
    db, user, _, candidate = _eligible_household()
    candidate.phone_number = None

    assert member_eligibility(db, user, candidate.id) == ["no_phone"]


def test_same_email_as_head_is_case_insensitive():
    db, user, _, candidate = _eligible_household()
    candidate.email = " HEAD@EXAMPLE.COM "

    assert member_eligibility(db, user, candidate.id) == ["same_email_as_head"]


def test_same_phone_as_head_uses_the_apps_normalised_form():
    db, user, _, candidate = _eligible_household()
    candidate.phone_number = "+91 90000 00001"

    assert member_eligibility(db, user, candidate.id) == ["same_phone_as_head"]


def test_email_in_use_checks_other_users_case_insensitively():
    db, user, _, candidate = _eligible_household()
    _other_user(db, email="CANDIDATE@EXAMPLE.COM")

    assert member_eligibility(db, user, candidate.id) == ["email_in_use"]


def test_phone_in_use_checks_other_users_in_normalised_form():
    db, user, _, candidate = _eligible_household()
    _other_user(db, phone="+91 90000 00002")

    assert member_eligibility(db, user, candidate.id) == ["phone_in_use"]


def test_contact_check_also_looks_at_identity_email_column():
    db, user, _, candidate = _eligible_household()
    other = _other_user(db)
    _identity(
        db,
        other,
        subject="google-subject-not-an-email",
        email="CANDIDATE@EXAMPLE.COM",
        provider=AuthIdentityProvider.GOOGLE,
    )

    assert member_eligibility(db, user, candidate.id) == ["email_in_use"]


def test_contact_check_looks_at_identity_subject_for_email_and_phone():
    db, user, _, candidate = _eligible_household()
    email_owner = _other_user(db, phone="+919000000090")
    phone_owner = _other_user(db, phone="+919000000091")
    _identity(db, email_owner, subject="CANDIDATE@EXAMPLE.COM")
    _identity(
        db,
        phone_owner,
        subject="+919000000002",
        provider=AuthIdentityProvider.PHONE_OTP,
    )

    assert member_eligibility(db, user, candidate.id) == ["email_in_use", "phone_in_use"]


def test_this_accounts_own_identity_contacts_count_as_same_as_head_not_in_use():
    db, user, _, candidate = _eligible_household()
    _identity(db, user, subject=candidate.email, email=candidate.email)
    _identity(db, user, subject=candidate.phone_number, provider=AuthIdentityProvider.PHONE_OTP)

    assert member_eligibility(db, user, candidate.id) == [
        "same_email_as_head",
        "same_phone_as_head",
    ]


def test_pan_registered_elsewhere():
    db, user, _, candidate = _eligible_household()
    candidate.pan_encrypted = candidate.pan_lookup_hash = None
    candidate.detected_pan_encrypted = "encrypted-conflicting-pan"
    candidate.detected_pan_hash = "conflicting-pan-hash"
    candidate.pan_conflict = MemberPanConflict.OTHER_ACCOUNT

    assert member_eligibility(db, user, candidate.id) == ["pan_registered_elsewhere"]


def test_no_pan():
    db, user, _, candidate = _eligible_household()
    candidate.pan_encrypted = candidate.pan_lookup_hash = None

    assert member_eligibility(db, user, candidate.id) == ["no_pan"]


@pytest.mark.parametrize("relationship", [None, Relationship.OTHER])
def test_label_missing(relationship):
    db, user, _, candidate = _eligible_household()
    candidate.relationship = relationship
    candidate.relationship_other_label = None

    assert member_eligibility(db, user, candidate.id) == ["label_missing"]


@pytest.mark.parametrize("free_text", ["friend", "Grandfather", "  "])
def test_an_other_label_with_free_text_is_still_label_missing(free_text):
    # Found in the Run 5 review: "other: friend" passed every check here, then the final step
    # refused it (the old head's new label cannot be worked out from "other"), after all four
    # codes had been used.
    db, user, _, candidate = _eligible_household()
    candidate.relationship = Relationship.OTHER
    candidate.relationship_other_label = free_text

    assert member_eligibility(db, user, candidate.id) == ["label_missing"]


@pytest.mark.parametrize("relationship", [Relationship.SPOUSE, Relationship.PARENT, Relationship.CHILD, Relationship.SIBLING])
def test_a_specific_label_is_enough(relationship):
    db, user, _, candidate = _eligible_household()
    candidate.relationship = relationship
    candidate.relationship_other_label = None

    assert member_eligibility(db, user, candidate.id) == []


@pytest.mark.parametrize("field", ["pending_deletion", "deletion_scheduled_at"])
def test_account_pending_deletion(field):
    db, user, _, candidate = _eligible_household()
    if field == "pending_deletion":
        user.pending_deletion = True
    else:
        user.deletion_scheduled_at = NOW + timedelta(days=1)

    assert member_eligibility(db, user, candidate.id) == ["account_pending_deletion"]


ACTIVE_IMPORT_STATUSES = [
    ImportStatus.PREVIEWING,
    ImportStatus.PENDING,
    ImportStatus.NOT_STARTED,
    ImportStatus.REQUESTING_CAS,
    ImportStatus.WAITING_FOR_USER,
    ImportStatus.UPLOAD_STARTED,
    ImportStatus.PASSWORD_REQUIRED,
    ImportStatus.VALIDATION_FAILED,
    ImportStatus.PROCESSING,
    ImportStatus.RETRY_PENDING,
]


@pytest.mark.parametrize("status", ACTIVE_IMPORT_STATUSES)
def test_import_in_progress_for_each_non_terminal_import_status(status):
    db, user, head, candidate = _eligible_household()
    db.add(
        Import(
            id=uuid.uuid4(),
            household_member_id=head.id,
            status=status,
            uploaded_at=NOW,
        )
    )
    db.flush()

    assert member_eligibility(db, user, candidate.id) == ["import_in_progress"]


@pytest.mark.parametrize(
    "status",
    [
        ImportStatus.CONFIRMED,
        ImportStatus.FAILED,
        ImportStatus.IMPORT_SUCCESSFUL,
        ImportStatus.IMPORT_FAILED,
        ImportStatus.EXPIRED,
    ],
)
def test_terminal_import_does_not_block_eligibility(status):
    db, user, head, candidate = _eligible_household()
    db.add(
        Import(
            id=uuid.uuid4(),
            household_member_id=head.id,
            status=status,
            uploaded_at=NOW,
        )
    )
    db.flush()

    assert member_eligibility(db, user, candidate.id) == []


def test_live_pan_claim_is_import_in_progress_but_an_expired_claim_is_not():
    db, user, head, candidate = _eligible_household()
    head.pan_encrypted = "pending-pan"
    head.pan_lookup_hash = "pending-pan-hash"
    head.pan_pending_until = datetime.now(timezone.utc) + timedelta(minutes=5)

    assert member_eligibility(db, user, candidate.id) == ["import_in_progress"]

    head.pan_pending_until = datetime.now(timezone.utc) - timedelta(minutes=1)
    assert member_eligibility(db, user, candidate.id) == []


def test_head_change_already_open():
    db, user, head, candidate = _eligible_household()
    db.add(
        HeadChangeRequest(
            id=uuid.uuid4(),
            user_id=user.id,
            from_member_id=head.id,
            to_member_id=candidate.id,
            status="pending",
            expires_at=NOW + timedelta(minutes=10),
        )
    )
    db.flush()

    assert member_eligibility(db, user, candidate.id) == ["head_change_already_open"]


def test_reasons_are_returned_in_the_documented_order():
    db, user, _, candidate = _eligible_household()
    candidate.email = user.email
    candidate.phone_number = user.phone_number
    candidate.pan_encrypted = candidate.pan_lookup_hash = None
    candidate.relationship = None
    user.pending_deletion = True
    other = _other_user(db, email=user.email)
    _identity(db, other, subject=user.email, email=user.email)
    _identity(
        db,
        other,
        subject=user.phone_number,
        provider=AuthIdentityProvider.PHONE_OTP,
    )

    assert member_eligibility(db, user, candidate.id) == [
        "same_email_as_head",
        "same_phone_as_head",
        "email_in_use",
        "phone_in_use",
        "no_pan",
        "label_missing",
        "account_pending_deletion",
    ]


@pytest.mark.parametrize("target", ["current_head", "foreign_member", "unknown"])
def test_current_head_foreign_member_and_unknown_id_are_indistinguishable(target):
    db, user, head, _ = _eligible_household()
    member_id = uuid.uuid4()
    if target == "current_head":
        member_id = head.id
    elif target == "foreign_member":
        other = _other_user(db)
        foreign = _member(
            other,
            name="Foreign",
            relationship=Relationship.SPOUSE,
            email="foreign@example.com",
            phone="+919000000088",
            pan_hash="foreign-pan-hash",
        )
        db.add(foreign)
        db.flush()
        member_id = foreign.id

    with pytest.raises(MemberNotFoundError) as exc:
        member_eligibility(db, user, member_id)

    assert exc.value.code == "member_not_found"
    assert exc.value.message == "Household member not found."
