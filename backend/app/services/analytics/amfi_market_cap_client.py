"""AMFI half-yearly classifications, joined only by ISIN and effective date.

Verified period URLs are intentionally explicit: filename drift must alert,
not guess a production source. All four PDFs were checked 2026-10-14.
"""
from __future__ import annotations

import logging
import re
import time
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

import httpx
import pypdfium2
from sqlalchemy import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.enums import MarketCapBucket
from app.models.reference import MarketCapClassification

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VerifiedPeriod:
    url: str
    source_rows: int
    valid_rows: int


VERIFIED_PERIODS = {
    date(2026, 6, 30): VerifiedPeriod("https://portal.amfiindia.com/spages/AverageMarketCapitalization30Jun2026.pdf", 5427, 5427),
    date(2025, 12, 31): VerifiedPeriod("https://www.amfiindia.com/Themes/Theme1/downloads/AverageMarketCapitalization31Dec2025.pdf", 5372, 5372),
    date(2025, 6, 30): VerifiedPeriod("https://www.amfiindia.com/Themes/Theme1/downloads/AverageMarketCapitalization30Jun2025.pdf", 5158, 5157),
    date(2024, 12, 31): VerifiedPeriod("https://www.amfiindia.com/Themes/Theme1/downloads/AverageMarketCapitalizationoflistedcompaniesduringthesixmonthsended31Dec2024.pdf", 5097, 5097),
}


@dataclass(frozen=True)
class MarketCapRecord:
    isin: str
    rank: int
    bucket: MarketCapBucket


@dataclass(frozen=True)
class ParsedMarketCapList:
    rows: tuple[MarketCapRecord, ...]
    source_row_count: int
    invalid_isin_ranks: tuple[int, ...]


def parse_market_cap_text(text: str) -> ParsedMarketCapList:
    records = re.findall(r"(?m)^[ \t]*(\d+)[ \t]+(.*?)(Large|Mid|Small)[ \t]+Cap\b", text, re.S)
    # AMFI's June 2025 tail uses competition ranks for equal market caps:
    # four rows ranked 5041 are followed by 5045. Preserve published ranks.
    ranks = [int(r[0]) for r in records]
    if len(records) < 251 or any(rank != i and (i == 1 or rank != ranks[i - 2])
                                 for i, rank in enumerate(ranks, 1)):
        raise ValueError("Incomplete or unordered AMFI rank column")
    rows, invalid, seen = [], [], set()
    for raw_rank, body, label in records:
        rank = int(raw_rank)
        bucket = MarketCapBucket(label.upper())
        expected = MarketCapBucket.LARGE if rank <= 100 else MarketCapBucket.MID if rank <= 250 else MarketCapBucket.SMALL
        if bucket != expected:
            raise ValueError(f"Unexpected category at rank {rank}")
        # PDFium can concatenate an ISIN with its company or symbol. Requiring
        # word boundaries loses real rows; the trailing digit avoids matching
        # company words such as INTERNATIONAL and INFRASTRUCTURE.
        matches = re.findall(r"IN[A-Z][A-Z0-9]{8}[0-9]", body)
        if len(matches) != 1:
            invalid.append(rank)
            continue
        isin = matches[0]
        if isin in seen:
            raise ValueError(f"Duplicate ISIN at rank {rank}: {isin}")
        seen.add(isin)
        rows.append(MarketCapRecord(isin, rank, bucket))
    return ParsedMarketCapList(tuple(rows), len(records), tuple(invalid))


def parse_market_cap_pdf(data: bytes) -> ParsedMarketCapList:
    if not data.startswith(b"%PDF-"):
        raise ValueError("AMFI response is not a PDF")
    try:
        with pypdfium2.PdfDocument(data) as document:
            pages = []
            for page in document:
                textpage = page.get_textpage()
                try:
                    pages.append(textpage.get_text_range())
                finally:
                    textpage.close()
                    page.close()
        return parse_market_cap_text("\n".join(pages))
    except pypdfium2.PdfiumError as exc:
        raise ValueError("Unreadable AMFI PDF") from exc


def recent_periods(today: date) -> tuple[date, ...]:
    period = date(today.year, 6, 30) if today.month >= 7 else date(today.year - 1, 12, 31)
    periods = []
    for _ in range(4):
        periods.append(period)
        period = date(period.year - 1, 12, 31) if period.month == 6 else date(period.year, 6, 30)
    return tuple(periods)


async def _fetch_pdf(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


@dataclass(frozen=True)
class MarketCapRefreshResult:
    success: bool
    periods_loaded: tuple[date, ...] = ()
    periods_skipped: tuple[date, ...] = ()
    periods_failed: tuple[date, ...] = ()
    rows_written: int = 0
    seconds: float = 0.0  # elapsed time only, never a money/weight value


async def refresh_market_cap(db: Session, today: date | None = None) -> MarketCapRefreshResult:
    started = time.monotonic()
    loaded, skipped, failed = [], [], []
    written = 0
    for period in recent_periods(today or date.today()):
        source = VERIFIED_PERIODS.get(period)
        if source is None:
            logger.warning("PORTFOLIO_DISCLOSURE_ALERT kind=market_cap period=%s reason=unverified_period", period)
            failed.append(period)
            continue
        effective = period + timedelta(days=1)
        count = db.query(MarketCapClassification).filter_by(effective_date=effective).count()
        if count == source.valid_rows:
            skipped.append(period)
            continue
        try:
            parsed = parse_market_cap_pdf(await _fetch_pdf(source.url))
            if parsed.source_row_count != source.source_rows or len(parsed.rows) != source.valid_rows:
                raise ValueError("AMFI source row count changed; re-verify this period")
            if parsed.invalid_isin_ranks:
                logger.warning("PORTFOLIO_DISCLOSURE_ALERT kind=market_cap period=%s reason=invalid_isin ranks=%s", period, parsed.invalid_isin_ranks)
            with db.begin_nested():
                db.query(MarketCapClassification).filter_by(effective_date=effective).delete()
                db.execute(insert(MarketCapClassification), [dict(
                    id=uuid.uuid4(), isin=row.isin, rank=row.rank, bucket=row.bucket,
                    effective_date=effective, source_period=period,
                ) for row in parsed.rows])
            db.commit()  # Each good period survives a later period's failure.
            loaded.append(period)
            written += len(parsed.rows)
        except (httpx.HTTPError, ValueError, SQLAlchemyError) as exc:
            db.rollback()
            logger.warning("PORTFOLIO_DISCLOSURE_ALERT kind=market_cap period=%s reason=refresh_failed error=%s", period, exc)
            failed.append(period)
    return MarketCapRefreshResult(not failed, tuple(loaded), tuple(skipped), tuple(failed), written, time.monotonic() - started)
