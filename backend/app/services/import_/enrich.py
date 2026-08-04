"""mfapi.in client — scheme resolution + category lookup for Import Service.

Ported from CAS Parsers/mf-import/backend/app/enrich.py, trimmed to what
Import Service needs (scheme matching, not valuation history — that's
Dashboard Service's job). Fuzzy matching stays on stdlib
difflib.SequenceMatcher per PRD-01 Constraints — no new dependency.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

MFAPI_BASE = "https://api.mfapi.in"
DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent.parent.parent / ".cache" / "mfapi"
SCHEMES_TTL = timedelta(hours=24)


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
        self.cache_dir.mkdir(parents=True, exist_ok=True)
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

    def fuzzy_match_scheme(self, scheme_name: str, scheme_list: list[dict[str, Any]]) -> SchemeMatch | None:
        norm_query = _normalize_name(scheme_name)
        best: SchemeMatch | None = None
        for item in scheme_list:
            name = item.get("schemeName") or item.get("scheme_name") or ""
            ratio = SequenceMatcher(None, norm_query, _normalize_name(name)).ratio()
            if best is None or ratio > best.confidence:
                code = str(item.get("schemeCode") or item.get("scheme_code") or "")
                best = SchemeMatch(amfi_code=code, scheme_name=name, confidence=ratio)
        return best

    async def resolve_scheme(self, scheme_name: str, amfi_from_cas: str | None) -> tuple[SchemeMatch | None, str]:
        """Returns (match, match_status). Never silently guess below 0.92 (PRD-01 FR-10)."""
        if amfi_from_cas:
            return SchemeMatch(amfi_code=amfi_from_cas, scheme_name=scheme_name, confidence=1.0), "confirmed"

        scheme_list = await self.get_scheme_list()
        match = self.fuzzy_match_scheme(scheme_name, scheme_list)
        if match is None or match.confidence < 0.92:
            return match, "pending"
        return match, "confirmed" if match.confidence >= 0.98 else "pending"

    async def get_scheme_category(self, amfi_code: str) -> str | None:
        cache_path = self.cache_dir / f"{amfi_code}_meta.json"
        if _cache_valid(cache_path, SCHEMES_TTL):
            data = json.loads(cache_path.read_text(encoding="utf-8"))
        else:
            data = await self._get_json(f"{MFAPI_BASE}/mf/{amfi_code}")
            cache_path.write_text(json.dumps(data), encoding="utf-8")
        meta = data.get("meta") or {}
        return meta.get("scheme_category") or meta.get("schemeCategory")


mfapi_client = MfApiClient()
