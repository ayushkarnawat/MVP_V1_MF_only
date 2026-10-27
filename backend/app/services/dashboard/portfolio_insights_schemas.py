from __future__ import annotations

from typing import Literal

from app.services.dashboard.portfolio_schemas import PortfolioDecimal
from app.services.home.schemas import Envelope, HomeModel, MemberOut


class LargestHoldingOut(HomeModel):
    scheme_id: str
    fund_name: str
    amc_name: str
    value: PortfolioDecimal
    pct_of_portfolio: PortfolioDecimal


class FundSpreadOut(HomeModel):
    fund_count: int
    amc_count: int


class PlanSplitEntryOut(HomeModel):
    value: PortfolioDecimal
    pct: PortfolioDecimal


class PlanSplitOut(HomeModel):
    direct: PlanSplitEntryOut
    regular: PlanSplitEntryOut
    unclassified: PlanSplitEntryOut


class LargestAmcOut(HomeModel):
    amc_name: str
    value: PortfolioDecimal
    pct_of_portfolio: PortfolioDecimal
    fund_count: int


class SipInsightOut(HomeModel):
    active_count: int
    monthly_total: PortfolioDecimal


class InsightsOut(HomeModel):
    largest_holding: LargestHoldingOut | None
    spread: FundSpreadOut  # {0, 0} when empty
    plan_split: PlanSplitOut | None
    largest_amc: LargestAmcOut | None
    sips: SipInsightOut  # always present


class PortfolioInsightsResponse(Envelope):
    # The household's members in created order in aggregate scope, null in member scope.
    members: list[MemberOut] | None
    total_value: PortfolioDecimal  # the denominator (C88), "0.00" when empty
    empty: bool
    empty_reason: Literal["no_holdings", "no_prices"] | None
    insights: InsightsOut
