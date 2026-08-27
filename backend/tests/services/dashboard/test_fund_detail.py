import asyncio
import uuid
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import NavHistory, Scheme
from app.services.dashboard import nav as nav_module
from app.services.dashboard.fund_detail import get_fund_nav_history


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _scheme(db, amfi_code="125497"):
    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code=amfi_code,
        isin="INF123",
        name="HDFC Flexi Cap Fund",
        amc_name="HDFC AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.commit()
    return scheme


def _get_history(db, scheme, period, rows):
    with patch.object(
        nav_module,
        "_fetch_nav_history_uncached",
        new=AsyncMock(return_value=rows),
    ):
        return asyncio.run(get_fund_nav_history(db, scheme, period))


def test_returns_points_covering_requested_period_when_history_is_long_enough():
    db = _session()
    scheme = _scheme(db)
    latest = date(2025, 6, 1)
    rows = [
        (latest - timedelta(days=day), Decimal("100.0000") + Decimal(day))
        for day in range(500)
    ]

    result = _get_history(db, scheme, "1Y", rows)

    assert result.period == "1Y"
    assert result.requested_period == "1Y"
    assert result.clamped is False
    assert result.points[0].date == latest - timedelta(days=366)
    assert result.points[-1].date == latest


def test_clamps_to_max_when_requested_period_exceeds_available_history():
    db = _session()
    scheme = _scheme(db)
    start = date(2024, 10, 1)
    rows = [(start + timedelta(days=day), Decimal("100.0000")) for day in range(240)]

    result = _get_history(db, scheme, "5Y", rows)

    assert result.period == "MAX"
    assert result.requested_period == "5Y"
    assert result.clamped is True
    assert result.points[0].date == start


def test_overall_return_matches_last_points_return():
    db = _session()
    scheme = _scheme(db)
    rows = [
        (date(2024, 1, 1), Decimal("100.0000")),
        (date(2024, 1, 2), Decimal("125.0000")),
    ]

    result = _get_history(db, scheme, "MAX", rows)

    assert result.overall_return_pct == result.points[-1].return_pct == "25.00"


def test_empty_history_returns_empty_response_without_exception():
    db = _session()
    scheme = _scheme(db)

    result = _get_history(db, scheme, "1Y", [])

    assert result.period == "MAX"
    assert result.requested_period == "1Y"
    assert result.clamped is True
    assert result.points == []
    assert result.overall_return_pct is None


def test_downsampling_keeps_first_and_last_rows_and_at_most_400_points():
    db = _session()
    scheme = _scheme(db)
    start = date(2020, 1, 1)
    rows = [
        (start + timedelta(days=day), Decimal("100.0000") + Decimal(day))
        for day in range(1001)
    ]

    result = _get_history(db, scheme, "MAX", rows)

    assert len(result.points) <= 400
    assert result.points[0].date == rows[0][0]
    assert result.points[0].nav == str(rows[0][1])
    assert result.points[-1].date == rows[-1][0]
    assert result.points[-1].nav == str(rows[-1][1])


def test_return_percentages_use_first_point_and_round_half_up():
    db = _session()
    scheme = _scheme(db)
    rows = [
        (date(2024, 1, 1), Decimal("80.0000")),
        (date(2024, 1, 2), Decimal("100.0000")),
        (date(2024, 1, 3), Decimal("106.6680")),
    ]

    result = _get_history(db, scheme, "MAX", rows)

    assert [point.return_pct for point in result.points] == ["0.00", "25.00", "33.34"]
