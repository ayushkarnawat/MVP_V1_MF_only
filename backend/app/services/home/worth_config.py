from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class WorthThresholds:
    max_cards: int = 3
    weak_tier: int = 1
    weak_min_share_pct: Decimal = Decimal("2")
    underperform_gap_pp: Decimal = Decimal("3")
    underperform_min_share_pct: Decimal = Decimal("3")
    expense_gap_pp: Decimal = Decimal("0.5")
    expense_min_share_pct: Decimal = Decimal("3")
    concentration_top5_pct: Decimal = Decimal("20")
    concentration_min_coverage_pct: Decimal = Decimal("50")


DEFAULT_THRESHOLDS = WorthThresholds()
