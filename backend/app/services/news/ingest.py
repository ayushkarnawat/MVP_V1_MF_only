"""T3: GDELT 2.1 GKG ingest.

15-minute files at ``https://data.gdeltproject.org/gdeltv2/<stamp>.gkg.csv.zip``,
27 tab-separated columns (as `news-dry-run/gdelt_dry_run.py` reads them). Only
column 1 (DATE), 3 (source domain), 4 (URL), 25 (translation info) and 26
(extras: ``<PAGE_TITLE>``/``<PAGE_PRECISEPUBTIMESTAMP>``) are used -- the rest
of the row is GDELT's entity/theme/tone extraction, irrelevant here.
"""

from __future__ import annotations

import asyncio
import html
import re
import zipfile
from collections.abc import Collection, Iterator
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from io import BytesIO, TextIOWrapper
from typing import Literal
from urllib.parse import urlsplit

import httpx

from app.services.news.config import (
    ETIMES_ALLOWED_PATH_PREFIXES,
    ETIMES_DOMAIN,
    GLOBAL_SITES,
    INDIAN_SITES,
    SOURCE_DISPLAY_NAMES,
)

# data.gdeltproject.org serves the same files over https (verified); use it so a
# network middlebox cannot rewrite the headlines/URLs we ingest.
GDELT_BASE_URL = "https://data.gdeltproject.org/gdeltv2/"
GKG_COLUMN_COUNT = 27
# A real 15-minute GKG zip is a few MB; anything past this is not one, so the
# download is aborted rather than held in memory.
MAX_GKG_FILE_BYTES = 50 * 1024 * 1024


class GkgFileTooLarge(RuntimeError):
    pass

# T6's job pauses 1s between files (politeness towards GDELT); hardcoded
# rather than a new ingest_window parameter because the handoff's contract
# fixes this function's signature. Tests stub asyncio.sleep.
_PAUSE_BETWEEN_FILES_SECONDS = 1.0

Origin = Literal["indian", "global"]
_SkipReason = Literal["malformed", "non_english", "site", "bad_url"]

_PAGE_TITLE_RE = re.compile(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", re.DOTALL)
_PRECISE_TS_RE = re.compile(r"<PAGE_PRECISEPUBTIMESTAMP>(\d{14})</PAGE_PRECISEPUBTIMESTAMP>")
# A trailing " - Moneycontrol"-style publisher suffix seen on several of the
# allow-listed sites' <PAGE_TITLE> values; GDELT does not strip this itself.
# Only stripped when the tail names the article's own source (see _clean_title),
# so a headline like "Gold surges - silver follows" keeps its tail.
_PUBLISHER_SUFFIX_RE = re.compile(r"^(?P<head>.*\S)\s+-\s+(?P<tail>[A-Za-z0-9.&' ]{2,40})$")
_PUNCT_RE = re.compile(r"[^0-9a-z ]+")

_ENGLISH_ASCII_RATIO_MIN = 0.8


@dataclass(frozen=True)
class RawArticle:
    url: str
    title: str
    domain: str
    source: str
    published_at: datetime
    origin: Origin


@dataclass
class IngestStats:
    files_ok: int = 0
    files_missing: int = 0
    files_failed: int = 0
    rows_seen: int = 0
    rows_kept: int = 0
    skipped_non_english: int = 0
    skipped_site: int = 0
    skipped_bad_url: int = 0
    skipped_dup: int = 0


def window_stamps(now_utc: datetime, hours: int) -> list[str]:
    """Newest-first 15-minute stamps; newest = floor15(now_utc - 1h) -- the
    1-hour lag matches T1's dry run (the newest file is always at least an
    hour old on GDELT's side)."""
    newest = now_utc - timedelta(hours=1)
    newest = newest.replace(minute=newest.minute - newest.minute % 15, second=0, microsecond=0)
    return [(newest - timedelta(minutes=15 * step)).strftime("%Y%m%d%H%M%S") for step in range(hours * 4)]


def iter_gkg_zip(data: bytes) -> Iterator[str]:
    """Streams decompressed lines one at a time -- never materializes the
    whole decompressed file, so a large real GKG file stays bounded memory."""
    with zipfile.ZipFile(BytesIO(data)) as archive:
        with archive.open(archive.namelist()[0]) as handle:
            wrapper = TextIOWrapper(handle, encoding="utf-8", errors="replace", newline="")
            for line in wrapper:
                yield line.rstrip("\n")


def _label_boundary_match(domain: str, site: str) -> bool:
    return domain == site or domain.endswith("." + site)


def _origin_for_domain(domain: str) -> Origin | None:
    if any(_label_boundary_match(domain, site) for site in INDIAN_SITES):
        return "indian"
    if any(_label_boundary_match(domain, site) for site in GLOBAL_SITES):
        return "global"
    return None


def _site_display_name(domain: str) -> str:
    for site, name in SOURCE_DISPLAY_NAMES.items():
        if _label_boundary_match(domain, site):
            return name
    return domain


def _url_on_allowed_domain(url: str, domain: str) -> bool:
    """The article URL must be http(s) and its host must be the allow-listed
    site (or a subdomain of it) that GDELT reported for the row: the domain
    column and the URL column are independent fields in the feed."""
    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").lower()
    except ValueError:
        return False
    if parts.scheme not in ("http", "https") or not host:
        return False
    sites = [s for s in (*INDIAN_SITES, *GLOBAL_SITES) if _label_boundary_match(domain, s)]
    return any(_label_boundary_match(host, site) for site in sites)


def _etimes_path_allowed(url: str) -> bool:
    path = url.split("://", 1)[-1].split("/", 1)[-1]
    path = "/" + path if not path.startswith("/") else path
    # Strip query/fragment before the prefix check.
    path = path.split("?", 1)[0].split("#", 1)[0]
    return any(path.startswith(prefix) for prefix in ETIMES_ALLOWED_PATH_PREFIXES)


def _clean_title(raw: str, domain: str = "") -> str:
    text = html.unescape(raw)
    text = re.sub(r"\s+", " ", text).strip()
    match = _PUBLISHER_SUFFIX_RE.match(text)
    if match is not None and domain:
        tail = match.group("tail").strip().lower()
        names = {domain.lower(), _site_display_name(domain).lower()}
        names |= {site for site in SOURCE_DISPLAY_NAMES if _label_boundary_match(domain, site)}
        if tail in names:
            text = match.group("head").strip()
    return text


def _is_english(translation_info: str, title: str) -> bool:
    if translation_info.strip():
        return False
    letters = [c for c in title if c.isalpha()]
    if not letters:
        return True
    ascii_letters = sum(1 for c in letters if c.isascii())
    return (ascii_letters / len(letters)) >= _ENGLISH_ASCII_RATIO_MIN


def _parse_stamp(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _published_at(date_col: str, extras: str) -> datetime | None:
    published = _parse_stamp(date_col)
    if published is None:
        return None
    precise_match = _PRECISE_TS_RE.search(extras)
    if precise_match:
        precise = _parse_stamp(precise_match.group(1))
        if precise is not None and precise <= published:
            return precise
    return published


def _dedup_key_title(title: str) -> str:
    lowered = _PUNCT_RE.sub(" ", title.lower())
    return re.sub(r"\s+", " ", lowered).strip()


def _normalise_url(url: str) -> str:
    base, _, _fragment = url.partition("#")
    path, _, query = base.partition("?")
    if not query:
        return path
    kept = [
        part for part in query.split("&")
        if part and not part.split("=", 1)[0].lower().startswith("utm_")
    ]
    return path if not kept else f"{path}?{'&'.join(kept)}"


def _classify_line(
    line: str, disabled_sources: Collection[str]
) -> tuple[RawArticle | None, _SkipReason | None]:
    """Shared by parse_gkg_line and ingest_window so site/language rules
    live in exactly one place; ingest_window also wants the skip reason
    (for IngestStats) which parse_gkg_line's fixed `RawArticle | None`
    return type has no room for."""
    cols = line.split("\t")
    if len(cols) < GKG_COLUMN_COUNT:
        return None, "malformed"
    domain = cols[3].strip().lower()
    url = cols[4].strip()
    if not domain or not url:
        return None, "malformed"
    title_match = _PAGE_TITLE_RE.search(cols[26])
    if not title_match:
        return None, "malformed"
    title = _clean_title(title_match.group(1), domain)
    if not title:
        return None, "malformed"
    if not _is_english(cols[25], title):
        return None, "non_english"
    origin = _origin_for_domain(domain)
    if origin is None:
        return None, "site"
    if not _url_on_allowed_domain(url, domain):
        return None, "bad_url"
    if _label_boundary_match(domain, ETIMES_DOMAIN) and not _etimes_path_allowed(url):
        return None, "site"
    if any(_label_boundary_match(domain, disabled) for disabled in disabled_sources):
        return None, "site"
    published_at = _published_at(cols[1].strip(), cols[26])
    if published_at is None:
        return None, "malformed"
    article = RawArticle(
        url=_normalise_url(url),
        title=title,
        domain=domain,
        source=_site_display_name(domain),
        published_at=published_at,
        origin=origin,
    )
    return article, None


def parse_gkg_line(line: str, *, disabled_sources: Collection[str] = ()) -> RawArticle | None:
    article, _reason = _classify_line(line, disabled_sources)
    return article


async def fetch_file(
    client: httpx.AsyncClient, stamp: str, *, tries: int = 3, retry_sleep: int = 2
) -> bytes | None:
    url = f"{GDELT_BASE_URL}{stamp}.gkg.csv.zip"
    error: Exception | None = None
    for attempt in range(tries):
        try:
            async with client.stream("GET", url) as response:
                body: bytes | None = None
                if response.status_code == 200:
                    chunks: list[bytes] = []
                    size = 0
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > MAX_GKG_FILE_BYTES:
                            raise GkgFileTooLarge(f"{url}: body exceeds {MAX_GKG_FILE_BYTES} bytes")
                        chunks.append(chunk)
                    body = b"".join(chunks)
        except httpx.HTTPError as exc:
            error = exc
        else:
            error = None
            if body is not None:
                return body
            if response.status_code == 404:
                if attempt == tries - 1:
                    return None
            else:
                error = RuntimeError(f"{url}: unexpected status {response.status_code}")
        if attempt < tries - 1:
            await asyncio.sleep(retry_sleep)
    raise error if error is not None else RuntimeError(f"{url}: exhausted retries")


async def ingest_window(
    client: httpx.AsyncClient,
    now_utc: datetime,
    hours: int,
    *,
    disabled_sources: Collection[str] = (),
    retry_sleep: int = 2,
) -> tuple[list[RawArticle], IngestStats]:
    stats = IngestStats()
    articles: list[RawArticle] = []
    seen_urls: set[str] = set()
    seen_title_keys: set[tuple[str, str]] = set()
    stamps = window_stamps(now_utc, hours)
    for index, stamp in enumerate(stamps):
        try:
            data = await fetch_file(client, stamp, retry_sleep=retry_sleep)
        except Exception:
            stats.files_failed += 1
        else:
            if data is None:
                stats.files_missing += 1
            else:
                failed = False
                try:
                    for line in iter_gkg_zip(data):
                        stats.rows_seen += 1
                        article, reason = _classify_line(line, disabled_sources)
                        if article is None:
                            if reason == "non_english":
                                stats.skipped_non_english += 1
                            elif reason == "site":
                                stats.skipped_site += 1
                            elif reason == "bad_url":
                                stats.skipped_bad_url += 1
                            continue
                        dedup_key = (article.domain, _dedup_key_title(article.title))
                        if article.url in seen_urls or dedup_key in seen_title_keys:
                            stats.skipped_dup += 1
                            continue
                        seen_urls.add(article.url)
                        seen_title_keys.add(dedup_key)
                        stats.rows_kept += 1
                        articles.append(article)
                except (zipfile.BadZipFile, EOFError, OSError):
                    failed = True
                if failed:
                    stats.files_failed += 1
                else:
                    stats.files_ok += 1
        if index < len(stamps) - 1:
            await asyncio.sleep(_PAUSE_BETWEEN_FILES_SECONDS)
    return articles, stats
