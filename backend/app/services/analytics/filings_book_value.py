"""T2.12 Step B: book value per share from NSE's Integrated Filing XBRL.

The P/B of a held stock is the day's close divided by the book value per share in the company's own
half-year or year-end filing; Yahoo and screener.in stay as labelled fallbacks in the daily job.

Source (verified 2 Nov 2026 from the VM, see Docs/orchestration/cr-r2-filings-book-value-handoff.md):
  1. GET https://www.nseindia.com/companies-listing/corporate-integrated-filing   (once per run, for the cookie)
  2. GET https://www.nseindia.com/api/integrated-filing-results?index=equities&symbol=<SYMBOL>&type=Integrated%20Filing-%20Financials
     Rows carry qe_Date ("30-SEP-2026"), consolidated ("Consolidated"/"Standalone"), audited and xbrl (a bare XML file).
  3. GET <xbrl>   (nsearchives.nseindia.com)
The balance sheet is only in the March and September filings.

Rules kept here: at least two seconds between requests, no retries, a 401/403/429 stops the whole run, one
stock's odd or missing data is skipped (never a crash, never a zero), Decimal only, fail closed.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Protocol
from urllib.parse import urlencode, urlsplit

import httpx

from app.db.session import commit_off_loop
from app.services.analytics.nse_indices_client import _USER_AGENT

logger = logging.getLogger(__name__)

NSE_BASE = "https://www.nseindia.com"
HANDSHAKE_URL = NSE_BASE + "/companies-listing/corporate-integrated-filing"
LIST_URL = NSE_BASE + "/api/integrated-filing-results"
FILING_TYPE = "Integrated Filing- Financials"

MIN_SECONDS_BETWEEN_REQUESTS = 2.0
BLOCKED_STATUSES = frozenset({401, 403, 429})
MAX_XBRL_BYTES = 8 * 1024 * 1024        # the largest real file seen (an insurer) was 657 KB
MAX_LIST_BYTES = 4 * 1024 * 1024
# A balance sheet older than this is not used for a new value (the next half-year filing is always due
# within about eight months, so an older latest filing means the company stopped filing or was delisted).
MAX_FILING_AGE_DAYS = 400
# A value already stored is used for P/B for at most this long (a year-and-a-half: if the job has not renewed it
# by then the company stopped filing or the job stopped running, and the labelled Yahoo/screener value is better).
MAX_STORED_VALUE_AGE_DAYS = 400
# Stop the run after this many stocks in a row whose request itself failed (not their data): that is a
# block or an outage, not a few odd companies.
MAX_CONSECUTIVE_SOURCE_FAULTS = 5
# Share count = paid-up capital / face value. Filings round amounts to a crore or a lakh ("decimals"); if that
# rounding could move the share count by more than this fraction, no value is stored for the stock.
MAX_SHARE_COUNT_ROUNDING = Decimal("0.02")

FILING_SOURCE_CODE = "FILING"                      # stock_master.pb_source value
FILING_SOURCE_LABEL = "From the company's stock exchange filing"
JOB_NAME = "refresh_filings_book_value"

BASIS_CONSOLIDATED = "consolidated"
BASIS_STANDALONE = "standalone"

_SIX_PLACES = Decimal("0.000001")
_XBRLI = "{http://www.xbrl.org/2003/instance}"
_XBRLDI = "{http://xbrl.org/2006/xbrldi}"
_CAPMKT_NS = re.compile(r"^https?://www\.sebi\.gov\.in/xbrl/[^/]+/in-capmkt$")


# --------------------------------------------------------------------------------------- errors

class NseAccessBlocked(Exception):
    """NSE answered 401, 403 or 429: stop the whole run and keep every stored value."""

    def __init__(self, status: int):
        super().__init__(f"NSE answered {status}")
        self.status = status


class FilingSourceError(Exception):
    """The request itself failed (other status, timeout, not JSON, too large): says nothing about the company."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class FilingDataError(ValueError):
    """The filing is there but its numbers cannot be used reliably: skip the stock, store nothing."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


# --------------------------------------------------------------------------------------- data

@dataclass(frozen=True)
class FilingRow:
    qe_date: date            # the balance-sheet date
    consolidated: bool
    xbrl_url: str


@dataclass(frozen=True)
class ParsedBookValue:
    book_value_per_share: Decimal
    equity: Decimal
    shares: Decimal
    method: str              # owners_equity | total_equity_standalone | bank_capital_plus_reserves


@dataclass(frozen=True)
class StoredBookValue:
    book_value_per_share: Decimal
    balance_sheet_date: date
    filing_ref: str          # the xbrl file address: identifies the filing
    basis: str               # BASIS_CONSOLIDATED | BASIS_STANDALONE


# --------------------------------------------------------------------------------------- row selection

def _parse_qe_date(value) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip(), "%d-%b-%Y").date()
    except ValueError:
        return None


def _is_half_year_end(when: date) -> bool:
    return (when.month, when.day) in ((3, 31), (9, 30))


def _safe_xbrl_url(value) -> str | None:
    if not isinstance(value, str):
        return None
    url = value.strip()
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or parts.username or parts.password:
        return None
    if host != "nseindia.com" and not host.endswith(".nseindia.com"):
        return None
    return url


def _records(payload) -> list[dict]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in ("data", "results", "records"):
            if key in payload:
                return _records(payload[key])
    return []


def parse_filing_rows(payload) -> list[FilingRow]:
    """Keep only rows we can read completely: a date, a known basis and an NSE-hosted xbrl address."""
    rows = []
    for raw in _records(payload):
        when = _parse_qe_date(raw.get("qe_Date"))
        basis = str(raw.get("consolidated") or "").strip().lower()
        url = _safe_xbrl_url(raw.get("xbrl"))
        if when is None or url is None or basis not in ("consolidated", "standalone"):
            continue
        rows.append(FilingRow(when, basis == "consolidated", url))
    return rows


def select_filing(rows: Sequence[FilingRow], *, today: date) -> FilingRow | None:
    """Newest March-or-September row that has an xbrl file; Consolidated wins on the same date.

    The date comes first on purpose: an older Consolidated balance sheet is never preferred to a newer
    Standalone one here (mixing the two bases silently is handled in `refresh_decision`).
    """
    candidates = [r for r in rows
                  if _is_half_year_end(r.qe_date) and r.qe_date <= today
                  and (today - r.qe_date).days <= MAX_FILING_AGE_DAYS]
    if not candidates:
        return None
    # Same date and basis: take the larger address so a rerun picks the same row (revisions sort later).
    return max(candidates, key=lambda r: (r.qe_date, r.consolidated, r.xbrl_url))


def refresh_decision(stored: StoredBookValue | None, chosen: FilingRow) -> str:
    """'refresh', 'unchanged' (this filing or a newer one is already stored) or 'basis_downgrade'.

    A newer Standalone filing never replaces a stored Consolidated value: the two can differ a lot and the
    Consolidated one for the newer date may simply not have its xbrl file yet.
    """
    if stored is None:
        return "refresh"
    if chosen.qe_date < stored.balance_sheet_date or chosen.xbrl_url == stored.filing_ref:
        return "unchanged"
    if stored.basis == BASIS_CONSOLIDATED and not chosen.consolidated:
        return "basis_downgrade"
    return "refresh"          # a newer balance sheet, or a revised/Consolidated filing for the same date


# --------------------------------------------------------------------------------------- XBRL parsing

@dataclass(frozen=True)
class _Fact:
    kind: str                # "I" instant, "D" duration
    end: date
    value: Decimal
    unit: str | None
    decimals: str | None


def _unit_signatures(root) -> dict[str, str]:
    units = {}
    for unit in root.iter(_XBRLI + "unit"):
        divide = unit.find(_XBRLI + "divide")
        if divide is not None:
            num = [m.text.strip() for m in divide.iter(_XBRLI + "measure")]
            units[unit.get("id")] = "/".join(num) if len(num) == 2 else "?"
        else:
            measures = [m.text.strip() for m in unit.iter(_XBRLI + "measure") if m.text]
            units[unit.get("id")] = measures[0] if len(measures) == 1 else "?"
    return units


def _plain_contexts(root) -> dict[str, tuple[str, date]]:
    """Context id -> (kind, end date) for contexts with a plain period and NO dimensions."""
    result = {}
    for context in root.iter(_XBRLI + "context"):
        entity = context.find(_XBRLI + "entity")
        if context.find(_XBRLI + "scenario") is not None or entity is None or entity.find(_XBRLI + "segment") is not None:
            continue
        period = context.find(_XBRLI + "period")
        if period is None:
            continue
        try:
            instant = period.find(_XBRLI + "instant")
            if instant is not None:
                result[context.get("id")] = ("I", date.fromisoformat(instant.text.strip()))
            elif period.find(_XBRLI + "endDate") is not None:
                result[context.get("id")] = ("D", date.fromisoformat(period.find(_XBRLI + "endDate").text.strip()))
        except (ValueError, AttributeError):
            continue
    return result


def _collect_facts(root) -> dict[str, list[_Fact]]:
    contexts = _plain_contexts(root)
    units = _unit_signatures(root)
    facts: dict[str, list[_Fact]] = {}
    for element in root:
        if not isinstance(element.tag, str) or not element.get("contextRef"):
            continue
        if not element.tag.startswith("{"):
            continue
        namespace, _, name = element.tag[1:].partition("}")
        if not _CAPMKT_NS.match(namespace):
            continue
        context = contexts.get(element.get("contextRef"))
        text = (element.text or "").strip()
        if context is None or not text:
            continue
        try:
            value = Decimal(text)
        except InvalidOperation:
            continue          # a text fact (company name, a date, "NA"); the numeric ones we need are checked by name
        if not value.is_finite():
            continue
        facts.setdefault(name, []).append(_Fact(context[0], context[1], value, units.get(element.get("unitRef")), element.get("decimals")))
    return facts


def _value(facts, tag, balance_date, *, durations_ok=False, unit):
    """The single value of `tag` at the balance-sheet date, or None when absent; ambiguity fails closed."""
    wanted = [f for f in facts.get(tag, []) if f.end == balance_date and (f.kind == "I" or durations_ok)]
    if not wanted:
        return None, None
    if any(f.unit != unit for f in wanted):
        raise FilingDataError(f"unexpected_unit_{tag}")
    if len({f.value for f in wanted}) != 1:
        raise FilingDataError(f"ambiguous_{tag}")
    return wanted[0].value, wanted[0].decimals


def _rounding_fraction(value: Decimal, decimals) -> Decimal:
    try:
        places = int(decimals)
    except (TypeError, ValueError):
        return Decimal(0)          # "INF" (exact) or missing: no stated rounding
    if places >= 0:
        return Decimal(0)
    return (Decimal(5) * Decimal(10) ** (-places - 1)) / value


def _shares(facts, balance_date) -> Decimal:
    paid_up, decimals = _value(facts, "PaidUpValueOfEquityShareCapital", balance_date, durations_ok=True, unit="iso4217:INR")
    face, _ = _value(facts, "FaceValueOfEquityShareCapital", balance_date, durations_ok=True, unit="iso4217:INR/xbrli:shares")
    if paid_up is None or face is None:
        raise FilingDataError("missing_share_count_facts")
    if paid_up <= 0 or face <= 0:
        raise FilingDataError("non_positive_share_count_facts")
    if _rounding_fraction(paid_up, decimals) > MAX_SHARE_COUNT_ROUNDING:
        raise FilingDataError("share_count_too_coarse")
    shares = paid_up / face
    if shares <= 0:
        raise FilingDataError("non_positive_shares")
    return shares


def parse_book_value(data: bytes, *, balance_sheet_date: date, standalone: bool = False) -> ParsedBookValue:
    """Book value per share at `balance_sheet_date` (the row's qe_Date), or FilingDataError. Never a zero.

    Non-bank (Ind AS, including finance companies such as Bajaj Finance):
        EquityAttributableToOwnersOfParent / (PaidUpValueOfEquityShareCapital / FaceValueOfEquityShareCapital)
        For a Standalone filing without that fact: `Equity` (no minority holders exist in a standalone balance sheet).
    Bank format (no equity total fact, e.g. HDFC Bank):
        (PaidUpValueOfEquityShareCapital + ReservesAndSurplus) / the same share count;
        `Capital` must agree with the paid-up capital when it is present.
    Anything else (life insurers have no face value or share count in the file) gives FilingDataError.
    """
    if len(data) > MAX_XBRL_BYTES:
        raise FilingDataError("file_too_large")
    upper = data.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:     # no entity tricks in a file we do not control
        raise FilingDataError("dtd_not_allowed")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise FilingDataError("not_xml") from exc
    if root.tag != _XBRLI + "xbrl":
        raise FilingDataError("not_xbrl")
    facts = _collect_facts(root)
    inr = "iso4217:INR"

    owners, _ = _value(facts, "EquityAttributableToOwnersOfParent", balance_sheet_date, unit=inr)
    method, equity = "owners_equity", owners
    if equity is None and standalone:
        equity, _ = _value(facts, "Equity", balance_sheet_date, unit=inr)
        method = "total_equity_standalone"
    if equity is None:
        reserves, _ = _value(facts, "ReservesAndSurplus", balance_sheet_date, unit=inr)
        capital, _ = _value(facts, "Capital", balance_sheet_date, unit=inr)
        paid_up, _ = _value(facts, "PaidUpValueOfEquityShareCapital", balance_sheet_date, durations_ok=True, unit=inr)
        total_equity_present = _value(facts, "Equity", balance_sheet_date, unit=inr)[0] is not None
        # Only the bank layout: capital and reserves, and no equity total anywhere in the file.
        if reserves is None or capital is None or paid_up is None or total_equity_present:
            raise FilingDataError("equity_facts_missing")
        if capital != paid_up:
            raise FilingDataError("capital_disagrees_with_paid_up")
        equity, method = paid_up + reserves, "bank_capital_plus_reserves"
    if equity <= 0:
        raise FilingDataError("non_positive_equity")
    shares = _shares(facts, balance_sheet_date)
    per_share = (equity / shares).quantize(_SIX_PLACES, rounding=ROUND_HALF_UP)
    if per_share <= 0:
        raise FilingDataError("non_positive_book_value")
    return ParsedBookValue(per_share, equity, shares, method)


# --------------------------------------------------------------------------------------- HTTP client

class FilingsSource(Protocol):
    async def handshake(self) -> None: ...
    async def list_filings(self, symbol: str) -> list[FilingRow]: ...
    async def fetch_xbrl(self, url: str) -> bytes: ...


class NseFilingsClient:
    """Sequential NSE client: >= 2 s between requests, no redirects, no retries, cookie kept by the session."""

    def __init__(self, http: httpx.AsyncClient | None = None, *,
                 sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
                 monotonic: Callable[[], float] = time.monotonic,
                 min_interval: float = MIN_SECONDS_BETWEEN_REQUESTS):
        self._http = http or httpx.AsyncClient(
            timeout=60, follow_redirects=False,
            headers={"User-Agent": _USER_AGENT, "Accept": "application/json,text/html,*/*",
                     "Accept-Language": "en-US,en;q=0.9", "Referer": HANDSHAKE_URL})
        self._sleep, self._monotonic, self._min_interval = sleep, monotonic, min_interval
        self._last_finished: float | None = None

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _get(self, url: str, *, params=None, max_bytes: int) -> bytes:
        if self._last_finished is not None:
            wait = self._min_interval - (self._monotonic() - self._last_finished)
            if wait > 0:
                await self._sleep(wait)
        try:
            async with self._http.stream("GET", url, params=params) as response:
                status = response.status_code
                if status in BLOCKED_STATUSES:
                    raise NseAccessBlocked(status)
                if status != 200:
                    raise FilingSourceError(f"status_{status}")
                chunks, size = [], 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > max_bytes:
                        raise FilingSourceError("response_too_large")
                    chunks.append(chunk)
                return b"".join(chunks)
        except httpx.HTTPError as exc:
            raise FilingSourceError(type(exc).__name__) from exc
        finally:
            self._last_finished = self._monotonic()

    async def handshake(self) -> None:
        await self._get(HANDSHAKE_URL, max_bytes=MAX_LIST_BYTES * 4)

    async def list_filings(self, symbol: str) -> list[FilingRow]:
        body = await self._get(LIST_URL, params={"index": "equities", "symbol": symbol, "type": FILING_TYPE},
                               max_bytes=MAX_LIST_BYTES)
        try:
            payload = json.loads(body.decode("utf-8-sig"))
        except (ValueError, UnicodeError) as exc:
            raise FilingSourceError("list_not_json") from exc
        return parse_filing_rows(payload)

    async def fetch_xbrl(self, url: str) -> bytes:
        if _safe_xbrl_url(url) is None:
            raise FilingDataError("xbrl_address_not_nse")
        return await self._get(url, max_bytes=MAX_XBRL_BYTES)


# --------------------------------------------------------------------------------------- run

class BookValueStore(Protocol):
    def stored(self, isin: str) -> StoredBookValue | None: ...
    def save(self, isin: str, value: StoredBookValue) -> None: ...
    async def commit(self) -> None: ...


@dataclass(frozen=True)
class FilingsRunResult:
    success: bool
    considered: int = 0
    updated: int = 0
    unchanged: int = 0
    skipped: int = 0
    stopped: str | None = None      # None, or why the run stopped early (blocked_<status>, handshake_failed, source_unusable)


async def refresh_filings_book_values(store: BookValueStore, targets: Sequence[tuple[str, str]], source: FilingsSource,
                                      *, today: date | None = None) -> FilingsRunResult:
    """targets: (isin, nse_symbol) of held equity stocks. A block or outage stops the run; stored values are kept."""
    today = today or date.today()
    considered = updated = unchanged = skipped = faults_in_a_row = 0
    try:
        await source.handshake()
    except NseAccessBlocked as exc:
        logger.warning("FILINGS_BOOK_VALUE_ALERT blocked status=%d stage=handshake", exc.status)
        return FilingsRunResult(False, stopped=f"blocked_{exc.status}")
    except FilingSourceError as exc:
        logger.warning("FILINGS_BOOK_VALUE_ALERT handshake_failed reason=%s", exc.reason)
        return FilingsRunResult(False, stopped="handshake_failed")
    for isin, symbol in sorted(targets, key=lambda t: (t[1], t[0])):
        considered += 1
        try:
            chosen = select_filing(await source.list_filings(symbol), today=today)
            faults_in_a_row = 0
            if chosen is None:
                skipped += 1
                logger.info("FILINGS_BOOK_VALUE_SKIP symbol=%s reason=no_recent_half_year_filing", symbol)
                continue
            decision = refresh_decision(store.stored(isin), chosen)
            if decision == "unchanged":
                unchanged += 1
                continue
            if decision == "basis_downgrade":
                skipped += 1
                logger.info("FILINGS_BOOK_VALUE_SKIP symbol=%s reason=standalone_after_consolidated", symbol)
                continue
            parsed = parse_book_value(await source.fetch_xbrl(chosen.xbrl_url), balance_sheet_date=chosen.qe_date,
                                      standalone=not chosen.consolidated)
            store.save(isin, StoredBookValue(parsed.book_value_per_share, chosen.qe_date, chosen.xbrl_url,
                                             BASIS_CONSOLIDATED if chosen.consolidated else BASIS_STANDALONE))
            await store.commit()
            updated += 1
        except NseAccessBlocked as exc:
            logger.warning("FILINGS_BOOK_VALUE_ALERT blocked status=%d symbol=%s", exc.status, symbol)
            return FilingsRunResult(False, considered, updated, unchanged, skipped, f"blocked_{exc.status}")
        except FilingSourceError as exc:
            skipped += 1
            faults_in_a_row += 1
            logger.info("FILINGS_BOOK_VALUE_SKIP symbol=%s reason=%s", symbol, exc.reason)
            if faults_in_a_row >= MAX_CONSECUTIVE_SOURCE_FAULTS:
                logger.warning("FILINGS_BOOK_VALUE_ALERT source_unusable consecutive_failures=%d", faults_in_a_row)
                return FilingsRunResult(False, considered, updated, unchanged, skipped, "source_unusable")
        except FilingDataError as exc:
            skipped += 1
            faults_in_a_row = 0
            logger.info("FILINGS_BOOK_VALUE_SKIP symbol=%s reason=%s", symbol, exc.reason)
        except Exception as exc:  # one stock's odd data or a storage hiccup must not stop the others
            skipped += 1
            faults_in_a_row = 0
            logger.info("FILINGS_BOOK_VALUE_SKIP symbol=%s error=%s", symbol, type(exc).__name__)
    if considered and skipped * 5 > considered:
        # Same threshold as the daily stock job: a few insurers and odd filers are normal, a fifth is not.
        logger.warning("FILINGS_BOOK_VALUE_ALERT many_stocks_skipped skipped=%d considered=%d", skipped, considered)
    return FilingsRunResult(True, considered, updated, unchanged, skipped)


# --------------------------------------------------------------------------------------- P/B from the stored value

# A filing P/B further than this from the previous stored P/B (either source) is distrusted: a bonus issue or share
# split after the balance-sheet date changes the close but not the stored book value per share, and the ISIN does not
# change, so nothing else would catch it. 1:1 bonus gives 0.5; ordinary differences between sources are well inside.
MAX_PB_JUMP_FACTOR = Decimal("1.67")


def filing_pb_ratio(
    stored: StoredBookValue | None, close: Decimal | None, close_date: date | None, *, previous: Decimal | None = None,
) -> Decimal | None:
    """Day's close / book value per share, or None (the daily job then uses the labelled Yahoo/screener value)."""
    if stored is None or close is None or close_date is None:
        return None
    if close <= 0 or stored.book_value_per_share <= 0 or stored.balance_sheet_date > close_date:
        return None
    if (close_date - stored.balance_sheet_date).days > MAX_STORED_VALUE_AGE_DAYS:
        return None           # the stored filing is far too old to describe the company any more
    ratio = (close / stored.book_value_per_share).quantize(_SIX_PLACES, rounding=ROUND_HALF_UP)
    if previous is not None and previous > 0 and ratio > 0:
        jump = ratio / previous
        if jump > MAX_PB_JUMP_FACTOR or jump < 1 / MAX_PB_JUMP_FACTOR:
            return None
    return ratio


FILING_FOOTNOTE = (
    "P/B from the company's own stock exchange filing (book value per share at its latest half-year "
    "or year-end balance sheet) and the day's closing price"
)


def filing_footnote(stored: StoredBookValue, close_date: date) -> str:
    # The same sentence for every stock on purpose: the valuation page lists each distinct footnote once,
    # and a sentence with the stock's own figures would give one footnote per stock.
    return FILING_FOOTNOTE


# --------------------------------------------------------------------------------------- database side
# stock_master has no column for the book value, its date or the filing address. The four columns below are
# PROPOSED (a migration after 0051 is needed; none was added). Until they exist every function here fails closed.

BOOK_VALUE_COLUMNS = ("book_value_per_share", "book_value_as_of", "book_value_filing_ref", "book_value_basis")


def book_value_columns_exist() -> bool:
    from app.models.reference import StockMaster
    return all(hasattr(StockMaster, name) for name in BOOK_VALUE_COLUMNS)


class BookValueColumnsMissing(RuntimeError):
    pass


def load_filing_values(db) -> dict[str, StoredBookValue]:
    """All stored filing values by ISIN; empty (labelled fallbacks stay in force) while the columns do not exist."""
    if not book_value_columns_exist():
        return {}
    from sqlalchemy import select
    from app.models.reference import StockMaster
    result = {}
    for row in db.scalars(select(StockMaster).where(StockMaster.book_value_per_share.isnot(None))):
        if row.book_value_as_of and row.book_value_filing_ref and row.book_value_basis:
            result[row.isin] = StoredBookValue(row.book_value_per_share, row.book_value_as_of,
                                               row.book_value_filing_ref, row.book_value_basis)
    return result


class StockMasterBookValueStore:
    def __init__(self, db):
        if not book_value_columns_exist():
            raise BookValueColumnsMissing("stock_master has no book value columns yet (migration pending)")
        self.db = db

    def stored(self, isin: str) -> StoredBookValue | None:
        return load_filing_values_for(self.db, isin)

    def save(self, isin: str, value: StoredBookValue) -> None:
        from app.models.reference import StockMaster
        row = self.db.get(StockMaster, isin)
        if row is None:
            raise FilingDataError("stock_not_in_master")
        row.book_value_per_share = value.book_value_per_share
        row.book_value_as_of = value.balance_sheet_date
        row.book_value_filing_ref = value.filing_ref
        row.book_value_basis = value.basis
        self.db.add(row)

    async def commit(self) -> None:
        try:
            await commit_off_loop(self.db)
        except Exception:
            self.db.rollback()
            raise


def load_filing_values_for(db, isin: str) -> StoredBookValue | None:
    from app.models.reference import StockMaster
    row = db.get(StockMaster, isin)
    if row is None or row.book_value_per_share is None or not (row.book_value_as_of and row.book_value_filing_ref and row.book_value_basis):
        return None
    return StoredBookValue(row.book_value_per_share, row.book_value_as_of, row.book_value_filing_ref, row.book_value_basis)


def held_equity_targets(db, today: date) -> tuple[list[tuple[str, str]], int]:
    """(isin, nse_symbol) of held domestic equity stocks, and how many held ones have no NSE symbol yet.

    "Held" is the selection the daily stock job already uses for its BSE step (units held today in a family
    member's portfolio, in the newest written disclosure of the scheme).
    """
    from sqlalchemy import select
    from app.models.reference import StockMaster
    from app.services.analytics.stock_fundamentals_client import _held_domestic_isins
    held = _held_domestic_isins(db, today)
    if not held:
        return [], 0
    rows = db.execute(select(StockMaster.isin, StockMaster.nse_symbol).where(StockMaster.isin.in_(held))).all()
    targets = [(isin, symbol.strip()) for isin, symbol in rows if symbol and symbol.strip()]
    return targets, len(rows) - len(targets)
