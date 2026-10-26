from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from sqlalchemy.orm import Session

from app.models.enums import SchemeSource
from app.models.reference import Scheme
from app.models.user import User
from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.member_details import require_member
from app.services.dashboard.schemas import HoldingRow
from app.services.home.movers import FundInput, Movers, compute_movers, load_sector_weights
from app.services.home.schemas import MemberOut, MissingFund
from app.services.home.series import (
    ValueSeries, build_value_series, load_navs_by_scheme, load_prior_prices,
)
from app.services.home.units import build_units_timeline


@dataclass(frozen=True)
class ScopeContext:
    scope: Literal["aggregate", "member"]
    member_id: uuid.UUID | None
    member_ids: tuple[uuid.UUID, ...]
    members: tuple[MemberOut, ...]
    member_name: str | None


@dataclass(frozen=True)
class HomeInputs:
    holdings: tuple[HoldingRow, ...]
    funds: tuple[FundInput, ...]
    movers: Movers
    series: ValueSeries
    nav_as_of: date | None
    partial: bool
    missing_funds: tuple[MissingFund, ...]


def resolve_scope(
    db: Session,
    user: User,
    member_id: uuid.UUID | None,
) -> ScopeContext:
    household = sorted(
        list_household_members(db, user.id),
        key=lambda member: (member.created_at, str(member.id)),
    )
    status_by_id = {status.id: status for status in get_member_statuses(db, user.id)}
    members = tuple(
        MemberOut(
            id=str(member.id),
            name=member.name,
            has_data=status_by_id[str(member.id)].has_data,
        )
        for member in household
    )
    if member_id is None:
        return ScopeContext(
            scope="aggregate",
            member_id=None,
            member_ids=tuple(member.id for member in household),
            members=members,
            member_name=None,
        )
    member = require_member(db, user.id, member_id)
    return ScopeContext(
        scope="member",
        member_id=member.id,
        member_ids=(member.id,),
        members=members,
        member_name=member.name,
    )


def _calendar_days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


def _active_in_window(points: Sequence[tuple[date, Decimal]], start: date) -> bool:
    """True when the units timeline has units on the books at `start` or at any later date."""
    units_at_start = Decimal("0")
    for changed_on, units in points:
        if changed_on <= start:
            units_at_start = units
        elif units > 0:
            return True
    return units_at_start > 0


def _feed_gap_days(
    newest_prices: dict[uuid.UUID, tuple[date, Decimal]],
    statement_priced_ids: Collection[uuid.UUID],
    today: date,
) -> int:
    """Whole days between `today` and the newest stored price of the funds that have a daily feed.

    Funds priced from statements are left out (their prices are weeks apart by nature and must not decide what
    "latest" means for the daily ones); a household of statement-priced funds only falls back to all of them."""
    daily = [day for scheme_id, (day, _price) in newest_prices.items() if scheme_id not in statement_priced_ids]
    days = daily or [day for day, _price in newest_prices.values()]
    return max(0, (today - max(days)).days) if days else 0


async def load_home_inputs(
    db: Session,
    ctx: ScopeContext,
    today: date,
    *,
    nav_start: date,
    view: Literal["fund", "category", "sector"] = "sector",
) -> HomeInputs:
    # Stored prices only: a GET must neither wait on the live feed nor write a price (register C84, review F6).
    holdings = tuple(
        await compute_holdings(db, list(ctx.member_ids), allow_stale_today=True, stored_only=True)
    )
    by_scheme: dict[uuid.UUID, HoldingRow] = {}
    for row in holdings:
        by_scheme.setdefault(uuid.UUID(row.scheme_id), row)
    held_scheme_ids = set(by_scheme)
    # Every fund the scope held at any time inside the window, not only today's: a fund sold or switched out
    # in the period has cash flows in it, so its value must be in the series too (review F1).
    units = build_units_timeline(db, ctx.member_ids)
    # Every window below is measured back from the newest stored price, not from the clock: when the feed has
    # stopped, the series and the day's change are still built on the last day that has prices (review L15).
    not_held = set(units) - held_scheme_ids
    schemes_not_held = (
        {scheme.id: scheme for scheme in db.query(Scheme).filter(Scheme.id.in_(not_held)).all()}
        if not_held else {}
    )
    statement_priced_ids = {
        scheme_id for scheme_id, row in by_scheme.items() if row.price_from_statement
    } | {
        scheme_id for scheme_id, scheme in schemes_not_held.items() if scheme.source == SchemeSource.CAS_ONLY
    }
    nav_start -= timedelta(days=_feed_gap_days(
        load_prior_prices(db, set(units) | held_scheme_ids, today), statement_priced_ids, today
    ))
    active_scheme_ids = {
        scheme_id for scheme_id, points in units.items() if _active_in_window(points, nav_start)
    } | held_scheme_ids
    others = {
        scheme_id: schemes_not_held[scheme_id]
        for scheme_id in active_scheme_ids - held_scheme_ids if scheme_id in schemes_not_held
    }
    names = {scheme_id: row.scheme_name for scheme_id, row in by_scheme.items()}
    names.update({scheme_id: scheme.name for scheme_id, scheme in others.items()})
    navs = load_navs_by_scheme(db, active_scheme_ids, nav_start, today)
    # A fund whose prices are weeks apart (statement-priced) needs the price that was current at the window's
    # start, which the ten-day look-back does not reach.
    lacking = {
        scheme_id for scheme_id in active_scheme_ids
        if not any(price_date <= nav_start for price_date, _price in navs.get(scheme_id, ()))
    }
    for scheme_id, (price_date, price) in load_prior_prices(db, lacking, nav_start).items():
        navs[scheme_id] = [(price_date, price), *navs.get(scheme_id, [])]
    sector_weights = (
        load_sector_weights(db, held_scheme_ids, today) if view == "sector" else {}
    )

    funds = []
    for scheme_id in sorted(active_scheme_ids, key=lambda key: (names.get(key, ""), str(key))):
        row = by_scheme.get(scheme_id)
        scheme = others.get(scheme_id)
        daily_navs = list(navs.get(scheme_id, ()))
        from_statement = bool(row.price_from_statement) if row else scheme.source == SchemeSource.CAS_ONLY
        statement_priced = from_statement or not daily_navs
        # A statement-priced fund keeps every statement price stored for it (review F4); the single latest
        # price on its holdings row is only the fallback when nothing is stored.
        if (
            not daily_navs
            and row is not None
            and row.current_nav is not None
            and row.current_nav_date is not None
        ):
            daily_navs = [(row.current_nav_date, Decimal(row.current_nav))]
        funds.append(FundInput(
            scheme_id=scheme_id,
            name=names[scheme_id],
            category=((row.sebi_category if row else scheme.sebi_category) or ""),
            units_timeline=units.get(scheme_id, ()),
            navs=daily_navs,
            statement_priced=statement_priced,
            sector_weights=sector_weights.get(scheme_id),
        ))

    movers = compute_movers(funds, today, view)
    dates = _calendar_days(nav_start, today) if nav_start <= today else []
    series = build_value_series(
        {scheme_id: units[scheme_id] for scheme_id in active_scheme_ids if scheme_id in units},
        {scheme_id: navs.get(scheme_id, []) for scheme_id in active_scheme_ids},
        dates,
    )
    missing_ids = {
        scheme_id for scheme_id, row in by_scheme.items() if row.nav_unavailable
    }
    missing_ids.update(movers.stale_scheme_ids)
    missing_ids.update(movers.missing_scheme_ids)
    missing_ids.update(series.missing_schemes)
    missing_funds = tuple(sorted(
        (
            MissingFund(scheme_id=str(scheme_id), name=names.get(scheme_id, str(scheme_id)))
            for scheme_id in missing_ids
        ),
        key=lambda item: (item.name, item.scheme_id),
    ))
    partial = bool(missing_funds) or movers.partial or series.partial
    return HomeInputs(
        holdings=holdings,
        funds=tuple(funds),
        movers=movers,
        series=series,
        nav_as_of=movers.as_of_nav_date,
        partial=partial,
        missing_funds=missing_funds,
    )
