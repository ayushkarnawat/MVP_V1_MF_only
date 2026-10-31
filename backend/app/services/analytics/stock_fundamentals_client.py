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
from app.models.enums import AssetType, BenchmarkIndex, BenchmarkReturnType, DisclosureBatchStatus
from app.models.reference import BenchmarkIndexHistory, DisclosureBatch, SchemeHolding, StockMaster
from app.models.user import HouseholdMember
from app.services.home.units import build_units_timeline
from app.services.analytics.nse_indices_client import _TRADING_INDEX_NAME, _USER_AGENT

logger = logging.getLogger(__name__)
# Valuation uses equity only; bonds, T-bills and MF units would only make junk 'delisted' rows.
_EQUITY_TYPES = (AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL)
PE_URL = "https://nsearchives.nseindia.com/content/equities/peDetail/PE_{date}.csv"
BSE_BHAVCOPY_URL = "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{date}_F_0000.CSV"
SECURITY_URL = "https://nsearchives.nseindia.com/content/cm/NSE_CM_security_{date}.csv.gz"
# Assumed standard exchange headers and owner-supplied groups: UNVERIFIED.
# The owner will check a real VM file. Keep all column spellings here only.
BSE_COLUMNS = {
    "code": "FinInstrmId", "isin": "ISIN", "ticker": "TckrSymb", "series": "SctySrs",
    "name": "FinInstrmNm", "close": "ClsPric", "date": "TradDt", "open": "OpnPric",
    "high": "HghPric", "low": "LwPric", "last": "LastPric", "previous_close": "PrvsClsgPric",
}
BSE_EQUITY_SERIES = frozenset({"A", "B", "T", "X", "XT", "Z", "ZP", "M", "MT"})
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


@dataclass(frozen=True)
class BseQuote:
    scrip_code: str
    ticker: str
    name: str
    close: Decimal


@dataclass(frozen=True)
class BsePrices:
    quotes: dict[str, BseQuote]
    ambiguous: int = 0


def parse_bse_bhavcopy(data: bytes, held_isins: set[str], *, file_date: date) -> BsePrices:
    columns = BSE_COLUMNS
    rows = _csv_rows(data, {columns[key] for key in ("isin", "close", "series", "code", "ticker")})
    candidates: dict[str, list[tuple[str, BseQuote]]] = {}
    for row in rows:
        isin = (row.get(columns["isin"]) or "").strip().upper()
        series = (row.get(columns["series"]) or "").strip().upper()
        if isin not in held_isins or not re.fullmatch(r"INE[A-Z0-9]{9}", isin) or series not in BSE_EQUITY_SERIES:
            continue
        close = _positive(row.get(columns["close"]))
        code = (row.get(columns["code"]) or "").strip()
        ticker = (row.get(columns["ticker"]) or "").strip()
        if close is None or not code.isdigit() or not ticker:
            continue
        printed_date = (row.get(columns["date"]) or "").strip()
        if printed_date and date.fromisoformat(printed_date) != file_date:
            raise ValueError("BSE file date does not match the requested day")
        quote = BseQuote(code, ticker, (row.get(columns["name"]) or "").strip(), close)
        candidates.setdefault(isin, []).append((series, quote))
    quotes, ambiguous = {}, 0
    for isin, entries in candidates.items():
        preferred = [quote for series, quote in entries if series in {"A", "B"}]
        if len({series for series, _ in entries}) > 1 and not preferred:
            ambiguous += 1
            continue
        distinct = set(preferred or [quote for _, quote in entries])
        if len(distinct) != 1:
            # Conflicting A/B rows (or conflicting rows in one series) are also unsafe.
            ambiguous += 1
            continue
        quotes[isin] = distinct.pop()
    return BsePrices(quotes, ambiguous)


def _held_domestic_isins(db: Session, today: date) -> set[str]:
    members = [member_id for (member_id,) in db.query(HouseholdMember.id).all()]
    timeline = build_units_timeline(db, members)
    held = set()
    for scheme_id, points in timeline.items():
        current = [units for when, units in points if when <= today]
        if current and current[-1] > 0:
            held.add(scheme_id)
    if not held:
        return set()
    batches = db.query(DisclosureBatch).filter(
        DisclosureBatch.scheme_id.in_(held), DisclosureBatch.status == DisclosureBatchStatus.WRITTEN,
        DisclosureBatch.as_of_date <= today,
    ).order_by(DisclosureBatch.as_of_date.desc()).all()
    latest = {}
    for batch in batches:
        latest.setdefault(batch.scheme_id, batch.id)
    # Master membership is required by the owner; index-only or new unknown ISINs are not BSE candidates.
    return {isin for (isin,) in db.query(StockMaster.isin).join(SchemeHolding, SchemeHolding.isin == StockMaster.isin)
            .filter(SchemeHolding.batch_id.in_(list(latest.values())),
                    SchemeHolding.asset_type == AssetType.EQUITY_DOMESTIC, SchemeHolding.pct_to_nav > 0).distinct()
            if re.fullmatch(r"INE[A-Z0-9]{9}", isin)}


async def _bse_prices(client, held_isins, today, pace_seconds) -> BsePrices | None:
    try:
        response = await _request(client, "GET", BSE_BHAVCOPY_URL.format(date=today.strftime("%Y%m%d")), pace_seconds)
        if response.status_code == 404:
            logger.info("BSE price file: no file today")
            return None
        response.raise_for_status()
        prices = parse_bse_bhavcopy(response.content, held_isins, file_date=today)
        logger.info("BSE price file: matched=%d ambiguous=%d", len(prices.quotes), prices.ambiguous)
        return prices
    except (httpx.HTTPError, ValueError, KeyError, OSError, UnicodeError) as exc:
        logger.warning("STOCK_FUNDAMENTALS_ALERT bse_file_unusable reason=%s", type(exc).__name__)
        return None


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
    def __init__(self, client, pace_seconds, suffix=".NS"):
        self.client, self.pace_seconds = client, pace_seconds
        self.suffix = suffix
        self.crumb = None
        self.initialized = self.renewed = False

    async def handshake(self, symbol):
        cookie = await _request(self.client, "GET", "https://fc.yahoo.com", self.pace_seconds)
        # The documented cookie endpoint sets its cookie on an HTTP 404 page.
        if cookie.status_code != 404:
            cookie.raise_for_status()
        page = await _request(self.client, "GET", f"https://finance.yahoo.com/quote/{symbol}{self.suffix}", self.pace_seconds)
        page.raise_for_status()
        response = await _request(self.client, "GET", "https://query2.finance.yahoo.com/v1/test/getcrumb", self.pace_seconds)
        response.raise_for_status()
        crumb = response.text.strip()
        if not crumb or len(crumb) > 128 or "<" in crumb:
            raise ValueError("Yahoo crumb unavailable")
        self.crumb = crumb

    async def get(self, symbol, *, raw=False):
        if not self.initialized:
            self.initialized = True
            await self.handshake(symbol)
        if not self.crumb:
            raise ValueError("Yahoo handshake failed")
        async def fetch():
            return await _request(self.client, "GET", f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}{self.suffix}", self.pace_seconds,
                                  params={"modules": "defaultKeyStatistics,summaryDetail", "crumb": self.crumb})
        response = await fetch()
        if response.status_code == 401 and not self.renewed:
            self.renewed = True
            self.crumb = None
            await self.handshake(symbol)
            response = await fetch()
        response.raise_for_status()
        return response.text if raw else parse_yahoo_pb(response.text)


@dataclass(frozen=True)
class BseRatios:
    pe: Decimal | None = None
    pb: Decimal | None = None
    pe_source: str | None = None
    pb_source: str | None = None
    bad_earnings: bool = False
    bad_book: bool = False


def parse_yahoo_bse_ratios(text: str, close: Decimal) -> BseRatios:
    if _positive(close) is None:
        return BseRatios()
    payload = json.loads(text, parse_float=Decimal)
    summary = payload.get("quoteSummary") if isinstance(payload, dict) else None
    results = summary.get("result") if isinstance(summary, dict) else None
    row = results[0] if isinstance(results, list) and results and isinstance(results[0], dict) else {}
    stats, detail = row.get("defaultKeyStatistics") or {}, row.get("summaryDetail") or {}
    def raw(mapping, key):
        field = mapping.get(key) if isinstance(mapping, dict) else None
        return field.get("raw") if isinstance(field, dict) else None
    earnings_raw, book_raw = raw(stats, "trailingEps"), raw(stats, "bookValue")
    earnings, book = _positive(earnings_raw), _positive(book_raw)
    # Completed provider figures stay as supplied; never substitute forward earnings.
    pe = close / earnings if earnings else None
    pb = close / book if book else None
    if earnings_raw is None:
        pe = _positive(raw(detail, "trailingPE") or raw(stats, "trailingPE"))
    if book_raw is None:
        pb = _positive(raw(stats, "priceToBook"))
    return BseRatios(pe, pb, "BSE_YAHOO_EPS" if earnings else "YAHOO" if pe else None,
                     "BSE_YAHOO_BOOK" if book else "YAHOO" if pb else None,
                     earnings_raw is not None and earnings is None, book_raw is not None and book is None)


def parse_screener_pe(text: str) -> Decimal | None:
    parser = _RatiosHTML(); parser.feed(text)
    for item in parser.items:
        if item.startswith("Stock P/E"):
            number = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", item[len("Stock P/E"):])
            return _positive(number.group()) if number else None
    return None


async def _refresh_bse_row(db, row, quote, yahoo, today, client, pace_seconds):
    try:
        values = parse_yahoo_bse_ratios(await yahoo.get(quote.ticker, raw=True), quote.close)
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        values = BseRatios()
    pe, pb, pe_source, pb_source = values.pe, values.pb, values.pe_source, values.pb_source
    if pe is None or pb is None:
        try:
            response = await _request(client, "GET", f"https://www.screener.in/company/{quote.scrip_code}/consolidated/", pace_seconds)
            response.raise_for_status()
            if pe is None:
                pe = parse_screener_pe(response.text)
                pe_source = "SCREENER" if pe is not None else None
            if pb is None:
                pb = parse_screener_pb(response.text)
                pb_source = "SCREENER" if pb is not None else None
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            pass
    notes = []
    if row.pe_ratio is not None and row.pe_source is None:
        row.pe_source = row.source
    for field, value, source, source_field, date_field, invalid in (
        ("P/E", pe, pe_source, "pe_source", "pe_as_of", values.bad_earnings),
        ("P/B", pb, pb_source, "pb_source", "pb_as_of", values.bad_book),
    ):
        ratio_field = "pe_ratio" if field == "P/E" else "pb_ratio"
        old_value = getattr(row, ratio_field)
        previous_date = getattr(row, date_field) or row.as_of_date
        if old_value is not None and today < previous_date:
            notes.append(f"{field} previous value retained from {previous_date}.")
            continue
        if value is not None:
            setattr(row, ratio_field, value)
            setattr(row, source_field, source)
            setattr(row, date_field, today)
            if source == "BSE_YAHOO_EPS":
                notes.append("P/E uses BSE close and Yahoo trailing earnings per share.")
            elif source == "BSE_YAHOO_BOOK":
                notes.append("P/B uses BSE close and Yahoo book value per share.")
            else:
                notes.append(f"{field} from {'Yahoo' if source == 'YAHOO' else 'screener.in'}, kept as supplied.")
        elif invalid:
            setattr(row, ratio_field, None)
            setattr(row, source_field, None)
            setattr(row, date_field, None)
            notes.append("Earnings are unavailable or not positive." if field == "P/E" else "Book value is unavailable or not positive.")
        else:
            if old_value is not None and getattr(row, date_field) is None:
                setattr(row, date_field, previous_date)
            notes.append(f"{field} unavailable; previous value retained from {previous_date}." if old_value is not None else f"{field} is not available yet.")
    row.bse_scrip_code, row.source = quote.scrip_code, "BSE"
    row.as_of_date = max(row.as_of_date, today)
    row.footnote = " ".join(notes)
    db.add(row)
    return pe is None or pb is None


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
    missing = {isin for isin in universe if isin not in symbols and re.fullmatch(r"INE[A-Z0-9]{9}", isin)}
    bse_candidates = missing & _held_domestic_isins(db, today) if missing else set()
    bse_prices = await _bse_prices(client, bse_candidates, today, pace_seconds) if bse_candidates else None
    bse_yahoo = _YahooPB(client, pace_seconds, suffix=".BO")
    yahoo = _YahooPB(client, pace_seconds)
    failed = written = 0
    for isin in sorted(universe):
        symbol = symbols.get(isin)
        old = db.get(StockMaster, isin)
        if isin in bse_candidates:
            quote = bse_prices.quotes.get(isin) if bse_prices is not None else None
            if quote is not None:
                failed += await _refresh_bse_row(db, old, quote, bse_yahoo, today, client, pace_seconds)
                written += 1
            # No file, no usable close or ambiguous series: write no BSE metadata or ratios.
            continue
        if not symbol and old is not None and old.source == "BSE":
            continue  # Reference data for a stock no longer held stays untouched.
        info = constituents.get(isin, {})
        row = old or StockMaster(isin=isin, name=info.get("name", symbol or isin), sector=info.get("sector"), source="NSE", as_of_date=as_of)
        # Preserve each retained ratio's last known date before the shared
        # legacy date advances. Older stored rows only have as_of_date.
        if old is not None:
            if old.pe_ratio is not None and old.pe_as_of is None:
                old.pe_as_of = old.as_of_date
            if old.pb_ratio is not None and old.pb_as_of is None:
                old.pb_as_of = old.as_of_date
            if old.pe_ratio is not None and old.pe_source is None:
                old.pe_source = old.source
        notes = []
        if not symbol:
            if old and security_as_of < old.as_of_date:
                notes.append("Older NSE security master; previous ratios retained")
            else:
                row.pe_ratio = row.pb_ratio = row.pb_source = None
                row.pe_as_of = row.pb_as_of = row.pe_source = None
                notes.append("ISIN absent from NSE EQ security master: delisted/merged or not NSE-listed (no BSE fallback)")
        else:
            row.source = "NSE"
            if symbol in pe:
                if old is not None and as_of < old.as_of_date:
                    notes.append("Older NSE P/E file; previous P/E retained")
                else:
                    row.pe_ratio = pe[symbol]
                    row.pe_as_of, row.pe_source = as_of, "NSE"
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
                row.pb_as_of = today
                if pb_source == "SCREENER": notes.append("P/B from screener.in fallback (current price / book value)")
            else:
                failed += 1
                notes.append(f"P/B refresh failed; previous P/B retained from {old.pb_as_of or old.as_of_date}" if old and old.pb_ratio else "P/B unavailable: Yahoo and screener.in both failed")
                logger.warning("STOCK_FUNDAMENTALS_ALERT pb_unavailable isin=%s", isin)
        row.as_of_date = max(as_of, old.as_of_date) if old else as_of
        row.footnote = "; ".join(notes) or None
        db.add(row); written += 1
    await commit_off_loop(db)
    return StockFundamentalsRefreshResult(bool(written or bse_candidates), as_of, len(universe), written, failed, time.monotonic()-started)


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
