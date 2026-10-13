"""Batch-only Locate/Fetch/Parse/Normalize/Write orchestration.

The synchronous Session queries/flushes inside async functions are intentional for
the scheduled job; commits use commit_off_loop. Never call this from an API route.
Each AMC commits separately, so a later failure cannot undo an earlier success.
Task 14 replaces the list-returning fetch and AMC-period skip with per-file skips
and gated alerts. Task 11a adds HTTP locators; page payloads and Index translation
remain for Task 11b.
"""
from __future__ import annotations

import html
import ast
import json
import logging
import re
import time
import urllib.parse
import zipfile
import io
import uuid
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
    if entry.kind is DisclosureResolverKind.MANUAL:
        return False
    if entry.custom_locator:
        return entry.custom_locator in _CUSTOM_LOCATORS
    if entry.kind is DisclosureResolverKind.JSON_API:
        # Unconfigured page-payload rows must remain counted as not onboarded.
        return bool(entry.endpoint_url and entry.response_json_path is not None and entry.documents is not None)
    return (entry.kind in {DisclosureResolverKind.STATIC_REGEX, DisclosureResolverKind.WAYBACK_LOCATE}
            or entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE)


async def _locate_and_fetch(client: httpx.AsyncClient, entry: DisclosureResolverEntry, scheme_rows: list[Scheme]) -> list[LocatedFile]:
    if entry.custom_locator:
        return await _CUSTOM_LOCATORS[entry.custom_locator](client, entry, scheme_rows)
    if entry.kind is DisclosureResolverKind.JSON_API and _is_locate_implemented(entry):
        return await _locate_json_api(client, entry, _latest_month_end())
    if entry.kind is DisclosureResolverKind.WAYBACK_LOCATE:
        return await _locate_wayback(client, entry)  # implemented in Task 7
    if entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE:
        return await _locate_deterministic_template(client, entry, [s.base_name or s.name for s in scheme_rows])
    if entry.kind is not DisclosureResolverKind.STATIC_REGEX:
        raise NotImplementedError(f"{entry.kind} Locate requires its own onboarding task")
    return await _fetch_candidates(client, await _static_regex_candidates(client, entry),
                                   keep_all=entry.file_shape is DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME)


def _request_values(value, as_of: date):
    """Fill only named placeholders; regex quantifier braces remain literal."""
    fy = as_of.year if as_of.month >= 4 else as_of.year - 1
    fields = {'yyyy': str(as_of.year), 'year': str(as_of.year), 'yy': f'{as_of.year % 100:02d}',
              'yy_plus_1': f'{(as_of.year + 1) % 100:02d}', 'mm': f'{as_of.month:02d}',
              'month': str(as_of.month), 'month_name': as_of.strftime('%B'),
              'financial_year': f'{fy}-{fy + 1}'}
    if isinstance(value, str):
        for key, replacement in fields.items():
            value = value.replace('{' + key + '}', replacement)
    elif isinstance(value, dict):
        return {key: _request_values(item, as_of) for key, item in value.items()}
    elif isinstance(value, (list, tuple)):
        return [_request_values(item, as_of) for item in value]
    return value


def _response_json(response):
    response.raise_for_status()
    if response.status_code == 204 or not response.content:
        return {}  # "no documents" (Franklin answers 204 for funds with none), not an error
    if not response.headers.get('Content-Type', '').lower().startswith('application/json'):
        raise ValueError('BLOCKED: expected JSON response, received non-JSON content type')
    return response.json()


async def _json_request(client, entry, as_of, *, headers=None, body=None, params=None):
    kwargs = {'params': _request_values(entry.request_params if params is None else params, as_of),
              'headers': {**_HEADERS, **(headers or {})}}
    if entry.http_method.upper() == 'POST':
        kwargs['json'] = _request_values(entry.request_body if body is None else body, as_of)
    response = await client.request(entry.http_method, entry.endpoint_url, **kwargs)
    return _response_json(response)


def _disclosed_date(text: str | None) -> date | None:
    """Parse a disclosure title, never an upload/reference/published timestamp."""
    text = html.unescape(str(text or '')).strip()
    text = re.split(r'\(?\bUploaded on\b', text, maxsplit=1, flags=re.I)[0].strip()
    # Franklin's month-first title precedes its parenthetical upload date.
    month_first = re.search(rf'({_MONTH_PATTERN})\s+(\d{{1,2}})(?:st|nd|rd|th)?\s*,\s*(\d{{4}})', text, re.I)
    if month_first:
        month, day, year = month_first.groups()
        try:
            return date(int(year), _MONTHS[month[:3].lower()], int(day))
        except ValueError:
            return None
    # WhiteOak writes "30th September2026" without a space before the year.
    text = re.sub(rf'({_MONTH_PATTERN})(?=\d{{4}})', r'\1 ', text, flags=re.I)
    return _filename_as_of_date('https://disclosure.invalid/' + urllib.parse.quote(text, safe=''))


def _file_url(url: str, base: str, rewrite_host=None):
    joined = urllib.parse.urljoin(base, html.unescape(url).strip())
    parsed = urllib.parse.urlsplit(joined)
    if parsed.scheme not in {'http', 'https'}:
        return None
    if rewrite_host and parsed.netloc.lower() == rewrite_host[0].lower():
        joined = parsed._replace(netloc=rewrite_host[1]).geturl()
    return str(httpx.URL(joined))


async def _fetch_dated_records(client, records, as_of, *, keep_all=True):
    """Source metadata can date opaque URLs; an undated source never gets a default."""
    results, seen = [], set()
    for url, disclosed, hint in records:
        if not url or disclosed != as_of or url in seen or not _WORKBOOK_URL.search(url):
            continue
        seen.add(url)
        try:
            data = await _download_workbook(client, url)
        except httpx.HTTPError:
            continue
        if data:
            results.append(LocatedFile(data, url, disclosed, hint))
            if not keep_all:
                break
    return results


async def _locate_json_api(client, entry, as_of) -> list[LocatedFile]:
    rows = await _json_request(client, entry, as_of)
    for key in (entry.response_json_path or '').split('.'):
        if key:
            rows = rows.get(key, []) if isinstance(rows, dict) else []
    records = []
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, str):
            url, label = row, ''
        elif isinstance(row, dict):
            url = row.get('doc') or row.get('pdfUrl') or row.get('url')
            label = row.get('ResourceLink') or row.get('name') or ''
        else:
            continue
        if not isinstance(url, str):
            continue
        if entry.documents and not any(re.search(_request_values(pattern, as_of), f'{label} {url}', re.I)
                                       for pattern in entry.documents):
            continue
        url = _file_url(url, entry.endpoint_url, entry.rewrite_host)
        disclosed = _disclosed_date(label) or (_filename_as_of_date(url) if url else None)
        records.append((url, disclosed, None))
    return await _fetch_dated_records(client, records, as_of,
                                    keep_all=entry.file_shape is DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME)


async def _locate_franklin(client, entry, scheme_rows):
    as_of = _latest_month_end()
    sitemap = await client.get(entry.landing_url)
    sitemap.raise_for_status()
    ids = dict.fromkeys(re.findall(r'/fund-details/fund-overview/(\d+)', sitemap.text))
    records = []
    for fund_id in ids:
        params = {**(entry.request_params or {}), 'frkOneTISNumber': fund_id}
        payload = await _json_request(client, entry, as_of, params=params)
        for row in payload.get('document', []):
            if row.get('contentGrouping') != 'Dis-Portfolio-Monthly':
                continue
            url = _file_url(row.get('downloadUrl', ''), entry.endpoint_url)
            filename = urllib.parse.unquote(urllib.parse.urlsplit(url or '').path.rsplit('/', 1)[-1])
            hint = re.sub(rf'_{_MONTH_PATTERN}_\d{{2,4}}_Monthly_Portfolio\.xlsx?$', '', filename, flags=re.I)
            records.append((url, _disclosed_date(row.get('dctermsTitle')), hint.replace('_', ' ')))
    return await _fetch_dated_records(client, records, as_of)


async def _locate_axis(client, entry, scheme_rows):
    as_of = _latest_month_end()
    payload = await _json_request(client, entry, as_of)
    token_data = payload.get('data', {})
    if isinstance(token_data, str):
        token_data = ast.literal_eval(token_data)
    token = token_data.get('token', '').strip()
    if not token:
        raise ValueError('Axis token missing')
    authorization = token if token.lower().startswith('bearer ') else 'Bearer ' + token
    response = await client.post(urllib.parse.urljoin(entry.endpoint_url, '/cms/get-scheme-documents'),
                                 headers={'Authorization': authorization}, json={
                                     'sdType': 'yearMonthSchemeDocs', 'sdID': 'sdMonthSchemePortfolio',
                                     'year': str(as_of.year), 'month': as_of.strftime('%B'), 'schemeCode': 'Consolidated'})
    rows = _response_json(response).get('data', {}).get('documentList', [])
    records = [(_file_url(r.get('docuementURL', ''), entry.endpoint_url), _disclosed_date(r.get('documentName')), None)
               for r in rows if str(r.get('documentName', '')).lower().startswith('monthly portfolio')]
    return await _fetch_dated_records(client, records, as_of, keep_all=False)


def _html_records(text, base, *, hints=False):
    return [(_file_url(url, base), _disclosed_date(label) or _filename_as_of_date(url.strip()),
             _clean_label(label) if hints else None) for url, label in _extract_links(text)]


def _options(text, select_name=None):
    if select_name:
        found = re.search(r'<select\b[^>]*name=["\']' + re.escape(select_name) + r'["\'][^>]*>(.*?)</select>', text, re.I | re.S)
        text = found.group(1) if found else ''
    return [(value.strip(), ' '.join(re.sub(r'<[^>]+>', '', html.unescape(label)).split()))
            for value, label in re.findall(r'<option\b[^>]*value=["\']([^"\']*)["\'][^>]*>(.*?)</option>', text, re.I | re.S)]


async def _locate_lic(client, entry, scheme_rows):
    as_of = _latest_month_end()
    headers = {'X-Requested-With': 'XMLHttpRequest'}
    year = await client.post(entry.endpoint_url, data=entry.request_body, headers=headers)
    year.raise_for_status()
    if str(as_of.year) not in {v for v, label in _options(year.text)}:
        return []
    month = await client.post(entry.endpoint_url, data={'year': str(as_of.year), 'id': '639', 'filter': 'month'}, headers=headers)
    month.raise_for_status()
    values = {v for v, label in _options(month.text)}
    month_value = next((v for v in values if v.isdigit() and int(v) == as_of.month), None)
    if month_value is None:
        return []
    response = await client.post(urllib.parse.urljoin(entry.endpoint_url, '/downloads/consolidated-portfolio-files'),
                                 data={'id': '639', 'month': month_value, 'year': str(as_of.year)}, headers=headers)
    response.raise_for_status()
    # Both consolidated workbooks cover different schemes; neither is a scheme hint.
    return await _fetch_dated_records(client, _html_records(response.text, str(response.url)), as_of)


async def _locate_sbi(client, entry, scheme_rows):
    as_of = _latest_month_end()
    response = await client.post(entry.endpoint_url, json=_request_values(entry.request_body, as_of),
                                 headers={'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json;charset=UTF-8'})
    response.raise_for_status()
    records = [r for r in _html_records(response.text, str(response.url)) if r[0] and 'all-schemes-monthly-portfolio' in r[0].lower()]
    return await _fetch_dated_records(client, records, as_of, keep_all=False)


async def _locate_trust(client, entry, scheme_rows):
    as_of = _latest_month_end()
    payload = await _json_request(client, entry, as_of)
    records = [(_file_url(r.get('fileurl', ''), entry.endpoint_url), _disclosed_date(r.get('title')), None)
               for r in payload.get('resultSetArray', [])]
    return await _fetch_dated_records(client, records, as_of, keep_all=False)


async def _locate_mirae(client, entry, scheme_rows):
    as_of = _latest_month_end()
    records, page = [], 1
    while True:
        body = _request_values(entry.request_body, as_of)
        body['request']['pgno'] = page
        payload = await _json_request(client, entry, as_of, body=body, headers={'X-Requested-With': 'XMLHttpRequest'})
        rows = payload.get('Data', [])
        for row in rows:
            title = row.get('Title', '')
            hint = title.split(' for ', 1)[1].strip() if ' for ' in title else None
            records.append((_file_url(row.get('URL', ''), entry.endpoint_url), _disclosed_date(title), hint))
        if not rows or page * body['request']['pgsize'] >= int(payload.get('DataCount', len(rows))):
            break
        page += 1
    return await _fetch_dated_records(client, records, as_of)


async def _locate_boi(client, entry, scheme_rows):
    as_of = _latest_month_end()
    payload = await _json_request(client, entry, as_of)
    data = payload.get('d', {})
    if isinstance(data, str):
        data = json.loads(data)
    records = [(_file_url(r.get('FolderUrl', ''), entry.endpoint_url), _disclosed_date(r.get('DocName')), None)
               for r in data.get('Documents', [])]
    return await _fetch_dated_records(client, records, as_of, keep_all=False)


async def _locate_taurus(client, entry, scheme_rows):
    completed = _latest_month_end()
    year, month = completed.year, 9 if completed.month >= 9 else 3
    if completed.month < 3:
        year, month = year - 1, 9
    as_of = date(year, month + 1, 1) - timedelta(days=1)
    response = await client.get(entry.endpoint_url)
    response.raise_for_status()
    year_id = next((v for v, label in _options(response.text, 'field_hy_portfolio_year_target_id') if label == str(year)), None)
    month_id = next((v for v, label in _options(response.text, 'field_hy_portfolio_month_target_id') if label.lower() == as_of.strftime('%B').lower()), None)
    if year_id is None or month_id is None:
        return []
    response = await client.get(entry.endpoint_url, params={'field_hy_portfolio_year_target_id': year_id,
                                                            'field_hy_portfolio_month_target_id': month_id})
    response.raise_for_status()
    records = []
    for url, label in _extract_links(response.text):
        url = _file_url(url, str(response.url))
        filename = urllib.parse.unquote(urllib.parse.urlsplit(url or '').path.rsplit('/', 1)[-1])
        hint = re.sub(r'_Half_Yearly_Portfolio.*$', '', filename, flags=re.I).replace('_', ' ')
        records.append((url, _filename_as_of_date(url) if url else None, hint))
    return await _fetch_dated_records(client, records, as_of)


async def _locate_absl(client, entry, scheme_rows):
    return await _locate_json_api(client, entry, _latest_month_end())


async def _locate_navi(client, entry, scheme_rows):
    as_of = _latest_month_end()
    page = await client.get(entry.landing_url)
    page.raise_for_status()
    nonce = re.search(r'"rest_url"\s*:\s*"[^"]*"\s*,\s*"nonce"\s*:\s*"([a-z0-9]+)"', page.text)
    if nonce is None:
        raise ValueError('Navi WP nonce missing')
    response = await client.post(entry.endpoint_url, data=_request_values(entry.request_body, as_of), headers={'WP-NONCE': nonce.group(1)})
    rows = _response_json(response).get('data', [])
    records = []
    for row in rows:
        title = html.unescape(row.get('title', ''))
        hint = re.split(r'\s+\d{1,2}(?:st|nd|rd|th)\b', title, maxsplit=1, flags=re.I)[0].strip()
        records.append((_file_url(row.get('url', ''), entry.endpoint_url), _disclosed_date(title), hint))
    return await _fetch_dated_records(client, records, as_of)


async def _locate_pgim(client, entry, scheme_rows):
    as_of = _latest_month_end()
    payload = await _json_request(client, entry, as_of)
    records = []
    for tab in payload.get('data', []):
        for row in tab.get('content', []):
            title = row.get('title', '')
            hint = re.sub(rf'\s+{_MONTH_PATTERN}\s+\d{{4}}$', '', title, flags=re.I).strip()
            records.append((_file_url(row.get('pdfPath', ''), entry.endpoint_url), _disclosed_date(row.get('dateMonthYear')), hint))
    return await _fetch_dated_records(client, records, as_of)


async def _locate_whiteoak(client, entry, scheme_rows):
    as_of = _latest_month_end()
    records, page = [], 1
    while True:
        params = {**entry.request_params, 'pagination[page]': page}
        payload = await _json_request(client, entry, as_of, params=params)
        for row in payload.get('data', []):
            attrs = row.get('attributes', {})
            if attrs.get('period') != 'Monthly':
                continue
            file = (attrs.get('doc_file') or {}).get('data') or {}
            records.append((_file_url(file.get('attributes', {}).get('url', ''), entry.endpoint_url),
                            _disclosed_date(attrs.get('doc_name')), attrs.get('scheme_name')))
        if page >= int(payload.get('meta', {}).get('pagination', {}).get('pageCount', 1)):
            break
        page += 1
    return await _fetch_dated_records(client, records, as_of)


async def _locate_icici(client, entry, scheme_rows):
    as_of = _latest_month_end()
    headers = {'requestapiid': str(uuid.uuid4()), 'sourceurl': 'DOWNLOADS', 'env': 'api',
               'Origin': 'https://www.icicipruamc.com', 'Referer': entry.landing_url,
               'Accept': 'application/json'}
    payload = await _json_request(client, entry, as_of, headers=headers)
    rows = payload.get('success', {}).get('data', {}).get('files', [])
    records = []
    for row in rows:
        path = row.get('url', '')
        if not path.startswith('/downloads/'):
            continue
        url = _file_url('/blob' + path, 'https://www.icicipruamc.com')
        records.append((url, _disclosed_date(row.get('title', {}).get('text')), None))
    return await _fetch_dated_records(client, records, as_of, keep_all=False)


async def _locate_uti(client, entry, scheme_rows):
    # No blanket scheme hint: EXPOSURE:<code> is not a tested scheme name.
    return await _locate_json_api(client, entry, _latest_month_end())


_CUSTOM_LOCATORS = {
    'franklin': _locate_franklin, 'axis': _locate_axis, 'lic': _locate_lic,
    'sbi': _locate_sbi, 'trust': _locate_trust, 'mirae': _locate_mirae,
    'boi': _locate_boi, 'taurus': _locate_taurus, 'absl': _locate_absl,
    'navi': _locate_navi, 'pgim': _locate_pgim, 'whiteoak': _locate_whiteoak,
    'icici': _locate_icici, 'uti': _locate_uti,
}


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
