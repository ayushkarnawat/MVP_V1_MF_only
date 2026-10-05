from datetime import datetime, timezone
import uuid
import pytest

from app.models.enums import ImportStatus, Relationship
from app.models.user import HouseholdMember, User
from app.services.import_.cams_portal import (
    build_cams_mailback_url,
    cancel_pending_request,
    expire_stale_cams_requests,
    initiate_cams_request,
)


@pytest.fixture
def member_setup(db_session):
    now = datetime.now(timezone.utc)
    user = User(
        id=uuid.uuid4(),
        phone_number="+919876543210",
        email="rajesh.kumar@example.com",
        created_at=now,
    )
    db_session.add(user)
    db_session.flush()

    member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Rajesh Kumar",
        relationship=Relationship.SELF,
        created_at=now,
    )
    db_session.add(member)
    db_session.commit()

    return {"user": user, "member": member}


def test_build_cams_mailback_url():
    url = build_cams_mailback_url()
    assert url == "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement"


def test_initiate_cams_request_creates_waiting_for_user_session(db_session, member_setup):
    user = member_setup["user"]
    member = member_setup["member"]

    import_rec, cams_url = initiate_cams_request(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
    )

    assert import_rec.status == ImportStatus.WAITING_FOR_USER
    assert import_rec.source_tab == "request"
    assert import_rec.expires_at is not None
    assert "camsonline" in cams_url


def test_cancel_pending_request_transitions_to_expired(db_session, member_setup):
    user = member_setup["user"]
    member = member_setup["member"]

    import_rec, _ = initiate_cams_request(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
    )
    assert import_rec.status == ImportStatus.WAITING_FOR_USER

    cancelled = cancel_pending_request(
        db=db_session,
        import_id=import_rec.id,
        user_id=user.id,
    )

    assert cancelled.status == ImportStatus.EXPIRED


def test_expire_stale_cams_requests_expires_only_requests_past_their_window(db_session, member_setup):
    from datetime import timedelta

    user, member = member_setup["user"], member_setup["member"]
    stale, _ = initiate_cams_request(db=db_session, user_id=user.id, household_member_id=member.id)
    now = datetime.now(timezone.utc)

    # Still inside the 48-hour window: untouched.
    assert expire_stale_cams_requests(db_session, now=now) == 0
    assert stale.status == ImportStatus.WAITING_FOR_USER

    # Past it: expired, and a second run finds nothing more to do.
    assert expire_stale_cams_requests(db_session, now=now + timedelta(hours=49)) == 1
    db_session.refresh(stale)
    assert stale.status == ImportStatus.EXPIRED
    assert expire_stale_cams_requests(db_session, now=now + timedelta(hours=49)) == 0
