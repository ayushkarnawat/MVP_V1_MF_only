"""Fresh month-end snapshots from one FIFO pass and bulk NAV history."""
from __future__ import annotations

import uuid
from bisect import bisect_right
from calendar import monthrange
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_amount
from app.db.session import SessionLocal, commit_off_loop
from app.models.enums import ImportStatus, TransactionType
from app.models.imports import Import
from app.models.reference import Scheme, NavHistory
from app.models.snapshot import PortfolioSnapshot
from app.models.user import HouseholdMember
from app.services.dashboard.holdings import FifoState, _load_folio_transactions, _LOT_CONSUMING_TYPES
from app.services.dashboard.nav import warm_nav_history
from app.services.dashboard.schemas import MonthDetail, MonthFundRow, SnapshotRow
from app.services.dashboard.household_members import list_household_members
from app.services.analytics.investment_withdrawal import direction_for
from app.services.lot_rules import paid_amount


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


@dataclass
class FundMonthValue:
    scheme_id: uuid.UUID
    scheme_name: str
    units: Decimal
    nav: Decimal | None
    nav_date: date | None
    value: Decimal
    cost: Decimal
    priced: bool


def value_month(month_end: date, folios, states: dict, schemes: dict, series: dict, dates: dict) -> list[FundMonthValue]:
    rows = []
    for folio in folios:
        state = states[folio.id]
        if state.units <= 0:
            continue
        index = bisect_right(dates[folio.scheme_id], month_end) - 1
        priced = index >= 0
        nav_date, nav = series[folio.scheme_id][index] if priced else (None, None)
        rows.append(FundMonthValue(
            scheme_id=folio.scheme_id, scheme_name=schemes[folio.scheme_id].name,
            units=state.units, nav=nav, nav_date=nav_date,
            value=state.units * nav if priced else Decimal("0"),
            cost=state.cost if priced else Decimal("0"), priced=priced,
        ))
    return rows


async def _prepare_months(db: Session, member_id: uuid.UUID, *, warm: bool = True, through: date | None = None):
    """`warm=False, through=<month>` is the click-time path: no network price fetch and no commit
    (the History page already warmed and stored the months), and only NAVs up to that month are read."""
    folios, by_folio = _load_folio_transactions(db, [member_id])
    if not any(by_folio.values()):
        return None
    schemes = {s.id:s for s in db.query(Scheme).filter(Scheme.id.in_({f.scheme_id for f in folios})).all()}
    if warm:
        await warm_nav_history(db, [s for s in schemes.values() if s.amfi_code])
    # Warming may commit and expire every ORM row. Capture the version before
    # reloading events, so a racing confirm can only make this batch stale.
    version = _data_version(db, member_id)
    if warm:
        folios, by_folio = _load_folio_transactions(db, [member_id])
    events = sorted((t for ts in by_folio.values() for t in ts),
                    key=lambda t:(t.date, t.type in _LOT_CONSUMING_TYPES, t.id))
    if not events:
        return None
    if warm:
        schemes = {s.id:s for s in db.query(Scheme).filter(Scheme.id.in_({f.scheme_id for f in folios})).all()}
    series = {sid:[] for sid in schemes}
    nav_query = db.query(NavHistory).filter(NavHistory.scheme_id.in_(schemes))
    if through is not None:
        nav_query = nav_query.filter(NavHistory.date <= through)
    for row in nav_query.order_by(NavHistory.date).all():
        # A 0 NAV is real (a written-off segregated portfolio, kfin_pk_10yr),
        # and the dashboard values it at 0; skipping it would carry the last
        # positive NAV forward forever (Phase 6 Task 12).
        if row.nav >= 0:
            series[row.scheme_id].append((row.date,row.nav))
    dates = {sid:[day for day,_ in values] for sid,values in series.items()}
    return folios, events, schemes, series, dates, version


def _walk_months(context, through: date):
    """The one FIFO replay used by stored snapshots and click-time details."""
    folios, events, schemes, series, dates, _ = context
    states = {f.id: FifoState() for f in folios}
    i = 0
    for month_end in _iter_month_ends(events[0].date, through):
        start = i
        while i < len(events) and events[i].date <= month_end:
            states[events[i].folio_id].apply(events[i])
            i += 1
        held = [f for f in folios if states[f.id].units > 0]
        values = value_month(month_end, held, states, schemes, series, dates)
        yield month_end, list(zip(held, values)), events[start:i]


async def _compute_member_months(db: Session, member_id: uuid.UUID) -> list[PortfolioSnapshot]:
    context = await _prepare_months(db, member_id)
    if context is None:
        return []
    out = []
    for month_end, valued, _ in _walk_months(context, last_completed_month_end()):
        values = [row for _, row in valued]
        value = sum((row.value for row in values), Decimal("0"))
        invested = sum((row.cost for row in values), Decimal("0"))
        missing = {str(row.scheme_id) for row in values if not row.priced}
        out.append(PortfolioSnapshot(household_member_id=member_id, snapshot_month=month_end,
                                     total_value=quantize_amount(value), invested_value=quantize_amount(invested), is_partial=bool(missing),
                                     missing_scheme_ids=sorted(missing) or None, data_version=context[-1],
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


def _money(value: Decimal) -> str:
    return f"{quantize_amount(value):.2f}"


def _fund_values(valued) -> dict:
    """Combine a member's folios, retaining the snapshot's rounding total."""
    grouped = {}
    for _, row in valued:
        if row.scheme_id not in grouped:
            grouped[row.scheme_id] = FundMonthValue(row.scheme_id, row.scheme_name, row.units,
                row.nav, row.nav_date, row.value, row.cost, row.priced)
        else:
            combined = grouped[row.scheme_id]
            combined.units += row.units
            combined.value += row.value
            combined.cost += row.cost
    priced = [grouped[sid] for sid in sorted(grouped) if grouped[sid].priced]
    for field in ("value", "cost"):
        total = quantize_amount(sum((getattr(r, field) for r in priced), Decimal("0")))
        for row in priced:
            setattr(row, field, quantize_amount(getattr(row, field)))
        difference = total - sum((getattr(r, field) for r in priced), Decimal("0"))
        # Reconcile by at most one paisa per fund, rather than making a tiny
        # fund negative by assigning the whole rounding difference to it.
        for row in priced:
            if not difference:
                break
            adjustment = min(abs(difference), Decimal("0.01")) * (1 if difference > 0 else -1)
            if getattr(row, field) + adjustment >= 0:
                setattr(row, field, getattr(row, field) + adjustment)
                difference -= adjustment
    return grouped


async def get_month_detail(db: Session, member_ids: list[uuid.UUID], month: date) -> MonthDetail | None:
    """A month is available when it is a month-end, not after the last completed month, and some member's
    history has started by then: exactly the months the stored snapshots hold. Derived from the
    transactions, so a click never reads a stale snapshot, rebuilds one, fetches prices or writes."""
    if month != _month_end(month.year, month.month) or month > last_completed_month_end():
        return None
    members = {m.id: m for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(member_ids)).all()}
    contexts = []
    for member_id in member_ids:
        if member_id not in members:
            continue
        context = await _prepare_months(db, member_id, warm=False, through=month)
        if context is not None:
            contexts.append((member_id, context))
    first_ends = [_month_end(c[1][1][0].date.year, c[1][1][0].date.month) for c in contexts]
    if not first_ends or min(first_ends) > month:
        return None
    previous_month = month.replace(day=1) - timedelta(days=1) if month > min(first_ends) else None
    rows = []
    switched_in = switched_out = previous_total = Decimal("0")
    for member_id, context in contexts:
        folios, _, schemes, _, _, _ = context
        folio_schemes = {f.id: f.scheme_id for f in folios}
        previous, current, transactions = {}, {}, []
        for day, valued, events in _walk_months(context, month):
            if day == previous_month:
                previous = _fund_values(valued)
            if day == month:
                current, transactions = _fund_values(valued), events
        cash = {}
        for event in transactions:
            sid = folio_schemes[event.folio_id]
            amounts = cash.setdefault(sid, {"new": Decimal("0"), "opening": Decimal("0"), "in": Decimal("0"), "out": Decimal("0"), "gift": Decimal("0")})
            direction = direction_for(event)
            amount = paid_amount(event)
            if direction == "invested":
                amounts["new"] += amount
            elif direction in ("withdrawn", "reversal"):
                amounts["new"] -= amount
            elif direction == "opening":
                amounts["opening"] += amount
            elif direction == "switched_in":
                amounts["in"] += amount
            elif direction == "switched_out":
                amounts["out"] += amount
            elif event.type == TransactionType.GIFT_IN:
                amounts["gift"] += amount  # not money the user put in, but the units change the value
            elif event.type == TransactionType.GIFT_OUT:
                amounts["gift"] -= amount
        previous_total += sum((r.value for r in previous.values() if r.priced), Decimal("0"))
        for sid in sorted(current.keys() | previous.keys() | cash.keys(), key=lambda key: (schemes[key].name, str(key))):
            now, before = current.get(sid), previous.get(sid)
            amounts = cash.get(sid, {"new": Decimal("0"), "opening": Decimal("0"), "in": Decimal("0"), "out": Decimal("0"), "gift": Decimal("0")})
            switched_in += amounts["in"]
            switched_out += amounts["out"]
            priced = now is None or now.priced
            known_change = priced and (before is None or before.priced)
            value = now.value if now else Decimal("0")
            change = value - (before.value if before else Decimal("0"))
            switched = amounts["in"] - amounts["out"]
            rows.append(MonthFundRow(
                scheme_id=str(sid), scheme_name=schemes[sid].name,
                household_member_id=str(member_id), household_member_name=members[member_id].name,
                units=str(now.units) if now else "0", nav=str(now.nav) if now and now.nav is not None else None,
                nav_date=now.nav_date if now else None,
                value=_money(value) if priced else None, cost=_money(now.cost) if now else "0.00",
                change_in_value=_money(change) if known_change else None,
                new_money=_money(amounts["new"]), opening_holdings=_money(amounts["opening"]),
                switched_net=_money(switched), gifts_net=_money(amounts["gift"]), priced=priced,
                market_movement=_money(change - amounts["new"] - amounts["opening"] - switched - amounts["gift"]) if known_change else None,
            ))
    def total(field):
        return sum((Decimal(getattr(row, field)) for row in rows if getattr(row, field) is not None), Decimal("0"))
    partial = any(row.market_movement is None for row in rows)
    return MonthDetail(
        month=month, previous_month=previous_month, total_value=_money(total("value")),
        previous_value=_money(previous_total),
        change=None if partial else _money(total("value") - previous_total),
        new_money=_money(total("new_money")), opening_holdings=_money(total("opening_holdings")),
        switches_net=_money(switched_in - switched_out), gifts_net=_money(total("gifts_net")),
        market_movement=None if partial else _money(total("market_movement")),
        switched_in=_money(switched_in), switched_out=_money(switched_out),
        is_partial=partial, missing_scheme_names=sorted({r.scheme_name for r in rows if r.market_movement is None}),
        funds=rows,
    )


async def get_aggregate_month_detail(db: Session, user_id: uuid.UUID, month: date) -> MonthDetail | None:
    return await get_month_detail(db, [member.id for member in list_household_members(db, user_id)], month)
