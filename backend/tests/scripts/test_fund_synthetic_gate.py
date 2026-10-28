from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.models.enums import TransactionType
from app.services.dashboard.xirr import xirr
from scripts.fund_synthetic_gate import oracle_fifo, oracle_xirr


def test_oracle_xirr_matches_production_on_hand_case():
    flows = [
        (date(2020, 1, 1), Decimal("-1000")),
        (date(2023, 1, 1), Decimal("1331")),
    ]
    assert abs(oracle_xirr(flows) - xirr(flows)) < Decimal("0.0000000001")


def test_oracle_fifo_replays_two_lots_without_importing_lot_rules():
    rows = [
        (TransactionType.PURCHASE.value, Decimal("10"), Decimal("100"), Decimal("1000")),
        (TransactionType.PURCHASE.value, Decimal("20"), Decimal("50"), Decimal("1000")),
        (TransactionType.REDEMPTION.value, Decimal("30"), Decimal("120"), Decimal("3600")),
    ]
    units, invested = oracle_fifo(rows)
    assert units == Decimal("30")
    assert invested == Decimal("600")
