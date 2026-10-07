"""Fresh month-end snapshots from one FIFO pass and bulk NAV history."""
from __future__ import annotations

import uuid
from bisect import bisect_right
from calendar import monthrange
from collections.abc import Iterator
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_amount
from app.db.session import SessionLocal, commit_off_loop
from app.models.enums import ImportStatus
from app.models.imports import Import
from app.models.reference import Scheme, NavHistory
from app.models.snapshot import PortfolioSnapshot
from app.models.user import HouseholdMember
from app.services.dashboard.holdings import FifoState, _load_folio_transactions, _LOT_CONSUMING_TYPES
from app.services.dashboard.nav import warm_nav_history
from app.services.dashboard.schemas import SnapshotRow


def _month_end(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def last_completed_month_end() -> date:
    return date.today().replace(day=1) - timedelta(days=1)


def _iter_month_ends(start: date, end: date) -> Iterator[date]:
    year, month = start.year, start.month
    while _month_end(year, month) <= end:
        yield _month_end(year, month)
        month += 1
        if month > 12:
            month = 1
            year += 1


def _data_version(db: Session, member_id: uuid.UUID) -> int:
    latest = db.query(func.max(Import.confirmed_at)).filter(
        Import.household_member_id == member_id, Import.status == ImportStatus.CONFIRMED).scalar()
    if latest is None:
        return 0
    latest = latest.replace(tzinfo=timezone.utc) if latest.tzinfo is None else latest
    delta = latest - datetime(1970,1,1,tzinfo=timezone.utc)
    return (delta.days*86400 + delta.seconds)*1000 + delta.microseconds//1000


async def _compute_member_months(db: Session, member_id: uuid.UUID) -> list[PortfolioSnapshot]:
    folios, by_folio = _load_folio_transactions(db, [member_id])
    if not any(by_folio.values()):
        return []
    schemes = {s.id:s for s in db.query(Scheme).filter(Scheme.id.in_({f.scheme_id for f in folios})).all()}
    await warm_nav_history(db, [s for s in schemes.values() if s.amfi_code])
    # Warming may commit and expire every ORM row. Capture the version before
    # reloading events, so a racing confirm can only make this batch stale.
    version = _data_version(db, member_id)
    folios, by_folio = _load_folio_transactions(db, [member_id])
    events = sorted((t for ts in by_folio.values() for t in ts),
                    key=lambda t:(t.date, t.type in _LOT_CONSUMING_TYPES, t.id))
    if not events:
        return []
    schemes = {s.id:s for s in db.query(Scheme).filter(Scheme.id.in_({f.scheme_id for f in folios})).all()}
    series = {sid:[] for sid in schemes}
    for row in db.query(NavHistory).filter(NavHistory.scheme_id.in_(schemes)).order_by(NavHistory.date).all():
        # A 0 NAV is real (a written-off segregated portfolio, kfin_pk_10yr),
        # and the dashboard values it at 0; skipping it would carry the last
        # positive NAV forward forever (Phase 6 Task 12).
        if row.nav >= 0:
            series[row.scheme_id].append((row.date,row.nav))
    dates = {sid:[day for day,_ in values] for sid,values in series.items()}
    states = {f.id:FifoState() for f in folios}
    out, i = [], 0
    for month_end in _iter_month_ends(events[0].date, last_completed_month_end()):
        while i < len(events) and events[i].date <= month_end:
            states[events[i].folio_id].apply(events[i])
            i += 1
        value, invested, missing = Decimal(0), Decimal(0), set()
        for folio in folios:
            state = states[folio.id]
            if state.units <= 0:
                continue
            invested += state.cost
            index = bisect_right(dates[folio.scheme_id], month_end)-1
            if index < 0:
                missing.add(str(folio.scheme_id))
            else:
                value += state.units * series[folio.scheme_id][index][1]
        out.append(PortfolioSnapshot(household_member_id=member_id, snapshot_month=month_end,
                                     total_value=quantize_amount(value), invested_value=quantize_amount(invested), is_partial=bool(missing),
                                     missing_scheme_ids=sorted(missing) or None, data_version=version,
                                     computed_at=datetime.now(timezone.utc)))
    return out


async def rebuild_member_snapshots(member_id: uuid.UUID) -> int:
    with SessionLocal() as db:
        if db.get(HouseholdMember, member_id) is None:
            return 0
        rows = await _compute_member_months(db, member_id)
        invalidate_member_snapshots(db, [member_id])
        db.add_all(rows)
        await commit_off_loop(db)
        return len(rows)


async def get_snapshots(db: Session, household_member_ids: list[uuid.UUID]) -> list[SnapshotRow]:
    out = []
    for member_id in household_member_ids:
        member = db.get(HouseholdMember, member_id)
        if member is None:
            continue
        rows = db.query(PortfolioSnapshot).filter_by(household_member_id=member_id).order_by(PortfolioSnapshot.snapshot_month).all()
        version = _data_version(db, member_id)
        if (not rows or any(r.data_version < version for r in rows)
                or rows[-1].snapshot_month < last_completed_month_end() or any(r.is_partial for r in rows)):
            rows = await _compute_member_months(db, member_id)
            invalidate_member_snapshots(db, [member_id])
            db.add_all(rows)
            await commit_off_loop(db)
            rows = db.query(PortfolioSnapshot).filter_by(household_member_id=member_id).order_by(PortfolioSnapshot.snapshot_month).all()
        missing_ids = {uuid.UUID(sid) for r in rows for sid in (r.missing_scheme_ids or [])}
        names = {str(s.id):s.name for s in db.query(Scheme).filter(Scheme.id.in_(missing_ids)).all()} if missing_ids else {}
        for row in rows:
            out.append(SnapshotRow(household_member_id=str(member_id), household_member_name=member.name,
                                   snapshot_month=row.snapshot_month, total_value=f"{row.total_value:.2f}",
                                   invested_value=f"{row.invested_value:.2f}" if row.invested_value is not None else None,
                                   is_partial=row.is_partial,
                                   missing_scheme_names=[names[sid] for sid in (row.missing_scheme_ids or []) if sid in names]))
    return out


def invalidate_member_snapshots(db: Session, household_member_ids: list[uuid.UUID]) -> int:
    """Drops the cached month-end values of these members so the next request
    recomputes them (data under them changed: a merge, a deletion). Does not
    commit -- callers persist it atomically with the change that made it stale."""
    if not household_member_ids:
        return 0
    return (
        db.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.household_member_id.in_(household_member_ids))
        .delete(synchronize_session=False)
    )
