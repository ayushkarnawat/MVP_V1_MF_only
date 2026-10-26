from __future__ import annotations

from decimal import Decimal
from typing import Sequence

from app.core.decimal_utils import quantize_amount
from app.services.dashboard.portfolio_schemas import InstrumentBucketOut
from app.services.dashboard.schemas import HoldingRow
from app.services.dashboard.xirr import DashboardXirrSummary


_COMING_SOON_LABELS = (
    "Direct Stocks", "US Stocks", "FDs & Bonds", "Debt", "Gold", "Real Estate", "Others",
)


def compute_instrument_allocation(
    holdings: Sequence[HoldingRow], xirr_summary: DashboardXirrSummary
) -> list[InstrumentBucketOut]:
    valued = [
        row for row in holdings if not row.nav_unavailable and row.current_value is not None
    ]
    current_value = sum(
        (quantize_amount(Decimal(row.current_value)) for row in valued), Decimal("0.00")
    )
    invested = sum(
        (quantize_amount(Decimal(row.amount_invested)) for row in valued), Decimal("0.00")
    )
    mutual_funds = InstrumentBucketOut(
        label="Mutual Funds", status="live",
        current_value=current_value, percentage=Decimal("100.00") if current_value > 0 else Decimal("0.00"),
        invested=invested, gain_loss=current_value - invested, xirr=xirr_summary.lifetime_xirr,
    )
    coming_soon = [
        InstrumentBucketOut(
            label=label, status="coming_soon",
            current_value=None, percentage=None, invested=None, gain_loss=None, xirr=None,
        )
        for label in _COMING_SOON_LABELS
    ]
    return [mutual_funds, *coming_soon]
