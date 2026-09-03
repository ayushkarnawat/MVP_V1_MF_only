import asyncio
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.reference import Scheme, SchemeAaum
from app.services.analytics.amfi_aaum_client import (
    _extract_aaum_value,
    _period_end_date,
    refresh_aaum_data,
)


def _session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _scheme(db, amfi_code):
    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code=amfi_code,
        isin="INF123",
        name="Test Fund",
        amc_name="HDFC AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.commit()
    return scheme


def test_period_end_date_parses_full_month_name():
    assert _period_end_date({"period": "August 2026"}) == date(2026, 8, 31)


def test_period_end_date_parses_abbreviated_month_name():
    assert _period_end_date({"text": "Feb 2026"}) == date(2026, 2, 28)


def test_period_end_date_returns_none_for_unrecognized_label():
    assert _period_end_date({"period": "Q1 FY26"}) is None


def test_extract_aaum_value_reads_nested_field():
    row = {"AverageAumForTheMonth": {"ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas": "125000000.50"}}
    assert _extract_aaum_value(row) == Decimal("125000000.50")


def test_extract_aaum_value_returns_none_when_missing():
    assert _extract_aaum_value({}) is None


def test_refresh_aaum_data_upserts_matched_scheme_by_amfi_code():
    db = _session()
    scheme = _scheme(db, "119551")

    years = [{"id": 1, "financial_year": "April 2025 - March 2026"}, {"id": 2, "financial_year": "April 2026 - March 2027"}]
    periods = [{"id": 1, "period": "June 2026"}, {"id": 2, "period": "August 2026"}]
    rows = [
        {
            "AMFI_Code": "119551",
            "AverageAumForTheMonth": {"ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas": "50000000.00"},
        },
        {
            "AMFI_Code": "999999",
            "AverageAumForTheMonth": {"ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas": "10000000.00"},
        },
    ]

    with (
        patch("app.services.analytics.amfi_aaum_client._fetch_financial_years", new=AsyncMock(return_value=years)),
        patch("app.services.analytics.amfi_aaum_client._fetch_periods", new=AsyncMock(return_value=periods)),
        patch("app.services.analytics.amfi_aaum_client._fetch_aaum_rows", new=AsyncMock(return_value=rows)),
    ):
        result = asyncio.run(refresh_aaum_data(db))

    assert result is True
    aaum = db.get(SchemeAaum, (scheme.id, date(2026, 8, 31)))
    assert aaum.aaum_value == Decimal("50000000.00")
    # Unmatched AMFI_Code (999999) has no local scheme — no row created for it.
    assert db.query(SchemeAaum).count() == 1


def test_refresh_aaum_data_returns_false_when_no_financial_years():
    db = _session()
    with patch("app.services.analytics.amfi_aaum_client._fetch_financial_years", new=AsyncMock(return_value=[])):
        result = asyncio.run(refresh_aaum_data(db))
    assert result is False


def test_refresh_aaum_data_returns_false_on_fetch_failure():
    db = _session()
    with patch(
        "app.services.analytics.amfi_aaum_client._fetch_financial_years",
        new=AsyncMock(side_effect=httpx.ConnectError("boom")),
    ):
        result = asyncio.run(refresh_aaum_data(db))
    assert result is False


def test_refresh_aaum_data_returns_false_when_no_scheme_matches():
    db = _session()
    years = [{"id": 1, "financial_year": "April 2026 - March 2027"}]
    periods = [{"id": 1, "period": "August 2026"}]
    rows = [{"AMFI_Code": "000000", "AverageAumForTheMonth": {"ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas": "1.00"}}]

    with (
        patch("app.services.analytics.amfi_aaum_client._fetch_financial_years", new=AsyncMock(return_value=years)),
        patch("app.services.analytics.amfi_aaum_client._fetch_periods", new=AsyncMock(return_value=periods)),
        patch("app.services.analytics.amfi_aaum_client._fetch_aaum_rows", new=AsyncMock(return_value=rows)),
    ):
        result = asyncio.run(refresh_aaum_data(db))

    assert result is False
    assert db.query(SchemeAaum).count() == 0
