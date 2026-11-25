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


def test_close_member_requests_leaves_other_statuses_alone(db_session, member_setup):
    from app.models.imports import Import
    from app.services.import_.cams_portal import close_member_requests

    statuses = [ImportStatus.REQUESTING_CAS, ImportStatus.CONFIRMED,
                ImportStatus.UPLOAD_STARTED, ImportStatus.EXPIRED, ImportStatus.WAITING_FOR_USER]
    rows = [Import(household_member_id=member_setup["member"].id, status=s,
                   uploaded_at=datetime.now(timezone.utc)) for s in statuses]
    db_session.add_all(rows)
    db_session.commit()
    assert close_member_requests(db_session, [member_setup["member"].id]) == 1
    db_session.flush()
    assert [r.status for r in rows] == statuses[:-1] + [ImportStatus.EXPIRED]
    db_session.rollback()
    assert rows[-1].status == ImportStatus.WAITING_FOR_USER


def test_close_member_requests_only_touches_the_given_members(db_session, member_setup):
    from app.services.import_.cams_portal import close_member_requests
    from tests.services.import_.test_confirm_people import _member, _user

    user, member = member_setup["user"], member_setup["member"]
    other = _member(db_session, user, "Ramesh Sharma", relationship=Relationship.PARENT)
    outsider = _member(db_session, _user(db_session), "Kiran Sharma")
    rows = [initiate_cams_request(db_session, m.user_id, m.id)[0]
            for m in (member, other, outsider)]
    assert close_member_requests(db_session, []) == 0
    assert close_member_requests(db_session, [member.id, other.id]) == 2
    assert [r.status for r in rows] == [ImportStatus.EXPIRED, ImportStatus.EXPIRED, ImportStatus.WAITING_FOR_USER]


def test_get_pending_request_returns_the_waiting_row(db_session, member_setup):
    from app.services.import_.cams_portal import get_pending_request

    user, member = member_setup["user"], member_setup["member"]
    assert get_pending_request(db_session, user.id, member.id) is None
    row, _ = initiate_cams_request(db_session, user.id, member.id)
    assert get_pending_request(db_session, user.id, member.id) is row
    cancel_pending_request(db_session, row.id, user.id)
    assert get_pending_request(db_session, user.id, member.id) is None


def test_get_pending_request_ignores_a_request_past_its_expiry(db_session, member_setup):
    from datetime import timedelta
    from app.services.import_.cams_portal import get_pending_request

    user, member = member_setup["user"], member_setup["member"]
    row, _ = initiate_cams_request(db_session, user.id, member.id)
    expiry = row.expires_at.replace(tzinfo=timezone.utc)
    assert get_pending_request(db_session, user.id, member.id, now=expiry - timedelta(seconds=1)) is row
    assert get_pending_request(db_session, user.id, member.id, now=expiry) is None
    assert get_pending_request(db_session, user.id, member.id, now=expiry + timedelta(seconds=1)) is None
    assert row.status == ImportStatus.WAITING_FOR_USER


def test_get_pending_request_is_scoped_to_the_user(db_session, member_setup):
    from app.services.import_.cams_portal import get_pending_request
    from tests.services.import_.test_confirm_people import _member, _user

    user, member = member_setup["user"], member_setup["member"]
    outsider = _member(db_session, _user(db_session), "Kiran Sharma")
    initiate_cams_request(db_session, user.id, member.id)
    initiate_cams_request(db_session, outsider.user_id, outsider.id)
    assert get_pending_request(db_session, outsider.user_id, member.id) is None
    assert get_pending_request(db_session, user.id, outsider.id) is None
