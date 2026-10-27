from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class FundModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Unavailable(FundModel):
    status: Literal["unavailable"] = "unavailable"
    reason: str


def plain(value: Decimal, places: int) -> str:
    """Quantize to `places` decimals, HALF_UP, string form -- never a
    negative-zero string (`-0.0000`/`-0.00`)."""
    quantized = value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    if quantized == 0:
        quantized = abs(quantized)
    return format(quantized, "f")


# Every money/unit/NAV/percent field below is `str`, not Home's `PlainDecimal`:
# `plain()` already does the quantization + negative-zero normalisation (the
# T2 guard test locks its return type to `str`), so a `PlainDecimal` field
# here would just reformat an already-formatted value for no benefit.


class ExpenseRatioOut(FundModel):
    value: str
    reference_period: date
    plan: str | None


class TilesOut(FundModel):
    current_value: str | None
    share_of_portfolio_pct: str | None
    invested: str | None
    total_gain: str | None
    total_gain_pct: str | None
    xirr: str | None
    expense_ratio: ExpenseRatioOut | None


class OpeningLotOut(FundModel):
    units: str
    since: date
    cost_source: Literal["cas_cost", "nav_on_start", "manual"]


class FolioOut(FundModel):
    folio_id: str
    member_id: str
    member_name: str
    folio_masked: str


class DetailsOut(FundModel):
    units: str | None
    average_nav: str | None
    current_nav: str | None
    invested: str | None
    current_value: str | None
    gain: str | None
    gain_pct: str | None
    xirr: str | None
    first_investment: date | None
    last_investment: date | None
    opening_lot: OpeningLotOut | None
    folios: list[FolioOut]


class SchemeInfoOut(FundModel):
    id: str
    name: str
    plan: str | None
    category: str
    amc_name: str


class OtherMemberOut(FundModel):
    id: str
    name: str


class SummaryResponse(FundModel):
    status: Literal["ready"] = "ready"
    scope: str
    held: bool
    held_by_other_members: list[OtherMemberOut]
    nav_as_of: date | None
    nav_stale: bool
    has_history: bool
    scheme: SchemeInfoOut
    tiles: TilesOut
    details: DetailsOut


class FolioNumberResponse(FundModel):
    status: Literal["ready"] = "ready"
    folio_id: str
    folio_number: str


class PerformancePoint(FundModel):
    date: date
    pct: str


class PeriodReturnsOut(FundModel):
    fund: str
    benchmark: str | None


class PerformanceResponse(FundModel):
    status: Literal["ready"] = "ready"
    scheme_id: str
    period: str
    start: date
    end: date
    clamped: bool
    since_launch: bool
    fund: list[PerformancePoint]
    benchmark_index: str | None
    benchmark_label: str | None
    benchmark: list[PerformancePoint] | None
    benchmark_reason: Literal["no_benchmark", "no_history"] | None
    period_returns: PeriodReturnsOut


class ReturnsResponse(FundModel):
    status: Literal["ready"] = "ready"
    mode: Literal["inception", "current"]
    columns: list[str]
    rows: dict[str, dict[str, str | None] | None]
    benchmark_reason: Literal["no_benchmark", "no_history"] | None


class RiskMetricOut(FundModel):
    value: str | None
    band: str | None
    tone: str | None


class RiskResponse(FundModel):
    status: Literal["ready"] = "ready"
    scheme_id: str
    window_start: date
    window_end: date
    points: int
    life_window: bool
    risk_free_rate: str
    volatility: RiskMetricOut
    max_drawdown: RiskMetricOut
    sharpe: RiskMetricOut
    beta: RiskMetricOut
    beta_reason: Literal["insufficient_shared_dates", "no_benchmark"] | None
