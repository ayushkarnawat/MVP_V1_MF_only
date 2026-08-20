"""mfapi.in client — scheme resolution + category lookup for Import Service.

Ported from CAS Parsers/mf-import/backend/app/enrich.py, trimmed to what
Import Service needs (scheme matching, not valuation history — that's
Dashboard Service's job). Fuzzy matching stays on stdlib
difflib.SequenceMatcher per PRD-01 Constraints — no new dependency.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import httpx

MFAPI_BASE = "https://api.mfapi.in"
DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent.parent.parent / ".cache" / "mfapi"
SCHEMES_TTL = timedelta(hours=24)

_http_client: httpx.AsyncClient | None = None
_http_client_lock = asyncio.Lock()


async def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        async with _http_client_lock:
            if _http_client is None:
                _http_client = httpx.AsyncClient(timeout=30.0)
    return _http_client


@dataclass
class SchemeMatch:
    amfi_code: str
    scheme_name: str
    confidence: float
    category: str | None = None


def _normalize_name(name: str) -> str:
    s = name.upper()
    s = re.sub(r"\([^)]*\)", "", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _cache_valid(path: Path, ttl: timedelta) -> bool:
    if not path.exists():
        return False
    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    return datetime.now(timezone.utc) - mtime < ttl


class MfApiClient:
    def __init__(self, cache_dir: Path | None = None):
        self.cache_dir = Path(cache_dir) if cache_dir else DEFAULT_CACHE_DIR
        self._schemes: list[dict[str, Any]] | None = None
        self._schemes_lock = asyncio.Lock()

    def _write_cache(self, cache_path: Path, data: Any) -> None:
        # Created lazily, right before the first write — not at __init__ time
        # (module-level `mfapi_client` singleton would otherwise mkdir on
        # every import, which fails on a read-only container filesystem).
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(data), encoding="utf-8")

    async def _get_json(self, url: str) -> Any:
        client = await _get_http_client()
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()

    async def get_scheme_list(self) -> list[dict[str, Any]]:
        if self._schemes is not None:
            return self._schemes
        # Double-checked lock: build_import_preview now resolves schemes
        # concurrently (asyncio.gather), so multiple no-AMFI schemes in the
        # same preview can all reach here before any of them has set
        # self._schemes — without this lock each one would independently
        # fetch the full ~20k-scheme directory instead of sharing one fetch.
        async with self._schemes_lock:
            if self._schemes is not None:
                return self._schemes
            cache_path = self.cache_dir / "schemes.json"
            if _cache_valid(cache_path, SCHEMES_TTL):
                self._schemes = json.loads(cache_path.read_text(encoding="utf-8"))
                return self._schemes
            data = await self._get_json(f"{MFAPI_BASE}/mf")
            self._write_cache(cache_path, data)
            self._schemes = data
            return data

    def fuzzy_match_scheme(self, scheme_name: str, scheme_list: list[dict[str, Any]]) -> SchemeMatch | None:
        norm_query = _normalize_name(scheme_name)
        best: SchemeMatch | None = None
        for item in scheme_list:
            name = item.get("schemeName") or item.get("scheme_name") or ""
            norm_name = _normalize_name(name)
            # SequenceMatcher("", "").ratio() is 1.0 -- a blank/punctuation-only
            # name must never "confirm" a match.
            ratio = SequenceMatcher(None, norm_query, norm_name).ratio() if norm_query and norm_name else 0.0
            if best is None or ratio > best.confidence:
                code = str(item.get("schemeCode") or item.get("scheme_code") or "")
                best = SchemeMatch(amfi_code=code, scheme_name=name, confidence=ratio)
        return best

    def cached_scheme_list(self) -> list[dict[str, Any]] | None:
        """Synchronous peek at whatever `get_scheme_list()` has already fetched
        this process (e.g. during the preceding `build_import_preview` call) —
        `None` if nothing has been fetched yet (a fresh process/restart between
        preview and confirm). Lets `confirm_import` cross-check an override's
        AMFI code against the master list without itself becoming async just
        for a lookup the preview step already paid for."""
        return self._schemes

    def _canonical_name_for_code(self, amfi_code: str, scheme_list: list[dict[str, Any]]) -> str | None:
        for item in scheme_list:
            code = str(item.get("schemeCode") or item.get("scheme_code") or "")
            if code == amfi_code:
                return item.get("schemeName") or item.get("scheme_name") or None
        return None

    def _canonical_isins_for_code(self, amfi_code: str, scheme_list: list[dict[str, Any]]) -> set[str]:
        for item in scheme_list:
            code = str(item.get("schemeCode") or item.get("scheme_code") or "")
            if code == amfi_code:
                return {i for i in (item.get("isinGrowth"), item.get("isinDivReinvestment")) if i}
        return set()

    async def resolve_scheme(
        self, scheme_name: str, amfi_from_cas: str | None, isin: str | None = None
    ) -> tuple[SchemeMatch | None, str]:
        """Returns (match, match_status). Never silently guess below 0.92 (PRD-01 FR-10).

        An mfapi.in outage degrades to (None, "pending") — a manual-resolution
        case, same as a low-confidence match — rather than crashing and
        discarding an already-parsed CAS (the user's PDF upload + password
        entry is expensive; mfapi.in being down is not their fault).

        DATA-001: a CAS-supplied `amfi_from_cas` used to be trusted at
        confidence 1.0 with zero cross-check against `scheme_name` — a
        corrupted (code, name) pairing from a bad CAS parse would silently
        "confirm". Now cross-checked against the AMFI master list's own name
        for that code before being accepted; an unresolvable or implausible
        pairing falls through to a genuine fuzzy match by name instead.

        `isin` is checked ahead of the name-similarity fallback when present:
        casparser already resolved `amfi_from_cas` via an ISIN lookup (a
        globally unique identifier), so an ISIN match against mfapi.in's own
        `isinGrowth`/`isinDivReinvestment` for that code is strictly stronger
        evidence than comparing scheme-name text -- RTAs, AMCs, and mfapi.in
        each format the same scheme's name slightly differently (e.g. a
        CAS's "Direct - Growth" vs mfapi's "Direct Plan - Growth Option"),
        which cost a real scheme (JioBlackRock Flexi Cap, a fund newly
        launched Oct 2025) its auto-confirm despite `amfi_from_cas` being
        correct. Falls back to the name-similarity check when `isin` is
        absent or mfapi.in has no ISIN on file for that code (true for most
        of its ~37k schemes) -- purely additive, never a weaker check than
        before."""
        try:
            scheme_list = await self.get_scheme_list()
        except httpx.HTTPError:
            return None, "pending"

        if amfi_from_cas:
            canonical_name = self._canonical_name_for_code(amfi_from_cas, scheme_list)
            if canonical_name is not None:
                if isin and isin in self._canonical_isins_for_code(amfi_from_cas, scheme_list):
                    return SchemeMatch(amfi_code=amfi_from_cas, scheme_name=scheme_name, confidence=1.0), "confirmed"
                norm_query = _normalize_name(scheme_name)
                norm_canonical = _normalize_name(canonical_name)
                # SequenceMatcher("", "").ratio() is 1.0 -- a name that
                # normalizes to nothing (blank/punctuation-only) must not be
                # treated as a perfect match.
                similarity = SequenceMatcher(None, norm_query, norm_canonical).ratio() if norm_query and norm_canonical else 0.0
                if similarity >= 0.92:
                    return SchemeMatch(amfi_code=amfi_from_cas, scheme_name=scheme_name, confidence=1.0), "confirmed"

        match = self.fuzzy_match_scheme(scheme_name, scheme_list)
        if match is None or match.confidence < 0.92:
            return match, "pending"
        return match, "confirmed" if match.confidence >= 0.98 else "pending"

    async def get_scheme_category(self, amfi_code: str) -> str | None:
        cache_path = self.cache_dir / f"{amfi_code}_meta.json"
        if _cache_valid(cache_path, SCHEMES_TTL):
            data = json.loads(cache_path.read_text(encoding="utf-8"))
        else:
            try:
                data = await self._get_json(f"{MFAPI_BASE}/mf/{amfi_code}/latest")
            except httpx.HTTPError:
                return None
            self._write_cache(cache_path, data)
        meta = data.get("meta") or {}
        return meta.get("scheme_category") or meta.get("schemeCategory")


mfapi_client = MfApiClient()
