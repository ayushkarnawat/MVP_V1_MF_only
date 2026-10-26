from __future__ import annotations

import calendar
import uuid
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

from sqlalchemy import Numeric, cast, func, tuple_
from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_amount
from app.models.enums import DisclosureBatchStatus, SchemePlanType
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding, SchemeTer
from app.services.dashboard.schemas import HoldingRow
from app.services.home.stored import load_fresh_sections, scope_key_for
from app.services.home.worth_config import DEFAULT_THRESHOLDS, WorthThresholds


PERCENT_PLACES = Decimal("0.01")
HUNDRED = Decimal("100")
STORED_SECTION_NAMES = ("score", "category_ranking", "stock_holdings")


@dataclass(frozen=True)
class FundFacts:
    scheme_id: uuid.UUID
    name: str
    category: str | None
    plan_type: str | None
    value: Decimal
    tier: int | None
    final_score: Decimal | None
    return_1y: Decimal | None
    category_avg_1y: Decimal | None
    ter: Decimal | None
    category_avg_ter: Decimal | None


@dataclass(frozen=True)
class StockExposure:
    name: str
    isin: str | None
    exposure_pct: Decimal


@dataclass(frozen=True)
class ConcentrationFacts:
    top_stocks: tuple[StockExposure, ...]
    top5_pct: Decimal
    holdings_as_of: date | None
    coverage_pct: Decimal | None
    hide_headlines: bool
    earlier_top5_pct: Decimal | None
    earlier_as_of: date | None


@dataclass(frozen=True)
class Card:
    kind: Literal["weak_fund", "underperforming", "high_expense", "concentration"]
    rank: int
    scheme_id: uuid.UUID | None
    scheme_name: str | None
    evidence: Mapping[str, Any]


@dataclass(frozen=True)
class WorthFacts:
    funds: tuple[FundFacts, ...]
    concentration: ConcentrationFacts | None
    unavailable: tuple[str, ...]


@dataclass(frozen=True)
class _Candidate:
    card: Card
    priority: int
    primary: Decimal
    secondary: Decimal
    name: str
    final_score: Decimal | None = None


def _percent(value: Decimal) -> Decimal:
    return value.quantize(PERCENT_PLACES, rounding=ROUND_HALF_UP)


def _percent_string(value: Decimal) -> str:
    return str(_percent(value))


def _candidate_key(candidate: _Candidate):
    if candidate.card.kind == "weak_fund":
        score_key = (
            candidate.final_score is None,
            candidate.final_score if candidate.final_score is not None else Decimal("0"),
        )
        return (candidate.priority, -candidate.primary, *score_key, candidate.name)
    return (
        candidate.priority,
        -candidate.primary,
        -candidate.secondary,
        candidate.name,
    )


def build_worth_cards(
    funds: Sequence[FundFacts],
    concentration: ConcentrationFacts | None,
    thresholds: WorthThresholds = DEFAULT_THRESHOLDS,
) -> tuple[Card, ...]:
    total = sum((fund.value for fund in funds), Decimal("0"))
    if total <= 0:
        return ()

    candidates = []
    for fund in funds:
        share_pct = _percent(fund.value / total * HUNDRED)
        candidate = None
        if fund.tier == thresholds.weak_tier and share_pct >= thresholds.weak_min_share_pct:
            candidate = _Candidate(
                card=Card(
                    kind="weak_fund",
                    rank=0,
                    scheme_id=fund.scheme_id,
                    scheme_name=fund.name,
                    evidence={
                        "tier": fund.tier,
                        "final_score": None if fund.final_score is None else str(fund.final_score),
                        "share_pct": str(share_pct),
                        "category": fund.category,
                    },
                ),
                priority=1,
                primary=share_pct,
                secondary=Decimal("0"),
                name=fund.name,
                final_score=fund.final_score,
            )
        elif fund.return_1y is not None and fund.category_avg_1y is not None:
            gap_pp = _percent((fund.category_avg_1y - fund.return_1y) * HUNDRED)
            if (
                gap_pp >= thresholds.underperform_gap_pp
                and share_pct >= thresholds.underperform_min_share_pct
            ):
                candidate = _Candidate(
                    card=Card(
                        kind="underperforming",
                        rank=0,
                        scheme_id=fund.scheme_id,
                        scheme_name=fund.name,
                        evidence={
                            "fund_1y_pct": _percent_string(fund.return_1y * HUNDRED),
                            "category_avg_1y_pct": _percent_string(
                                fund.category_avg_1y * HUNDRED
                            ),
                            "gap_pp": str(gap_pp),
                            "share_pct": str(share_pct),
                            "category": fund.category,
                        },
                    ),
                    priority=2,
                    primary=gap_pp,
                    secondary=share_pct,
                    name=fund.name,
                )
        if (
            candidate is None
            and fund.ter is not None
            and fund.category_avg_ter is not None
        ):
            gap_pp = _percent(fund.ter - fund.category_avg_ter)
            if (
                gap_pp > thresholds.expense_gap_pp
                and share_pct >= thresholds.expense_min_share_pct
            ):
                candidate = _Candidate(
                    card=Card(
                        kind="high_expense",
                        rank=0,
                        scheme_id=fund.scheme_id,
                        scheme_name=fund.name,
                        evidence={
                            "ter": _percent_string(fund.ter),
                            "category_avg_ter": _percent_string(fund.category_avg_ter),
                            "gap_pp": str(gap_pp),
                            "plan_type": fund.plan_type,
                            "share_pct": str(share_pct),
                        },
                    ),
                    priority=4,
                    primary=gap_pp,
                    secondary=share_pct,
                    name=fund.name,
                )
        if candidate is not None:
            candidates.append(candidate)

    if (
        concentration is not None
        and not concentration.hide_headlines
        and concentration.coverage_pct is not None
        and concentration.coverage_pct >= thresholds.concentration_min_coverage_pct
        and concentration.top5_pct >= thresholds.concentration_top5_pct
    ):
        candidates.append(_Candidate(
            card=Card(
                kind="concentration",
                rank=0,
                scheme_id=None,
                scheme_name=None,
                evidence={
                    "top5_pct": _percent_string(concentration.top5_pct),
                    "stocks": [
                        {
                            "name": stock.name,
                            "isin": stock.isin,
                            "exposure_pct": _percent_string(stock.exposure_pct),
                        }
                        for stock in concentration.top_stocks
                    ],
                    "holdings_as_of": (
                        None
                        if concentration.holdings_as_of is None
                        else concentration.holdings_as_of.isoformat()
                    ),
                    "earlier_top5_pct": (
                        None
                        if concentration.earlier_top5_pct is None
                        else _percent_string(concentration.earlier_top5_pct)
                    ),
                    "earlier_as_of": (
                        None
                        if concentration.earlier_as_of is None
                        else concentration.earlier_as_of.isoformat()
                    ),
                    "approximate": True,
                },
            ),
            priority=3,
            primary=concentration.top5_pct,
            secondary=Decimal("0"),
            name="",
        ))

    selected = sorted(candidates, key=_candidate_key)[:max(thresholds.max_cards, 0)]
    return tuple(replace(candidate.card, rank=index) for index, candidate in enumerate(selected, 1))


def _subtract_months(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 - months
    year, zero_based_month = divmod(month_index, 12)
    month = zero_based_month + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def load_earlier_top5(
    db: Session,
    *,
    scheme_values: Mapping[uuid.UUID, Decimal],
    total_value: Decimal,
    isins: Sequence[str],
    current_as_of: date,
) -> tuple[Decimal | None, date | None]:
    if total_value <= 0 or not scheme_values or not isins:
        return None, None
    cutoff = _subtract_months(current_as_of, 3)
    lower_bound = cutoff - timedelta(days=45)
    rows = (
        db.query(DisclosureBatch.id, DisclosureBatch.scheme_id, DisclosureBatch.as_of_date)
        .filter(
            DisclosureBatch.scheme_id.in_(scheme_values),
            DisclosureBatch.status == DisclosureBatchStatus.WRITTEN,
        )
        .all()
    )
    by_scheme = defaultdict(list)
    for row in rows:
        by_scheme[row.scheme_id].append(row)

    selected = {}
    for scheme_id, scheme_rows in by_scheme.items():
        eligible = [
            row for row in scheme_rows
            if row.as_of_date <= cutoff and row.as_of_date > lower_bound
        ]
        if not eligible:
            return None, None
        selected[scheme_id] = max(eligible, key=lambda row: row.as_of_date)
    if not selected:
        return None, None

    batch_to_scheme = {row.id: scheme_id for scheme_id, row in selected.items()}
    holding_rows = (
        db.query(SchemeHolding.batch_id, SchemeHolding.pct_to_nav)
        .filter(
            SchemeHolding.batch_id.in_(batch_to_scheme),
            SchemeHolding.isin.in_(isins),
        )
        .all()
    )
    pct_by_scheme = defaultdict(lambda: Decimal("0"))
    for row in holding_rows:
        pct_by_scheme[batch_to_scheme[row.batch_id]] += Decimal(row.pct_to_nav)
    earlier_value = sum(
        (
            scheme_values[scheme_id] * pct_by_scheme[scheme_id] / HUNDRED
            for scheme_id in selected
        ),
        Decimal("0"),
    )
    earlier_pct = _percent(earlier_value / total_value * HUNDRED)
    earlier_as_of = min(row.as_of_date for row in selected.values())
    return earlier_pct, earlier_as_of


def _latest_ters(db: Session, scheme_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    ranked = (
        db.query(
            SchemeTer.scheme_id.label("scheme_id"),
            SchemeTer.ter_value.label("ter_value"),
            func.row_number().over(
                partition_by=SchemeTer.scheme_id,
                order_by=SchemeTer.reference_period.desc(),
            ).label("row_number"),
        )
        .filter(SchemeTer.scheme_id.in_(scheme_ids), SchemeTer.ter_value.is_not(None))
        .subquery()
    )
    return {
        scheme_id: Decimal(ter_value)
        for scheme_id, ter_value in db.query(ranked.c.scheme_id, ranked.c.ter_value)
        .filter(ranked.c.row_number == 1)
        .all()
    }


def _category_ter_means(
    db: Session, pairs: set[tuple[str, SchemePlanType]]
) -> dict[tuple[str, str], Decimal]:
    if not pairs:
        return {}
    ranked = (
        db.query(
            SchemeTer.scheme_id.label("scheme_id"),
            SchemeTer.ter_value.label("ter_value"),
            func.row_number().over(
                partition_by=SchemeTer.scheme_id,
                order_by=SchemeTer.reference_period.desc(),
            ).label("row_number"),
        )
        .filter(SchemeTer.ter_value.is_not(None))
        .subquery()
    )
    average = cast(func.avg(ranked.c.ter_value), Numeric(18, 6))
    rows = (
        db.query(Scheme.sebi_category, Scheme.plan_type, average)
        .join(ranked, ranked.c.scheme_id == Scheme.id)
        .filter(
            ranked.c.row_number == 1,
            tuple_(Scheme.sebi_category, Scheme.plan_type).in_(pairs),
        )
        .group_by(Scheme.sebi_category, Scheme.plan_type)
        .all()
    )
    return {
        (category, plan_type.value): Decimal(mean)
        for category, plan_type, mean in rows
    }


_MALFORMED = (KeyError, TypeError, ValueError, AttributeError, ArithmeticError)


def _parse_scores(payload: Mapping[str, Any]) -> dict[Any, tuple[Any, Decimal | None]]:
    return {
        row.get("scheme_id"): (
            row.get("risk_adjusted_tier"),
            None if row.get("final_score") is None else Decimal(row["final_score"]),
        )
        for row in payload.get("funds", [])
    }


def _parse_rankings(payload: Mapping[str, Any]) -> dict[Any, tuple[Decimal | None, Decimal | None]]:
    parsed = {}
    for row in payload.get("funds", []):
        period = row.get("periods", {}).get("1y", {})
        parsed[row.get("scheme_id")] = (
            None if period.get("fund_return") is None else Decimal(period["fund_return"]),
            None if period.get("category_avg") is None else Decimal(period["category_avg"]),
        )
    return parsed


def load_worth_facts(
    db: Session,
    user_id: uuid.UUID,
    *,
    scope: Literal["aggregate", "member"],
    household_member_ids: Sequence[uuid.UUID],
    holdings: Sequence[HoldingRow],
) -> WorthFacts:
    valued_rows = [
        (row, quantize_amount(Decimal(row.current_value)))
        for row in holdings
        if not row.nav_unavailable and row.current_value is not None
    ]
    if not valued_rows:
        return WorthFacts((), None, STORED_SECTION_NAMES)

    grouped = {}
    for row, value in valued_rows:
        scheme_id = uuid.UUID(row.scheme_id)
        plan_type = row.plan_type.value
        current = grouped.get(scheme_id)
        if current is None:
            grouped[scheme_id] = {
                "name": row.scheme_name,
                "category": row.sebi_category or None,
                "plan_type": plan_type,
                "plan_value": value,
                "value": value,
            }
        else:
            current["value"] += value
            if value > current["plan_value"]:
                current["plan_type"] = plan_type
                current["plan_value"] = value

    scheme_ids = tuple(grouped)
    sections = load_fresh_sections(
        db,
        user_id,
        scope_key=scope_key_for(scope, household_member_ids),
        sections=STORED_SECTION_NAMES,
        household_member_ids=household_member_ids,
    )
    # A stored payload that no longer parses (a schema that moved, a bad value) is unavailable, like a missing or
    # stale one: the card is skipped, the page does not fail (review F10).
    unavailable = {name for name in STORED_SECTION_NAMES if name not in sections}

    scores = {}
    if section := sections.get("score"):
        try:
            scores = _parse_scores(section.payload)
        except _MALFORMED:
            unavailable.add("score")
    rankings = {}
    if section := sections.get("category_ranking"):
        try:
            rankings = _parse_rankings(section.payload)
        except _MALFORMED:
            unavailable.add("category_ranking")

    ters = _latest_ters(db, scheme_ids)
    pairs = set()
    for facts in grouped.values():
        if facts["category"] and facts["plan_type"] in {"direct", "regular"}:
            pairs.add((facts["category"], SchemePlanType(facts["plan_type"])))
    category_means = _category_ter_means(db, pairs)

    funds = []
    for scheme_id, grouped_facts in grouped.items():
        score = scores.get(str(scheme_id), (None, None))
        ranking = rankings.get(str(scheme_id), (None, None))
        funds.append(FundFacts(
            scheme_id=scheme_id,
            name=grouped_facts["name"],
            category=grouped_facts["category"],
            plan_type=grouped_facts["plan_type"],
            value=grouped_facts["value"],
            tier=score[0],
            final_score=score[1],
            return_1y=ranking[0],
            category_avg_1y=ranking[1],
            ter=ters.get(scheme_id),
            category_avg_ter=category_means.get(
                (grouped_facts["category"], grouped_facts["plan_type"])
            ),
        ))

    concentration = None
    if section := sections.get("stock_holdings"):
        payload = section.payload
        try:
            rows = payload.get("rows", [])[:5]
            if rows:
                top_stocks = tuple(
                    StockExposure(
                        name=row["instrument_name"],
                        isin=row.get("isin"),
                        exposure_pct=Decimal(row["exposure_pct"]),
                    )
                    for row in rows
                )
                current_as_of = (
                    None
                    if payload.get("holdings_as_of") is None
                    else date.fromisoformat(payload["holdings_as_of"])
                )
                coverage = payload.get("coverage", {}).get("covered_value_pct")
                coverage_pct = None if coverage is None else Decimal(coverage)
                hide_headlines = bool(payload.get("hide_headlines"))
                earlier = (None, None)
                isins = [stock.isin for stock in top_stocks if stock.isin is not None]
                if not hide_headlines and current_as_of is not None and isins:
                    earlier = load_earlier_top5(
                        db,
                        scheme_values={
                            scheme_id: grouped_facts["value"]
                            for scheme_id, grouped_facts in grouped.items()
                        },
                        total_value=sum(
                            (grouped_facts["value"] for grouped_facts in grouped.values()),
                            Decimal("0"),
                        ),
                        isins=isins,
                        current_as_of=current_as_of,
                    )
                concentration = ConcentrationFacts(
                    top_stocks=top_stocks,
                    top5_pct=sum(
                        (stock.exposure_pct for stock in top_stocks), Decimal("0")
                    ),
                    holdings_as_of=current_as_of,
                    coverage_pct=coverage_pct,
                    hide_headlines=hide_headlines,
                    earlier_top5_pct=earlier[0],
                    earlier_as_of=earlier[1],
                )
        except _MALFORMED:
            concentration = None
            unavailable.add("stock_holdings")
    return WorthFacts(
        tuple(funds),
        concentration,
        tuple(name for name in STORED_SECTION_NAMES if name in unavailable),
    )
