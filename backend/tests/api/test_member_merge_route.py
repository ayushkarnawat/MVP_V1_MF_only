from datetime import datetime, timezone

from app.db.session import get_db
from app.models.enums import AuthIdentityProvider, MemberOrigin, MemberPanSource, Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.session import create_session
from app.services.import_.crypto import encrypt_pan, hash_pan


def test_merge_route_merges_and_returns_counts(client):
    db = next(client.app.dependency_overrides[get_db]())
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919500000001", created_at=now)
    db.add(user)
    db.flush()
    # The target holds a statement PAN, so merging it into the name-only
    # source is refused (M11) while the reverse is allowed.
    target = HouseholdMember(
        user_id=user.id, name="Ramesh Kumar Sharma", relationship=Relationship.PARENT, created_at=now,
        pan_encrypted=encrypt_pan("AAAPZ1234C"), pan_lookup_hash=hash_pan("AAAPZ1234C"),
        pan_source=MemberPanSource.CAS,
    )
    source = HouseholdMember(
        user_id=user.id, name="Ramesh Sharma", relationship=None, created_at=now,
        origin=MemberOrigin.CAS_DETECTED,
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


import pytest
from unittest.mock import AsyncMock

@pytest.fixture(autouse=True)
def snapshot_background_test_db(monkeypatch):
    from .import_helpers import _test_db
    monkeypatch.setattr("app.services.dashboard.snapshots.SessionLocal", _test_db)
    monkeypatch.setattr("app.services.dashboard.snapshots.warm_nav_history", AsyncMock())
