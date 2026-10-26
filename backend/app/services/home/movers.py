from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal
from fractions import Fraction
from typing import Literal, TypeVar

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.models.enums import DisclosureBatchStatus
from app.models.reference import DisclosureBatch, SchemeHolding, StockMaster


K = TypeVar("K")
CENT = Decimal("0.01")


@dataclass(frozen=True)
class FundInput:
    scheme_id: uuid.UUID
    name: str
    category: str
    units_timeline: Sequence[tuple[date, Decimal]]
    navs: Sequence[tuple[date, Decimal]]
    statement_priced: bool = False
    sector_weights: Mapping[str, Decimal] | None = None


@dataclass(frozen=True)
class FundChange:
    scheme_id: uuid.UUID
    name: str
    category: str
    change: Decimal
    current_value: Decimal
    previous_value: Decimal


@dataclass(frozen=True)
class MoverBar:
    key: str
    label: str
    change: Decimal
    scheme_ids: tuple[uuid.UUID, ...]


@dataclass(frozen=True)
class MoversView:
    gains: tuple[MoverBar, ...]
    losses: tuple[MoverBar, ...]
    others_count: int
    others_change: Decimal


@dataclass(frozen=True)
class Movers:
    requested_view: Literal["fund", "category", "sector"]
    view: Literal["fund", "category", "sector"]
    fell_back: bool
    estimated: bool
    coverage_pct: Decimal | None
    net_change: Decimal
    previous_value: Decimal
    net_pct: Decimal | None
    as_of_nav_date: date | None
    previous_nav_date: date | None
    partial: bool
    stale_scheme_ids: tuple[uuid.UUID, ...]
    missing_scheme_ids: tuple[uuid.UUID, ...]
    funds: tuple[FundChange, ...]
    result: MoversView


def _money(value: Decimal) -> Decimal:
    value = value.quantize(CENT)
    return Decimal("0.00") if value.is_zero() else value


def _zero(value: Decimal) -> Decimal:
    return abs(value) if value.is_zero() else value


def distribute_cents(exact: Mapping[K, Decimal]) -> tuple[dict[K, Decimal], Decimal]:
    if not exact:
        return {}, Decimal("0.00")
    # Floor first (including negatives), then award the residual cents by
    # largest remainder. This makes independently displayed fund amounts add
    # back to the rounded portfolio headline exactly.
    floors = {key: value.quantize(CENT, rounding=ROUND_FLOOR) for key, value in exact.items()}
    total = _money(sum(exact.values(), Decimal("0")).quantize(CENT, rounding=ROUND_HALF_UP))
    missing = int((total - sum(floors.values(), Decimal("0"))) / CENT)
    ranked = sorted(exact, key=lambda key: (-(exact[key] - floors[key]), str(key)))
    result = dict(floors)
    for key in ranked[:missing]:
        result[key] += CENT
    return {key: _money(value) for key, value in result.items()}, total


def spread_cents(total: Decimal, weights: Mapping[K, Decimal]) -> dict[K, Decimal]:
    positive = {key: weight for key, weight in weights.items() if weight > 0}
    result = {key: Decimal("0.00") for key in weights}
    if total.is_zero() or not positive:
        return result
    weight_total = sum(positive.values(), Decimal("0"))
    # Exact fractions, not Decimal division: a repeating share (a third of a cent) must tie exactly
    # with its peers so the key order decides, instead of 28-digit rounding noise.
    total_cents = int((abs(total) / CENT).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    exact = {key: Fraction(total_cents) * Fraction(weight) / Fraction(weight_total) for key, weight in positive.items()}
    cents = {key: share.numerator // share.denominator for key, share in exact.items()}
    ranked = sorted(exact, key=lambda key: (-(exact[key] - cents[key]), str(key)))
    for key in ranked[: total_cents - sum(cents.values())]:
        cents[key] += 1
    sign = Decimal("-1") if total < 0 else Decimal("1")
    for key, count in cents.items():
        result[key] = _money(Decimal(count) * CENT * sign)
    return result


def _value_at(points: Sequence[tuple[date, Decimal]], on_date: date) -> Decimal:
    value = Decimal("0")
    for changed_on, candidate in points:
        if changed_on > on_date:
            break
        value = candidate
    return value


def _nav_context(fund: FundInput, as_of: date):
    available = [(day, nav) for day, nav in fund.navs if day <= as_of]
    latest = available[-1] if available else None
    previous = available[-2] if len(available) > 1 else None
    current_units = _value_at(fund.units_timeline, latest[0] if latest else as_of)
    previous_units = _value_at(fund.units_timeline, previous[0]) if previous else Decimal("0")
    eligible = previous_units > 0 or current_units > 0
    return latest, previous, current_units, previous_units, eligible


def _make_view(bars: Sequence[MoverBar]) -> MoversView:
    gains = tuple(sorted((bar for bar in bars if bar.change > 0),
                         key=lambda bar: (-bar.change, bar.label))[:2])
    losses = tuple(sorted((bar for bar in bars if bar.change < 0),
                          key=lambda bar: (bar.change, bar.label))[:2])
    shown = {bar.key for bar in (*gains, *losses)}
    others = [bar for bar in bars if bar.key not in shown]
    return MoversView(
        gains=gains,
        losses=losses,
        others_count=len(others),
        others_change=_money(sum((bar.change for bar in others), Decimal("0"))),
    )


def _bars_for_view(
    view: Literal["fund", "category", "sector"],
    included: Sequence[FundInput],
    changes: Mapping[uuid.UUID, Decimal],
) -> list[MoverBar]:
    if view == "fund":
        return [
            MoverBar(
                key=str(fund.scheme_id), label=fund.name, change=changes[fund.scheme_id],
                scheme_ids=(fund.scheme_id,) if changes[fund.scheme_id] else (),
            )
            for fund in included
        ]

    amounts: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    contributors: dict[str, set[uuid.UUID]] = defaultdict(set)
    if view == "category":
        for fund in included:
            label = fund.category or "Other"
            amount = changes[fund.scheme_id]
            amounts[label] += amount
            if amount:
                contributors[label].add(fund.scheme_id)
    else:
        for fund in included:
            weights = {key: value for key, value in (fund.sector_weights or {}).items() if value > 0}
            if not weights:
                weights = {"Other": Decimal("1")}
            parts = spread_cents(changes[fund.scheme_id], weights)
            for label, amount in parts.items():
                amounts[label] += amount
                if amount:
                    contributors[label].add(fund.scheme_id)
    return [
        MoverBar(
            key=label,
            label=label,
            change=_money(amount),
            scheme_ids=tuple(sorted(contributors[label], key=str)),
        )
        for label, amount in amounts.items()
    ]


PRICE_DAY_COVERAGE = Decimal("0.5")
PRICE_DAY_LOOKBACK = 15
# The longest gap between the clock and a daily-priced fund's newest price that still counts as current: a long
# weekend with a holiday is five days, so ten leaves room without hiding a feed that has stopped.
STALE_FEED_DAYS = 10


def _price_day(funds: Sequence[FundInput], as_of: date) -> date | None:
    """The day the day's change is measured on (register C103).

    Normally the latest price date, but some fund houses publish prices for weekend month-ends; on such a morning
    that date is the latest across funds yet covers a sliver of the portfolio, and every other fund would count
    as stale. So: the latest recent date on which funds holding at least half of the portfolio's value (at their
    own latest prices) have a price; the others use their latest price on or before it. `None` when no fund has
    a daily price at all."""
    weights: dict[uuid.UUID, Decimal] = {}
    dates: dict[uuid.UUID, set[date]] = {}
    for fund in funds:
        if fund.statement_priced:
            continue
        latest, _previous, current_units, _previous_units, eligible = _nav_context(fund, as_of)
        if not eligible or latest is None:
            continue
        weights[fund.scheme_id] = current_units * latest[1]
        dates[fund.scheme_id] = {day for day, _nav in fund.navs if day <= as_of}
    if not dates:
        return None
    candidates = sorted(set().union(*dates.values()), reverse=True)[:PRICE_DAY_LOOKBACK]
    total = sum(weights.values(), Decimal("0"))
    if total <= 0:
        return candidates[0]
    for day in candidates:
        covered = sum((weights[key] for key, days in dates.items() if day in days), Decimal("0"))
        if covered >= total * PRICE_DAY_COVERAGE:
            return day
    return candidates[0]


def compute_movers(
    funds: Sequence[FundInput],
    as_of: date,
    view: Literal["fund", "category", "sector"] = "sector",
) -> Movers:
    price_day = _price_day(funds, as_of)
    contexts = {fund.scheme_id: _nav_context(fund, price_day or as_of) for fund in funds}
    eligible = [fund for fund in funds if contexts[fund.scheme_id][4]]
    # A fund priced only from statements has no daily price to compare: it never sets the as-of day and is never
    # "stale" (its change is zero by rule); it still counts in the value the percentage is measured against.
    priced = [fund for fund in eligible if not fund.statement_priced]
    dated = [contexts[fund.scheme_id][0][0] for fund in priced if contexts[fund.scheme_id][0]]
    if not dated:
        dated = [contexts[fund.scheme_id][0][0] for fund in eligible if contexts[fund.scheme_id][0]]
    as_of_nav_date = max(dated) if dated else None
    included = [
        fund for fund in eligible
        if contexts[fund.scheme_id][0] and (
            contexts[fund.scheme_id][0][0] == as_of_nav_date or fund.statement_priced
        )
    ]
    # A fund with no units today (sold or switched out after its price feed ended) has nothing left to price: it
    # is not stale, however old its last price is (review N2).
    # A fund is also stale when its newest price is more than STALE_FEED_DAYS older than the clock, even if every
    # other fund is just as old (a feed that stopped): the numbers are then correct as of that date, and `partial`
    # says they are not today's (review L15).
    stale = tuple(sorted((
        fund.scheme_id for fund in priced
        if contexts[fund.scheme_id][0] and (
            contexts[fund.scheme_id][0][0] != as_of_nav_date
            or (as_of - contexts[fund.scheme_id][0][0]).days > STALE_FEED_DAYS
        )
        and _value_at(fund.units_timeline, as_of) > 0
    ), key=str))
    missing = tuple(sorted((
        fund.scheme_id for fund in eligible if contexts[fund.scheme_id][0] is None
    ), key=str))

    exact_changes = {}
    current_values = {}
    previous_values = {}
    previous_dates = []
    for fund in included:
        latest, previous, current_units, previous_units, _ = contexts[fund.scheme_id]
        current_values[fund.scheme_id] = _zero(current_units * latest[1])
        if fund.statement_priced:
            # Its change is zero by rule, so the value it started the day with is the value it has: the units
            # held at the latest price date at that price. Taking the units at the previous statement date left
            # a fund with one price out of the base entirely, and ignored units added since that statement,
            # which overstated every percentage (review N1).
            previous_values[fund.scheme_id] = current_values[fund.scheme_id]
        else:
            previous_values[fund.scheme_id] = _zero(previous_units * previous[1]) if previous else Decimal("0")
        exact_changes[fund.scheme_id] = (
            Decimal("0") if fund.statement_priced or previous is None
            else previous_units * (latest[1] - previous[1])
        )
        if previous and not fund.statement_priced:
            previous_dates.append(previous[0])
    changes, net_change = distribute_cents(exact_changes)
    fund_changes = tuple(sorted((
        FundChange(
            scheme_id=fund.scheme_id,
            name=fund.name,
            category=fund.category,
            change=changes[fund.scheme_id],
            current_value=current_values[fund.scheme_id],
            previous_value=previous_values[fund.scheme_id],
        )
        for fund in included
    ), key=lambda fund: (-abs(fund.change), fund.name)))
    previous_value = _zero(sum(previous_values.values(), Decimal("0")))
    net_pct = None
    if previous_value > 0:
        net_pct = _zero((net_change / previous_value * Decimal("100")).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        ))

    coverage_pct = None
    actual_view = view
    fell_back = False
    if view == "sector":
        total_value = sum(current_values.values(), Decimal("0"))
        covered_value = Decimal("0")
        for fund in included:
            mapped = sum((weight for label, weight in (fund.sector_weights or {}).items()
                          if label != "Other" and weight > 0), Decimal("0"))
            covered_value += current_values[fund.scheme_id] * min(mapped, Decimal("100")) / Decimal("100")
        coverage = covered_value / total_value * Decimal("100") if total_value > 0 else Decimal("0")
        coverage_pct = _zero(coverage.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        if coverage < Decimal("50"):
            actual_view = "category"
            fell_back = True

    bars = _bars_for_view(actual_view, included, changes)
    return Movers(
        requested_view=view,
        view=actual_view,
        fell_back=fell_back,
        estimated=actual_view == "sector",
        coverage_pct=coverage_pct,
        net_change=net_change,
        previous_value=previous_value,
        net_pct=net_pct,
        as_of_nav_date=as_of_nav_date,
        previous_nav_date=max(previous_dates) if previous_dates else None,
        partial=bool(stale or missing),
        stale_scheme_ids=stale,
        missing_scheme_ids=missing,
        funds=fund_changes,
        result=_make_view(bars),
    )


def load_sector_weights(
    db: Session,
    scheme_ids: Collection[uuid.UUID],
    as_of: date,
) -> dict[uuid.UUID, dict[str, Decimal]]:
    if not scheme_ids:
        return {}
    latest = (
        db.query(
            DisclosureBatch.scheme_id.label("scheme_id"),
            func.max(DisclosureBatch.as_of_date).label("as_of_date"),
        )
        .filter(
            DisclosureBatch.scheme_id.in_(scheme_ids),
            DisclosureBatch.status == DisclosureBatchStatus.WRITTEN,
            DisclosureBatch.as_of_date <= as_of,
        )
        .group_by(DisclosureBatch.scheme_id)
        .subquery()
    )
    rows = (
        db.query(DisclosureBatch.scheme_id, SchemeHolding.pct_to_nav, StockMaster.sector)
        .join(latest, and_(
            latest.c.scheme_id == DisclosureBatch.scheme_id,
            latest.c.as_of_date == DisclosureBatch.as_of_date,
        ))
        .join(SchemeHolding, SchemeHolding.batch_id == DisclosureBatch.id)
        .outerjoin(StockMaster, StockMaster.isin == SchemeHolding.isin)
        .filter(DisclosureBatch.status == DisclosureBatchStatus.WRITTEN)
        .all()
    )
    result: dict[uuid.UUID, dict[str, Decimal]] = defaultdict(
        lambda: defaultdict(lambda: Decimal("0"))
    )
    for scheme_id, weight, sector in rows:
        # sector_raw is deliberately ignored: debt rows use it for ratings.
        label = sector.strip() if sector and sector.strip() else "Other"
        result[scheme_id][label] += weight
    return {scheme_id: dict(weights) for scheme_id, weights in result.items()}
