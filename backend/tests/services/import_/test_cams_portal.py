from datetime import datetime, timezone
import uuid
import pytest

from app.models.enums import ImportStatus, Relationship
from app.models.user import HouseholdMember, User
from app.services.import_.cams_portal import (
    build_cams_mailback_url,
    cancel_pending_request,
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
