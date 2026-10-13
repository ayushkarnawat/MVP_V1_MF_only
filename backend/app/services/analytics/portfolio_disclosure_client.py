"""Batch-only Locate/Fetch/Parse/Normalize/Write orchestration.

The synchronous Session queries/flushes inside async functions are intentional for
the scheduled job; commits use commit_off_loop. Never call this from an API route.
Each AMC commits separately, so a later failure cannot undo an earlier success.
Task 14 replaces the list-returning fetch and AMC-period skip with per-file skips
and gated alerts. JSON_API Locate and Index-sheet translation belong to Task 11.
"""
from __future__ import annotations

import html
import logging
import re
import time
import urllib.parse
import zipfile
import io
from dataclasses import dataclass
from datetime import date, timedelta

import httpx
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.enums import DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme
from app.services.analytics.amfi_factsheet_client import build_families
from app.services.analytics.portfolio_disclosure_matching import match_scheme_name
from app.services.analytics.portfolio_disclosure_parsing import (
    extract_zip_members, parse_workbook, sniff_workbook_format,
)
from app.services.analytics.portfolio_disclosure_resolvers import (
    AMC_DISCLOSURE_RESOLVERS, DisclosureFileShape, DisclosureResolverEntry, DisclosureResolverKind,
)
from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch

logger = logging.getLogger(__name__)
_HTTP_TIMEOUT = 90.0
_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
_MAX_WORKBOOK_BYTES = 60 * 1024 * 1024
_ANCHOR_LINK_RE = re.compile(r'<a\b[^>]*\bhref=["\']([^"\']+\.(?:xlsx?|zip)(?:[?#][^"\']*)?)["\'][^>]*>(.*?)</a>', re.I | re.S)
_BARE_LINK_RE = re.compile(r'["\']([^"\'<>\r\n]+\.(?:xlsx?|zip)(?:[?#][^"\'<>\r\n]*)?)["\']', re.I)
_MONTH_PATTERN = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
_MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
_SEPARATOR = r"[\s_.–-]+"
_DAY_DATE_RE = re.compile(rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?{_SEPARATOR}({_MONTH_PATTERN}|\d{{2}}){_SEPARATOR}(\d{{4}}|\d{{2}})(?!\d)", re.I)
_COMPACT_DATE_RE = re.compile(r"(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)")
_MONTH_YEAR_RE = re.compile(rf"(?<![A-Za-z])({_MONTH_PATTERN})[\s_.–-]*(\d{{4}}|\d{{2}})(?!\d)", re.I)


@dataclass(frozen=True)
class LocatedFile:
    data: bytes
    source_url: str
    as_of_date: date
    scheme_hint: str | None = None


@dataclass(frozen=True)
class PortfolioDisclosureRefreshResult:
    success: bool
    amcs_processed: int = 0
    amcs_failed: int = 0
    amcs_not_onboarded: int = 0
    schemes_written: int = 0
    seconds: float = 0.0  # elapsed time only; never a financial value


def _filename_as_of_date(url: str) -> date | None:
    filename = urllib.parse.unquote(urllib.parse.urlsplit(url).path.rsplit("/", 1)[-1])
    match = _DAY_DATE_RE.search(filename) or _COMPACT_DATE_RE.search(filename)
    if match:
        day, month, year = match.groups()
        month_number = int(month) if month.isdigit() else _MONTHS[month[:3].lower()]
        year_number = int(year) + (2000 if len(year) == 2 else 0)
        try:
            return date(year_number, month_number, int(day))
        except ValueError:
            return None
    match = _MONTH_YEAR_RE.search(filename)
    if match:
        month, year = match.groups()
        year_number = int(year) + (2000 if len(year) == 2 else 0)
        try:
            next_month = date(year_number, _MONTHS[month[:3].lower()], 28) + timedelta(days=4)
            return next_month - timedelta(days=next_month.day)
        except ValueError:
            return None
    return None


def _extract_links(html_text: str) -> list[tuple[str, str]]:
    # Decode only JSON URL/quote escapes, preserving percent-encoded paths and text.
    text = re.sub(r"\\+u0026", "&", html_text, flags=re.I)
    text = re.sub(r"\\+([/\"'])", r"\1", text)
    text = html.unescape(text)
    found = {}
    for href, label in _ANCHOR_LINK_RE.findall(text):
        found[href] = " ".join(re.sub(r"<[^>]+>", " ", label).split())
    for href in _BARE_LINK_RE.findall(text):
        found.setdefault(href, "")
    return list(found.items())


def _clean_label(label: str) -> str:
    label = html.unescape(" ".join(label.split())).strip()
    # Canara prefix discovery has no anchor text or Index sheet. Its captured
    # filename explicitly names the scheme between the leading code and date.
    decoded = urllib.parse.unquote(label)
    canara = re.fullmatch(
        r"[A-Za-z]{1,4}[-_\s–]+(Canara-Robeco-.*?-Fund)[-_\s–]+.*\.xlsx?",
        decoded, re.I,
    )
    if canara:
        return canara.group(1).replace("-", " ")
    # The captured per-scheme anchor text includes a document descriptor.
    return re.sub(r"\s*[-–:]\s*Monthly Portfolio(?:\s.*)?$", "", label, flags=re.I).strip()


_WORKBOOK_URL = re.compile(r"\.(?:xlsx?|zip)(?:$|[?#])", re.I)
_WORKBOOK_MAGICS = (b"PK\x03\x04", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")


def _looks_like_workbook(data: bytes) -> bool:
    return data.startswith(_WORKBOOK_MAGICS)


def _candidate_allowed(entry, url, label=""):
    text = urllib.parse.unquote(f"{url} {label}")
    return (
        (not entry.link_pattern or re.search(entry.link_pattern, text, re.I) is not None)
        and (not entry.exclude_pattern or re.search(entry.exclude_pattern, text, re.I) is None)
    )


async def _static_regex_candidates(client: httpx.AsyncClient, entry: DisclosureResolverEntry) -> list[tuple[str, str]]:
    resp = await client.get(entry.landing_url)
    resp.raise_for_status()
    return [(urllib.parse.urljoin(str(resp.url), href), label)
            for href, label in _extract_links(resp.text) if _candidate_allowed(entry, href, label)]


async def _download_workbook(client: httpx.AsyncClient, url: str) -> bytes | None:
    async with client.stream("GET", url) as resp:
        resp.raise_for_status()
        body = bytearray()
        async for chunk in resp.aiter_bytes():
            body.extend(chunk)
            if len(body) > _MAX_WORKBOOK_BYTES:
                return None
    # HTTP 200 is not proof of a file (Mirae-style HTML under a .xlsx name): check the magic bytes.
    return bytes(body) if _looks_like_workbook(bytes(body[:8])) else None


async def _fetch_candidates(client: httpx.AsyncClient, candidates: list[tuple[str, str]], *, keep_all: bool) -> list[LocatedFile]:
    dated = sorted(((url, label, as_of) for url, label in candidates
                    if (as_of := _filename_as_of_date(url)) is not None),
                   key=lambda item: item[2], reverse=True)
    results = []
    seen = set()
    for url, label, as_of in dated:
        if url in seen or (keep_all and as_of != dated[0][2]):
            continue
        seen.add(url)
        try:
            data = await _download_workbook(client, url)
        except httpx.HTTPError:
            continue
        if data:
            results.append(LocatedFile(data, url, as_of, _clean_label(label) or None if keep_all else None))
            if not keep_all:
                break
    return results


def _slugify_scheme_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _latest_month_end(today: date | None = None) -> date:
    return (today or date.today()).replace(day=1) - timedelta(days=1)


async def _locate_deterministic_template(client: httpx.AsyncClient, entry: DisclosureResolverEntry, scheme_names: list[str]) -> list[LocatedFile]:
    as_of = _latest_month_end()
    results = []
    seen = set()
    for name in scheme_names:
        url = entry.url_template.format(
            scheme_slug=_slugify_scheme_name(name), dd=f"{as_of.day:02d}", mm=f"{as_of.month:02d}",
            yyyy=as_of.year, month_name_lower=as_of.strftime("%B").lower(),
            month_name=as_of.strftime("%B"), yy=f"{as_of.year % 100:02d}",
            yy_plus_1=f"{(as_of.year + 1) % 100:02d}",
        )
        if url in seen:
            continue
        seen.add(url)
        try:
            data = await _download_workbook(client, url)
        except httpx.HTTPError:
            continue
        if data:
            hint = name if "{scheme_slug}" in entry.url_template else None
            results.append(LocatedFile(data, url, as_of, hint))
    return results


def _is_locate_implemented(entry: DisclosureResolverEntry) -> bool:
    return (entry.kind in {DisclosureResolverKind.STATIC_REGEX, DisclosureResolverKind.WAYBACK_LOCATE}
            or entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE)


async def _locate_and_fetch(client: httpx.AsyncClient, entry: DisclosureResolverEntry, scheme_rows: list[Scheme]) -> list[LocatedFile]:
    if entry.kind is DisclosureResolverKind.WAYBACK_LOCATE:
        return await _locate_wayback(client, entry)  # implemented in Task 7
    if entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE:
        return await _locate_deterministic_template(client, entry, [s.base_name or s.name for s in scheme_rows])
    if entry.kind is not DisclosureResolverKind.STATIC_REGEX:
        raise NotImplementedError(f"{entry.kind} Locate requires its own onboarding task")
    return await _fetch_candidates(client, await _static_regex_candidates(client, entry),
                                   keep_all=entry.file_shape is DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME)


async def _cdx_query(client: httpx.AsyncClient, url: str, *, match_type: str = "exact") -> list[str]:
    """Return captured originals, not archive download URLs.

    limit=-50 selects the last 50 index rows, not the latest 50 disclosures;
    older months and some schemes may be absent. Dates are ranked separately.
    """
    resp = await client.get("https://web.archive.org/cdx/search/cdx", params={
        "url": url, "output": "json", "matchType": match_type,
        "filter": "statuscode:200", "collapse": "urlkey", "limit": "-50",
    })
    resp.raise_for_status()
    rows = resp.json()
    if len(rows) <= 1:
        return []
    header, *data_rows = rows
    original_idx = header.index("original")
    return [row[original_idx] for row in data_rows]


async def _locate_wayback_cached_page(client: httpx.AsyncClient, entry: DisclosureResolverEntry) -> list[LocatedFile]:
    if not await _cdx_query(client, entry.landing_url, match_type="exact"):
        return []
    cached = await client.get(f"https://web.archive.org/web/2id_/{entry.landing_url}")
    cached.raise_for_status()
    candidates = []
    for href, label in _extract_links(cached.text):
        if not _candidate_allowed(entry, href, label):
            continue
        absolute = urllib.parse.urljoin(entry.landing_url, href)
        parsed = urllib.parse.urlsplit(absolute)
        live_url = parsed._replace(netloc=entry.cdn_domain, scheme="https").geturl()
        candidates.append((live_url, label))
    return await _fetch_candidates(client, candidates, keep_all=True)


async def _locate_wayback_prefix_search(client: httpx.AsyncClient, entry: DisclosureResolverEntry) -> list[LocatedFile]:
    originals = await _cdx_query(client, entry.landing_url, match_type="prefix")
    # CDX rows include PDFs, images and pages under the prefix: only workbook/zip paths are candidates.
    candidates = [(url, url.rsplit("/", 1)[-1]) for url in originals
                  if _WORKBOOK_URL.search(urllib.parse.unquote(url)) and _candidate_allowed(entry, url)]
    return await _fetch_candidates(client, candidates, keep_all=True)


async def _locate_wayback(client: httpx.AsyncClient, entry: DisclosureResolverEntry) -> list[LocatedFile]:
    if entry.cdn_domain:
        return await _locate_wayback_cached_page(client, entry)
    return await _locate_wayback_prefix_search(client, entry)


def _alert(amc_name: str, reason: str, detail: str) -> None:
    logger.warning("PORTFOLIO_DISCLOSURE_ALERT amc=%s reason=%s detail=%s",
                   " ".join(amc_name.split()), " ".join(reason.split()), " ".join(detail.split()))


def _already_written(db: Session, amc_name: str, as_of_date: date) -> bool:
    return db.query(DisclosureBatch).filter_by(
        amc_name=amc_name, as_of_date=as_of_date, status=DisclosureBatchStatus.WRITTEN).first() is not None


def _zip_members(data: bytes, amc_name: str):
    try:
        members = extract_zip_members(data)
    except Exception:
        # The shared extractor eagerly reads every member. A CRC/read failure needs
        # a per-member retry so one damaged workbook does not hide readable peers.
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for name in archive.namelist():
                if not name.lower().endswith((".xls", ".xlsx")) or name.endswith("/"):
                    continue
                try:
                    member_data = archive.read(name)
                except Exception as exc:
                    _alert(amc_name, "parse_error", f"member={name} {type(exc).__name__}: {exc}")
                    continue
                yield name, member_data
    else:
        yield from members


def _parse_file(file: LocatedFile, amc_name: str):
    """Yield member name and parsed sheets; an invalid ZIP member cannot stop peers."""
    try:
        sniff_workbook_format(file.data)
    except ValueError:
        if not zipfile.is_zipfile(io.BytesIO(file.data)):
            raise
        parsed_member = False
        for name, data in _zip_members(file.data, amc_name):
            try:
                sheets = parse_workbook(data)
            except Exception as exc:
                _alert(amc_name, "parse_error", f"member={name} {type(exc).__name__}: {exc}")
                continue
            parsed_member = True
            yield name, sheets
        if not parsed_member:
            raise ValueError("ZIP contains no readable workbook members")
    else:
        # A broken standalone workbook is an AMC error, not an isolated ZIP peer.
        yield file.source_url, parse_workbook(file.data)


async def refresh_portfolio_disclosures(db: Session) -> PortfolioDisclosureRefreshResult:
    started = time.perf_counter()
    amcs_processed = amcs_failed = amcs_not_onboarded = schemes_written = 0
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=_HEADERS, follow_redirects=True) as http_client:
        for amc_name, entry in AMC_DISCLOSURE_RESOLVERS.items():
            if entry.kind is DisclosureResolverKind.MANUAL:
                continue
            if not _is_locate_implemented(entry):
                amcs_not_onboarded += 1
                continue
            try:
                scheme_rows = db.query(Scheme).filter(Scheme.amc_name == amc_name).all()
                if not scheme_rows:
                    _alert(amc_name, "zero_schemes_matched", "registry key has no scheme_master rows")
                    amcs_failed += 1
                    continue
                files = await _locate_and_fetch(http_client, entry, scheme_rows)
                if not files:
                    _alert(amc_name, "no_file_found", entry.landing_url or entry.url_template or "")
                    amcs_failed += 1
                    continue
                if _already_written(db, amc_name, max(f.as_of_date for f in files)):
                    amcs_processed += 1
                    continue
                families = build_families(scheme_rows)
                written_this_amc = 0
                for file in files:
                    for member, sheets in _parse_file(file, amc_name):
                        for sheet in sheets:
                            if not sheet.holdings:
                                continue
                            # Per-sheet errors: one broken sheet must not FAIL its good neighbours.
                            parse_errors = ([{"file": member, "sheet": sheet.sheet_name, "error": sheet.error}]
                                            if sheet.error else None)
                            match_key = file.scheme_hint or sheet.sheet_name
                            match = match_scheme_name(match_key, families)
                            if match is None:
                                logger.info("refresh_portfolio_disclosures: unmatched amc=%s key=%r", amc_name, match_key[:80])
                                continue
                            family, method, confidence = match
                            written_this_amc += write_disclosure_batch(
                                db, family, file.as_of_date, amc_name, file.source_url,
                                sheet.holdings, method, confidence, parse_errors=parse_errors,
                                declared_total=sheet.declared_total,
                            )
                await commit_off_loop(db)
                amcs_processed += 1
                schemes_written += written_this_amc
            except Exception as exc:
                db.rollback()
                _alert(amc_name, "error", f"{type(exc).__name__}: {exc}"[:300])
                amcs_failed += 1
    if amcs_not_onboarded:
        logger.info("refresh_portfolio_disclosures: %d registered AMC(s) skipped, Locate not yet built", amcs_not_onboarded)
    return PortfolioDisclosureRefreshResult(
        success=True, amcs_processed=amcs_processed, amcs_failed=amcs_failed,
        amcs_not_onboarded=amcs_not_onboarded, schemes_written=schemes_written,
        seconds=round(time.perf_counter() - started, 1),
    )
