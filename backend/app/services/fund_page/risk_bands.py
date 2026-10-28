from __future__ import annotations

from decimal import Decimal


def band_for(
    metric: str,
    value: Decimal,
    fund_class: str,
) -> tuple[str, str] | None:
    if fund_class != "Equity":
        return None
    if metric == "volatility":
        if value < Decimal("12"):
            return "Low", "pos"
        if value <= Decimal("18"):
            return "Moderate", "warn"
        return "High", "neg"
    if metric == "max_drawdown":
        if value > Decimal("-15"):
            return "Low", "pos"
        if value >= Decimal("-30"):
            return "Moderate", "warn"
        return "High", "neg"
    if metric == "sharpe":
        if value < Decimal("0.5"):
            return "Weak", "neg"
        if value <= Decimal("1.0"):
            return "Fair", "warn"
        return "Good", "pos"
    if metric == "beta":
        if value <= Decimal("0.95"):
            return "Lower risk", "pos"
        if value <= Decimal("1.05"):
            return "Market-like", "neu"
        return "Higher risk", "warn"
    raise ValueError(f"Unknown risk metric: {metric}")
