"""Invented cash flows for the actual-days/365 XIRR comparison."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, localcontext


@dataclass(frozen=True)
class XirrFixture:
    name: str
    flows: list[tuple[date, Decimal]]
    expected: Decimal | None
    excel_value: Decimal | None


def _cash_flows(
    name: str, *rows: tuple[str, str], expected: Decimal | None = None,
) -> XirrFixture:
    flows = [(date.fromisoformat(day), Decimal(amount)) for day, amount in rows]
    return XirrFixture(name=name, flows=flows, expected=expected, excel_value=None)


def _lump_sum(
    name: str, start: str, end: str, outflow: str, terminal: str,
    *offsetting_rows: tuple[str, str],
) -> XirrFixture:
    """Solve the growth factor for two nonzero net flows on distinct dates."""
    days = (date.fromisoformat(end) - date.fromisoformat(start)).days
    with localcontext() as context:
        context.prec = 50
        expected = (Decimal(terminal) / -Decimal(outflow)) ** (Decimal(365) / days) - 1
    return _cash_flows(name, (start, outflow), *offsetting_rows, (end, terminal), expected=expected)


def _monthly_sip(months: int, terminal: str) -> XirrFixture:
    flows = [(date(2021 + month // 12, 1 + month % 12, 15), Decimal("-1000"))
             for month in range(months)]
    flows.append((date(2021 + months // 12, 1, 15), Decimal(terminal)))
    return XirrFixture(
        name=f"monthly_sip_{months}_months", flows=flows, expected=None, excel_value=None,
    )


# The two-flow cases and the purchase/reversal pair that nets to two flows have closed forms.
# For the other solvable cases, pytest obtains the expectation from the independent solver.
# The orchestrator fills excel_value from Excel on these same flows.
FIXTURES: list[XirrFixture] = [
    _lump_sum("lump_sum_365_days", "2022-03-01", "2023-03-01", "-1000", "1250"),
    _lump_sum("lump_sum_366_days_across_feb_29", "2023-03-01", "2024-03-01", "-1000", "1250"),
    _lump_sum("lump_sum_two_years", "2021-01-01", "2023-01-01", "-1000", "1440"),
    _lump_sum("lump_sum_three_years_negative", "2021-01-01", "2024-01-01", "-1000", "729"),
    _monthly_sip(12, "13050"),
    _monthly_sip(36, "42900"),
    _cash_flows(
        "sip_with_partial_redemption",
        ("2024-01-10", "-1000"), ("2024-02-10", "-1000"), ("2024-03-10", "-1000"),
        ("2024-06-20", "800"), ("2025-01-10", "2600"),
    ),
    _cash_flows(
        "sip_then_full_redemption",
        ("2023-04-05", "-700"), ("2023-05-05", "-700"), ("2023-06-05", "-700"),
        ("2025-04-05", "2600"),
    ),
    _lump_sum("three_months_up", "2025-01-01", "2025-04-01", "-1000", "1200"),
    _lump_sum("three_months_down", "2025-01-01", "2025-04-01", "-1000", "850"),
    _lump_sum("one_month", "2025-04-01", "2025-05-01", "-1000", "1100"),
    _lump_sum("steep_fall_60_percent_one_year", "2022-06-01", "2023-06-01", "-1000", "400"),
    _lump_sum("steep_fall_90_percent_two_years", "2021-06-01", "2023-06-01", "-1000", "100"),
    _cash_flows("same_day_buy_and_sell", ("2024-05-01", "-1000"), ("2024-05-01", "1030")),
    _cash_flows(
        "same_day_net_zero",
        ("2024-05-01", "-1000"), ("2024-05-01", "-400"), ("2024-05-01", "1400"),
    ),
    _cash_flows("no_money_out", ("2024-01-05", "100"), ("2025-01-05", "1400")),
    _cash_flows("no_money_in", ("2024-01-05", "-1000"), ("2025-01-05", "0")),
    _cash_flows("single_flow", ("2025-01-05", "1400")),
    _lump_sum("tenfold_gain_in_five_years", "2020-01-01", "2025-01-01", "-1000", "10000"),
    _cash_flows(
        "opening_balance_before_first_transaction",
        ("2021-01-01", "-4500"), ("2022-03-12", "-1000"), ("2024-01-01", "7000"),
    ),
    _cash_flows(
        "quarterly_top_ups",
        ("2023-01-01", "-2100"), ("2023-04-01", "-600"), ("2023-07-01", "-700"),
        ("2023-10-01", "-800"), ("2024-01-01", "4700"),
    ),
    _lump_sum(
        "purchase_reversed_same_day", "2023-01-01", "2024-01-01", "-1100", "1300",
        ("2023-06-01", "-750"), ("2023-06-01", "750"),
    ),
    _cash_flows(
        "fund_fully_sold_then_bought_again",
        ("2021-01-01", "-1000"), ("2022-01-01", "1100"), ("2023-01-01", "-1100"),
        ("2024-01-01", "1320"),
    ),
    _cash_flows(
        "gift_received_then_gift_given",
        ("2022-03-01", "-2200"), ("2023-03-01", "550"), ("2024-03-01", "2250"),
    ),
    _lump_sum("unchanged_value_over_one_year", "2022-01-01", "2023-01-01", "-1000", "1000"),
]
