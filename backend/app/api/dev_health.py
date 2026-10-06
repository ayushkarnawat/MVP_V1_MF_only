"""Staging-only developer tools (#6). Registered by main.py only when
ENVIRONMENT is staging or development; elsewhere these paths are 404.
Read-only by construction."""

import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.enums import ImportStatus
from app.models.imports import Import
from app.models.snapshot import PortfolioSnapshot
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user
from app.services.dashboard.member_details import require_member
from app.services.import_.reconciliation import reconcile_members

DEV_ENVIRONMENTS = {"staging", "development"}
router = APIRouter(prefix="/dev", tags=["dev"])


class FolioHealth(BaseModel):
    folio_id: str
    household_member_id: str
    household_member_name: str
    scheme_name: str
    folio_number: str
    plan_type: str
    cas_close_units: str | None
    cas_statement_to: date | None
    fresh_units: str
    cached_units: str | None
    cas_nav: str | None
    cas_nav_date: date | None
    our_nav: str | None
    status: Literal["match", "units_differ", "cache_stale", "no_cas_data"]
    diff_units: str | None


class HistoryCacheHealth(BaseModel):
    household_member_id: str
    latest_month: date | None
    cached_value: str | None


class ImportHealthResponse(BaseModel):
    folios: list[FolioHealth]
    history: list[HistoryCacheHealth]
    warnings: list[str]
    last_import_at: datetime | None


def _s(v) -> str | None:
    return None if v is None else str(v)


@router.get("/status")
def dev_status(user: User = Depends(get_active_user)) -> dict:
    return {"enabled": True}


@router.get("/import-health", response_model=ImportHealthResponse)
def import_health(
    household_member_id: uuid.UUID | None = None,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
) -> ImportHealthResponse:
    if household_member_id is not None:
        members = [require_member(db, user.id, household_member_id)]
    else:
        members = db.query(HouseholdMember).filter(HouseholdMember.user_id == user.id).all()
    ids = [m.id for m in members]
    names = {str(m.id): m.name for m in members}
    rows = reconcile_members(db, ids)
    imports = (
        db.query(Import)
        .filter(Import.household_member_id.in_(ids), Import.status == ImportStatus.CONFIRMED)
        .order_by(Import.confirmed_at.desc())
        .all()
    ) if ids else []
    warnings: list[str] = []
    seen: set[uuid.UUID] = set()
    for imp in imports:
        if imp.household_member_id in seen:
            continue
        seen.add(imp.household_member_id)
        warnings.extend((imp.raw_parser_output or {}).get("parse_warnings") or [])
    history = []
    for m in members:
        snap = (
            db.query(PortfolioSnapshot)
            .filter(PortfolioSnapshot.household_member_id == m.id)
            .order_by(PortfolioSnapshot.snapshot_month.desc())
            .first()
        )
        history.append(HistoryCacheHealth(
            household_member_id=str(m.id),
            latest_month=snap.snapshot_month if snap else None,
            cached_value=_s(snap.total_value) if snap else None,
        ))
    return ImportHealthResponse(
        folios=[FolioHealth(
            folio_id=r.folio_id, household_member_id=r.household_member_id,
            household_member_name=names[r.household_member_id], scheme_name=r.scheme_name,
            folio_number=r.folio_number, plan_type=r.plan_type,
            cas_close_units=_s(r.cas_close_units), cas_statement_to=r.cas_statement_to,
            fresh_units=str(r.fresh_units), cached_units=_s(r.cached_units),
            cas_nav=_s(r.cas_nav), cas_nav_date=r.cas_nav_date, our_nav=_s(r.our_nav),
            status=r.status, diff_units=_s(r.diff_units),
        ) for r in rows],
        history=history,
        warnings=[w for w in warnings if "STAMP" not in w.upper()],
        last_import_at=imports[0].confirmed_at if imports else None,
    )


def register_dev_routes(app: FastAPI, environment: str) -> bool:
    if environment not in DEV_ENVIRONMENTS:
        return False
    app.include_router(router)
    return True
