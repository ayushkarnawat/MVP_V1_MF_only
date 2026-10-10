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
from app.services.analytics.scheme_universe import canonical_category
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
    "Union Mutual Fund": {
        "Union ELSS Tax Saver Fund": "Union ELSS Tax Saver Fund (Formerly Union Tax Saver (ELSS) Fund",
    },
    "UTI Mutual Fund": {"UTI FOCUSED FUND": "UTI Focused Fund (30 stocks)"},
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
    "Bandhan Mutual Fund": {
        "Bandhan CRISIL IBX 90:10 SDL Plus Gilt November 2026 Index Fund": "BANDHAN CRISIL IBX 90:10 SDL PLUS GILT - NOV 2026 INDEX FUND",
    },
    "SBI Mutual Fund": {
        "CRISIL - IBX FINANCIAL SERVICES 3-6 MONTHS DEBT INDEX FUND": "SBI CRISIL-IBX Financial Services 3-6 Months Debt Index Fund",
        "CRISIL-IBX FINANCIAL SERVICES 9-12 MONTHS DEBT INDEX FUND": "SBI CRISIL-IBX Financial Services 9-12 Months Debt Index Fund",
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


def match_scheme_families(page: SchemePage, families: list[FundFamily]) -> list[tuple[FundFamily, str, Decimal]]:
    """Keep single-family matching intact; expand only approved exact variant ties."""
    match = match_scheme_page(page, families)
    if match is not None:
        return [match]
    exact = [f for f in families if f.canonical == _canonical_fund_name(
        _AMC_FUND_ALIASES.get(f.amc_name, {}).get(page.heading, page.heading))]
    if (len(exact) > 1 and all(f.sebi_category for f in exact) and len({f.canonical for f in exact}) == 1
            # Canonical category (A09): NAVAll files UTI's segregated portfolios under the post-2018
            # SEBI name and the main fund under the old one; both canonicalise to one category.
            and len({canonical_category(f.sebi_category) for f in exact}) == 1
            and len({f.amc_name for f in exact}) == 1):
        return [(f, MATCH_METHOD_EXACT, Decimal("1.0")) for f in exact]
    return []

AMFI_FACTSHEET_DIRECTORY_URL = "https://www.amfiindia.com/online-center/download-factsheets"
_HTTP_TIMEOUT = 90.0
_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def _parse_managing_since(raw: str) -> date | None:
    # Normalise what factsheets print: "August 26,2026" (no space), "23rd March 2026"
    # (ordinal day), "Sept 2025". Day-first forms come from quant, NJ and Abakkus (Run 4).
    # Run 8: Tata/SBI PDFs print U+FFFE where the hyphen is ("01-Mar\ufffe2025"); SBI spaces
    # its hyphens ("Jan - 2026") and its commas ("July 1st ,2025"); Motilal spells months out.
    text = raw.strip().rstrip(",;").replace("\ufffe", "-")
    text = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", text)
    text = re.sub(r"\s*-\s*", "-", text)
    text = re.sub(r"\s*,\s*", ", ", text)
    text = re.sub(r"\bSept\b", "Sep", text)
    for fmt in ("%b. %d, %Y", "%b %d, %Y", "%B %d, %Y", "%d %B %Y", "%d %b %Y", "%d %B, %Y", "%d %b, %Y", "%d-%b-%Y",
                "%d-%B-%Y", "%b %Y", "%B %Y", "%b-%y", "%b-%Y", "%B-%Y", "%b %y", "%d-%b-%y", "%d-%B-%y",
                "%d-%m-%Y", "%B, %Y", "%b, %Y", "%B %d-%Y"):
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
        # Some PDFs (Tata, SBI, Union) print U+FFFE where a hyphen is; store the hyphen.
        manager = {key: value.replace("\ufffe", "-") if isinstance(value, str) else value for key, value in manager.items()}
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
    try:
        pages = []
        for index in range(len(doc)):
            page = doc.get_page(index)
            text = page.get_textpage()
            try:
                pages.append(text.get_text_range())
            finally:
                # Close-out, 10 Oct: PDFium's native memory is only freed on close. Left to
                # the garbage collector, the monthly job peaked at 2.9 GB (staging jobs get 1 GB).
                text.close()
                page.close()
        return pages
    finally:
        doc.close()


def extract_page_words(pdf_bytes: bytes) -> list[list[Word]]:
    """Whitespace-delimited words with the union of PDFium character boxes."""
    doc = pdfium.PdfDocument(pdf_bytes)
    try:
        return [_page_words(doc, index) for index in range(len(doc))]
    finally:
        doc.close()


def _page_words(doc, index: int) -> list[Word]:
    page = doc.get_page(index)
    text = page.get_textpage()
    try:
        words = []
        chars = []
        boxes = []
        def flush():
            if chars:
                words.append((min(b[0] for b in boxes), min(b[1] for b in boxes),
                              max(b[2] for b in boxes), max(b[3] for b in boxes), "".join(chars)))
                chars.clear()
                boxes.clear()
        for char_index in range(text.count_chars()):
            char = text.get_text_range(char_index, 1)
            if not char or char.isspace():
                flush()
            else:
                chars.append(char)
                boxes.append(text.get_charbox(char_index))
        flush()
        return words
    finally:
        text.close()  # see extract_page_text
        page.close()


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


def _next_factsheet_data(page: str, key: str) -> dict:
    """Read the public server-rendered download props, without executing scripts."""
    chunks = []
    for match in re.finditer(r'self\.__next_f\.push\((\[.*?\])\)</script>', page, re.S):
        try:
            value = json.loads(match.group(1))
            if len(value) > 1 and isinstance(value[1], str):
                chunks.append(value[1])
        except (ValueError, TypeError):
            continue
    stream = "".join(chunks)
    marker = f'"{key}":'
    if marker not in stream:
        return {}
    value, _ = json.JSONDecoder().raw_decode(stream.split(marker, 1)[1].lstrip())
    return value if isinstance(value, dict) else {}


async def _static_link_candidates(client: httpx.AsyncClient, landing_url: str, link_pattern: str | None) -> list[str]:
    """Card 4, pick rule: links whose URL or link text says factsheet (or the AMC's own
    pattern), newest first. The content and month checks then decide which one is real."""
    if landing_url.lower().split("?")[0].endswith(".pdf"):
        return [landing_url]  # e.g. Old Bridge: AMFI points straight at the file
    resp = await client.get(landing_url)
    resp.raise_for_status()
    pattern = re.compile(link_pattern or r"fact\s*[-_ ]?sheet", re.I)
    links = []
    host = urllib.parse.urlparse(landing_url).hostname
    if host == "www.taurusmutualfund.com":
        # The public Drupal form filters the year before it renders PDF anchors.
        field = re.search(r'<select[^>]+name="field_factsheet_item_target_id"[^>]*>(.*?)</select>', resp.text, re.S)
        if field:
            # Early January the new year's option exists but lists nothing; December's file is current.
            for year in (date.today().year, date.today().year - 1):
                option = re.search(r'<option[^>]+value="([^"]+)"[^>]*>\s*' + str(year) + r'\s*</option>', field.group(1))
                if not option:
                    continue
                filtered = await client.get(landing_url, params={"field_factsheet_item_target_id": option.group(1)})
                filtered.raise_for_status()
                if re.search(r'href="[^"]+\.pdf', filtered.text, re.I):
                    resp = filtered
                    break
    if host == "www.unionmf.com":
        # Angular consumes this page's inline list, rather than HTML anchors.
        for block in re.findall(r'downloadfactsheets\.push\(\s*\{(.*?)\}\s*\)', resp.text, re.S):
            title = re.search(r'Title\s*:\s*["\']([^"\']+)', block)
            url = re.search(r'Url\s*:\s*["\']([^"\']+)', block)
            if title and url and pattern.search(title.group(1) + " " + url.group(1)) and urllib.parse.urlparse(url.group(1)).path.lower().endswith(".pdf"):
                links.append((_link_date(title.group(1)), html.unescape(url.group(1))))
    if host == "www.wealthcompanyamc.in":
        chunks = []
        for match in re.finditer(r'self\.__next_f\.push\((\[.*?\])\)</script>', resp.text, re.S):
            value = json.loads(match.group(1))
            if len(value) > 1 and isinstance(value[1], str):
                chunks.append(value[1])
        stream = "".join(chunks)
        if '"downloads":' in stream:
            docs, _ = json.JSONDecoder().raw_decode(stream.split('"downloads":', 1)[1].lstrip())
            for doc in docs:
                name = doc.get("name", "")
                url = (doc.get("attachment") or {}).get("url")
                if isinstance(url, str) and pattern.search(name) and urllib.parse.urlparse(url).path.lower().endswith(".pdf"):
                    printed = re.search(r"\b(\d{2})-(\d{2})-(\d{4})\b", name)
                    when = (int(printed.group(3)), int(printed.group(2))) if printed else _link_date(name)
                    links.append((when, urllib.parse.urljoin(str(resp.url), url)))
    if host == "www.360.one":
        data = _next_factsheet_data(resp.text, "factSheets")
        for year in data.get("yearlyData", []):
            for month in year.get("monthlyData", []):
                for group in month.get("documentGroups", []):
                    if group.get("title") != "Factsheet - Fund":
                        continue  # regular-plan companion repeats the scheme information
                    for doc in group.get("documents", []):
                        url = doc.get("fileUrl")
                        if isinstance(url, str) and urllib.parse.urlparse(url).path.lower().endswith(".pdf"):
                            links.append(((int(year["year"]), int(month["month"])), url))
        return list(dict.fromkeys(url for _, url in sorted(links, key=lambda p: p[0], reverse=True)))[:3]
    if host == "www.angelonemf.com":
        data = _next_factsheet_data(resp.text, "factsheetsData")
        for doc in data.values():
            fields = doc.get("fields", {})
            for url in fields.get("post_guid", []):
                if isinstance(url, str) and urllib.parse.urlparse(url).path.lower().endswith(".pdf"):
                    links.append((_link_date(fields.get("Dropdown", "") + " " + url), url))
        return list(dict.fromkeys(url for _, url in sorted(links, key=lambda p: p[0], reverse=True)))[:3]
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
            if host == "www.oldbridgemf.com":
                short = re.search(r"(?:^|_)(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)_(\d{2})(?:_|\.pdf)", named, re.I)
                if short:
                    when = (2000 + int(short.group(2)), _MONTHS[short.group(1)[:3].lower()])
            if host == "www.samcomf.com":
                # Samco's trailing numeric document id can contain year-like
                # digits (June's id contains 2086). Only its month/year pair
                # dates the file; keep this correction scoped to this AMC.
                month = _MONTH_WORD.search(named.lower())
                year = re.match(r"[-_ ]*(20\d{2})(?!\d)", named[month.end():]) if month else None
                if month and year:
                    when = (int(year.group(1)), _MONTHS[month.group(1)[:3]])
            # ASK serves this fragment from /pages, but the enclosing document
            # loads it at the site root. Its ./assests links resolve there.
            base = "https://www.askmutualfund.com/" if host == "www.askmutualfund.com" else str(resp.url)
            links.append((when, urllib.parse.urljoin(base, html.unescape(href))))
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
    for text in pages:
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


def looks_like_current_factsheet(pages: list[str], reader, today: date, *, as_on_pattern: str | None = None, min_schemes: int = 3) -> tuple[bool, str]:
    """Card 4: the downloaded PDF is this AMC's current factsheet. Content: at least
    min_schemes (default 3) schemes this AMC's reader understands, including
    multi-scheme summary pages. Only an explicit single-fund registry entry
    lowers the threshold; unrelated PDFs still fail. Month: the latest "as on" date is within 45 days (a factsheet
    published mid-month can still carry the previous month-end -- Edelweiss's September
    file says "Data as on August 31"). Returns (ok, reason) for the alert line."""
    scheme_pages = sum(len(_read_schemes(reader, page, pages.words[i] if isinstance(pages, FactsheetPages) else None))
                       for i, page in enumerate(pages))
    if scheme_pages < min_schemes:
        return False, "not_a_factsheet"
    if as_on_pattern is None:
        as_on = _latest_as_on(pages, today)
    else:
        # A configured caption is authoritative for this AMC only. Scan all pages:
        # quant puts AUM dates on scheme pages after its introductory chapters.
        dates = [_parse_managing_since(m.group(1)) for page in pages
                 for m in re.finditer(as_on_pattern, page, re.I)]
        dates = [d for d in dates if d is not None and d <= today + timedelta(days=7)]
        as_on = max(dates) if dates else None
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
    # A fund can be printed on several pages, or in both files of a month (Mirae active +
    # passive): gather every page's managers per scheme first, then write each scheme once.
    # Writing per page let the last page's list delete the earlier pages' managers.
    by_scheme: dict[uuid.UUID, tuple[Scheme, list[dict], str, Decimal | None]] = {}
    for i, page_text in enumerate(pages):
        for page in _read_schemes(reader, page_text, pages.words[i] if isinstance(pages, FactsheetPages) else None):
            results = match_scheme_families(page, families)
            if not results:
                unmatched += 1
                logger.info("refresh_fund_managers: unmatched amc=%s heading=%r", amc_name, page.heading[:80])
                continue
            for family, method, confidence in results:
                for scheme in family.schemes:
                    _, managers, first_method, first_confidence = by_scheme.get(scheme.id, (scheme, [], method, confidence))
                    listed = {m["name"] for m in managers}
                    managers = managers + [m for m in page.managers if m["name"] not in listed]
                    by_scheme[scheme.id] = (scheme, managers, first_method, first_confidence)
                matched.add((family.amc_name, family.base_name))
    for scheme, managers, method, confidence in by_scheme.values():
        upsert_scheme_fund_managers(db, scheme, managers, reference_period,
                                    MATCH_METHOD_MANUAL if manual else method, confidence)
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
        groups = [[url for url in candidates if re.search(pattern, url, re.I)]
                  for pattern in entry.documents] if entry.documents else [candidates]
    else:
        landing = entry.landing_url or directory.get(entry.directory_name or "")
        if not landing:
            return None, "no_landing_url"
        groups = [await _static_link_candidates(client, landing, pattern)
                  for pattern in entry.documents or (entry.link_pattern,)]
    combined, words = [], []
    for candidates in groups:
        if not candidates:
            return None, "no_factsheet_link"
        reason = "fetch_failed"
        for url in candidates:  # newest current file for each required pattern
            try:
                pdf = await _download_pdf(client, url)
            except httpx.HTTPError:
                continue
            if pdf is None:
                continue
            pages = extract_page_text(pdf)
            if entry.needs_boxes:
                pages = FactsheetPages(pages, extract_page_words(pdf))
            ok, reason = looks_like_current_factsheet(pages, reader, today, as_on_pattern=entry.as_on_pattern, min_schemes=entry.min_schemes)
            if ok:
                combined.extend(pages)
                if entry.needs_boxes:
                    words.extend(pages.words)
                break
        else:
            return None, reason
    # Validation finishes before any import; refresh imports this union once and
    # commits once per AMC. Counts are unique families even across several files.
    return (FactsheetPages(combined, words) if entry.needs_boxes else combined), "ok"


async def _json_api_candidates(client, entry: ResolverEntry) -> list[str]:
    if entry.directory_name == "Navi AMC Limited":
        landing = await client.get(entry.landing_url)
        landing.raise_for_status()
        config = re.search(r'var navi_property\s*=\s*(\{[^;]+\})', landing.text)
        category = re.search(r'data-category="(\d+)"\s+data-type="Monthly"', landing.text)
        if not config or not category:
            raise ValueError("Navi public factsheet configuration missing")
        nonce = json.loads(config.group(1))["nonce"]
        today = date.today()
        links = []
        for offset in range(3):
            year, month = divmod(today.year * 12 + today.month - 1 - offset, 12)
            month += 1
            financial_year = year if month >= 4 else year - 1
            resp = await client.post(entry.endpoint_url, headers={"WP-NONCE": nonce}, data={
                "financial_year": f"{financial_year}-{financial_year + 1}",
                "value": date(year, month, 1).strftime("%B"), "category": category.group(1),
                "type": "Monthly", "order": "DESC",
            })
            resp.raise_for_status()
            payload = resp.json()
            if payload.get("success") is not True:
                raise ValueError("Navi public download list unavailable")
            for doc in payload.get("data", []):
                title = doc.get("title", "")
                urls = doc.get("url", [])
                urls = [urls] if isinstance(urls, str) else [v.get("link") for v in urls]
                for url in urls:
                    if isinstance(url, str) and "factsheet" in title.lower() and urllib.parse.urlparse(url).path.lower().endswith(".pdf"):
                        links.append((_link_date(title), url))
        return list(dict.fromkeys(url for _, url in sorted(links, reverse=True)))[:6]
    if entry.directory_name == "Mahindra Manulife Investment Management Pvt Ltd":
        # preLogin/downloads is public (HTTP 200 without credentials). Its page
        # unwraps the response using public transport constants in its own JS.
        # Fetch those constants anew; never store keys or authenticate a request.
        import base64
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives.padding import PKCS7
        landing = await client.get(entry.landing_url)
        landing.raise_for_status()
        script = re.search(r'<script[^>]+src=["\'](/assets/index-[^"\']+\.js)["\']', landing.text)
        if not script:
            raise ValueError("Mahindra public download script missing")
        js = await client.get(urllib.parse.urljoin(entry.landing_url, script.group(1)))
        js.raise_for_status()
        constants = re.search(r'const (\w+)="([^"]+)",(\w+)="([^"]+)",\w+=(\w+)\.enc\.Utf8\.parse\(\1\),\w+=\5\.enc\.Utf8\.parse\(\3\)', js.text)
        if not constants:
            raise ValueError("Mahindra public transport format changed")
        resp = await client.get(entry.endpoint_url, headers={"platform": "web", "Accept": "application/json"})
        resp.raise_for_status()
        decryptor = Cipher(algorithms.AES(constants.group(2).encode()), modes.CBC(constants.group(4).encode())).decryptor()
        raw = decryptor.update(base64.b64decode(resp.json()["payload"])) + decryptor.finalize()
        unpadder = PKCS7(128).unpadder()
        data = json.loads(unpadder.update(raw) + unpadder.finalize())
        if data.get("status") != 1:
            raise ValueError("Mahindra public download list unavailable")
        links = []
        def collect(categories):
            for category in categories:
                for doc in category.get("files", []):
                    if "factsheet" in doc.get("title", "").lower() and isinstance(doc.get("fileUrl"), str):
                        links.append((_link_date(doc["title"]), doc["fileUrl"]))
                collect(category.get("subcategories", []))
        collect(data["data"])
        return list(dict.fromkeys(url for _, url in sorted(links, reverse=True)))[:3]
    if entry.directory_name == "SBI Funds Management Limited":
        resp = await client.post(entry.endpoint_url, headers={"Content-Type": "application/json;charset=utf-8"})
        resp.raise_for_status()
        links = [(_link_date(re.sub(r"<[^>]+>", " ", label)), html.unescape(url))
                 for url, label in re.findall(r'<a[^>]+href="([^"]+\.pdf[^\"]*)"[^>]*>(.*?)</a>', resp.text, re.S | re.I)
                 if re.search(r"factsheet", url, re.I)]
        return list(dict.fromkeys(url for _, url in sorted(links, reverse=True)))[:6]
    if entry.directory_name == "Tata Asset Management Private Limited":
        today = date.today()
        links = []
        for offset in range(3):
            month_index = today.year * 12 + today.month - 1 - offset
            year, month = divmod(month_index, 12)
            resp = await client.get(entry.endpoint_url, params={"year": year, "month": f"{month + 1:02d}"},
                                    headers={"Accept": "application/json", "check-enc": "false"})
            if resp.is_error:
                continue  # a month not published yet can error; earlier months still count
            links.extend((_link_date(doc.get("title", "")), doc["field_media_document"])
                         for doc in resp.json() if "factsheet" in doc.get("title", "").lower()
                         and isinstance(doc.get("field_media_document"), str))
        return list(dict.fromkeys(url for _, url in sorted(links, reverse=True)))[:3]
    if entry.directory_name == "Motilal Oswal Asset Management Company Limited":
        today = date.today()
        years = [today.year] + ([today.year - 1] if today.month <= 2 else [])
        links = []
        for year in years:
            resp = await client.get(entry.endpoint_url, params={"year": year, "category": "factsheet", "month": "", "type": "mf"})
            resp.raise_for_status()
            links.extend((_link_date(doc.get("title", "")), urllib.parse.urljoin(str(resp.url), doc["path"]))
                         for doc in resp.json()["results"] if doc.get("mimeType") == "application/pdf"
                         and isinstance(doc.get("path"), str) and "factsheet" in doc.get("title", "").lower())
        return list(dict.fromkeys(url for _, url in sorted(links, reverse=True)))[:6]
    if entry.directory_name == "Bank of India Investment Managers Private Limited":
        resp = await client.post(entry.endpoint_url, json={"pagno": 0, "category": None, "fromDate": None,
            "toDate": None, "LibraryName": "InvestorCorner", "folderName": "FACTSHEETS", "CategoryValue": "no"})
        resp.raise_for_status()
        documents = json.loads(resp.json()["d"])["Documents"]
        links = [(_link_date(doc.get("DocName", "")), urllib.parse.urljoin(str(resp.url), doc["FolderUrl"]))
                 for doc in documents if doc.get("FolderTitle") == "FACTSHEETS"
                 and isinstance(doc.get("FolderUrl"), str) and doc["FolderUrl"]]
        return list(dict.fromkeys(url for _, url in sorted(links, key=lambda p: p[0], reverse=True)))[:3]
    if entry.directory_name == "Franklin Templeton Asset Management (India) Private Limited":
        resp = await client.get(entry.endpoint_url)
        resp.raise_for_status()
        links = []
        def visit(node):
            if isinstance(node, dict):
                href = node.get("literatureHref")
                if node.get("id") == "FUND-FACTSHEETS" and isinstance(href, str) and href:
                    named_date = _link_date(node.get("dctermsTitle", ""))
                    if not named_date[0]:
                        named_date = _link_date(urllib.parse.unquote(urllib.parse.urlparse(href).path.rsplit("/", 1)[-1]))
                    links.append((named_date,
                                  urllib.parse.urljoin("https://www.franklintempletonindia.com/download/", href.lstrip("/"))))
                for child in node.values():
                    visit(child)
            elif isinstance(node, list):
                for child in node:
                    visit(child)
        visit(resp.json()["PageType"])
        return list(dict.fromkeys(url for _, url in sorted(links, key=lambda p: p[0], reverse=True)))[:3]
    if entry.directory_name == "Jio BlackRock Asset Management Private Limited":
        # The download page publishes a Next server action. Discover its deployment id
        # from that page's own script, then call its ordinary public month filter.
        resp = await client.get(entry.endpoint_url)
        resp.raise_for_status()
        scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', resp.text)
        # Several page chunks can load; the action may be in any of them, next to other
        # server references (arguments hold no parentheses, so the match can't span two).
        action = None
        for script in (url for url in scripts if "statutory-disclosure/" in url and "/page-" in url):
            code = await client.get(urllib.parse.urljoin(str(resp.url), html.unescape(script)))
            code.raise_for_status()
            action = re.search(r'createServerReference\)\("([^"\s]+)"[^;()]+?"getDisclosureL3Data"', code.text)
            if action is not None:
                break
        if action is None:
            return []
        month = date.today().replace(day=1)
        for _ in range(3):
            year = month.year if month.month >= 4 else month.year - 1
            result = await client.post(entry.endpoint_url, headers={"Next-Action": action.group(1),
                "Content-Type": "text/plain;charset=UTF-8"}, content=json.dumps([
                    "factsheet", {"year": f"FI{year}-{year + 1}", "month": month.strftime("%B")}, "MF"]))
            result.raise_for_status()
            payload = next((json.loads(line.split(":", 1)[1]) for line in result.text.splitlines()
                            if re.match(r'^[0-9a-f]+:\{"data":', line)), {})
            links = [doc["file"]["url"] for doc in payload.get("data", [])
                     if re.match(r"Jio\s*BlackRock Mutual Fund\b", doc.get("title", ""), re.I)
                     and doc.get("file", {}).get("ext") == ".pdf"
                     and isinstance(doc["file"].get("url"), str)]
            if links:
                return list(dict.fromkeys(links))
            month = (month - timedelta(days=1)).replace(day=1)
        return []
    if entry.directory_name == "Choice AMC Private Limited":
        resp = await client.get(entry.endpoint_url)
        resp.raise_for_status()
        documents = [doc for root in resp.json()["body"] if root.get("slug") == "scheme-documents"
                     for node in root["children"] if node.get("redirection_link") == "disclosures/factsheets"
                     for year in node["financial_years"] for doc in year["files"]
                     if doc.get("scheme_id") is None and isinstance(doc.get("file_path"), str) and doc["file_path"]]
        links = [(_link_date(doc["doc_name"]), urllib.parse.urljoin("https://doc.choicemf.com/", doc["file_path"]))
                 for doc in documents]
        return list(dict.fromkeys(url for _, url in sorted(links, key=lambda pair: pair[0], reverse=True)))[:3]
    if entry.directory_name == "PGIM India Asset Management Private Limite":
        resp = await client.get(entry.endpoint_url)
        resp.raise_for_status()
        documents = resp.json()["data"]["tab_0007"]
        links = [(_link_date(doc["monthYear"]), urllib.parse.urljoin(str(resp.url), doc["pdfPath"]))
                 for doc in documents if doc.get("displayStatus") is True
                 and isinstance(doc.get("pdfPath"), str) and doc["pdfPath"]]
        return list(dict.fromkeys(url for _, url in sorted(links, key=lambda pair: pair[0], reverse=True)))[:3]
    if entry.directory_name == "UTI Asset Mgmt. Co. Ltd.":
        # Fund Watch API's month parameter is a full English name, not a number.
        month = date.today().replace(day=1)
        documents = []
        for _ in range(3):
            resp = await client.get(entry.endpoint_url, params={"year": month.year, "month": month.strftime("%B")})
            resp.raise_for_status()
            documents = [doc for doc in resp.json()["rows"] if "hindi" not in doc.get("name", "").lower()]
            if documents:
                break
            month = (month - timedelta(days=1)).replace(day=1)
        return list(dict.fromkeys(urllib.parse.urljoin(str(resp.url), doc["doc"])
                                 for doc in documents if isinstance(doc.get("doc"), str) and doc["doc"]))
    if entry.directory_name == "Mirae Asset Investment Managers (India) Pvt. Ltd":
        resp = await client.post(entry.endpoint_url, json={"request": {
            "modulename": "Factsheet", "pgno": 1, "pgsize": 10}})
        resp.raise_for_status()
        documents = resp.json()["Data"]
        links = [(_link_date(f"{doc['Title']} {doc['URL']}"),
                  urllib.parse.urljoin(str(resp.url), doc["URL"]))
                 for doc in documents if isinstance(doc.get("URL"), str) and doc["URL"]]
        # Don't truncate across patterns: active/passive each need their own fallbacks.
        return list(dict.fromkeys(url for _, url in sorted(links, key=lambda pair: pair[0], reverse=True)))
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
