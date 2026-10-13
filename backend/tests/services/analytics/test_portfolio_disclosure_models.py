# backend/tests/services/analytics/test_portfolio_disclosure_models.py
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.enums import AssetType, DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding


def _scheme(db):
    scheme = Scheme(
        id=uuid.uuid4(), isin="INF123", name="Test Fund", amc_name="Test AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.commit()
    return scheme


def test_round_trip_batch_and_holding(db_session):
    scheme = _scheme(db_session)
    batch = DisclosureBatch(
        id=uuid.uuid4(), scheme_id=scheme.id, as_of_date=date(2026, 8, 31), amc_name="Test AMC",
        status=DisclosureBatchStatus.WRITTEN, source_url="https://example.test/file.xls",
        match_method="EXACT", match_confidence=Decimal("1.0"), written_at=datetime.now(timezone.utc),
    )
    db_session.add(batch)
    db_session.commit()
    holding = SchemeHolding(
        id=uuid.uuid4(), batch_id=batch.id, instrument_name="HDFC Bank Ltd", isin="INE040A01034",
        sector_raw="Banks", asset_type=AssetType.EQUITY_DOMESTIC, quantity=Decimal("1000.0000"),
        market_value=Decimal("1500000.00"), pct_to_nav=Decimal("2.500"),
    )
    db_session.add(holding)
    db_session.commit()

    fetched = db_session.query(SchemeHolding).filter_by(batch_id=batch.id).one()
    assert fetched.instrument_name == "HDFC Bank Ltd"
    assert fetched.isin == "INE040A01034"
    assert fetched.market_value == Decimal("1500000.00")
    assert fetched.asset_type == AssetType.EQUITY_DOMESTIC


def test_unique_constraint_rejects_duplicate_scheme_and_date(db_session):
    scheme = _scheme(db_session)
    db_session.add(DisclosureBatch(
        id=uuid.uuid4(), scheme_id=scheme.id, as_of_date=date(2026, 8, 31), amc_name="Test AMC",
        status=DisclosureBatchStatus.WRITTEN,
    ))
    db_session.commit()
    db_session.add(DisclosureBatch(
        id=uuid.uuid4(), scheme_id=scheme.id, as_of_date=date(2026, 8, 31), amc_name="Test AMC",
        status=DisclosureBatchStatus.PENDING,
    ))
    with pytest.raises(IntegrityError):
        db_session.commit()
