"""Monthly portfolio value snapshots — backfillable historically, per
PRD-03 FR-8, since mfapi.in provides full historical NAV per scheme. First
request for a member computes every missing month-end into
portfolio_snapshots; subsequent requests read the cached rows."""

from __future__ import annotations

import uuid
from calendar import monthrange
from collections.abc import Iterator
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.snapshot import PortfolioSnapshot
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.dashboard.holdings import _LOT_CONSUMING_TYPES, _process_folio_lots
from app.services.dashboard.nav import get_nav_on_or_before
from app.services.dashboard.schemas import SnapshotRow


def _month_end(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def _iter_month_ends(start: date, end: date) -> Iterator[date]:
    year, month = start.year, start.month
    while True:
        month_end = _month_end(year, month)
        if month_end > end:
            break
        yield month_end
        month += 1
        if month > 12:
            month = 1
            year += 1


async def get_snapshots(db: Session, household_member_ids: list[uuid.UUID]) -> list[SnapshotRow]:
    rows: list[SnapshotRow] = []

    for member_id in household_member_ids:
        member = db.get(HouseholdMember, member_id)
        if member is None:
            continue

        folios = db.query(Folio).filter(Folio.household_member_id == member_id).all()
        if not folios:
            continue

        transactions_by_folio = {
            folio.id: (
                db.query(Transaction)
                .filter(Transaction.folio_id == folio.id)
                .order_by(
                    Transaction.date,
                    # Same-date purchases must sort before redemptions —
                    # same fix as holdings.py: Transaction.id is a random
                    # uuid4, so an id-only tiebreak would let a same-day
                    # redemption randomly process first and silently
                    # under-consume (no lots to draw from).
                    case((Transaction.type.in_(_LOT_CONSUMING_TYPES), 1), else_=0),
                    Transaction.id,
                )
                .all()
            )
            for folio in folios
        }
        all_dates = [t.date for txns in transactions_by_folio.values() for t in txns]
        if not all_dates:
            continue
        first_date = min(all_dates)

        cached = {
            s.snapshot_month: s.total_value
            for s in db.query(PortfolioSnapshot).filter(PortfolioSnapshot.household_member_id == member_id).all()
        }

        for month_end in _iter_month_ends(first_date, date.today()):
            if month_end in cached:
                rows.append(
                    SnapshotRow(
                        household_member_id=str(member_id),
                        household_member_name=member.name,
                        snapshot_month=month_end,
                        total_value=str(cached[month_end]),
                    )
                )
                continue

            total_value = Decimal("0")
            nav_unavailable = False
            for folio in folios:
                txns_to_date = [t for t in transactions_by_folio[folio.id] if t.date <= month_end]
                units_held, _cost_basis, _realized = _process_folio_lots(txns_to_date)
                if units_held == 0:
                    continue
                scheme = db.get(Scheme, folio.scheme_id)
                nav_result = await get_nav_on_or_before(db, scheme, month_end)
                if nav_result is None:
                    nav_unavailable = True
                    break
                nav, _actual_date = nav_result
                total_value += units_held * nav

            if nav_unavailable:
                # Don't cache/persist an understated value for this month —
                # leave it uncomputed so a later request (once NAV data is
                # available) can retry, instead of permanently serving a
                # silently-wrong financial figure. Matches this function's
                # existing precedent for "no data point" (never a zero).
                continue

            snapshot = PortfolioSnapshot(
                household_member_id=member_id, snapshot_month=month_end,
                total_value=total_value, computed_at=datetime.now(timezone.utc),
            )
            db.add(snapshot)
            await commit_off_loop(db)
            rows.append(
                SnapshotRow(
                    household_member_id=str(member_id), household_member_name=member.name,
                    snapshot_month=month_end, total_value=str(total_value),
                )
            )
    return rows
