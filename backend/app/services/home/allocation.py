from __future__ import annotations

import uuid
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_amount
from app.models.reference import Scheme
from app.services.dashboard.allocation_labels import asset_class_bucket
from app.services.dashboard.holdings import compute_holdings
from app.services.home.movers import spread_cents
from app.services.home.stored import load_fresh_sections, scope_key_for


ALLOCATION_CLASSES: tuple[tuple[str, str, Literal["live", "coming_soon"]], ...] = (
    ("equity", "Equity", "live"),
    ("debt", "Debt", "live"),
    ("gold", "Gold", "live"),
    ("others", "Others", "live"),
    ("direct_stocks", "Direct stocks", "coming_soon"),
    ("fds_bonds", "FDs and bonds", "coming_soon"),
    ("real_estate", "Real estate", "coming_soon"),
    ("us_stocks", "US stocks", "coming_soon"),
)
LIVE_KEYS = ("equity", "debt", "gold", "others")
PERCENT_PLACES = Decimal("0.01")


@dataclass(frozen=True)
class ClassRow:
    key: str
    label: str
    status: Literal["live", "coming_soon"]
    value: Decimal | None
    percentage: Decimal | None


@dataclass(frozen=True)
class MemberValue:
    member_id: uuid.UUID
    name: str
    value: Decimal


@dataclass(frozen=True)
class MemberShare:
    member_id: uuid.UUID
    name: str
    value: Decimal
    percentage: Decimal


@dataclass(frozen=True)
class StoredMix:
    equity: Decimal
    debt: Decimal
    gold: Decimal
    others: Decimal
    total_value: Decimal
    covered_value: Decimal
    nav_as_of: date | None
    computed_at: datetime


@dataclass(frozen=True)
class Allocation:
    source: Literal["analytics", "dashboard_buckets"]
    approximate: bool
    total_value: Decimal
    classes: tuple[ClassRow, ...]
    covered_pct: Decimal | None
    mix_as_of: date | None
    mix_computed_at: datetime | None
    members: tuple[MemberShare, ...] | None


def _zero(value: Decimal) -> Decimal:
    return abs(value) if value.is_zero() else value


def _percentage(value: Decimal, total: Decimal) -> Decimal:
    if total == 0:
        return Decimal("0.00")
    return _zero((value / total * Decimal("100")).quantize(
        PERCENT_PLACES, rounding=ROUND_HALF_UP
    ))


def parse_stored_allocation(
    payload: Mapping[str, Any], computed_at: datetime
) -> StoredMix | None:
    try:
        summary = payload["asset_allocation"] if "asset_allocation" in payload else payload
        if summary["hide_headlines"]:
            return None
        total = Decimal(str(summary["total_portfolio_value"]))
        covered = Decimal(str(summary["covered_value"]))
        nav_value = summary["nav_as_of"]
        nav_as_of = date.fromisoformat(nav_value) if nav_value is not None else None
        class_values = {key: Decimal("0") for key in ("equity", "debt", "gold", "cash_like")}
        for row in summary["as_disclosed"]["classes"]:
            key = row["key"]
            if key in class_values:
                class_values[key] = Decimal(str(row["value"]))
    except (InvalidOperation, KeyError, TypeError, ValueError):
        return None
    if total <= 0 or covered <= 0 or any(value < 0 for value in class_values.values()):
        return None
    computed = computed_at if computed_at.tzinfo is not None else computed_at.replace(tzinfo=timezone.utc)
    return StoredMix(
        equity=class_values["equity"],
        debt=class_values["debt"],
        gold=class_values["gold"],
        others=max(total - class_values["equity"] - class_values["debt"] - class_values["gold"],
                   Decimal("0")),
        total_value=total,
        covered_value=covered,
        nav_as_of=nav_as_of,
        computed_at=computed,
    )


def bucket_class(sebi_category: str) -> Literal["equity", "debt", "gold", "others"]:
    bucket = asset_class_bucket(sebi_category)
    if bucket == "Equity":
        return "equity"
    if bucket == "Debt":
        return "debt"
    category = sebi_category.lower()
    if "gold" in category or "silver" in category:
        return "gold"
    return "others"


def bucket_values(items: Iterable[tuple[Decimal, str]]) -> dict[str, Decimal]:
    result = {key: Decimal("0") for key in LIVE_KEYS}
    for value, category in items:
        result[bucket_class(category)] += value
    return result


def build_allocation(
    *,
    total_value: Decimal,
    mix: StoredMix | None,
    buckets: Mapping[str, Decimal] | None,
    members: Sequence[MemberValue] | None,
) -> Allocation:
    if total_value == 0:
        source: Literal["analytics", "dashboard_buckets"] = "dashboard_buckets"
        approximate = False
        live_values = {key: Decimal("0.00") for key in LIVE_KEYS}
        covered_pct = None
        mix_as_of = None
        mix_computed_at = None
    else:
        weights = None if mix is None else {
            "equity": mix.equity,
            "debt": mix.debt,
            "gold": mix.gold,
            "others": mix.others,
        }
        if weights is not None and sum(weights.values(), Decimal("0")) > 0:
            source = "analytics"
            approximate = False
            live_values = spread_cents(total_value, weights)
            covered_pct = _percentage(mix.covered_value, mix.total_value)
            mix_as_of = mix.nav_as_of
            mix_computed_at = mix.computed_at
        else:
            if buckets is None:
                raise ValueError("buckets are required when no usable stored mix exists")
            live_values = {
                key: _zero(quantize_amount(buckets.get(key, Decimal("0"))))
                for key in LIVE_KEYS
            }
            if sum(live_values.values(), Decimal("0")) != total_value:
                raise ValueError("bucket values must add exactly to total_value")
            source = "dashboard_buckets"
            approximate = True
            covered_pct = None
            mix_as_of = None
            mix_computed_at = None

    classes = tuple(
        ClassRow(
            key=key,
            label=label,
            status=status,
            value=live_values[key] if status == "live" else None,
            percentage=_percentage(live_values[key], total_value) if status == "live" else None,
        )
        for key, label, status in ALLOCATION_CLASSES
    )
    member_rows = None
    if members is not None:
        member_rows = tuple(
            MemberShare(
                member_id=member.member_id,
                name=member.name,
                value=_zero(member.value),
                percentage=_percentage(member.value, total_value),
            )
            for member in members
        )
    return Allocation(
        source=source,
        approximate=approximate,
        total_value=total_value,
        classes=classes,
        covered_pct=covered_pct,
        mix_as_of=mix_as_of,
        mix_computed_at=mix_computed_at,
        members=member_rows,
    )


async def load_allocation(
    db: Session,
    user_id: uuid.UUID,
    *,
    scope: Literal["aggregate", "member"],
    household_member_ids: Sequence[uuid.UUID],
    members: Sequence[tuple[uuid.UUID, str]],
) -> Allocation:
    rows = await compute_holdings(
        db, list(household_member_ids), allow_stale_today=True
    )
    valued_rows = [
        (row, quantize_amount(Decimal(row.current_value)))
        for row in rows
        if not row.nav_unavailable and row.current_value is not None
    ]
    total_value = sum((value for _, value in valued_rows), Decimal("0.00"))

    member_values = None
    if scope == "aggregate" and len(members) > 1:
        by_member = {member_id: Decimal("0.00") for member_id, _ in members}
        for row, value in valued_rows:
            member_id = uuid.UUID(row.household_member_id)
            if member_id in by_member:
                by_member[member_id] += value
        member_values = [
            MemberValue(member_id, name, by_member[member_id])
            for member_id, name in members
        ]

    if total_value == 0:
        return build_allocation(
            total_value=Decimal("0.00"), mix=None, buckets=None, members=member_values
        )

    scope_key = scope_key_for(scope, household_member_ids)
    sections = load_fresh_sections(
        db,
        user_id,
        scope_key=scope_key,
        sections=["asset_allocation"],
        household_member_ids=household_member_ids,
    )
    mix = None
    if section := sections.get("asset_allocation"):
        mix = parse_stored_allocation(section.payload, section.computed_at)

    buckets = None
    if mix is None:
        scheme_ids = {uuid.UUID(row.scheme_id) for row, _ in valued_rows}
        categories = dict(
            db.query(Scheme.id, Scheme.sebi_category)
            .filter(Scheme.id.in_(scheme_ids))
            .all()
        )
        buckets = bucket_values(
            (value, categories.get(uuid.UUID(row.scheme_id), "") or "")
            for row, value in valued_rows
        )
    return build_allocation(
        total_value=total_value,
        mix=mix,
        buckets=buckets,
        members=member_values,
    )
