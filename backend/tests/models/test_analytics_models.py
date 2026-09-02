import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
from app.models.user import User


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine, tables=[User.__table__, AnalyticsSection.__table__, AnalyticsRecomputeStatus.__table__]
    )
    return sessionmaker(autoflush=False, bind=engine)()


def _user(db) -> User:
    user = User(id=uuid.uuid4(), phone_number="+919999999999", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.commit()
    return user


def test_analytics_section_round_trip_for_combined_scope():
    db = _session()
    user = _user(db)
    now = datetime.now(timezone.utc)

    row = AnalyticsSection(
        user_id=user.id, scope_key="combined", section="allocation", household_member_id=None,
        payload={"by_category": [], "by_amc": [], "total_value": "0"}, computed_at=now, failed_at=None,
    )
    db.add(row)
    db.commit()

    fetched = db.get(AnalyticsSection, (user.id, "combined", "allocation"))
    assert fetched is not None
    assert fetched.payload == {"by_category": [], "by_amc": [], "total_value": "0"}
    assert fetched.household_member_id is None
    assert fetched.failed_at is None


def test_analytics_section_scope_key_is_the_member_id_as_a_string():
    db = _session()
    user = _user(db)
    member_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    row = AnalyticsSection(
        user_id=user.id, scope_key=str(member_id), section="ter", household_member_id=member_id,
        payload={"weighted_ter": None, "covered_value": "0", "total_value": "0", "reference_period": None, "uncovered_schemes": []},
        computed_at=now, failed_at=None,
    )
    db.add(row)
    db.commit()

    fetched = db.get(AnalyticsSection, (user.id, str(member_id), "ter"))
    assert fetched.household_member_id == member_id


def test_analytics_recompute_status_defaults_to_no_started_at():
    db = _session()
    user = _user(db)

    status = AnalyticsRecomputeStatus(user_id=user.id, started_at=None)
    db.add(status)
    db.commit()

    fetched = db.get(AnalyticsRecomputeStatus, user.id)
    assert fetched.started_at is None
