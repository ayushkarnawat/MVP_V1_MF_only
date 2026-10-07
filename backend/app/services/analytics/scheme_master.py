"""Daily AMFI master refresh; preserves historical and CAS-only identities."""
from dataclasses import dataclass
import re
import uuid
from sqlalchemy.orm import Session
from app.db.session import commit_off_loop
from app.models.reference import Scheme
from app.models.enums import SchemePlanType, SchemeSource
from app.services.analytics.scheme_universe import UniverseRow, SchemeUniverseClient, _parse_nav_all

MIN_ROWS = 5000


class MasterRefreshAborted(ValueError):
    pass


@dataclass(frozen=True)
class MasterRefreshResult:
    inserted: int
    updated: int
    deactivated: int
    rows: int


def plan_type_for(row: UniverseRow) -> SchemePlanType | None:
    for text in (row.plan or "", row.name):
        if re.search(r"\b(?:DIRECT|DIR)\b", text, re.I):
            return SchemePlanType.DIRECT
        if re.search(r"\b(?:REGULAR|REG)\b", text, re.I):
            return SchemePlanType.REGULAR
    return None


async def refresh_scheme_master(db: Session, text: str | None = None) -> MasterRefreshResult:
    if text is None:
        text = await SchemeUniverseClient()._fetch_nav_all_text()
    rows = _parse_nav_all(text)
    by_code = {r.amfi_code: r for r in rows}
    if len(by_code) < MIN_ROWS:
        raise MasterRefreshAborted(f"AMFI master has only {len(by_code)} rows; minimum is {MIN_ROWS}")
    existing = {s.amfi_code: s for s in db.query(Scheme).all() if s.amfi_code is not None}
    inserts, updates, deactivated = [], [], 0
    for code, row in by_code.items():
        saved = existing.get(code)
        if saved is not None and saved.source != SchemeSource.AMFI:
            continue
        data = dict(name=row.name, isin=row.isin, isin_reinvest=row.isin_reinvest,
                    base_name=row.base_name, amc_name=row.amc_name, sebi_category=row.sebi_category,
                    plan_type=plan_type_for(row), is_active=True)
        if saved is None:
            inserts.append(dict(id=uuid.uuid4(), amfi_code=code, source=SchemeSource.AMFI, **data))
        elif any(getattr(saved, key) != value for key, value in data.items()):
            updates.append(dict(id=saved.id, **data))
    updated = len(updates)
    for code, saved in existing.items():
        if saved.source == SchemeSource.AMFI and code not in by_code and saved.is_active:
            updates.append(dict(id=saved.id, is_active=False))
            deactivated += 1
    try:
        for batch in range(0, len(inserts), 1000):
            db.bulk_insert_mappings(Scheme, inserts[batch:batch + 1000])
        for batch in range(0, len(updates), 1000):
            db.bulk_update_mappings(Scheme, updates[batch:batch + 1000])
        await commit_off_loop(db)
    except Exception:
        db.rollback()
        raise
    db.expire_all()
    return MasterRefreshResult(len(inserts), updated, deactivated, len(by_code))
