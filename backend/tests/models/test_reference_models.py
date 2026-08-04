import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import ArnDirectory, Scheme
from app.models.enums import ArnStatus


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[Scheme.__table__, ArnDirectory.__table__])
    return sessionmaker(bind=engine)()


def test_scheme_round_trip():
    db = _session()
    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code="120503",
        name="Test Fund Direct Growth",
        amc_name="Test AMC",
        sebi_category="Large Cap Fund",
    )
    db.add(scheme)
    db.commit()

    fetched = db.query(Scheme).filter_by(amfi_code="120503").one()
    assert fetched.name == "Test Fund Direct Growth"


def test_arn_directory_defaults_to_unresolved():
    db = _session()
    entry = ArnDirectory(arn_code="ARN-12345")
    db.add(entry)
    db.commit()

    fetched = db.query(ArnDirectory).filter_by(arn_code="ARN-12345").one()
    assert fetched.status == ArnStatus.UNRESOLVED
