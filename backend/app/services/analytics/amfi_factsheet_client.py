"""AMFI factsheet-based fund-manager attribution (attribute 04).

Mirrors amfi_ter_client.py's shape: one monthly file per AMC covers every scheme it
offers, matched against locally known schemes and upserted. There's no AMFI bulk feed;
each AMC's own factsheet is the source, fetched per fund_manager_resolvers.py and read
per fund_manager_layouts.py.

Matching is per fund, not per plan row (card 1): a factsheet names a fund, while
`schemes` has one row per plan and option sharing `base_name`. A matched fund's managers
are written to every row of that (amc_name, base_name) family. Layers, strongest first:
ISIN printed on the page; exact canonical name; fuzzy name >= 0.80 within the same
category, refused when the runner-up is within 0.05."""

from __future__ import annotations

import html
import json
import logging
import re
import time
import urllib.parse
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from difflib import SequenceMatcher

import httpx
import pypdfium2 as pdfium
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.reference import Scheme, SchemeFundManager
from app.services.analytics.fund_manager_layouts import SchemePage, LAYOUTS, Word
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverEntry, ResolverKind

MATCH_METHOD_ISIN = "ISIN"
MATCH_METHOD_EXACT = "EXACT"
MATCH_METHOD_FUZZY = "FUZZY"
MATCH_METHOD_MANUAL = "MANUAL"

MIN_MATCH_CONFIDENCE = Decimal("0.80")
AMBIGUITY_MARGIN = Decimal("0.05")

_BOILERPLATE_RE = re.compile(
    r"\b(FUND|SCHEME|PLAN|DIRECT|REGULAR|GROWTH|IDCW|DIVIDEND|REINVESTMENT|PAYOUT)\b", re.IGNORECASE,
)
# "(Existing Number of Segregated Portfolios - 1)", "[(Erstwhile ABC Income Fund)]" -- AMFI and
# factsheets add these to the same fund's name, so they never decide a match.
_NAME_NOTE_RE = re.compile(r"[\[(][^\])]*(?:ERSTWHILE|SEGREGATED)[^\])]*[\])]+", re.IGNORECASE)

# September 2026 printed names verified against this AMC's live NAVAll families.
# Never global normalization: an alias is scoped to the same AMC as the match.
_AMC_FUND_ALIASES = {
    "Sundaram Mutual Fund": {
        "Sundaram Aggressive Hybrid Fund": "Sundaram Aggressive Hybrid Fund (Formerly Known as Principal Hybrid Equity Fund)",
        "Sundaram Arbitrage Fund": "Sundaram Arbitrage Fund(Formerly Known as Prinicpal Arbitrage Fund)",
        "Sundaram Banking and PSU Debt Fund": "Sundaram Banking and PSU Debt Fund (Formerly Known as Sundaram Banking and PSU Fund)",
        "Sundaram Conservative Hybrid Fund": "Sundaram Conservative Hybrid Fund (Formerly Known as Sundaram Debt Oriented Hybrid Fund)",
        "Sundaram Consumption Fund": "Sundaram Consumption Fund (Formerly Known as Sundaram Rural and Consumption Fund)",
        "Sundaram Dividend Yield Fund": "Sundaram Dividend Yield Fund (Formerly Known as Principal Dividend Yield Fund)",
        "Sundaram Dynamic Asset Allocation Fund": "Sundaram Dynamic Asset Allocation Fund (Formerly Known as Sundaram Balanced Advantage Fund)",
        "Sundaram Equity Savings Fund": "Sundaram Equity Savings Fund (Formerly Known as Principal Equity Savings Fund)",
        "Sundaram Focused Fund": "Sundaram Focused Fund (Formerly Known as Principal Focused Multicap Fund)",
        "Sundaram Large Cap Fund": "Sundaram Large Cap Fund ( Formerly Know as Sundaram Blue Chip Fund)",
        "Sundaram Liquid Fund": "Sundaram Liquid Fund (Formerly Known as Principal Cash Management Fund)",
        "Sundaram Medium Term Fund": "Sundaram Medium Term Fund (Formerly Known as Sundaram Medium Duration Fund)",
        "Sundaram Multi Cap Fund": "Sundaram Multi Cap Fund (Formerly Known as Principal Multi Cap Growth Fund)",
        "Sundaram Nifty 100 Equal Weight Fund": "Sundaram Nifty 100 Equal Weight Fund (Formerly Known as Principal Nifty 100 Equal Weight Fund)",
        "Sundaram Short Term Fund": "Sundaram Short Term Fund (Formerly Known as Sundaram Short Duration Fund)",
        "Sundaram Ultra Short Term Fund": "Sundaram Ultra Short Term Fund (Formerly Known as Sundaram Ultra Short Duration Fund)",
        "Sundaram Ultra Short to Short Term Fund": "Sundaram Ultra Short to Short Term Fund (Formerly Known as Sundaram Low Duration Fund)",
    },
    "Aditya Birla Sun Life Mutual Fund": {
        "Aditya Birla Sun Life Large & Midcap Fund": "Aditya Birla Sun Life Large & Mid Cap Fund",
        "Aditya Birla Sun Life Silver ETF Fund of Fund": "Aditya Birla Sun Life Silver ETF FOF",
        "Aditya Birla Sun Life US Treasury 1-3 year Bonds ETFs Passive FOF": "Aditya Birla Sun Life US Treasury 1-3 Year Bond ETFs Passive FOF",
        "Aditya Birla Sun Life US Treasury 3-10 year Bonds ETFs Passive FOF": "Aditya Birla Sun Life US Treasury 3-10 Year Bond ETFs Passive FOF",
    },
}


def _canonical_fund_name(name: str) -> str:
    s = _NAME_NOTE_RE.sub(" ", name).upper()
    s = _BOILERPLATE_RE.sub("", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


@dataclass(frozen=True)
class FundFamily:
    amc_name: str
    base_name: str
    sebi_category: str
    schemes: tuple[Scheme, ...]
    isins: frozenset[str]

    @property
    def canonical(self) -> str:
        return _canonical_fund_name(self.base_name)


def build_families(schemes: list[Scheme]) -> list[FundFamily]:
    grouped: dict[tuple[str, str], list[Scheme]] = {}
    for scheme in schemes:
        if scheme.base_name:
            grouped.setdefault((scheme.amc_name, scheme.base_name), []).append(scheme)
    return [
        FundFamily(amc, base, members[0].sebi_category or "", tuple(members),
                   frozenset(i for s in members for i in (s.isin, s.isin_reinvest) if i))
        for (amc, base), members in grouped.items()
    ]


def _same_category(page_category: str | None, family: FundFamily) -> bool:
    # The factsheet's "Category: Small Cap Fund" against our "Equity Scheme - Small Cap Fund".
    if not page_category:
        return True  # nothing printed to check against
    return _canonical_fund_name(page_category) in _canonical_fund_name(family.sebi_category)


def match_scheme_page(page: SchemePage, families: list[FundFamily]) -> tuple[FundFamily, str, Decimal] | None:
    """`families` must already be scoped to one AMC -- never search across AMCs.
    Returns None when no confident, unambiguous match exists (Review Focus #2)."""
    if page.isins:
        by_isin = [f for f in families if f.isins & set(page.isins)]
        if len(by_isin) == 1:
            return by_isin[0], MATCH_METHOD_ISIN, Decimal("1.0")

    wanted = _canonical_fund_name(page.heading)
    exact = [f for f in families if f.canonical == _canonical_fund_name(
        _AMC_FUND_ALIASES.get(f.amc_name, {}).get(page.heading, page.heading))]
    if len(exact) == 1:
        return exact[0], MATCH_METHOD_EXACT, Decimal("1.0")
    if len(exact) > 1:
        return None

    scored = sorted(
        ((f, Decimal(str(round(SequenceMatcher(None, wanted, f.canonical).ratio(), 3))))
         for f in families if _same_category(page.category, f)),
        key=lambda pair: pair[1], reverse=True,
    )
    if not scored or scored[0][1] < MIN_MATCH_CONFIDENCE:
        return None
    if len(scored) > 1 and scored[0][1] - scored[1][1] < AMBIGUITY_MARGIN:
        return None
    return scored[0][0], MATCH_METHOD_FUZZY, scored[0][1]


logger = logging.getLogger(__name__)

AMFI_FACTSHEET_DIRECTORY_URL = "https://www.amfiindia.com/online-center/download-factsheets"
_HTTP_TIMEOUT = 90.0
_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def _parse_managing_since(raw: str) -> date | None:
    # Normalise what factsheets print: "August 26,2026" (no space), "23rd March 2026"
    # (ordinal day), "Sept 2025". Day-first forms come from quant, NJ and Abakkus (Run 4).
    text = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", raw.strip())
    text = re.sub(r",\s*", ", ", text).replace("Sept ", "Sep ")
    for fmt in ("%b. %d, %Y", "%b %d, %Y", "%B %d, %Y", "%d %B %Y", "%d %b %Y", "%d-%b-%Y", "%b %Y", "%B %Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None  # an unparsed date is never fatal -- managing_since_raw keeps the original text


def upsert_scheme_fund_managers(
    db: Session, scheme: Scheme, managers: list[dict], reference_period: date,
    match_method: str, match_confidence: Decimal | None,
) -> None:
    existing = {
        row.manager_name: row
        for row in db.query(SchemeFundManager).filter_by(scheme_id=scheme.id, reference_period=reference_period).all()
    }
    seen_names = set()
    for order, manager in enumerate(managers):
        name = manager["name"]
        if name in seen_names:
            continue  # listed twice on one page (e.g. table and footnote): the first listing wins
        seen_names.add(name)
        since_raw = manager.get("since_raw")
        since = _parse_managing_since(since_raw) if since_raw else None
        row = existing.get(name)
        if row is None:
            db.add(SchemeFundManager(
                id=uuid.uuid4(), scheme_id=scheme.id, manager_name=name, role=manager.get("role"),
                sequence_order=order, managing_since_raw=since_raw, managing_since=since,
                reference_period=reference_period, match_method=match_method, match_confidence=match_confidence,
            ))
        else:
            row.role = manager.get("role")
            row.sequence_order = order
            row.managing_since_raw = since_raw
            row.managing_since = since
            row.match_method = match_method
            row.match_confidence = match_confidence
    # A manager present last month but gone from this month's factsheet
    # (departed/replaced) is removed, not left stale.
    for name, row in existing.items():
        if name not in seen_names:
            db.delete(row)
    # Production sessions disable autoflush. Make this upsert visible to the
    # next page/file in the same AMC transaction without committing the AMC.
    db.flush()


def extract_page_text(pdf_bytes: bytes) -> list[str]:
    """One string per page -- the per-scheme regex/absl extraction runs
    once per page, since each page typically covers one scheme."""
    doc = pdfium.PdfDocument(pdf_bytes)
    return [page.get_textpage().get_text_range() for page in doc]


def extract_page_words(pdf_bytes: bytes) -> list[list[Word]]:
    """Whitespace-delimited words with the union of PDFium character boxes."""
    doc = pdfium.PdfDocument(pdf_bytes)
    pages = []
    for page in doc:
        text = page.get_textpage()
        words = []
        chars = []
        boxes = []
        def flush():
            if chars:
                words.append((min(b[0] for b in boxes), min(b[1] for b in boxes),
                              max(b[2] for b in boxes), max(b[3] for b in boxes), "".join(chars)))
                chars.clear()
                boxes.clear()
        for index in range(text.count_chars()):
            char = text.get_text_range(index, 1)
            if not char or char.isspace():
                flush()
            else:
                chars.append(char)
                boxes.append(text.get_charbox(index))
        flush()
        pages.append(words)
    return pages


class FactsheetPages(list[str]):
    """Keep page text and optional geometry together through validation and import."""
    def __init__(self, texts: list[str], words: list[list[Word]]):
        if len(texts) != len(words):
            raise ValueError("Text and geometry page counts differ")
        super().__init__(texts)
        self.words = words


@dataclass(frozen=True)
class FundManagerRefreshResult:
    success: bool
    amcs_processed: int = 0
    amcs_failed: int = 0
    schemes_matched: int = 0
    schemes_unmatched: int = 0
    seconds: float = 0.0


async def _fetch_amfi_directory() -> dict[str, str]:
    """{AMFI company name: factsheet landing URL}, re-fetched every run (AMCs move their
    pages). Keys are AMFI's company names ("Aditya Birla Sun Life AMC Limited"), which the
    registry maps to our fund-house names -- `schemes.amc_name` never appears here."""
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
        resp = await client.get(AMFI_FACTSHEET_DIRECTORY_URL)
        resp.raise_for_status()
    return _parse_amfi_directory_payload(resp.text)


def _parse_amfi_directory_payload(html: str) -> dict[str, str]:
    # The page server-renders a Next.js payload with escaped quotes; each AMC object
    # carries "amc_name" and "amc_monthly_mf_factsheets" (checked live 9 Oct: 57 AMCs).
    text = html.replace('\\"', '"')
    pairs = re.findall(r'"amc_name":"([^"]+)"[^{}]*?"amc_monthly_mf_factsheets":"([^"]*)"', text)
    return {name.replace("\\u0026", "&"): url.replace("\\u0026", "&") for name, url in pairs}


_MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
_NOT_A_FACTSHEET = re.compile(r"riskometer|portfolio|how[-_ ]?to|methodology|kim|\bsid\b|addendum|notice|form", re.I)


_MONTH_WORD = re.compile(
    r"(?<![a-z])(january|february|march|april|may|june|july|august|september|october|november|december"
    r"|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)(?![a-z])"
)


def _link_date(text: str) -> tuple[int, int]:
    """(year, month) found in a link's URL or text, newest first when sorted descending;
    (0, 0) when none -- such links sort last."""
    lowered = text.lower()
    year = max((int(y) for y in re.findall(r"20\d\d", lowered)), default=0)
    # Whole month words only ("marketing" isn't March); the last one wins, since folders
    # come before the file name in a URL.
    months = _MONTH_WORD.findall(lowered)
    return year, (_MONTHS[months[-1][:3]] if months else 0)


async def _static_link_candidates(client: httpx.AsyncClient, landing_url: str, link_pattern: str | None) -> list[str]:
    """Card 4, pick rule: links whose URL or link text says factsheet (or the AMC's own
    pattern), newest first. The content and month checks then decide which one is real."""
    if landing_url.lower().split("?")[0].endswith(".pdf"):
        return [landing_url]  # e.g. Old Bridge: AMFI points straight at the file
    resp = await client.get(landing_url)
    resp.raise_for_status()
    pattern = re.compile(link_pattern or r"fact\s*[-_ ]?sheet", re.I)
    links = []
    if urllib.parse.urlparse(landing_url).hostname == "www.growwmf.in":
        # Download tabs are embedded in Next page data, not all rendered as anchors.
        script = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', resp.text, re.S)
        if script:
            root = json.loads(script.group(1))["props"]["pageProps"]["filesData"]
            def documents(folder):
                for doc in folder.get("files", []):
                    name, public_url = doc.get("name"), doc.get("publicUrl")
                    if not (isinstance(name, str) and isinstance(public_url, str)):
                        continue  # a malformed entry mustn't stop the rest (Run 3 review)
                    if pattern.search(name) and not _NOT_A_FACTSHEET.search(public_url):
                        # Fiscal-year folder names must not override the document year.
                        links.append((_link_date(name), public_url))
                for child in folder.get("folders", []):
                    documents(child)
            documents(root)
    for href, label in re.findall(r'<a[^>]+href=["\']([^"\']+\.pdf[^"\']*)["\'][^>]*>(.*?)</a>', resp.text, re.I | re.S):
        text = re.sub(r"<[^>]+>", " ", label)
        joined = f"{href} {text}"
        if pattern.search(joined) and not _NOT_A_FACTSHEET.search(href):
            # Date the link by its file name and text first: upload folders (/2026/01/) and
            # document ids (HSBC's UUIDs) carry year-like digits unrelated to the factsheet's month.
            named = f"{urllib.parse.unquote(urllib.parse.urlparse(href).path.rsplit('/', 1)[-1])} {text}"
            when = _link_date(named) if _link_date(named)[0] else _link_date(joined)
            if urllib.parse.urlparse(landing_url).hostname == "www.zerodhafundhouse.com":
                # This site's published filenames use "Factsheet - Aug 26.pdf".
                short = re.search(r"Factsheet\s*-\s*([A-Za-z]+)\s+(\d{2})\.pdf", named, re.I)
                if short and short.group(1)[:3].lower() in _MONTHS:
                    when = (2000 + int(short.group(2)), _MONTHS[short.group(1)[:3].lower()])
            links.append((when, urllib.parse.urljoin(str(resp.url), html.unescape(href))))
    # The same file is often linked twice (title and "Download"): keep one, at its best date.
    best: dict[str, tuple[int, int]] = {}
    for when, url in links:
        best[url] = max(when, best.get(url, (0, 0)))
    return [url for url, _ in sorted(best.items(), key=lambda pair: pair[1], reverse=True)][:3]


# Factsheets on 9 Oct were 1-22 MB; anything far larger isn't one, and pdfium parses it in-process.
_MAX_PDF_BYTES = 60 * 1024 * 1024


async def _download_pdf(client: httpx.AsyncClient, url: str) -> bytes | None:
    async with client.stream("GET", url) as resp:
        resp.raise_for_status()
        body = bytearray()
        async for chunk in resp.aiter_bytes():
            body.extend(chunk)
            if len(body) > _MAX_PDF_BYTES:
                return None
    return bytes(body) if body.startswith(b"%PDF") else None


_AS_ON = re.compile(
    r"(?:as on|as of|data as on)\s*:?\s*(\d{1,2})(?:st|nd|rd|th)?\s*([A-Za-z]{3,9})[,.]?\s*(\d{4})"
    r"|(?:as on|as of|data as on)\s*:?\s*([A-Za-z]{3,9})\s*(\d{1,2}),?\s*(\d{4})", re.I)


def _latest_as_on(pages: list[str], today: date | None = None) -> date | None:
    found = []
    for text in pages[:12]:
        for m in _AS_ON.finditer(text):
            day, month, year = (m.group(1), m.group(2), m.group(3)) if m.group(1) else (m.group(5), m.group(4), m.group(6))
            month_no = _MONTHS.get(month[:3].lower())
            if month_no:
                try:
                    found.append(date(int(year), month_no, int(day)))
                except ValueError:
                    continue
    # A future date (a typo, or a misread fund date) must not make an old file look current.
    if today is not None:
        found = [d for d in found if d <= today + timedelta(days=7)]
    return max(found) if found else None


def _read_schemes(reader, text: str, words: list[Word] | None = None) -> list[SchemePage]:
    found = reader(text, words) if words is not None else reader(text)
    return [found] if isinstance(found, SchemePage) else found or []


def looks_like_current_factsheet(pages: list[str], reader, today: date) -> tuple[bool, str]:
    """Card 4: the downloaded PDF is this AMC's current factsheet. Content: at least 3
    schemes this AMC's reader understands (including multi-scheme summary pages;
    rejects single-scheme one-pagers, how-to guides,
    unrelated PDFs). Month: the latest "as on" date is within 45 days (a factsheet
    published mid-month can still carry the previous month-end -- Edelweiss's September
    file says "Data as on August 31"). Returns (ok, reason) for the alert line."""
    scheme_pages = sum(len(_read_schemes(reader, page, pages.words[i] if isinstance(pages, FactsheetPages) else None))
                       for i, page in enumerate(pages))
    if scheme_pages < 3:
        return False, "not_a_factsheet"
    as_on = _latest_as_on(pages, today)
    if as_on is None or (today - as_on).days > 45:
        return False, "stale_month"
    return True, "ok"


def _alert(amc_name: str, reason: str, detail: str) -> None:
    # One line per problem; a CloudWatch metric filter on this prefix raises an alarm on
    # the existing ops-alerts SNS topic (Task 4). Card 2.
    logger.warning(
        "FUND_MANAGER_ALERT amc=%s reason=%s detail=%s",
        " ".join(amc_name.split()), " ".join(reason.split()), " ".join(detail.split()),
    )


def import_pages(
    db: Session, amc_name: str, pages: list[str], reader, reference_period: date, manual: bool = False,
) -> tuple[int, int]:
    """Read every scheme page with the AMC's reader, match each to a fund family within
    this AMC only, and write the managers to every plan row of the matched family. Shared
    by the monthly job and the manual-import CLI. Returns (families matched, pages unmatched)."""
    families = build_families(db.query(Scheme).filter(Scheme.amc_name == amc_name).all())
    matched: set[tuple[str, str]] = set()
    unmatched = 0
    for i, page_text in enumerate(pages):
        for page in _read_schemes(reader, page_text, pages.words[i] if isinstance(pages, FactsheetPages) else None):
            result = match_scheme_page(page, families)
            if result is None:
                unmatched += 1
                logger.info("refresh_fund_managers: unmatched amc=%s heading=%r", amc_name, page.heading[:80])
                continue
            family, method, confidence = result
            for scheme in family.schemes:
                upsert_scheme_fund_managers(db, scheme, page.managers, reference_period,
                                            MATCH_METHOD_MANUAL if manual else method, confidence)
            matched.add((family.amc_name, family.base_name))
    return len(matched), unmatched


def _families_matched_last_month(db: Session, amc_name: str, reference_period: date) -> int:
    previous = (reference_period.replace(day=1) - timedelta(days=1)).replace(day=1)
    return (
        db.query(func.count(func.distinct(Scheme.base_name)))
        .join(SchemeFundManager, SchemeFundManager.scheme_id == Scheme.id)
        .filter(Scheme.amc_name == amc_name, SchemeFundManager.reference_period == previous)
        .scalar() or 0
    )


async def _resolve_and_read(client, entry: ResolverEntry, directory: dict[str, str], reader, today: date) -> tuple[list[str] | None, str]:
    if entry.kind is ResolverKind.JSON_API:
        candidates = await _json_api_candidates(client, entry)
    else:
        landing = entry.landing_url or directory.get(entry.directory_name or "")
        if not landing:
            return None, "no_landing_url"
        candidates = await _static_link_candidates(client, landing, entry.link_pattern)
    if not candidates:
        return None, "no_factsheet_link"
    reason = "fetch_failed"
    for url in candidates:  # card 4: the first candidate that passes both checks wins
        try:
            pdf = await _download_pdf(client, url)
        except httpx.HTTPError:
            continue  # a dead link: try the next candidate; reason stays fetch_failed if none work
        if pdf is None:
            continue
        pages = extract_page_text(pdf)
        if entry.needs_boxes:
            pages = FactsheetPages(pages, extract_page_words(pdf))
        ok, reason = looks_like_current_factsheet(pages, reader, today)
        if ok:
            return pages, "ok"
    return None, reason


async def _json_api_candidates(client, entry: ResolverEntry) -> list[str]:
    if entry.directory_name == "Sundaram Asset Management Company Ltd":
        # Public DownloadArchive request; its legacy script escapes '=' and '%',
        # but leaves the slash literal. The response is a quoted URL, not JSON.
        month = date.today().replace(day=1) - timedelta(days=1)
        resp = await client.post(entry.endpoint_url, content=f"cat=1\r\nmnth={month:%m/%Y}",
                                 headers={"Content-Type": "text/plain"})
        resp.raise_for_status()
        found = re.fullmatch(r"['\"](https://www\.sundarammutual\.com/uploaddir/consolidated_factsheet/[^'\"\s]+\.pdf)['\"]", resp.text.strip())
        return [found.group(1)] if found else []
    if entry.directory_name == "DSP Asset Managers Private Limited":
        # Public downloads.json request made by the AMC's download centre.
        resp = await client.get(entry.endpoint_url)
        resp.raise_for_status()
        links = [(_link_date(f"{doc['title']} {doc['pdf_url']}"),
                  urllib.parse.urljoin(str(resp.url), doc["pdf_url"]))
                 for doc in resp.json()[entry.response_json_path]
                 if isinstance(doc.get("pdf_url"), str) and doc["pdf_url"]]
        return [url for _, url in sorted(links, key=lambda pair: pair[0], reverse=True)][:3]
    if entry.directory_name == "Aditya Birla Sun Life AMC Limited":
        # Published by factsheet-investor-information.js, verified 10 Oct 2026.
        # Keep the datasourceId query while selecting the rolling current year.
        url = httpx.URL(entry.endpoint_url)
        documents = []
        # Early in January the new year has no uploads yet; December's file is current then.
        for year in (date.today().year, date.today().year - 1):
            resp = await client.get(url.copy_merge_params({"year": year}))
            resp.raise_for_status()
            documents = resp.json()[entry.response_json_path]
            if documents:
                break
        links = [
            (_link_date(f"{doc['DocumentTitle']} {doc['DocumentLink']}"),
             urllib.parse.urljoin(str(resp.url), doc["DocumentLink"]))
            for doc in documents if isinstance(doc.get("DocumentLink"), str) and doc["DocumentLink"]
        ]
        return [url for _, url in sorted(links, key=lambda pair: pair[0], reverse=True)][:3]
    # Other APIs remain unverified until their own Task 8 onboarding.
    raise NotImplementedError("JSON API document shape requires Task 8 onboarding")


_MIN_DIRECTORY_ENTRIES = 40  # 57 AMCs on 9 Oct


async def refresh_fund_managers(db: Session) -> FundManagerRefreshResult:
    started = time.perf_counter()
    try:
        directory = await _fetch_amfi_directory()
    except (httpx.HTTPError, ValueError) as exc:
        _alert("ALL", "directory_failed", repr(exc))
        return FundManagerRefreshResult(success=False)
    if len(directory) < _MIN_DIRECTORY_ENTRIES:
        # The page changed shape: one alert, not a flood of per-AMC no_landing_url alerts.
        _alert("ALL", "directory_failed", f"parsed {len(directory)} AMCs")
        return FundManagerRefreshResult(success=False)

    today = date.today()
    reference_period = today.replace(day=1)
    amcs_processed = amcs_failed = schemes_matched = schemes_unmatched = 0

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
        for amc_name, entry in AMC_RESOLVERS.items():
            # Manual AMCs come in through the CLI; an AMC without a reader isn't onboarded yet
            # (Task 8) -- its schemes show as "not available yet", never guessed.
            if entry.kind is ResolverKind.MANUAL or entry.layout is None:
                continue
            try:
                reader = LAYOUTS[entry.layout]
                pages, reason = await _resolve_and_read(client, entry, directory, reader, today)
                if pages is None:
                    _alert(amc_name, reason, entry.landing_url or directory.get(entry.directory_name or "", ""))
                    amcs_failed += 1
                    continue
                matched, unmatched = import_pages(db, amc_name, pages, reader, reference_period)
                await commit_off_loop(db)  # per AMC: a later AMC failing never undoes this one
                last = _families_matched_last_month(db, amc_name, reference_period)
                if last and matched < last / 2:
                    _alert(amc_name, "matching_collapsed", f"{matched} vs {last} last month")
                amcs_processed += 1
                schemes_matched += matched
                schemes_unmatched += unmatched
            except Exception as exc:  # card 2: one AMC breaking never stops the rest
                db.rollback()
                _alert(amc_name, "error", f"{type(exc).__name__}: {exc}"[:300])
                amcs_failed += 1

    return FundManagerRefreshResult(
        success=True, amcs_processed=amcs_processed, amcs_failed=amcs_failed,
        schemes_matched=schemes_matched, schemes_unmatched=schemes_unmatched,
        seconds=round(time.perf_counter() - started, 1),
    )
