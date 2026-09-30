from datetime import datetime, timezone

from app.db.session import get_db
from app.models.enums import AuthIdentityProvider, MemberLockReason, Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.session import create_session


def test_merge_route_merges_and_returns_counts(client):
    db = next(client.app.dependency_overrides[get_db]())
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919500000001", created_at=now)
    db.add(user)
    db.flush()
    target = HouseholdMember(user_id=user.id, name="Ramesh Kumar Sharma", relationship=Relationship.PARENT, created_at=now)
    source = HouseholdMember(
        user_id=user.id, name="Ramesh Sharma", relationship=None, created_at=now,
        details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED,
    )
    db.add_all([target, source])
    _, token = create_session(db, user.id, auth_method=AuthIdentityProvider.PHONE_OTP)
    db.commit()
    source_id = source.id
    headers = {"Authorization": f"Bearer {token}"}

    bad = client.post(f"/household-members/{target.id}/merge-into/{source.id}", headers=headers)
    assert bad.status_code == 409 and bad.json()["detail"]["code"] == "merge_not_allowed"

    ok = client.post(f"/household-members/{source.id}/merge-into/{target.id}", headers=headers)
    assert ok.status_code == 200
    assert ok.json() == {"folios_moved": 0, "transactions_dropped": 0}
    db.expire_all()
    assert db.get(HouseholdMember, source_id) is None
    db.close()
