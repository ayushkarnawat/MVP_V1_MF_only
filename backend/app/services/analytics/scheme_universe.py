"""Scheme-universe ingestion from AMFI's NAVAll.txt bulk file — PRD-04
FR-3/FR-4's shared data-gap fix (Phase 4 design doc, section 1).

`mfapi.in`'s bulk scheme list (`import_/enrich.py`'s `MfApiClient.get_scheme_list`)
has no category field, and a per-scheme category lookup across the whole
~40,000-scheme universe is infeasible. AMFI's `NAVAll.txt` groups every
live scheme under a category header line in one bulk file instead — live-
verified this session as directly joinable with `schemes.sebi_category`
with zero string-format reconciliation, since both ultimately parse
mfapi.in's own `meta.scheme_category` text.

Same disk-cache idiom as `import_/enrich.py`'s `MfApiClient` (this is a
bulk universe file, not a resolve-once-per-key value, so it doesn't use
`nav.py`/`arn_lookup.py`'s per-row DB cache idiom), 24h TTL.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.reference import Scheme

NAV_ALL_URL = "https://www.amfiindia.com/spages/NAVAll.txt"
DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent.parent.parent / ".cache" / "amfi_navall"
NAV_ALL_TTL = timedelta(hours=24)
_CATEGORY_HEADER_RE = re.compile(r"^(?:Open Ended|Close Ended|Interval Fund) Schemes\((.+)\)$")


@dataclass
class UniverseRow:
    amfi_code: str
    isin: str | None
    name: str
    amc_name: str
    sebi_category: str


def _cache_valid(path: Path, ttl: timedelta) -> bool:
    if not path.exists():
        return False
    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    return datetime.now(timezone.utc) - mtime < ttl


def _parse_nav_all(text: str) -> list[UniverseRow]:
    """NAVAll.txt is a flat, stateful stream: a category header line, then
    one or more AMC-name lines, then that AMC's scheme rows, repeating,
    blank lines throughout. Neither header nor AMC lines contain `;`.

    AMFI changed the scheme-row shape live in Aug 2026: the historical
    6-field row (`code;isinGrowth;isinReinvest;name;nav;date`, plan/option
    baked into `name` as free text) became 8 fields
    (`code;isinGrowth;isinReinvest;name;plan;option;nav;date`), name now
    bare. Both are accepted so a future reversion doesn't silently break
    this again — the old 6-field check silently dropped every row,
    zeroing out every category universe (root cause of every held fund
    showing "Insufficient History" regardless of actual track record,
    confirmed live 2026-08-19). A scheme row before any header/AMC line
    has been seen is skipped rather than guessed at."""
    rows: list[UniverseRow] = []
    current_category: str | None = None
    current_amc: str | None = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        header_match = _CATEGORY_HEADER_RE.match(line)
        if header_match:
            current_category = header_match.group(1)
            continue

        if ";" not in line:
            current_amc = line
            continue

        fields = line.split(";")
        if fields[0] == "Scheme Code" or len(fields) not in (6, 8):
            continue
        if current_category is None or current_amc is None:
            continue

        if len(fields) == 6:
            code, isin_growth, isin_reinvest, name, _nav, _date = fields
        else:
            code, isin_growth, isin_reinvest, base_name, plan, option, _nav, _date = fields
            name = f"{base_name} - {plan} - {option}"
        isin = isin_growth if isin_growth != "-" else (isin_reinvest if isin_reinvest != "-" else None)
        rows.append(
            UniverseRow(
                amfi_code=code,
                isin=isin,
                name=name,
                amc_name=current_amc,
                sebi_category=current_category,
            )
        )
    return rows


class SchemeUniverseClient:
    def __init__(self, cache_dir: Path | None = None):
        self.cache_dir = Path(cache_dir) if cache_dir else DEFAULT_CACHE_DIR
        self._rows: list[UniverseRow] | None = None

    async def _fetch_nav_all_text(self) -> str:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(NAV_ALL_URL)
            resp.raise_for_status()
            return resp.text

    async def _get_rows(self) -> list[UniverseRow]:
        if self._rows is not None:
            return self._rows

        cache_path = self.cache_dir / "nav_all.txt"
        if _cache_valid(cache_path, NAV_ALL_TTL):
            text = cache_path.read_text(encoding="utf-8")
        else:
            text = await self._fetch_nav_all_text()
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(text, encoding="utf-8")

        self._rows = _parse_nav_all(text)
        return self._rows

    async def get_category_universe(self, db: Session, sebi_category: str) -> list[Scheme]:
        """Every scheme tagged `sebi_category` in NAVAll.txt, get-or-created
        against local `schemes` keyed by `amfi_code`. New rows get
        `plan_name_variant=None` — irrelevant for return-ranking, which
        operates per scheme code/NAV series regardless of direct/regular.
        Degrades to an empty list (not a crash) on a fetch failure."""
        try:
            rows = await self._get_rows()
        except httpx.HTTPError:
            return []

        matched = [r for r in rows if r.sebi_category == sebi_category]
        if not matched:
            return []

        existing = {
            s.amfi_code: s
            for s in db.query(Scheme).filter(Scheme.amfi_code.in_([r.amfi_code for r in matched])).all()
        }
        result: list[Scheme] = []
        created_any = False
        for row in matched:
            scheme = existing.get(row.amfi_code)
            if scheme is None:
                scheme = Scheme(
                    id=uuid.uuid4(),
                    amfi_code=row.amfi_code,
                    isin=row.isin,
                    name=row.name,
                    amc_name=row.amc_name,
                    sebi_category=row.sebi_category,
                    plan_name_variant=None,
                )
                db.add(scheme)
                existing[row.amfi_code] = scheme
                created_any = True
            result.append(scheme)

        if created_any:
            await commit_off_loop(db)
        return result


scheme_universe_client = SchemeUniverseClient()


async def get_category_universe(db: Session, sebi_category: str) -> list[Scheme]:
    return await scheme_universe_client.get_category_universe(db, sebi_category)
