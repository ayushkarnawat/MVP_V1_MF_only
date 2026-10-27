"""T5: build a user's news watch list (D4) -- which stocks, fund houses,
fund categories, the gold/silver asset class and debt/rates the user
actually holds, each tagged with how big that holding is so score.py's
ladder (D5) and majority override (D6) can rank news against it.

Read-only: every input (`holdings`, `allocation`, `sections`) is already
computed by the Home route; this module only groups and ranks it. No new
per-fund DB query here beyond `load_sector_weights`'s single batched IN
query, so the route's statement count does not grow with fund count.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from sqlalchemy.orm import Session

from app.models.user import User
from app.services.dashboard.schemas import HoldingRow
from app.services.home.allocation import Allocation
from app.services.home.context import ScopeContext
from app.services.home.movers import load_sector_weights
from app.services.home.stored import StoredSection
from app.services.news.config import CATEGORY_LABELS, MIN_SIZE_PCT, SECTOR_LABELS, TOP_N
from app.services.news.normalise import Kind, category_key, fund_house_key, normalise_title, sector_key

_PCT_PLACES = Decimal("0.01")
_HUNDRED = Decimal("100")


@dataclass(frozen=True)
class WatchEntity:
    kind: Kind
    key: str
    label: str
    exposure_pct: Decimal | None
    chip: Literal["none", "holdings", "lookthrough"]
    funds: tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class WatchList:
    entities: tuple[WatchEntity, ...]
    majority_class: str | None
    coverage_pct: Decimal | None
    holdings_as_of: date | None


def _pct(value: Decimal, total: Decimal) -> Decimal:
    if total == 0:
        return Decimal("0.00")
    return (value / total * _HUNDRED).quantize(_PCT_PLACES, rounding=ROUND_HALF_UP)


def _valued(holdings: Sequence[HoldingRow]) -> list[tuple[HoldingRow, Decimal]]:
    rows: list[tuple[HoldingRow, Decimal]] = []
    for row in holdings:
        if row.nav_unavailable or row.current_value is None:
            continue
        rows.append((row, Decimal(row.current_value)))
    return rows


def _group_by_fund_house(valued: Sequence[tuple[HoldingRow, Decimal]], total: Decimal) -> list[WatchEntity]:
    groups: dict[str, Decimal] = {}
    funds: dict[str, list[tuple[str, str]]] = {}
    for row, value in valued:
        key = fund_house_key(row.amc_name)
        groups[key] = groups.get(key, Decimal("0")) + value
        funds.setdefault(key, []).append((row.scheme_id, row.scheme_name))
    return [
        WatchEntity(
            kind="fund_house",
            key=key,
            label=key.replace("_", " ").title(),
            exposure_pct=_pct(value, total),
            chip="holdings",
            funds=tuple(funds[key]),
        )
        for key, value in groups.items()
    ]


def _group_by_fund_category(valued: Sequence[tuple[HoldingRow, Decimal]], total: Decimal) -> list[WatchEntity]:
    groups: dict[str, Decimal] = {}
    funds: dict[str, list[tuple[str, str]]] = {}
    for row, value in valued:
        key = category_key(row.sebi_category or "")
        if key is None:
            continue
        groups[key] = groups.get(key, Decimal("0")) + value
        funds.setdefault(key, []).append((row.scheme_id, row.scheme_name))
    return [
        WatchEntity(
            kind="fund_category",
            key=key,
            label=CATEGORY_LABELS.get(key, key),
            exposure_pct=_pct(value, total),
            chip="holdings",
            funds=tuple(funds[key]),
        )
        for key, value in groups.items()
    ]


def _allocation_entities(allocation: Allocation) -> list[WatchEntity]:
    entities: list[WatchEntity] = []
    by_key = {row.key: row for row in allocation.classes}
    gold = by_key.get("gold")
    if gold is not None and gold.percentage is not None:
        entities.append(
            WatchEntity(
                kind="asset_class", key="gold_silver", label="Gold and Silver",
                exposure_pct=gold.percentage, chip="holdings", funds=(),
            )
        )
    debt = by_key.get("debt")
    if debt is not None and debt.percentage is not None:
        entities.append(
            WatchEntity(
                kind="rates_macro", key="rates", label="Interest rates",
                exposure_pct=debt.percentage, chip="holdings", funds=(),
            )
        )
    return entities


def _sector_entities(db: Session, valued: Sequence[tuple[HoldingRow, Decimal]], total: Decimal, today: date) -> list[WatchEntity]:
    if total == 0:
        return []
    scheme_ids = {uuid.UUID(row.scheme_id) for row, _ in valued}
    weights_by_scheme = load_sector_weights(db, scheme_ids, today)
    pct_by_key: dict[str, Decimal] = {}
    for row, value in valued:
        weights = weights_by_scheme.get(uuid.UUID(row.scheme_id), {})
        for raw_label, weight_pct in weights.items():
            key = sector_key(raw_label)
            if key is None:
                continue
            contribution = value / total * weight_pct
            pct_by_key[key] = pct_by_key.get(key, Decimal("0")) + contribution
    return [
        WatchEntity(
            kind="sector", key=key, label=SECTOR_LABELS.get(key, key),
            exposure_pct=pct.quantize(_PCT_PLACES, rounding=ROUND_HALF_UP),
            chip="lookthrough", funds=(),
        )
        for key, pct in pct_by_key.items()
    ]


def _stock_entities(stock_holdings: StoredSection | None) -> list[WatchEntity]:
    if stock_holdings is None:
        return []
    entities: list[WatchEntity] = []
    for row in stock_holdings.payload.get("rows", []):
        isin = row.get("isin")
        name = row.get("instrument_name", "")
        if row.get("asset_type") == "equity_international":
            key = normalise_title(name)  # matches tag_title's foreign-alias key, no prefix
        else:
            key = isin or f"name:{normalise_title(name)}"
        funds = tuple(
            (str(f["scheme_id"]), f["scheme_name"]) for f in row.get("contributing_funds", [])
        )
        entities.append(
            WatchEntity(
                kind="stock", key=key, label=name,
                exposure_pct=Decimal(str(row["exposure_pct"])),
                chip="lookthrough", funds=funds,
            )
        )
    return entities


def _top5_then_minimum(entities: list[WatchEntity]) -> list[WatchEntity]:
    """D4: rank by exposure_pct within each kind, keep the top TOP_N, THEN
    drop anything below that kind's MIN_SIZE_PCT -- a rank-6+ entity is
    excluded even if it would clear the minimum on its own."""
    by_kind: dict[str, list[WatchEntity]] = {}
    for entity in entities:
        by_kind.setdefault(entity.kind, []).append(entity)
    kept: list[WatchEntity] = []
    for kind, group in by_kind.items():
        group.sort(key=lambda e: (e.exposure_pct is None, -(e.exposure_pct or Decimal("0")), e.key))
        minimum = MIN_SIZE_PCT.get(kind, Decimal("0.00"))
        for entity in group[:TOP_N]:
            if entity.exposure_pct is not None and entity.exposure_pct >= minimum:
                kept.append(entity)
    return kept


def build_watchlist(
    db: Session,
    user: User,
    ctx: ScopeContext,
    holdings: Sequence[HoldingRow],
    allocation: Allocation,
    sections: dict[str, StoredSection],
    *,
    today: date,
) -> WatchList:
    valued = _valued(holdings)
    total = allocation.total_value or Decimal("0")

    entities = [
        *_group_by_fund_house(valued, total),
        *_group_by_fund_category(valued, total),
        *_allocation_entities(allocation),
        *_sector_entities(db, valued, total, today),
        *_stock_entities(sections.get("stock_holdings")),
    ]
    entities = _top5_then_minimum(entities)

    stock_holdings = sections.get("stock_holdings")
    coverage_pct: Decimal | None = None
    holdings_as_of: date | None = None
    if stock_holdings is not None:
        coverage = stock_holdings.payload.get("coverage") or {}
        if coverage.get("covered_value_pct") is not None:
            coverage_pct = Decimal(str(coverage["covered_value_pct"]))
        as_of_raw = stock_holdings.payload.get("holdings_as_of")
        if as_of_raw:
            holdings_as_of = as_of_raw if isinstance(as_of_raw, date) else date.fromisoformat(as_of_raw)

    if coverage_pct is not None and coverage_pct < Decimal("50.00"):
        entities = tuple(
            e if e.chip != "lookthrough" else WatchEntity(e.kind, e.key, e.label, None, e.chip, e.funds)
            for e in entities
        )
    else:
        entities = tuple(entities)

    by_key = {row.key: row for row in allocation.classes}
    gold_pct = by_key["gold"].percentage if "gold" in by_key else None
    debt_pct = by_key["debt"].percentage if "debt" in by_key else None
    majority_class: str | None = None
    if gold_pct is not None and gold_pct > Decimal("50.00"):
        majority_class = "gold"
    elif debt_pct is not None and debt_pct > Decimal("50.00"):
        majority_class = "debt"

    return WatchList(
        entities=entities,
        majority_class=majority_class,
        coverage_pct=coverage_pct,
        holdings_as_of=holdings_as_of,
    )
