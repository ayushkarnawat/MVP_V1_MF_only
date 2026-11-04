from __future__ import annotations

import uuid
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.core.decimal_utils import AMOUNT_PLACES, quantize_amount
from app.models.reference import Scheme
from app.services.dashboard.allocation_labels import asset_class_bucket
from app.services.dashboard.holdings import compute_holdings
from app.services.home.movers import spread_cents
from app.services.home.stored import load_fresh_sections, scope_key_for


ALLOCATION_CLASSES: tuple[tuple[str, str, Literal["live", "coming_soon"]], ...] = (
    ("equity", "Equity", "live"),
    ("debt", "Debt", "live"),
    ("gold", "Gold", "live"),
    ("real_estate", "Real Estate (REITs and InvITs)", "live"),
    ("others", "Others", "live"),
    ("direct_stocks", "Direct stocks", "coming_soon"),
    ("fds_bonds", "FDs and bonds", "coming_soon"),
    ("us_stocks", "US stocks", "coming_soon"),
)
LIVE_KEYS = ("equity", "debt", "gold", "real_estate", "others")
PERCENT_PLACES = Decimal("0.01")


@dataclass(frozen=True)
class ClassFund:
    scheme_id: str
    name: str
    value: Decimal
    share_of_class: Decimal


@dataclass(frozen=True)
class ClassRow:
    key: str
    label: str
    status: Literal["live", "coming_soon"]
    value: Decimal | None
    percentage: Decimal | None
    funds: tuple[ClassFund, ...] = ()


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
    real_estate: Decimal = Decimal("0")
    funds: Mapping[str, tuple[ClassFund, ...]] = field(default_factory=dict)
    disclosed_values: Mapping[str, Decimal] = field(default_factory=dict)


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
        class_values = {key: Decimal("0") for key in ("equity", "debt", "gold", "cash_like", "real_estate", "others")}
        class_funds: dict[str, list[ClassFund]] = {}
        for row in summary["as_disclosed"]["classes"]:
            key = row["key"]
            if key in class_values:
                class_values[key] = Decimal(str(row["value"]))
                target = "others" if key == "cash_like" else key
                for fund in row.get("funds") or ():
                    value = Decimal(str(fund["value"]))
                    if not value.is_finite() or value <= 0:
                        continue
                    class_funds.setdefault(target, []).append(ClassFund(
                        scheme_id=str(fund["scheme_id"]),
                        name=fund["scheme_name"],
                        value=value,
                        share_of_class=Decimal("0.00"),
                    ))
    except (InvalidOperation, KeyError, TypeError, ValueError):
        return None
    if total <= 0 or covered <= 0 or any(value < 0 for value in class_values.values()):
        return None
    computed = computed_at if computed_at.tzinfo is not None else computed_at.replace(tzinfo=timezone.utc)
    five_classes = any(row["key"] == "others" for row in summary["as_disclosed"]["classes"])
    others = (class_values["others"] + max(total - sum(class_values.values(), Decimal("0")), Decimal("0"))
              if five_classes else max(total - class_values["equity"] - class_values["debt"] - class_values["gold"], Decimal("0")))
    return StoredMix(
        equity=class_values["equity"],
        debt=class_values["debt"],
        gold=class_values["gold"],
        others=others,
        real_estate=class_values["real_estate"],
        funds={key: tuple(funds) for key, funds in class_funds.items()},
        disclosed_values={
            key: class_values[key] if key != "others" else class_values["others"] + class_values["cash_like"]
            for key in class_funds
        },
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


def _class_funds(
    funds: Sequence[ClassFund], class_value: Decimal, *, covered_value: Decimal | None = None,
) -> tuple[ClassFund, ...]:
    covered_value = class_value if covered_value is None else covered_value
    # Whole cents, rounded down: spread_cents works in cents, so a sub-cent covered value could
    # push the summed floors above target_units (a cap the disclosed percent must not exceed).
    covered_value = covered_value.quantize(AMOUNT_PLACES, rounding=ROUND_DOWN)
    if class_value <= 0 or covered_value <= 0 or not funds:
        return ()
    by_scheme: dict[str, Decimal] = {}
    names: dict[str, str] = {}
    for fund in funds:
        if fund.value > 0:
            by_scheme[fund.scheme_id] = by_scheme.get(fund.scheme_id, Decimal("0")) + fund.value
            names[fund.scheme_id] = fund.name
    if not by_scheme:
        return ()
    # Uncovered exposure belongs to the class, but must not inflate its known funds.
    values = spread_cents(covered_value, by_scheme)
    ordered = sorted(values, key=lambda scheme_id: (-values[scheme_id], scheme_id))
    partial_shares: dict[str, Decimal] = {}
    if covered_value < class_value:
        parts = {
            scheme_id: divmod(value * Decimal("10000"), class_value)
            for scheme_id, value in values.items()
        }
        target_units = divmod(covered_value * Decimal("10000"), class_value)[0]
        extra_units = max(0, int(target_units - sum((part[0] for part in parts.values()), Decimal("0"))))
        ranked = sorted(parts, key=lambda scheme_id: (-parts[scheme_id][1], scheme_id))
        winners = set(ranked[:extra_units])
        partial_shares = {
            scheme_id: (whole + (Decimal("1") if scheme_id in winners else Decimal("0"))) * PERCENT_PLACES
            for scheme_id, (whole, _) in parts.items()
        }
    remaining = Decimal("100.00")
    result = []
    for index, scheme_id in enumerate(ordered):
        if covered_value == class_value:
            share = remaining if index == len(ordered) - 1 else min(
                _percentage(values[scheme_id], class_value), remaining,
            )
        else:
            share = partial_shares[scheme_id]
        result.append(ClassFund(scheme_id, names[scheme_id], values[scheme_id], share))
        remaining -= share
    return tuple(result)


def build_allocation(
    *,
    total_value: Decimal,
    mix: StoredMix | None,
    buckets: Mapping[str, Decimal] | None,
    members: Sequence[MemberValue] | None,
    funds: Mapping[str, Sequence[ClassFund]] | None = None,
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
            "real_estate": mix.real_estate,
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

    source_funds = mix.funds if source == "analytics" else funds or {}
    covered_values = dict(live_values)
    if source == "analytics":
        for key in LIVE_KEYS:
            if weights[key] > 0 and key in mix.disclosed_values:
                covered_values[key] = min(live_values[key], quantize_amount(
                    live_values[key] * mix.disclosed_values[key] / weights[key]
                ))
    classes = tuple(
        ClassRow(
            key=key,
            label=label,
            status=status,
            value=live_values[key] if status == "live" else None,
            percentage=_percentage(live_values[key], total_value) if status == "live" else None,
            funds=_class_funds(
                source_funds.get(key, ()), live_values[key], covered_value=covered_values[key],
            ) if status == "live" else (),
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
        db, list(household_member_ids), allow_stale_today=True, stored_only=True
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
    funds: dict[str, list[ClassFund]] = {}
    if mix is None:
        scheme_ids = {uuid.UUID(row.scheme_id) for row, _ in valued_rows}
        categories = dict(
            db.query(Scheme.id, Scheme.sebi_category)
            .filter(Scheme.id.in_(scheme_ids))
            .all()
        )
        buckets = {key: Decimal("0.00") for key in LIVE_KEYS}
        for row, value in valued_rows:
            key = bucket_class(categories.get(uuid.UUID(row.scheme_id), "") or "")
            buckets[key] += value
            funds.setdefault(key, []).append(ClassFund(
                scheme_id=row.scheme_id, name=row.scheme_name, value=value,
                share_of_class=Decimal("0.00"),
            ))
    return build_allocation(
        total_value=total_value,
        mix=mix,
        buckets=buckets,
        members=member_values,
        funds=funds,
    )
