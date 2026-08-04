from datetime import date
from decimal import Decimal

from app.calc import (
    NavPoint,
    Transaction,
    TransactionType,
    compute_holdings,
    fifo_cost_basis,
    fifo_realized_gains,
    invested_amount,
)


def _buy(d: date, units: str, nav: str, amount: str | None = None) -> Transaction:
    u = Decimal(units)
    n = Decimal(nav)
    amt = Decimal(amount) if amount else u * n
    return Transaction(d, TransactionType.PURCHASE, amt, u, n)


def _sell(d: date, units: str, nav: str) -> Transaction:
    u = Decimal(units)
    n = Decimal(nav)
    return Transaction(d, TransactionType.REDEMPTION, u * n, u, n)


def test_compute_holdings_net_units():
    txns = [
        _buy(date(2024, 1, 1), "100", "10"),
        _buy(date(2024, 6, 1), "50", "12"),
        _sell(date(2025, 1, 1), "80", "15"),
    ]
    assert compute_holdings(txns) == Decimal("70.000")


def test_fifo_four_transaction_fixture():
    """Buy 100@10, Buy 50@12, Sell 80@15 — hand-computed gains.

    Sell 80 units:
    - 80 from first lot @ 10 → cost 800, proceeds 1200, gain 400 (STCG, ~12 months)
    Remaining: 20@10 + 50@12 = 20 + 50 = 70 units
    """
    txns = [
        _buy(date(2024, 1, 1), "100", "10"),
        _buy(date(2024, 6, 1), "50", "12"),
        _sell(date(2025, 1, 1), "80", "15"),
    ]
    lots, avg_cost = fifo_cost_basis(txns)
    assert compute_holdings(txns) == Decimal("70.000")
    assert len(lots) == 2
    assert lots[0].units == Decimal("20")
    assert lots[1].units == Decimal("50")

    result = fifo_realized_gains(txns, "Equity Scheme - Large Cap Fund", [])
    assert len(result.realized_gains) == 1
    assert result.realized_gains[0].units == Decimal("80")
    assert result.realized_gains[0].gain == Decimal("400.00")
    assert result.realized_gains[0].gain_type == "STCG"
    assert result.total_realized_gain == Decimal("400.00")
    assert result.stcg == Decimal("400.00")


def test_invested_amount():
    txns = [
        _buy(date(2024, 1, 1), "100", "10"),
        _buy(date(2024, 6, 1), "50", "12"),
        _sell(date(2025, 1, 1), "80", "15"),
    ]
    # 1000 + 600 - 1200 = 400
    assert invested_amount(txns) == Decimal("400.00")


def test_debt_post_apr_2023_classified_as_slab():
    txns = [
        _buy(date(2023, 5, 1), "100", "10"),
        _sell(date(2024, 6, 1), "100", "12"),
    ]
    result = fifo_realized_gains(txns, "Debt Scheme - Corporate Bond Fund", [])
    assert result.realized_gains[0].gain_type == "SLAB"
    assert result.slab_gains == Decimal("200.00")


def test_grandfathering_uses_jan_2018_nav_when_beneficial():
    txns = [
        _buy(date(2017, 6, 1), "100", "10"),  # cost 1000
        _sell(date(2024, 6, 1), "100", "20"),  # proceeds 2000
    ]
    nav_history = [NavPoint(date(2018, 1, 31), Decimal("15"))]  # substituted cost 1500
    result = fifo_realized_gains(txns, "Equity Scheme - Large Cap Fund", nav_history)
    assert result.realized_gains[0].gain == Decimal("500.00")  # 2000 - 1500
    assert "Grandfathering" in result.realized_gains[0].note
