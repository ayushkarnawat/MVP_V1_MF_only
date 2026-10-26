"""H1 end to end: a member with a long history uploads a second CAS that brings a new folio. The second
statement's opening balance is dated at its own start, which is not when the money was invested."""

import asyncio
import uuid
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from app.models.enums import PlanType, TransactionOrigin, TransactionType
from app.models.folio import Folio
from app.models.transaction import Transaction
from app.services.analytics.benchmark import compute_fund_vs_benchmark, compute_portfolio_vs_benchmarks
from tests.services.analytics.test_benchmark import (
    _folio_with_purchase,
    _household_member,
    _mock_holdings_multi,
    _no_fetch,
    _scheme,
    _seed_all_tri_history,
    _session,
    _window_context,
)


def _add_second_cas_opening(db, member, scheme, opened_on):
    folio = Folio(
        id=uuid.uuid4(),
        household_member_id=member.id,
        scheme_id=scheme.id,
        folio_number="SECOND-CAS",
        plan_type=PlanType.DIRECT,
    )
    db.add(folio)
    db.commit()
    db.add(
        Transaction(
            id=uuid.uuid4(),
            folio_id=folio.id,
            import_id=uuid.uuid4(),
            type=TransactionType.OPENING_BALANCE,
            date=opened_on,
            amount=Decimal("90000"),
            units=Decimal("9000"),
            nav=Decimal("10"),
            origin=TransactionOrigin.CAS_OPENING,
        )
    )
    db.commit()


def _patched_context(ctx):
    return patch(
        "app.services.analytics.benchmark.build_window_context",
        new=AsyncMock(return_value=ctx),
        create=True,
    )


def test_portfolio_windows_are_unavailable_when_a_second_cas_opening_falls_inside_them():
    db = _session()
    member = _household_member(db)
    first_fund = _scheme(db, "Long Held Fund")
    second_fund = _scheme(db, "Second Statement Fund")
    purchase_date = date.today().replace(year=date.today().year - 6)
    _folio_with_purchase(db, member, first_fund, Decimal("1000"), Decimal("100"), Decimal("10"), purchase_date)
    opened_on = date.today() - timedelta(days=120)
    _add_second_cas_opening(db, member, second_fund, opened_on)
    ctx = _window_context([first_fund.id, second_fund.id])
    _seed_all_tri_history(
        db, [purchase_date, opened_on, date.today(), *(s for s in ctx.starts.values() if s is not None)]
    )

    p1, p2 = _mock_holdings_multi({first_fund.id: Decimal("12"), second_fund.id: Decimal("11")})
    with p1, p2, _no_fetch(), _patched_context(ctx):
        summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    by_window = {window.window: window for window in summary.windows}
    for name in ("1Y", "3Y", "5Y"):
        assert by_window[name].available is False
        assert by_window[name].portfolio_xirr is None
        assert all(row.xirr is None for row in by_window[name].indices)
        assert by_window[name].unavailable_reason == "opening_balance_in_window"
    # The since-inception row is the legacy number, untouched.
    assert by_window["SI"].available is True
    assert by_window["SI"].portfolio_xirr == summary.portfolio_xirr


def test_fund_windows_have_no_rate_when_a_second_folio_of_the_same_fund_opens_inside_them():
    db = _session()
    member = _household_member(db)
    fund = _scheme(db, "Two Folio Fund")
    purchase_date = date.today().replace(year=date.today().year - 6)
    _folio_with_purchase(db, member, fund, Decimal("1000"), Decimal("100"), Decimal("10"), purchase_date)
    opened_on = date.today() - timedelta(days=120)
    _add_second_cas_opening(db, member, fund, opened_on)
    ctx = _window_context([fund.id])
    _seed_all_tri_history(
        db, [purchase_date, opened_on, date.today(), *(s for s in ctx.starts.values() if s is not None)]
    )

    p1, p2 = _mock_holdings_multi({fund.id: Decimal("12")})
    with p1, p2, _no_fetch(), _patched_context(ctx):
        comparison = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    [row] = comparison.funds
    by_window = {window.window: window for window in row.windows}
    for name in ("1Y", "3Y", "5Y"):
        assert (by_window[name].fund_xirr, by_window[name].benchmark_xirr) == (None, None)
    assert by_window["SI"].fund_xirr == row.fund_xirr
