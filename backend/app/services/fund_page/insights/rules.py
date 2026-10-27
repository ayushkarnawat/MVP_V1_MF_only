from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Callable, Literal

from app.services.fund_page.insights.constants import (
    CAP_SPREAD_MIN,
    MANAGER_TENURE_YEARS,
    OVERLAP_CONSIDERATION,
    OVERLAP_SHOWN,
    PRIORITY_CAP_SPREAD,
    PRIORITY_EXPENSE,
    PRIORITY_LAGGING,
    PRIORITY_MANAGEMENT,
    PRIORITY_OVERLAP,
    PRIORITY_PERFORMANCE_LONG,
    PRIORITY_PERFORMANCE_YEARS,
    PRIORITY_SECTOR,
    PRIORITY_TOP_FIVE,
    PRIORITY_VOLATILITY,
    SECTOR_CONCENTRATION,
    TER_GAP,
    TOP_FIVE_CONCENTRATED,
    TOP_FIVE_SPREAD,
    VOLATILITY_GAP,
)
from app.services.fund_page.insights.templates import TEMPLATES


FactList = Literal["key", "strength", "consideration"]
Tone = Literal["pos", "warn", "neg", "info", "neu"]


@dataclass(frozen=True)
class Fact:
    id: str
    list: FactList
    tone: Tone
    text: str
    evidence: list[tuple[str, str]]
    priority: int


@dataclass
class InsightInputs:
    calendar_years: list[tuple[Decimal | None, Decimal | None]] | None = None
    ter: Decimal | None = None
    category_ter: Decimal | None = None
    top5_weight: Decimal | None = None
    sector_weights: dict[str, Decimal] | None = None
    overlap_pairs: list[tuple[str, Decimal]] | None = None
    return_3y: Decimal | None = None
    category_return_3y: Decimal | None = None
    return_5y: Decimal | None = None
    category_return_5y: Decimal | None = None
    manager_tenure: Decimal | None = None
    manager_since: date | None = None
    cap_shares: dict[str, Decimal] | None = None
    volatility: Decimal | None = None
    peer_volatility_median: Decimal | None = None


def _number(value: Decimal) -> str:
    return format(value.normalize(), "f")


def _pct(value: Decimal) -> str:
    return f"{_number(value)}%"


def _calendar_counts(inputs: InsightInputs) -> tuple[int, int] | None:
    if inputs.calendar_years is None:
        return None
    comparable = [(fund, category) for fund, category in inputs.calendar_years if fund is not None and category is not None]
    if not comparable:
        return None
    return sum(fund > category for fund, category in comparable), len(comparable)


def rule_peer_beat_years(inputs: InsightInputs) -> Fact | None:
    counts = _calendar_counts(inputs)
    if counts is None:
        return None
    wins, total = counts
    value = f"{wins} of {total}"
    if wins >= 4:
        return Fact(
            "peer_beat_years", "strength", "pos",
            TEMPLATES["peer_beat_strength"].format(count=wins, total=total),
            [("Years above category", value)], PRIORITY_PERFORMANCE_YEARS,
        )
    if wins <= 2:
        return Fact(
            "peer_beat_years", "consideration", "warn",
            TEMPLATES["peer_beat_consideration"].format(count=wins, total=total),
            [("Years above category", value)], PRIORITY_PERFORMANCE_YEARS,
        )
    return None


def rule_expense_ratio_vs_category(inputs: InsightInputs) -> Fact | None:
    if inputs.ter is None or inputs.category_ter is None:
        return None
    own, category = _pct(inputs.ter), _pct(inputs.category_ter)
    if inputs.category_ter - inputs.ter >= TER_GAP:
        return Fact(
            "expense_ratio_vs_category", "key", "pos",
            TEMPLATES["expense_lower"].format(ter=own, category=category),
            [("Expense ratio", own), ("Category average", category)], PRIORITY_EXPENSE,
        )
    if inputs.ter - inputs.category_ter >= TER_GAP:
        return Fact(
            "expense_ratio_vs_category", "consideration", "warn",
            TEMPLATES["expense_higher"].format(ter=own, category=category),
            [("Expense ratio", own), ("Category average", category)], PRIORITY_EXPENSE,
        )
    return None


def rule_top5_weight(inputs: InsightInputs) -> Fact | None:
    if inputs.top5_weight is None or inputs.top5_weight < 0:
        return None
    weight = _pct(inputs.top5_weight)
    if inputs.top5_weight >= TOP_FIVE_CONCENTRATED:
        template, list_name, tone = "top5_concentrated", "key", "warn"
    elif inputs.top5_weight < TOP_FIVE_SPREAD:
        template, list_name, tone = "top5_spread", "strength", "pos"
    else:
        template, list_name, tone = "top5_neutral", "key", "neu"
    return Fact(
        "top5_weight", list_name, tone, TEMPLATES[template].format(weight=weight),
        [("Top five weight", weight)], PRIORITY_TOP_FIVE,
    )


def rule_sector_concentration(inputs: InsightInputs) -> Fact | None:
    if inputs.sector_weights is None or not inputs.sector_weights:
        return None
    sector, value = max(inputs.sector_weights.items(), key=lambda item: (item[1], item[0]))
    if value < SECTOR_CONCENTRATION:
        return None
    weight = _pct(value)
    return Fact(
        "sector_concentration", "consideration", "warn",
        TEMPLATES["sector"].format(sector=sector, weight=weight),
        [(sector, weight)], PRIORITY_SECTOR,
    )


def rule_overlap(inputs: InsightInputs) -> Fact | None:
    if inputs.overlap_pairs is None or not inputs.overlap_pairs:
        return None
    fund, value = max(inputs.overlap_pairs, key=lambda item: (item[1], item[0]))
    if value < OVERLAP_SHOWN:
        return None
    weight = _pct(value)
    consideration = value >= OVERLAP_CONSIDERATION
    return Fact(
        "overlap", "consideration" if consideration else "key",
        "warn" if consideration else "info",
        TEMPLATES["overlap_consideration" if consideration else "overlap_key"].format(
            fund=fund, weight=weight,
        ),
        [(fund, weight)], PRIORITY_OVERLAP,
    )


def rule_long_term_vs_category(inputs: InsightInputs) -> Fact | None:
    if inputs.return_5y is None or inputs.category_return_5y is None:
        return None
    if inputs.return_5y == inputs.category_return_5y:
        return None
    fund = _pct(inputs.return_5y)
    category = _pct(inputs.category_return_5y)
    strength = inputs.return_5y > inputs.category_return_5y
    return Fact(
        "long_term_vs_category", "strength" if strength else "consideration",
        "pos" if strength else "warn",
        TEMPLATES["long_strength" if strength else "long_consideration"].format(
            fund_return=fund, category_return=category,
        ),
        [("Fund return", fund), ("Category return", category)], PRIORITY_PERFORMANCE_LONG,
    )


def rule_manager_tenure(inputs: InsightInputs) -> Fact | None:
    if inputs.manager_tenure is None or inputs.manager_since is None:
        return None
    if inputs.manager_tenure < MANAGER_TENURE_YEARS:
        return None
    tenure = _number(inputs.manager_tenure)
    since = inputs.manager_since.isoformat()
    return Fact(
        "manager_tenure", "strength", "pos",
        TEMPLATES["manager"].format(since=since, tenure=tenure),
        [("Managing since", since), ("Tenure", tenure)], PRIORITY_MANAGEMENT,
    )


def rule_market_cap_spread(inputs: InsightInputs) -> Fact | None:
    if inputs.cap_shares is None:
        return None
    required = ("Large", "Mid", "Small")
    if any(inputs.cap_shares.get(label) is None for label in required):
        return None
    if any(inputs.cap_shares[label] < CAP_SPREAD_MIN for label in required):
        return None
    values = {label: _pct(inputs.cap_shares[label]) for label in required}
    return Fact(
        "market_cap_spread", "strength", "pos",
        TEMPLATES["cap_spread"].format(
            large=values["Large"], mid=values["Mid"], small=values["Small"],
        ),
        [(label, values[label]) for label in required], PRIORITY_CAP_SPREAD,
    )


def rule_volatility_vs_category(inputs: InsightInputs) -> Fact | None:
    if inputs.volatility is None or inputs.peer_volatility_median is None:
        return None
    if inputs.volatility - inputs.peer_volatility_median <= VOLATILITY_GAP:
        return None
    fund = _pct(inputs.volatility)
    peer = _pct(inputs.peer_volatility_median)
    return Fact(
        "volatility_vs_category", "consideration", "warn",
        TEMPLATES["volatility"].format(fund=fund, peer=peer),
        [("Fund volatility", fund), ("Peer median", peer)], PRIORITY_VOLATILITY,
    )


def rule_lagging_years(inputs: InsightInputs) -> Fact | None:
    counts = _calendar_counts(inputs)
    if counts is None:
        return None
    wins, total = counts
    lagging = total - wins
    if lagging < 2:
        return None
    value = f"{lagging} of {total}"
    return Fact(
        "lagging_years", "consideration", "neg",
        TEMPLATES["lagging"].format(count=lagging, total=total),
        [("Years below category", value)], PRIORITY_LAGGING,
    )


ALL_RULES: tuple[Callable[[InsightInputs], Fact | None], ...] = (
    rule_peer_beat_years,
    rule_expense_ratio_vs_category,
    rule_top5_weight,
    rule_sector_concentration,
    rule_overlap,
    rule_long_term_vs_category,
    rule_manager_tenure,
    rule_market_cap_spread,
    rule_volatility_vs_category,
    rule_lagging_years,
)
