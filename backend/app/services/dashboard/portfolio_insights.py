from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal, Sequence

from app.core.decimal_utils import quantize_amount
from app.models.enums import PlanType
from app.services.dashboard.portfolio_insights_schemas import (
    FundSpreadOut,
    InsightsOut,
    LargestAmcOut,
    LargestHoldingOut,
    PlanSplitEntryOut,
    PlanSplitOut,
    SipInsightOut,
)
from app.services.dashboard.schemas import HoldingRow, SipRow


PCT = Decimal("0.0001")
HUNDRED = Decimal("100")
ZERO = Decimal("0.00")
UNKNOWN_AMC = "Unknown AMC"


@dataclass(frozen=True)
class PortfolioInsights:
    total_value: Decimal
    empty: bool
    empty_reason: Literal["no_holdings", "no_prices"] | None
    insights: InsightsOut


def _pct(value: Decimal, total: Decimal) -> Decimal:
    # Not forced to sum to 100; a zero total (every counted row worth 0.00) gives 0.0000 rather than dividing.
    if total == 0:
        return Decimal("0.0000")
    return (value / total * HUNDRED).quantize(PCT, rounding=ROUND_HALF_UP)


def _sips(sip_rows: Sequence[SipRow]) -> SipInsightOut:
    # Parallel twins (same amount, same month) are separate SIPs: `series_count` of them, each paying `sip_amount`.
    # Counting rows or summing `sip_amount` alone would show half for a household running two identical SIPs.
    active = sum(row.series_count for row in sip_rows)
    monthly = sum((Decimal(row.sip_amount) * row.series_count for row in sip_rows), ZERO)
    return SipInsightOut(active_count=active, monthly_total=quantize_amount(monthly))


def compute_portfolio_insights(
    holdings: Sequence[HoldingRow], sip_rows: Sequence[SipRow],
) -> PortfolioInsights:
    sips = _sips(sip_rows)
    held = [row for row in holdings if Decimal(row.units_held) > 0]
    # A valued row is one with a price (register C88). A no-NAV fund is excluded from every value, share and count.
    counted = [row for row in held if not row.nav_unavailable and row.current_value is not None]
    if not counted:
        return PortfolioInsights(
            total_value=ZERO, empty=True, empty_reason="no_prices" if held else "no_holdings",
            insights=InsightsOut(
                largest_holding=None, spread=FundSpreadOut(fund_count=0, amc_count=0),
                plan_split=None, largest_amc=None, sips=sips,
            ),
        )

    # Each row is rounded to the paisa first, then summed: the same total as `portfolio-summary` (C88).
    values = [quantize_amount(Decimal(row.current_value)) for row in counted]
    total = sum(values, ZERO)

    # A fund is a scheme_id, summed across members and across rows of that scheme.
    funds: dict[str, dict] = {}
    for row, value in zip(counted, values):
        fund = funds.setdefault(
            row.scheme_id,
            {"scheme_id": row.scheme_id, "name": row.scheme_name, "amc": row.amc_name.strip() or UNKNOWN_AMC,
             "value": ZERO},
        )
        fund["value"] += value
    # Ties (equal value) break by name then scheme_id ascending so the answer never flips between runs.
    largest = min(funds.values(), key=lambda f: (-f["value"], f["name"], f["scheme_id"]))

    amcs: dict[str, dict] = {}
    for fund in funds.values():
        amc = amcs.setdefault(fund["amc"], {"amc_name": fund["amc"], "value": ZERO, "fund_count": 0})
        amc["value"] += fund["value"]
        amc["fund_count"] += 1
    largest_amc = min(amcs.values(), key=lambda a: (-a["value"], a["amc_name"]))

    # `unclassified` is its own entry and never folded into direct or regular, so the three always add up to total.
    by_plan = {plan: ZERO for plan in (PlanType.DIRECT, PlanType.REGULAR, PlanType.UNCLASSIFIED)}
    for row, value in zip(counted, values):
        by_plan[row.plan_type] += value
    entry = lambda plan: PlanSplitEntryOut(value=by_plan[plan], pct=_pct(by_plan[plan], total))

    return PortfolioInsights(
        total_value=total, empty=False, empty_reason=None,
        insights=InsightsOut(
            largest_holding=LargestHoldingOut(
                scheme_id=largest["scheme_id"], fund_name=largest["name"], amc_name=largest["amc"],
                value=largest["value"], pct_of_portfolio=_pct(largest["value"], total),
            ),
            spread=FundSpreadOut(fund_count=len(funds), amc_count=len(amcs)),
            plan_split=PlanSplitOut(
                direct=entry(PlanType.DIRECT), regular=entry(PlanType.REGULAR),
                unclassified=entry(PlanType.UNCLASSIFIED),
            ),
            largest_amc=LargestAmcOut(
                amc_name=largest_amc["amc_name"], value=largest_amc["value"],
                pct_of_portfolio=_pct(largest_amc["value"], total), fund_count=largest_amc["fund_count"],
            ),
            sips=sips,
        ),
    )
