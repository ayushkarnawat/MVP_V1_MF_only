"""mfapi.in client with on-disk cache and fuzzy scheme matching."""

from __future__ import annotations

from urllib.parse import quote

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.calc import NavPoint, map_category_from_mfapi
from app.decimal_utils import quantize_nav, to_decimal

IST = ZoneInfo("Asia/Kolkata")
MFAPI_BASE = "https://api.mfapi.in"
CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"
SCHEMES_CACHE = CACHE_DIR / "schemes.json"
NAV_CACHE_DIR = CACHE_DIR / "nav"
SCHEMES_TTL = timedelta(hours=24)


@dataclass
class SchemeMatch:
    amfi_code: str
    scheme_name: str
    confidence: float
    category: str | None = None


@dataclass
class NavSeries:
    meta: dict[str, Any]
    latest_nav: Decimal | None
    history: list[NavPoint]


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


def _nav_cache_valid(path: Path) -> bool:
    if not path.exists():
        return False
    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=IST)
    now = datetime.now(IST)
    return mtime.date() == now.date()


def _parse_mfapi_date(d: str) -> date:
    parts = d.split("-")
    if len(parts[0]) == 4:
        return date.fromisoformat(d[:10])
    return date(int(parts[2]), int(parts[1]), int(parts[0]))


class MfApiClient:
    def __init__(self, cache_dir: Path | None = None):
        self.cache_dir = cache_dir or CACHE_DIR
        self.nav_cache_dir = self.cache_dir / "nav"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.nav_cache_dir.mkdir(parents=True, exist_ok=True)
        self._schemes: list[dict[str, Any]] | None = None

    async def _get_json(self, url: str) -> Any:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()

    async def get_scheme_list(self) -> list[dict[str, Any]]:
        if self._schemes is not None:
            return self._schemes

        cache_path = self.cache_dir / "schemes.json"
        if _cache_valid(cache_path, SCHEMES_TTL):
            self._schemes = json.loads(cache_path.read_text(encoding="utf-8"))
            return self._schemes

        data = await self._get_json(f"{MFAPI_BASE}/mf")
        cache_path.write_text(json.dumps(data), encoding="utf-8")
        self._schemes = data
        return data

    async def search_schemes(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        url = f"{MFAPI_BASE}/mf/search?q={quote(query)}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            results = resp.json()
        return results[:limit]

    def fuzzy_match_scheme(self, scheme_name: str, scheme_list: list[dict[str, Any]]) -> SchemeMatch | None:
        norm_query = _normalize_name(scheme_name)
        best: SchemeMatch | None = None
        for item in scheme_list:
            name = item.get("schemeName") or item.get("scheme_name") or ""
            norm_name = _normalize_name(name)
            ratio = SequenceMatcher(None, norm_query, norm_name).ratio()
            if best is None or ratio > best.confidence:
                code = str(item.get("schemeCode") or item.get("scheme_code") or "")
                best = SchemeMatch(amfi_code=code, scheme_name=name, confidence=ratio)
        return best

    async def resolve_scheme(
        self,
        scheme_name: str,
        amfi_from_cas: str | None,
    ) -> tuple[SchemeMatch | None, str]:
        """Returns (match, match_status). Never silently guess below 0.92."""
        if amfi_from_cas:
            return (
                SchemeMatch(amfi_code=amfi_from_cas, scheme_name=scheme_name, confidence=1.0),
                "confirmed" if amfi_from_cas else "pending",
            )

        scheme_list = await self.get_scheme_list()
        match = self.fuzzy_match_scheme(scheme_name, scheme_list)
        if match is None or match.confidence < 0.92:
            return match, "pending"
        status = "confirmed" if match.confidence >= 0.98 else "pending"
        return match, status

    async def get_nav_series(self, amfi_code: str) -> NavSeries:
        cache_path = self.nav_cache_dir / f"{amfi_code}.json"
        if _nav_cache_valid(cache_path):
            data = json.loads(cache_path.read_text(encoding="utf-8"))
        else:
            data = await self._get_json(f"{MFAPI_BASE}/mf/{amfi_code}")
            cache_path.write_text(json.dumps(data), encoding="utf-8")

        meta = data.get("meta") or {}
        history: list[NavPoint] = []
        for row in data.get("data") or []:
            nav_val = to_decimal(row.get("nav"))
            if nav_val is not None:
                history.append(NavPoint(_parse_mfapi_date(row["date"]), quantize_nav(nav_val)))

        history.sort(key=lambda p: p.nav_date)
        latest = history[-1].nav if history else None
        return NavSeries(meta=meta, latest_nav=latest, history=history)

    async def get_latest_nav(self, amfi_code: str) -> Decimal | None:
        cache_path = self.nav_cache_dir / f"{amfi_code}_latest.json"
        if _nav_cache_valid(cache_path):
            data = json.loads(cache_path.read_text(encoding="utf-8"))
        else:
            data = await self._get_json(f"{MFAPI_BASE}/mf/{amfi_code}/latest")
            cache_path.write_text(json.dumps(data), encoding="utf-8")

        rows = data.get("data") or []
        if not rows:
            return None
        return quantize_nav(to_decimal(rows[0]["nav"]))

    def category_from_meta(self, meta: dict[str, Any]) -> str:
        cat = meta.get("scheme_category") or meta.get("schemeCategory")
        return map_category_from_mfapi(cat)


mfapi_client = MfApiClient()
