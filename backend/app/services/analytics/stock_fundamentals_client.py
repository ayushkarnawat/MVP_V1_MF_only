"""Independent daily fundamentals reference pipeline; no disclosure-status dependency."""
from __future__ import annotations

import asyncio
import csv
import gzip
import io
import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser

import httpx
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.enums import AssetType, BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory, SchemeHolding, StockMaster
from app.services.analytics.nse_indices_client import _TRADING_INDEX_NAME, _USER_AGENT

logger = logging.getLogger(__name__)
# Valuation uses equity only; bonds, T-bills and MF units would only make junk 'delisted' rows.
_EQUITY_TYPES = (AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL)
PE_URL = "https://nsearchives.nseindia.com/content/equities/peDetail/PE_{date}.csv"
SECURITY_URL = "https://nsearchives.nseindia.com/content/cm/NSE_CM_security_{date}.csv.gz"
CONSTITUENT_URLS = (
    "https://archives.nseindia.com/content/indices/ind_nifty500list.csv",
    "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv",
)
INDEX_VALUATION_URL = "https://www.niftyindices.com/BackPage/getpepbHistoricaldataDBtoString"


def _positive(value):
    try:
        number = Decimal(str(value).strip().replace(",", ""))
        return number if number.is_finite() and number > 0 else None
    except (InvalidOperation, ValueError, TypeError):
        return None


def _csv_rows(data, required):
    reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
    if not required <= set(reader.fieldnames or []):
        raise ValueError("Unrecognized source CSV columns")
    rows = list(reader)
    if not rows:
        raise ValueError("Empty source CSV")
    return rows


def parse_pe_csv(data: bytes) -> dict[str, Decimal | None]:
    return {r["SYMBOL"].strip(): _positive(r["SYMBOL P/E"]) for r in _csv_rows(data, {"SYMBOL", "SYMBOL P/E"}) if r.get("SYMBOL") and r.get("SYMBOL P/E") is not None}


def parse_security_master(data: bytes) -> dict[str, str]:
    rows = _csv_rows(data, {"TckrSymb", "ISIN", "SctySrs"})
    result = {r["ISIN"].strip(): r["TckrSymb"].strip() for r in rows if (r.get("SctySrs") or "").strip() == "EQ" and r.get("ISIN") and r.get("TckrSymb")}
    if not result:
        raise ValueError("No EQ security-master rows")
    return result


def parse_constituents(data: bytes) -> dict[str, dict[str, str]]:
    return {r["ISIN Code"].strip(): {"symbol": r["Symbol"].strip(), "name": r["Company Name"].strip(), "sector": r["Industry"].strip()}
            for r in _csv_rows(data, {"ISIN Code", "Symbol", "Company Name", "Industry"}) if r["ISIN Code"].strip()}


def parse_yahoo_pb(text: str) -> Decimal | None:
    data = json.loads(text, parse_float=Decimal)
    summary = data.get("quoteSummary") if isinstance(data, dict) else None
    results = summary.get("result") if isinstance(summary, dict) else None
    if not isinstance(results, list) or not results or not isinstance(results[0], dict):
        return None
    stats = results[0].get("defaultKeyStatistics")
    value = stats.get("priceToBook") if isinstance(stats, dict) else None
    return _positive(value.get("raw")) if isinstance(value, dict) else None



class _RatiosHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = None
        self.items = []

    def handle_starttag(self, tag, attrs):
        if tag == "li": self.parts = []

    def handle_data(self, data):
        if self.parts is not None: self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "li" and self.parts is not None:
            self.items.append(" ".join(" ".join(self.parts).split()))
            self.parts = None


def parse_screener_pb(text: str) -> Decimal | None:
    parser = _RatiosHTML(); parser.feed(text)
    values = {}
    for item in parser.items:
        for label in ("Current Price", "Book Value"):
            if item.startswith(label):
                number = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", item[len(label):])
                values[label] = _positive(number.group()) if number else None
    price, book = values.get("Current Price"), values.get("Book Value")
    return price / book if price and book else None


def build_isin_universe(db: Session, constituents: dict) -> set[str]:
    return {isin for (isin,) in db.query(SchemeHolding.isin).filter(SchemeHolding.isin.isnot(None), SchemeHolding.asset_type.in_(_EQUITY_TYPES)).distinct()} | set(constituents)


async def _request(client, method, url, pace_seconds, **kwargs):
    if pace_seconds:
        await asyncio.sleep(pace_seconds)
    return await client.request(method, url, **kwargs)


async def _dated_file(client, template, date_format, today, pace_seconds):
    for offset in range(7):
        when = today - timedelta(days=offset)
        response = await _request(client, "GET", template.format(date=when.strftime(date_format)), pace_seconds)
        if response.status_code == 404:
            continue
        response.raise_for_status()
        return response.content, when
    raise ValueError("No published file in the seven-date window")


class _YahooPB:
    def __init__(self, client, pace_seconds):
        self.client, self.pace_seconds = client, pace_seconds
        self.crumb = None
        self.initialized = self.renewed = False

    async def handshake(self, symbol):
        cookie = await _request(self.client, "GET", "https://fc.yahoo.com", self.pace_seconds)
        # The documented cookie endpoint sets its cookie on an HTTP 404 page.
        if cookie.status_code != 404:
            cookie.raise_for_status()
        page = await _request(self.client, "GET", f"https://finance.yahoo.com/quote/{symbol}.NS", self.pace_seconds)
        page.raise_for_status()
        response = await _request(self.client, "GET", "https://query2.finance.yahoo.com/v1/test/getcrumb", self.pace_seconds)
        response.raise_for_status()
        crumb = response.text.strip()
        if not crumb or len(crumb) > 128 or "<" in crumb:
            raise ValueError("Yahoo crumb unavailable")
        self.crumb = crumb

    async def get(self, symbol):
        if not self.initialized:
            self.initialized = True
            await self.handshake(symbol)
        if not self.crumb:
            raise ValueError("Yahoo handshake failed")
        async def fetch():
            return await _request(self.client, "GET", f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}.NS", self.pace_seconds,
                                  params={"modules": "defaultKeyStatistics,summaryDetail", "crumb": self.crumb})
        response = await fetch()
        if response.status_code == 401 and not self.renewed:
            self.renewed = True
            self.crumb = None
            await self.handshake(symbol)
            response = await fetch()
        response.raise_for_status()
        return parse_yahoo_pb(response.text)


@dataclass(frozen=True)
class StockFundamentalsRefreshResult:
    success: bool
    as_of_date: date | None = None
    universe_count: int = 0
    rows_written: int = 0
    failed: int = 0
    seconds: float = 0.0  # elapsed time, never a financial value


async def refresh_stock_fundamentals(db: Session, *, today: date | None = None,
                                     client: httpx.AsyncClient | None = None, pace_seconds: float = 0.3) -> StockFundamentalsRefreshResult:
    if client is None:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers={"User-Agent": _USER_AGENT}) as owned:
            return await refresh_stock_fundamentals(db, today=today, client=owned, pace_seconds=pace_seconds)
    started, today = time.monotonic(), today or date.today()
    try:
        data, as_of = await _dated_file(client, PE_URL, "%d%m%y", today, pace_seconds)
        pe = parse_pe_csv(data)
        data, security_as_of = await _dated_file(client, SECURITY_URL, "%d%m%Y", today, pace_seconds)
        symbols = parse_security_master(gzip.decompress(data))
        constituents = {}
        for url in CONSTITUENT_URLS:
            response = await _request(client, "GET", url, pace_seconds); response.raise_for_status()
            constituents.update(parse_constituents(response.content))
        universe = build_isin_universe(db, constituents)
    except (httpx.HTTPError, ValueError, KeyError, OSError) as exc:
        logger.warning("STOCK_FUNDAMENTALS_ALERT bulk_fetch_failed %s", type(exc).__name__)
        return StockFundamentalsRefreshResult(False, seconds=time.monotonic()-started)
    yahoo = _YahooPB(client, pace_seconds)
    failed = written = 0
    for isin in sorted(universe):
        symbol = symbols.get(isin)
        old = db.get(StockMaster, isin)
        info = constituents.get(isin, {})
        row = old or StockMaster(isin=isin, name=info.get("name", symbol or isin), sector=info.get("sector"), source="NSE", as_of_date=as_of)
        notes = []
        if not symbol:
            if old and security_as_of < old.as_of_date:
                notes.append("Older NSE security master; previous ratios retained")
            else:
                row.pe_ratio = row.pb_ratio = row.pb_source = None
                notes.append("ISIN absent from NSE EQ security master: delisted/merged or not NSE-listed (no BSE fallback)")
        else:
            if symbol in pe:
                if old is not None and as_of < old.as_of_date:
                    notes.append("Older NSE P/E file; previous P/E retained")
                else:
                    row.pe_ratio = pe[symbol]
                    if pe[symbol] is None: notes.append("P/E excluded: loss-making or unavailable earnings")
            else:
                notes.append("NSE P/E unavailable; previous P/E retained" if old and old.pe_ratio else "NSE P/E unavailable")
            pb = None
            try:
                pb = await yahoo.get(symbol)
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                pass
            pb_source = "YAHOO"
            if pb is None:
                pb_source = "SCREENER"
                try:
                    response = await _request(client, "GET", f"https://www.screener.in/company/{symbol}/consolidated/", pace_seconds)
                    response.raise_for_status(); pb = parse_screener_pb(response.text)
                except (httpx.HTTPError, ValueError, KeyError, TypeError):
                    pass
            if pb is not None:
                row.pb_ratio, row.pb_source = pb, pb_source
                if pb_source == "SCREENER": notes.append("P/B from screener.in fallback (current price / book value)")
            else:
                failed += 1
                notes.append(f"P/B refresh failed; previous P/B retained from {old.as_of_date}" if old and old.pb_ratio else "P/B unavailable: Yahoo and screener.in both failed")
                logger.warning("STOCK_FUNDAMENTALS_ALERT pb_unavailable isin=%s", isin)
        row.as_of_date = max(as_of, old.as_of_date) if old else as_of
        row.footnote = "; ".join(notes) or None
        db.add(row); written += 1
    await commit_off_loop(db)
    return StockFundamentalsRefreshResult(bool(written), as_of, len(universe), written, failed, time.monotonic()-started)


def parse_index_ratios(text, index, start_date, end_date):
    payload = json.loads(text, parse_float=Decimal)
    if isinstance(payload, dict) and "d" in payload:
        payload = json.loads(payload["d"], parse_float=Decimal) if isinstance(payload["d"], str) else payload["d"]
    if not isinstance(payload, list) or not payload:
        raise ValueError("Empty or unrecognized index valuation response")
    result = []
    for row in payload:
        if row["Index Name"].upper() != _TRADING_INDEX_NAME[index].upper():
            raise ValueError("Wrong index valuation response")
        when = datetime.strptime(row["DATE"], "%d %b %Y").date()
        if not start_date <= when <= end_date:
            continue  # server may ignore the range; keep only what we asked for
        for kind, key in ((BenchmarkReturnType.PE, "pe"), (BenchmarkReturnType.PB, "pb")):
            value = _positive(row.get(key))
            if value is not None: result.append((kind, when, value))
    if not result: raise ValueError("No positive index ratios")
    return result


async def refresh_index_valuations(db: Session, *, today: date | None = None,
                                  client: httpx.AsyncClient | None = None, pace_seconds: float = 0.3) -> bool:
    if client is None:
        async with httpx.AsyncClient(timeout=30, headers={"User-Agent": _USER_AGENT}) as owned:
            return await refresh_index_valuations(db, today=today, client=owned, pace_seconds=pace_seconds)
    today = today or date.today(); start = today - timedelta(days=9)
    succeeded = 0
    for index in (BenchmarkIndex.NIFTY_50, BenchmarkIndex.NIFTY_500):
        try:
            name = _TRADING_INDEX_NAME[index]
            info = json.dumps({"name": name, "indexName": name, "startDate": start.strftime("%d-%b-%Y"), "endDate": today.strftime("%d-%b-%Y")})
            response = await _request(client, "POST", INDEX_VALUATION_URL, pace_seconds, json={"cinfo": info}); response.raise_for_status()
            parsed = parse_index_ratios(response.text, index, start, today)
            for kind, when, value in parsed:
                row = db.get(BenchmarkIndexHistory, (index, when, kind))
                if row: row.value = value
                else: db.add(BenchmarkIndexHistory(index_name=index, date=when, return_type=kind, value=value))
            await commit_off_loop(db); succeeded += 1
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            db.rollback()
            logger.warning("STOCK_FUNDAMENTALS_ALERT index_failed index=%s reason=%s", index.value, type(exc).__name__)
    return succeeded == 2
