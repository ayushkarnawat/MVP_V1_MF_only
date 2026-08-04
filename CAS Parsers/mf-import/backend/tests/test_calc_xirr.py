from datetime import date
from decimal import Decimal

import pytest

from app.calc import Cashflow, Transaction, TransactionType, build_cashflows, xirr


def test_xirr_empty_returns_none():
    assert xirr([]) is None


def test_xirr_single_cashflow_returns_none():
    flows = [Cashflow(date(2024, 1, 1), Decimal("-10000"))]
    assert xirr(flows) is None


def test_xirr_all_negative_returns_none():
    flows = [
        Cashflow(date(2024, 1, 1), Decimal("-5000")),
        Cashflow(date(2024, 2, 1), Decimal("-5000")),
    ]
    assert xirr(flows) is None


def test_xirr_simple_lump_sum():
    """Invest 10000 on Jan 1, worth 11000 on Dec 31 → ~10% XIRR."""
    flows = [
        Cashflow(date(2024, 1, 1), Decimal("-10000")),
        Cashflow(date(2024, 12, 31), Decimal("11000")),
    ]
    result = xirr(flows)
    assert result is not None
    assert abs(result - Decimal("0.10")) < Decimal("0.005")


def test_xirr_monthly_sip_series():
    """Monthly SIP of 5000 for 12 months, terminal 65000 on Dec 31."""
    from app.calc import _npv

    dates = [
        date(2024, 1, 1), date(2024, 2, 1), date(2024, 3, 1), date(2024, 4, 1),
        date(2024, 5, 1), date(2024, 6, 1), date(2024, 7, 1), date(2024, 8, 1),
        date(2024, 9, 1), date(2024, 10, 1), date(2024, 11, 1), date(2024, 12, 1),
    ]
    flows = [Cashflow(d, Decimal("-5000")) for d in dates]
    flows.append(Cashflow(date(2024, 12, 31), Decimal("65000")))

    result = xirr(flows)
    assert result is not None
    # Verify NPV ≈ 0 at computed rate (known-answer self-consistency)
    npv = _npv(result, flows)
    assert abs(npv) < Decimal("0.01")
    assert Decimal("0.10") < result < Decimal("0.20")


def test_build_cashflows_with_terminal():
    txns = [
        Transaction(date(2024, 1, 1), TransactionType.PURCHASE, Decimal("10000"), Decimal("100")),
        Transaction(date(2024, 6, 1), TransactionType.REDEMPTION, Decimal("5000"), Decimal("50")),
    ]
    flows = build_cashflows(txns, Decimal("6000"), date(2024, 12, 31))
    assert len(flows) == 3
    assert flows[0].amount == Decimal("-10000")
    assert flows[1].amount == Decimal("5000")
    assert flows[2].amount == Decimal("6000")
