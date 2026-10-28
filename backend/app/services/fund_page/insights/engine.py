from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.reference import Scheme
from app.services.analytics.scorer import _category_ter_context
from app.services.analytics.scheme_universe import get_category_peers
from app.services.analytics.ter import _latest_ter_for_scheme
from app.services.fund_page.composition import build_composition
from app.services.fund_page.manager import build_manager
from app.services.fund_page.peers import (
    calendar_year_returns,
    category_returns,
    risk_return_scatter,
)
from app.services.fund_page.returns import inception_returns
from app.services.fund_page.score import build_score
from app.services.fund_page.schemas import (
    InsightEvidenceOut,
    InsightFactOut,
    InsightsResponse,
    Unavailable,
)
from app.services.fund_page.scope import ScopeContext
from app.services.fund_page.sections import stored_section
from app.services.fund_page.insights.rules import ALL_RULES, Fact, InsightInputs


def overlap_pairs_from_stored(
    db: Session,
    scheme: Scheme,
    ctx: ScopeContext,
    user_id: uuid.UUID,
) -> list[tuple[str, Decimal]] | None:
    stored = stored_section(db, user_id, ctx.scope_key, "overlap", ctx.member_ids)
    if stored is None:
        return None
    pairs = []
    for row in stored.payload.get("pairs_above_low", []):
        fund_a = row.get("fund_a", {})
        fund_b = row.get("fund_b", {})
        if fund_a.get("scheme_id") == str(scheme.id):
            other = fund_b
        elif fund_b.get("scheme_id") == str(scheme.id):
            other = fund_a
        else:
            continue
        value = row.get("overlap_pct")
        if value is not None and other.get("scheme_name"):
            pairs.append((other["scheme_name"], Decimal(str(value))))
    return sorted(pairs, key=lambda item: (-item[1], item[0]))


async def gather_inputs(
    db: Session,
    scheme: Scheme,
    ctx: ScopeContext,
    user_id: uuid.UUID,
    today: date,
) -> InsightInputs:
    composition = build_composition(db, scheme, today)
    manager = build_manager(db, scheme, today)
    now = datetime.combine(today, time.min, tzinfo=timezone.utc)
    score = await build_score(db, scheme, ctx, user_id, today, now)
    category = await category_returns(db, scheme, today)
    calendar_rows = await calendar_year_returns(db, scheme, today)
    scatter = await risk_return_scatter(db, scheme, today)
    peers = await get_category_peers(db, scheme.sebi_category, scheme.plan_type)
    ter_by_scheme, category_ter = await _category_ter_context(db, peers.schemes)
    own_ter = ter_by_scheme.get(scheme.id)
    if own_ter is None:
        latest_ter = _latest_ter_for_scheme(db, scheme.id)
        own_ter = latest_ter[0] if latest_ter is not None else None

    top5_weight = None
    sector_weights = None
    cap_shares = None
    if not isinstance(composition, Unavailable):
        top5_weight = sum(
            (Decimal(row.weight) for row in composition.top10[:5]), Decimal("0")
        )
        sector_weights = {
            row.label: Decimal(row.pct)
            for row in composition.allocation.sector if row.label != "Others"
        }
        cap_shares = {
            row.label: Decimal(row.pct) for row in composition.allocation.market_cap
        }

    manager_tenure = None
    manager_since = None
    if not isinstance(manager, Unavailable) and manager.managers:
        lead = manager.managers[0]
        manager_tenure = Decimal(lead.tenure_years) if lead.tenure_years is not None else None
        manager_since = lead.managing_since

    calendar_values = [
        (
            Decimal(row.fund) if row.fund is not None else None,
            Decimal(row.category) if row.category is not None else None,
        )
        for row in calendar_rows[-5:]
    ] or None

    volatility = None
    peer_median = None
    if not isinstance(scatter, Unavailable):
        fund_point = next((point for point in scatter.points if point.is_fund), None)
        volatility = Decimal(fund_point.volatility_pct) if fund_point is not None else None
        peer_median = (
            Decimal(scatter.peer_volatility_median)
            if scatter.peer_volatility_median is not None else None
        )

    scheme_return = Decimal(score.scheme_return) * Decimal("100") if score.scheme_return is not None else None
    category_return = (
        Decimal(score.category_avg_return) * Decimal("100")
        if score.category_avg_return is not None else None
    )
    # The scorer return is a blended 3Y/5Y figure; the five-year rule needs the real
    # annualised 5Y on both sides (same basis as category["5Y"]), else no fact.
    fund_5y = None
    own_returns = inception_returns(db, scheme, today)
    if not isinstance(own_returns, Unavailable):
        value = (own_returns.rows.get("fund") or {}).get("5Y")
        fund_5y = Decimal(value) if value is not None else None
    category_5y = None
    if not isinstance(category, Unavailable) and category.category.get("5Y") is not None:
        category_5y = Decimal(category.category["5Y"])

    return InsightInputs(
        calendar_years=calendar_values,
        ter=own_ter,
        category_ter=category_ter,
        top5_weight=top5_weight,
        sector_weights=sector_weights,
        overlap_pairs=overlap_pairs_from_stored(db, scheme, ctx, user_id),
        return_3y=scheme_return,
        category_return_3y=category_return,
        return_5y=fund_5y,
        category_return_5y=category_5y,
        manager_tenure=manager_tenure,
        manager_since=manager_since,
        cap_shares=cap_shares,
        volatility=volatility,
        peer_volatility_median=peer_median,
    )


def evaluate_rules(inputs: InsightInputs) -> list[Fact]:
    return [fact for rule in ALL_RULES if (fact := rule(inputs)) is not None]


def select_top_three(facts: list[Fact]) -> list[Fact]:
    by_id = {fact.id: fact for fact in facts}
    selected: list[Fact] = []

    performance = by_id.get("long_term_vs_category") or by_id.get("peer_beat_years")
    if performance is not None:
        selected.append(performance)
    for rule_id in ("overlap", "manager_tenure"):
        fact = by_id.get(rule_id)
        if fact is not None:
            selected.append(fact)
    for fact in sorted(facts, key=lambda item: (item.priority, item.id)):
        if fact not in selected:
            selected.append(fact)
        if len(selected) == 3:
            break
    return selected[:3]


def _out(fact: Fact) -> InsightFactOut:
    return InsightFactOut(
        id=fact.id, list=fact.list, tone=fact.tone, text=fact.text,
        evidence=[InsightEvidenceOut(label=label, value=value) for label, value in fact.evidence],
        priority=fact.priority,
    )


async def build_insights(
    db: Session,
    scheme: Scheme,
    ctx: ScopeContext,
    user_id: uuid.UUID,
    today: date,
) -> InsightsResponse:
    inputs = await gather_inputs(db, scheme, ctx, user_id, today)
    facts = evaluate_rules(inputs)
    ordered = sorted(facts, key=lambda fact: (fact.priority, fact.id))
    return InsightsResponse(
        key=[_out(fact) for fact in ordered if fact.list == "key"],
        strengths=[_out(fact) for fact in ordered if fact.list == "strength"],
        considerations=[_out(fact) for fact in ordered if fact.list == "consideration"],
        top_three=[_out(fact) for fact in select_top_three(facts)],
    )
