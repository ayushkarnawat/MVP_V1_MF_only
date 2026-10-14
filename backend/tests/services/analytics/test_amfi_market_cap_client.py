import uuid
from datetime import date

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
import app.models.reference  # Register reference tables before db_session.create_all.


def _pdf(period):
    from pathlib import Path
    import lzma
    root = Path(__file__).resolve().parents[2] / "fixtures/market_cap"
    if period == "2025-12-31":
        return lzma.decompress((root / f"{period}.pdf.xz").read_bytes())
    return (root / f"{period}.pdf").read_bytes()


@pytest.mark.parametrize("period,count,valid", [("2024-12-31", 5097, 5097), ("2025-06-30", 5158, 5157), ("2025-12-31", 5372, 5372), ("2026-06-30", 5427, 5427)])
def test_market_cap_parse_real_lists(period, count, valid):
    from app.services.analytics.amfi_market_cap_client import parse_market_cap_pdf
    result = parse_market_cap_pdf(_pdf(period))
    assert result.source_row_count == count
    assert len(result.rows) == valid
    assert len({row.isin for row in result.rows}) == valid
    assert [(r.rank, r.bucket.value) for i, r in enumerate(result.rows) if not i or r.bucket != result.rows[i-1].bucket] == [(1, "LARGE"), (101, "MID"), (251, "SMALL")]
    assert result.invalid_isin_ranks == ((2058,) if period == "2025-06-30" else ())


def test_market_cap_parser_rejects_empty_truncated_duplicate_or_wrong_categories():
    from app.services.analytics.amfi_market_cap_client import parse_market_cap_text
    text = "\n".join(f"{i} Fund INE{i:09d} RELIANCE 100 {'Large' if i <= 100 else 'Mid' if i <= 250 else 'Small'} Cap" for i in range(1, 252))
    assert len(parse_market_cap_text(text).rows) == 251
    for bad in ("", "1 Fund INE002A01018 1 Large Cap", text.replace("251 Fund", "252 Fund"), text.replace("101 Fund", "100 Fund"), text.replace("251 Fund INE000000251 RELIANCE 100 Small Cap", "251 Fund INE000000251 RELIANCE 100 Mid Cap"), text.replace("INE000000251", "INE000000250")):
        with pytest.raises(ValueError):
            parse_market_cap_text(bad)


def test_market_cap_refresh_loads_four_real_lists_effective_dates_and_skips_rerun(db_session, monkeypatch, caplog):
    import asyncio
    from unittest.mock import AsyncMock
    from app.services.analytics import amfi_market_cap_client as client
    from app.models.reference import MarketCapClassification
    fetch = AsyncMock(side_effect=lambda url: _pdf(next(str(period) for period, source in client.VERIFIED_PERIODS.items() if source.url == url)))
    monkeypatch.setattr(client, "_fetch_pdf", fetch)
    result = asyncio.run(client.refresh_market_cap(db_session, date(2026, 10, 14)))
    assert result.success and result.rows_written == 21053
    assert len(result.periods_loaded) == 4 and fetch.await_count == 4
    row = db_session.query(MarketCapClassification).filter_by(isin="INE002A01018", source_period=date(2026, 6, 30)).one()
    assert row.effective_date == date(2026, 7, 1)
    assert "invalid_isin" in caplog.text and "2058" in caplog.text
    again = asyncio.run(client.refresh_market_cap(db_session, date(2026, 10, 14)))
    assert again.success and len(again.periods_skipped) == 4 and fetch.await_count == 4


def test_market_cap_failure_alerts_and_preserves_good_periods(db_session, monkeypatch, caplog):
    import asyncio
    import httpx
    from unittest.mock import AsyncMock
    from app.services.analytics import amfi_market_cap_client as client
    from app.models.reference import MarketCapClassification
    fetch = AsyncMock(side_effect=[httpx.ReadTimeout("failed"), _pdf("2025-12-31"), b"bad pdf", _pdf("2024-12-31")])
    monkeypatch.setattr(client, "_fetch_pdf", fetch)
    result = asyncio.run(client.refresh_market_cap(db_session, date(2026, 10, 14)))
    assert not result.success and len(result.periods_failed) == 2 and len(result.periods_loaded) == 2
    assert db_session.query(MarketCapClassification).count() == 10469
    assert "PORTFOLIO_DISCLOSURE_ALERT" in caplog.text


def test_market_cap_future_unverified_period_is_alerted_not_guessed(db_session, monkeypatch, caplog):
    import asyncio
    from unittest.mock import AsyncMock
    from app.services.analytics import amfi_market_cap_client as client
    fetch = AsyncMock(side_effect=lambda url: _pdf(next(str(period) for period, source in client.VERIFIED_PERIODS.items() if source.url == url)))
    monkeypatch.setattr(client, "_fetch_pdf", fetch)
    result = asyncio.run(client.refresh_market_cap(db_session, date(2027, 1, 1)))
    assert date(2026, 12, 31) in result.periods_failed
    assert fetch.await_count == 3 and "unverified_period" in caplog.text


def test_market_cap_model_roundtrip_and_unique_isin_period(db_session):
    from app.models.enums import MarketCapBucket
    from app.models.reference import MarketCapClassification
    row = MarketCapClassification(isin="INE002A01018", rank=1, bucket=MarketCapBucket.LARGE,
                                  effective_date=date(2026, 7, 1), source_period=date(2026, 6, 30))
    db_session.add(row)
    db_session.commit()
    assert isinstance(row.id, uuid.UUID)
    assert db_session.get(MarketCapClassification, row.id).bucket == MarketCapBucket.LARGE
    assert inspect(db_session.get_bind()).get_foreign_keys("market_cap_classifications") == []
    db_session.add(MarketCapClassification(isin=row.isin, rank=2, bucket=MarketCapBucket.MID,
                                          effective_date=row.effective_date, source_period=row.source_period))
    with pytest.raises(IntegrityError):
        db_session.flush()
