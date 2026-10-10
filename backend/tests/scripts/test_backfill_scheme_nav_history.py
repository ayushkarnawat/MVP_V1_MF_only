# backend/tests/scripts/test_backfill_scheme_nav_history.py
import sys
import uuid
from pathlib import Path
from datetime import date
from decimal import Decimal

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import NavHistory, Scheme
from scripts.jobs.backfill_scheme_nav_history import chunk_schemes, schemes_needing_backfill


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_chunk_schemes_splits_into_fixed_size_batches():
    schemes = [object() for _ in range(320)]
    batches = list(chunk_schemes(schemes, 150))
    assert [len(b) for b in batches] == [150, 150, 20]


def test_schemes_needing_backfill_excludes_already_warmed_schemes():
    db = _session()
    warmed = Scheme(id=uuid.uuid4(), amfi_code="W1", name="Warmed Fund", amc_name="AMC", sebi_category="Equity")
    cold = Scheme(id=uuid.uuid4(), amfi_code="C1", name="Cold Fund", amc_name="AMC", sebi_category="Equity")
    db.add_all([warmed, cold])
    db.commit()
    db.add(NavHistory(scheme_id=warmed.id, date=date(2024, 1, 1), nav=Decimal("10.00")))
    db.commit()

    remaining = schemes_needing_backfill(db)
    assert [s.id for s in remaining] == [cold.id]



def test_ruling10_backfill_only_active_schemes_with_amfi_code():
    db = _session()
    active = Scheme(name="Active", amc_name="AMC", sebi_category="Equity", amfi_code="123456", is_active=True)
    inactive = Scheme(name="Inactive", amc_name="AMC", sebi_category="Equity", amfi_code="123457", is_active=False)
    cas_only = Scheme(name="CAS only", amc_name="AMC", sebi_category="Equity", amfi_code=None, is_active=True)
    empty_code = Scheme(name="Empty code", amc_name="AMC", sebi_category="Equity", amfi_code="", is_active=True)
    db.add_all([active, inactive, cas_only, empty_code]); db.commit()
    assert [s.id for s in schemes_needing_backfill(db)] == [active.id]
