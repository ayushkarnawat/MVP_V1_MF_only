from datetime import date, timedelta
from decimal import Decimal

from app.models.enums import TransactionType
from app.services.analytics.xirr import xirr
from app.services.dashboard.xirr import portfolio_xirr_display
from services.analytics.xirr_reference.fixtures import FIXTURES
from services.dashboard.test_xirr import _disclaimer_scenario


def _display(rows, rate=Decimal("0.25")):
    today = date.today()
    flows = [(today - timedelta(days=days), Decimal(amount)) for days, amount in rows]
    return portfolio_xirr_display(rate, flows)


def test_young_single_purchase_is_young():
    result = _display([(90, "-1000"), (0, "1200")])
    assert result.rate == Decimal("0.25")
    assert result.basis == "since_purchase"
    assert str(result.since_purchase_return) == "0.2"
    assert result.caution == "young"


def test_exactly_365_days_one_purchase_is_single_transaction():
    result = _display([(365, "-1000"), (0, "1250")])
    assert result.basis == "annualised"
    assert str(result.since_purchase_return) == "0.25"
    assert result.caution == "single_transaction"


def test_two_purchases_over_a_year_have_no_caution():
    result = _display([(365, "-500"), (200, "-500"), (0, "1300")])
    assert str(result.since_purchase_return) == "0.3"
    assert result.caution is None


def test_two_purchases_on_the_same_day_are_two_flows():
    result = _display([(400, "-500"), (400, "-500"), (0, "1300")])
    assert result.caution is None


def test_young_wins_over_single_transaction():
    assert _display([(364, "-1000"), (0, "1250")]).caution == "young"


def test_net_zero_on_one_day_has_no_caution_and_no_since_purchase():
    result = _display([(0, "-1000"), (0, "1000")])
    assert result.rate is result.basis is result.since_purchase_return is result.caution is None


def test_no_money_paid_gives_no_since_purchase_and_no_caution():
    for days in (90, 365):
        result = _display([(days, "1000"), (0, "1200")])
        assert result.since_purchase_return is result.caution is None


def test_no_rate_gives_no_caution():
    for days in (90, 365):
        result = _display([(days, "-1000"), (0, "1200")], rate=None)
        assert result.rate is result.caution is None
        assert str(result.since_purchase_return) == "0.2"
        assert result.basis == ("since_purchase" if days < 365 else None)


def test_a_loss_is_reported_as_a_negative_since_purchase_return():
    assert str(_display([(90, "-1000"), (0, "850")]).since_purchase_return) == "-0.15"


def test_the_rate_and_the_basis_are_unchanged_for_every_fixture():
    for fixture in FIXTURES:
        flows = fixture.flows
        rate = xirr(flows)
        result = portfolio_xirr_display(rate, flows)
        end = flows[-1][0]
        if all(day == end for day, _ in flows):
            assert result.rate == (rate if sum(amount for _, amount in flows) else None), fixture.name
            assert result.basis is None, fixture.name
        else:
            assert result.rate == rate, fixture.name
            if (end - min(day for day, _ in flows)).days >= 365:
                basis = "annualised" if rate is not None else None
            else:
                basis = "since_purchase" if any(amount < 0 for _, amount in flows) else None
            assert result.basis == basis, fixture.name


def test_a_switch_in_counts_as_a_purchase_flow_in_the_current_holdings_view(db_session):
    today = date.today()
    result = _disclaimer_scenario(
        db_session, "+910000000061", today - timedelta(days=800), "100", "10", [],
        current_value="1800", units_held="150",
        typed_txns=[(TransactionType.SWITCH_IN, today - timedelta(days=500), "50", "10", "500")],
    )
    assert result.lifetime_xirr_caution == "single_transaction"
    assert result.current_holdings_xirr_caution is None
    assert result.lifetime_since_purchase == "0.8"
    assert result.current_holdings_since_purchase == "0.2"


def test_a_reinvested_dividend_is_not_a_purchase_flow(db_session):
    today = date.today()
    result = _disclaimer_scenario(
        db_session, "+910000000062", today - timedelta(days=800), "100", "10", [],
        current_value="1200", units_held="110",
        typed_txns=[(TransactionType.DIVIDEND_REINVEST, today - timedelta(days=500), "10", "10", "100")],
    )
    assert result.lifetime_xirr_caution == result.current_holdings_xirr_caution == "single_transaction"
    assert result.lifetime_since_purchase == result.current_holdings_since_purchase == "0.2"


def test_lifetime_and_current_views_get_their_own_caution(db_session):
    today = date.today()
    result = _disclaimer_scenario(
        db_session, "+910000000063", today - timedelta(days=800), "100", "10", [],
        current_value="0", units_held="0",
        typed_txns=[(TransactionType.REDEMPTION, today - timedelta(days=100), "100", "12", "1200")],
    )
    assert result.lifetime_xirr_caution == "single_transaction"
    assert result.current_holdings_xirr_caution is None
    assert result.current_holdings_xirr is None
