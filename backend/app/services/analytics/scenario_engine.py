# backend/app/services/analytics/scenario_engine.py
"""Scenario simulator compute engine (attribute 11). Step 2 (compute_scenario_results)
precomputes one scenario_scheme_results row per active scheme -- real
(is_proxied=false, computed from genuine NAV history) or proxied (category
average, then asset-class average, then an honest "no data" NULL) --
following the planning doc's "proxies built only from real data, never
from other proxies" rule: the real-data pass runs first and completely
for every scheme before any proxy lookup reads from it. Step 3
(get_scenario_summary/get_scenario_result_for_household) is pure serving:
one indexed SELECT filtered to the scenario and the caller's held scheme
IDs, no live NAV computation."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.reference import (
    NavHistory,
    Scenario,
    ScenarioCategoryAverage,
    ScenarioHypotheticalAssumption,
    ScenarioSchemeResult,
    Scheme,
)
from app.services.analytics.scheme_universe import canonical_category
from app.services.analytics.scenario_asset_class import underlying_asset_class
from app.services.analytics.schemas import (
    ScenarioBenchmarkResult,
    ScenarioFundResult,
    ScenarioHypotheticalAssumptionRow,
    ScenarioMemberFundResult,
    ScenarioMemberResult,
    ScenarioPhaseResult,
    ScenarioResultRow,
    ScenarioSummaryRow,
)
from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory, SchemeAaum
from app.services.dashboard.holdings import compute_holdings


logger = logging.getLogger(__name__)

def _bulk_nav_for_scenario(
    db: Session, scheme_ids: list[uuid.UUID], pre_start: date, end: date
) -> dict[uuid.UUID, dict[str, Decimal]]:
    """Scheme-master-wide variant of category_ranking.py's
    `_bulk_nav_on_or_before` -- same bounded MAX(date)-join pattern, not
    reused directly since this scopes to the whole schemes table rather
    than one SEBI category and only ever needs the two window-boundary
    dates, never a 3yr/5yr anchor set."""
    if not scheme_ids:
        return {}
    result: dict[uuid.UUID, dict[str, Decimal]] = {sid: {} for sid in scheme_ids}
    for boundary, target in (("start", pre_start), ("end", end)):
        upper = NavHistory.date < target if boundary == "start" else NavHistory.date <= target
        latest_dates = (
            db.query(NavHistory.scheme_id, func.max(NavHistory.date).label("max_date"))
            .filter(NavHistory.scheme_id.in_(scheme_ids), upper, NavHistory.date >= target - timedelta(days=7))
            .group_by(NavHistory.scheme_id)
            .subquery()
        )
        rows = (
            db.query(NavHistory.scheme_id, NavHistory.nav)
            .join(latest_dates, (NavHistory.scheme_id == latest_dates.c.scheme_id) & (NavHistory.date == latest_dates.c.max_date))
            .all()
        )
        for scheme_id, nav in rows:
            result[scheme_id][boundary] = nav
    return result


def _proxy_group(scheme: Scheme) -> str:
    # Generic wrapper headings ("Other Scheme - Index Funds") mix equity, bond, gold and
    # silver funds, so a missing fund is proxied by funds holding the same thing, not by
    # the whole heading (card 3). For ordinary categories this is one group per category.
    category = canonical_category(scheme.sebi_category or "")
    return f"{category}|{underlying_asset_class(category, scheme.name)}"


def _held_results(db: Session, scenario_id: uuid.UUID, schemes: dict[uuid.UUID, Scheme]) -> dict[uuid.UUID, ScenarioSchemeResult]:
    results = {r.scheme_id: r for r in db.query(ScenarioSchemeResult).filter(
        ScenarioSchemeResult.scenario_id == scenario_id, ScenarioSchemeResult.scheme_id.in_(schemes)
    ).all()}
    missing = schemes.keys() - results.keys()
    if not missing:
        return results
    averages = {a.sebi_category: a for a in db.query(ScenarioCategoryAverage).filter_by(scenario_id=scenario_id).all()}
    for sid in missing:
        scheme = schemes[sid]
        group = _proxy_group(scheme)
        category_average = averages.get(group)
        pct = None
        basis = "no_comparable_data"
        if category_average is not None and category_average.scheme_count >= 3:
            pct = category_average.avg_pct_change
            basis = f"sebi_category_average:{group}"
        else:
            bucket = underlying_asset_class(scheme.sebi_category or "", scheme.name)
            comparable = [a for key, a in averages.items() if key.endswith(f"|{bucket}") and a.scheme_count > 0]
            count = sum(a.scheme_count for a in comparable)
            if count:
                pct = (sum(a.avg_pct_change * a.scheme_count for a in comparable) / count).quantize(Decimal("0.01"))
                basis = f"asset_class_average:{bucket}"
        # Transient: serving never writes or recomputes NAVs.
        results[sid] = ScenarioSchemeResult(scenario_id=scenario_id, scheme_id=sid, pct_change=pct, is_proxied=True, proxy_basis=basis)
    return results


def _fund_series(schemes: list[Scheme], real_pcts: dict[uuid.UUID, Decimal]) -> list[Scheme]:
    funds: dict[tuple[str, str], list[Scheme]] = {}
    for scheme in schemes:
        # Growth series only, but NAVAll leaves the option blank for single-option funds
        # (ETFs: "DSP MSCI INDIA ETF"), so exclude payout options rather than require "Growth".
        if scheme.id not in real_pcts or re.search(r"\b(idcw|dividend|bonus)\b", scheme.name, re.I):
            continue
        base = scheme.base_name or re.sub(r"\s*(?:-\s*)?(?:(?:direct|regular)\s*(?:plan)?\s*(?:-\s*)?)?growth(?:\s+option)?\s*$", "", scheme.name, flags=re.I)
        key = (" ".join((scheme.amc_name or "").lower().split()), " ".join(base.lower().split()))
        funds.setdefault(key, []).append(scheme)
    def priority(scheme: Scheme):
        plan = getattr(scheme.plan_type, "value", scheme.plan_type)
        regular = plan == "regular" or (plan is None and not re.search(r"\bdirect\b", scheme.name, re.I))
        return (0 if regular else 1, scheme.amfi_code or "", str(scheme.id))
    return [min(options, key=priority) for options in funds.values()]


def compute_scenario_results(db: Session, scenario: Scenario) -> None:
    if scenario.scenario_type == "HYPOTHETICAL":
        return  # category D needs no precompute at all -- pure arithmetic at serve time

    all_schemes = db.query(Scheme).filter(Scheme.is_active.is_(True)).all()
    scheme_ids = [s.id for s in all_schemes]
    pre_start = scenario.start_date
    end = scenario.end_date or date.today()
    navs = _bulk_nav_for_scenario(db, scheme_ids, pre_start, end)

    real_pct_by_scheme: dict[uuid.UUID, Decimal] = {}
    for scheme in all_schemes:
        per_scheme = navs.get(scheme.id, {})
        start_nav = per_scheme.get("start")
        end_nav = per_scheme.get("end")
        if start_nav is None or end_nav is None or start_nav == 0:
            continue
        pct = (end_nav - start_nav) / start_nav * 100
        if abs(pct) > Decimal("1000"):
            logger.warning("Skipping implausible NAV ratio for scheme %s: %s%%", scheme.id, pct)
            continue
        real_pct_by_scheme[scheme.id] = pct.quantize(Decimal("0.01"))

    db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id).delete()
    db.query(ScenarioCategoryAverage).filter_by(scenario_id=scenario.id).delete()

    for scheme_id, pct in real_pct_by_scheme.items():
        db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=scheme_id, pct_change=pct, is_proxied=False))

    series = _fund_series(all_schemes, real_pct_by_scheme)
    category_totals: dict[str, list[Decimal]] = {}
    for scheme in series:
        if scheme.id in real_pct_by_scheme:
            category_totals.setdefault(_proxy_group(scheme), []).append(real_pct_by_scheme[scheme.id])
    category_averages = {
        category: (sum(values) / len(values)).quantize(Decimal("0.01"))
        for category, values in category_totals.items()
    }
    for category, avg in category_averages.items():
        db.add(ScenarioCategoryAverage(
            scenario_id=scenario.id, sebi_category=category, avg_pct_change=avg,
            scheme_count=len(category_totals[category]),
        ))

    asset_class_totals: dict[str, list[Decimal]] = {}
    for scheme in series:
        if scheme.id in real_pct_by_scheme:
            bucket = underlying_asset_class(scheme.sebi_category or "", scheme.name)
            asset_class_totals.setdefault(bucket, []).append(real_pct_by_scheme[scheme.id])
    asset_class_averages = {
        bucket: (sum(values) / len(values)).quantize(Decimal("0.01"))
        for bucket, values in asset_class_totals.items()
    }

    for scheme in all_schemes:
        if scheme.id in real_pct_by_scheme:
            continue
        category = scheme.sebi_category or ""
        group = _proxy_group(scheme)
        if group in category_averages and len(category_totals[group]) >= 3:
            db.add(ScenarioSchemeResult(
                scenario_id=scenario.id, scheme_id=scheme.id, pct_change=category_averages[group],
                is_proxied=True, proxy_basis=f"sebi_category_average:{group}",
            ))
            continue
        bucket = underlying_asset_class(category, scheme.name)
        if bucket in asset_class_averages:
            db.add(ScenarioSchemeResult(
                scenario_id=scenario.id, scheme_id=scheme.id, pct_change=asset_class_averages[bucket],
                is_proxied=True, proxy_basis=f"asset_class_average:{bucket}",
            ))
            continue
        db.add(ScenarioSchemeResult(
            scenario_id=scenario.id, scheme_id=scheme.id, pct_change=None,
            is_proxied=True, proxy_basis="no_comparable_data",
        ))

    _set_quick_stats(db, scenario, all_schemes, real_pct_by_scheme)
    db.commit()


_QUICK_MIN_FUNDS = 5


def _aum_weighted(pcts: dict[uuid.UUID, Decimal], weights: dict[uuid.UUID, Decimal]) -> Decimal | None:
    weighted = [(pcts[sid], weights[sid]) for sid in pcts if weights.get(sid, Decimal("0")) > 0]
    if len(weighted) < _QUICK_MIN_FUNDS:
        return None
    total = sum(w for _, w in weighted)
    return (sum(p * w for p, w in weighted) / total).quantize(Decimal("0.01"))


def _set_quick_stats(
    db: Session, scenario: Scenario, all_schemes: list[Scheme], real_pct_by_scheme: dict[uuid.UUID, Decimal]
) -> None:
    """Picker-card figures (card 10): the market's move, and the AUM-weighted move of
    equity funds and of debt funds -- kept apart, because averaging them together turned
    COVID's -38% into about -15%. A figure without data stays NULL, never a substitute."""
    scenario.quick_market_pct = scenario.quick_equity_pct = scenario.quick_debt_pct = None
    scenario.quick_weight_quarter = None
    has_phases = db.query(Scenario).filter_by(parent_scenario_id=scenario.id).first() is not None
    if scenario.scenario_type == "HYPOTHETICAL" or scenario.had_redemption_freeze_schemes or has_phases:
        return

    end = scenario.end_date or date.today()
    start_level, end_level = _benchmark_levels(db, BenchmarkIndex.NIFTY_50, scenario.start_date, end)
    if start_level and end_level and start_level > 0:
        scenario.quick_market_pct = ((end_level / start_level - 1) * 100).quantize(Decimal("0.01"))

    # Weight by fund size at the window's start when we hold that quarter; otherwise the
    # earliest quarter we hold, and the tooltip says which ("weighted by fund size in ...").
    quarter = (
        db.query(func.max(SchemeAaum.reference_period)).filter(SchemeAaum.reference_period <= scenario.start_date).scalar()
        or db.query(func.min(SchemeAaum.reference_period)).scalar()
    )
    if quarter is None:
        return
    weights = {
        sid: value for sid, value in db.query(SchemeAaum.scheme_id, SchemeAaum.aaum_value).filter(
            SchemeAaum.reference_period == quarter, SchemeAaum.scheme_id.in_(list(real_pct_by_scheme))
        ).all()
    }
    classes = {s.id: underlying_asset_class(s.sebi_category or "", s.name) for s in all_schemes if s.id in real_pct_by_scheme}
    equity = {sid: p for sid, p in real_pct_by_scheme.items() if classes.get(sid) in ("Equity", "Index/ETF")}
    debt = {sid: p for sid, p in real_pct_by_scheme.items() if classes.get(sid) in ("Debt-short", "Debt-long")}
    scenario.quick_equity_pct = _aum_weighted(equity, weights)
    scenario.quick_debt_pct = _aum_weighted(debt, weights)
    scenario.quick_weight_quarter = quarter


def get_scenario_summary(db: Session, scenario: Scenario, *, has_phases: bool | None = None) -> ScenarioSummaryRow:
    if has_phases is None:
        has_phases = db.query(Scenario).filter_by(parent_scenario_id=scenario.id).first() is not None
    return ScenarioSummaryRow(
        scenario_id=str(scenario.id), name=scenario.name, scenario_type=scenario.scenario_type,
        start_date=scenario.start_date.isoformat() if scenario.start_date else None,
        end_date=scenario.end_date.isoformat() if scenario.end_date else None,
        is_ongoing=scenario.is_ongoing, display_rank=scenario.display_rank,
        parent_scenario_id=str(scenario.parent_scenario_id) if scenario.parent_scenario_id else None,
        has_phases=has_phases, had_redemption_freeze_schemes=scenario.had_redemption_freeze_schemes,
        quick_market_pct=_pct_str(scenario.quick_market_pct), quick_equity_pct=_pct_str(scenario.quick_equity_pct),
        quick_debt_pct=_pct_str(scenario.quick_debt_pct),
        quick_weight_quarter=scenario.quick_weight_quarter.isoformat() if scenario.quick_weight_quarter else None,
    )


def _current_phase(db: Session, group: Scenario) -> Scenario:
    phases = db.query(Scenario).filter_by(parent_scenario_id=group.id).order_by(Scenario.phase_order.desc()).all()
    return phases[0] if phases else group


def _pct_str(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


_SEGREGATED_SUFFIX = re.compile(r"\s*\(no\.?\s*of\s+segregated\s+portfolios?\s*-\s*\d+\)\s*$", re.IGNORECASE)


def _freeze_key(name: str) -> str:
    # AMFI's base names for the 6 wound-up Franklin schemes carry a suffix with varying case
    # and spacing ("Franklin India Short-Term Income Plan (no. of segregated portfolios- 3)"),
    # while live funds have close names ("Franklin India Short Term Fund"), so the match is
    # exact on cleaned text, never "contains" (card 7).
    text = _SEGREGATED_SUFFIX.sub("", name).lower().replace("-", " ")
    return " ".join(text.split())


def _is_frozen(scheme: Scheme, frozen_keys: set[str]) -> bool:
    if not frozen_keys or "franklin templeton" not in (scheme.amc_name or "").lower():
        return False
    base = scheme.base_name or scheme.name.split(" - ")[0]
    return _freeze_key(base) in frozen_keys


async def _async_get_scenario_result_for_household(
    db: Session, scenario: Scenario, household_member_ids: list[uuid.UUID]
) -> ScenarioResultRow:
    summary = get_scenario_summary(db, scenario)
    from app.models.user import HouseholdMember
    members = {m.id: m for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()}

    frozen_keys = {_freeze_key(name) for name in (scenario.had_redemption_freeze_schemes or [])}

    if scenario.scenario_type == "HYPOTHETICAL":
        assumptions = db.query(ScenarioHypotheticalAssumption).filter_by(scenario_id=scenario.id).all()
        if not assumptions:
            return ScenarioResultRow(
                scenario=summary, portfolio_impact_pct=None, rupee_impact=None,
                covered_value=None, total_value=None, no_data_funds=None, benchmarks=[],
                phases=[], by_fund=[], by_member=[], hypothetical_assumptions=[], assumptions_not_set=True,
            )
        assumption_by_class = {a.asset_class: a for a in assumptions}
        holdings = await compute_holdings(db, household_member_ids)
        by_member: dict[uuid.UUID, Decimal] = {mid: Decimal("0") for mid in household_member_ids}
        by_member_covered: dict[uuid.UUID, Decimal] = {mid: Decimal("0") for mid in household_member_ids}
        total_impact = covered_value = total_value = Decimal("0")
        no_data_funds = 0
        for holding in holdings:
            if holding.current_value is not None:
                total_value += Decimal(holding.current_value)
            if holding.current_value is None or Decimal(holding.current_value) <= 0:
                continue
            scheme = db.get(Scheme, uuid.UUID(holding.scheme_id))
            bucket = underlying_asset_class(scheme.sebi_category or "", scheme.name) if scheme else "Other"
            assumption = assumption_by_class.get(bucket)
            if assumption is None:
                no_data_funds += 1
                continue
            impact = Decimal(holding.current_value) * assumption.assumed_pct_change / 100
            member_id = uuid.UUID(holding.household_member_id)
            by_member[member_id] = by_member.get(member_id, Decimal("0")) + impact
            by_member_covered[member_id] = by_member_covered.get(member_id, Decimal("0")) + Decimal(holding.current_value)
            total_impact += impact
            covered_value += Decimal(holding.current_value)

        return ScenarioResultRow(
            scenario=summary,
            portfolio_impact_pct=_pct_str((total_impact / covered_value * 100).quantize(Decimal("0.01"))) if covered_value else None,
            rupee_impact=str(total_impact.quantize(Decimal("0.01"))),
            covered_value=str(covered_value.quantize(Decimal("0.01"))), total_value=str(total_value.quantize(Decimal("0.01"))),
            no_data_funds=no_data_funds,
            benchmarks=[], phases=[], by_fund=[],
            by_member=[
                ScenarioMemberResult(
                    household_member_id=str(mid), member_name=members[mid].name if mid in members else "Unknown",
                    rupee_impact=str(impact.quantize(Decimal("0.01"))),
                    pct=_pct_str((impact / by_member_covered[mid] * 100).quantize(Decimal("0.01"))) if by_member_covered.get(mid) else None,
                    funds=[],
                )
                for mid, impact in by_member.items()
            ],
            hypothetical_assumptions=[
                ScenarioHypotheticalAssumptionRow(asset_class=a.asset_class, assumed_pct_change=str(a.assumed_pct_change), assumption_note=a.assumption_note)
                for a in assumptions
            ],
            assumptions_not_set=False,
        )

    serving_scenario = _current_phase(db, scenario) if summary.has_phases else scenario
    holdings = await compute_holdings(db, household_member_ids)
    held_ids = {uuid.UUID(h.scheme_id) for h in holdings}
    held_schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_(held_ids)).all()}
    results = _held_results(db, serving_scenario.id, held_schemes)
    headline_results = _held_results(db, scenario.id, held_schemes) if summary.has_phases else results
    frozen_ids = {sid for sid, s in held_schemes.items() if _is_frozen(s, frozen_keys)}

    by_fund_map: dict[str, ScenarioFundResult] = {}
    by_member_rupee: dict[uuid.UUID, Decimal] = {mid: Decimal("0") for mid in household_member_ids}
    by_member_covered: dict[uuid.UUID, Decimal] = {mid: Decimal("0") for mid in household_member_ids}
    by_member_funds: dict[uuid.UUID, list[ScenarioMemberFundResult]] = {mid: [] for mid in household_member_ids}
    total_rupee = Decimal("0")
    covered_value = Decimal("0")
    total_value = Decimal("0")
    no_data_funds = 0

    for holding in holdings:
        scheme_id = uuid.UUID(holding.scheme_id)
        member_id = uuid.UUID(holding.household_member_id)
        scheme_result = results.get(scheme_id)
        headline_result = headline_results.get(scheme_id)
        is_frozen = scheme_id in frozen_ids
        current_value = Decimal(holding.current_value) if holding.current_value else Decimal("0")
        total_value += current_value

        pct = None if is_frozen else (headline_result.pct_change if headline_result else None)
        rupee_impact = None
        if pct is not None:
            rupee_impact = (current_value * pct / 100).quantize(Decimal("0.01"))
            by_member_rupee[member_id] += rupee_impact
            by_member_covered[member_id] += current_value
            total_rupee += rupee_impact
            covered_value += current_value
        elif not is_frozen and current_value > 0:
            no_data_funds += 1

        by_fund_map[holding.scheme_id] = ScenarioFundResult(
            scheme_id=holding.scheme_id, scheme_name=holding.scheme_name,
            pct=_pct_str(None if is_frozen else (scheme_result.pct_change if scheme_result else None)), is_proxied=scheme_result.is_proxied if scheme_result else False,
            proxy_basis=scheme_result.proxy_basis if scheme_result else None, is_frozen=is_frozen,
        )
        by_member_funds[member_id].append(
            ScenarioMemberFundResult(scheme_id=holding.scheme_id, scheme_name=holding.scheme_name, rupee_impact=_pct_str(rupee_impact))
        )

    def household_pct(pct_by_scheme: dict[uuid.UUID, Decimal | None]) -> str | None:
        # Fix 6: this household's own number -- rupee impact over the value it covers.
        # No-data and frozen holdings are left out of both sums, never counted as 0%.
        impact = covered = Decimal("0")
        for holding in holdings:
            sid = uuid.UUID(holding.scheme_id)
            pct = pct_by_scheme.get(sid)
            if pct is None or sid in frozen_ids or not holding.current_value:
                continue
            value = Decimal(holding.current_value)
            impact += value * pct / 100
            covered += value
        return _pct_str((impact / covered * 100).quantize(Decimal("0.01"))) if covered else None

    phases: list[ScenarioPhaseResult] = []
    if summary.has_phases:
        for phase in db.query(Scenario).filter_by(parent_scenario_id=scenario.id).order_by(Scenario.phase_order).all():
            phase_results = {sid: r.pct_change for sid, r in _held_results(db, phase.id, held_schemes).items()}
            phases.append(ScenarioPhaseResult(
                label=phase.phase_label, order=phase.phase_order,
                start_date=phase.start_date.isoformat(), end_date=phase.end_date.isoformat() if phase.end_date else None,
                is_ongoing=phase.is_ongoing, pct=household_pct(phase_results),
            ))
    portfolio_impact_pct = (
        _pct_str((total_rupee / covered_value * 100).quantize(Decimal("0.01"))) if covered_value else None
    )

    return ScenarioResultRow(
        scenario=summary, portfolio_impact_pct=portfolio_impact_pct, rupee_impact=str(total_rupee.quantize(Decimal("0.01"))),
        covered_value=str(covered_value.quantize(Decimal("0.01"))), total_value=str(total_value.quantize(Decimal("0.01"))),
        no_data_funds=no_data_funds,
        benchmarks=_scenario_benchmark_comparisons(db, scenario) if not summary.had_redemption_freeze_schemes and not summary.has_phases else [],
        phases=phases, by_fund=list(by_fund_map.values()),
        by_member=[
            ScenarioMemberResult(
                household_member_id=str(mid), member_name=members[mid].name if mid in members else "Unknown",
                rupee_impact=str(by_member_rupee[mid].quantize(Decimal("0.01"))),
                pct=_pct_str((by_member_rupee[mid] / by_member_covered[mid] * 100).quantize(Decimal("0.01"))) if by_member_covered[mid] else None,
                funds=by_member_funds[mid],
            )
            for mid in household_member_ids
        ],
        hypothetical_assumptions=[], assumptions_not_set=False,
    )


def get_scenario_result_for_household(
    db: Session, scenario: Scenario, household_member_ids: list[uuid.UUID]
) -> ScenarioResultRow:
    """Sync-callable wrapper -- `compute_holdings` is async (it awaits
    `warm_nav_history` internally for stale-NAV cases), but this function's
    own logic is otherwise synchronous DB reads; callers needing the async
    path directly (e.g. this module's own tests, and the FastAPI route in
    Task 7) should call `_async_get_scenario_result_for_household` instead."""
    import asyncio
    return asyncio.run(_async_get_scenario_result_for_household(db, scenario, household_member_ids))


def _benchmark_levels(db: Session, index: BenchmarkIndex, start: date, end: date) -> tuple[Decimal | None, Decimal | None]:
    levels = []
    for boundary, target in (("start", start), ("end", end)):
        upper = BenchmarkIndexHistory.date < target if boundary == "start" else BenchmarkIndexHistory.date <= target
        row = (
            db.query(BenchmarkIndexHistory)
            .filter(BenchmarkIndexHistory.index_name == index,
                    BenchmarkIndexHistory.return_type == BenchmarkReturnType.TRI,
                    upper, BenchmarkIndexHistory.date >= target - timedelta(days=7))
            .order_by(BenchmarkIndexHistory.date.desc()).first()
        )
        levels.append(row.value if row else None)
    return levels[0], levels[1]


def _scenario_benchmark_comparisons(db: Session, scenario: Scenario) -> list[ScenarioBenchmarkResult]:
    if scenario.start_date is None:
        return []
    end = scenario.end_date or date.today()
    comparisons = []
    for index in BenchmarkIndex:
        start_level, end_level = _benchmark_levels(db, index, scenario.start_date, end)
        if start_level is None or end_level is None or start_level <= 0:
            continue
        pct = ((end_level - start_level) / start_level * 100).quantize(Decimal("0.01"))
        comparisons.append(ScenarioBenchmarkResult(name=index.value, pct=str(pct)))
    return comparisons
