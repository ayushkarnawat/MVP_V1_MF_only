import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import ImportStatus, Relationship
from app.models.imports import Import
from app.models.user import HouseholdMember, User
from app.services.dashboard.aggregate import get_aggregate_holdings, get_member_statuses


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _user_with_members(db, names: list[str]):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    members = []
    for name in names:
        member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name=name, relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
        db.add(member)
        members.append(member)
    db.commit()
    return user, members


def test_get_member_statuses_marks_member_without_confirmed_import_as_no_data():
    db = _session()
    user, (member_with_data, member_without) = _user_with_members(db, ["Mom", "Dad"])
    db.add(Import(id=uuid.uuid4(), household_member_id=member_with_data.id, status=ImportStatus.CONFIRMED, uploaded_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc)))
    db.commit()

    statuses = get_member_statuses(db, user.id)
    by_name = {s.name: s.has_data for s in statuses}
    assert by_name["Mom"] is True
    assert by_name["Dad"] is False


def test_get_member_statuses_pending_import_does_not_count_as_data():
    db = _session()
    user, (member,) = _user_with_members(db, ["Solo"])
    db.add(Import(id=uuid.uuid4(), household_member_id=member.id, status=ImportStatus.PENDING, uploaded_at=datetime.now(timezone.utc)))
    db.commit()

    statuses = get_member_statuses(db, user.id)
    assert statuses[0].has_data is False


def test_get_aggregate_holdings_includes_members_list_with_placeholder():
    db = _session()
    user, (member_a, member_b) = _user_with_members(db, ["Mom", "Dad"])

    response = asyncio.run(get_aggregate_holdings(db, user.id))
    assert {m.name for m in response.members} == {"Mom", "Dad"}
    assert all(m.has_data is False for m in response.members)
    assert response.holdings == []
