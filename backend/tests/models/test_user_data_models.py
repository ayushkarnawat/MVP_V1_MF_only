import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import Relationship
from app.models.user import HouseholdMember, User


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__, HouseholdMember.__table__])
    return sessionmaker(bind=engine)()


def test_household_member_belongs_to_user():
    db = _session()
    user = User(id=uuid.uuid4(), phone_number="+919999999999", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.commit()

    member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Self",
        relationship=Relationship.SELF,
        created_at=datetime.now(timezone.utc),
    )
    db.add(member)
    db.commit()

    fetched = db.query(HouseholdMember).filter_by(name="Self").one()
    assert fetched.user_id == user.id
    assert fetched.relationship == Relationship.SELF


def test_enum_column_persists_lowercase_value_not_member_name():
    """Enum columns must store '.value' — the raw partitioned-table CHECK
    constraint in migration 0001 only permits lowercase values."""
    db = _session()
    user = User(id=uuid.uuid4(), phone_number="+919888888888", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.add(HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Spouse",
        relationship=Relationship.SPOUSE,
        created_at=datetime.now(timezone.utc),
    ))
    db.commit()

    stored = db.execute(
        text("SELECT relationship FROM household_members WHERE name = 'Spouse'")
    ).scalar_one()
    assert stored == "spouse"
