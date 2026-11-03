"""W1: the 60% rule for P/E and P/B and a plain `unavailable_reason` whenever a value is withheld."""
from datetime import date
from decimal import Decimal

import pytest

from app.models.enums import AssetType
from tests.services.analytics.test_lookthrough import _scheme, _batch, _holding
from tests.services.analytics.test_valuation import _compute, _stock, _reported

EQ = AssetType.EQUITY_DOMESTIC


def _all_reasons(result):
    texts = []
    for metric in (result.pe, result.pb):
        texts += [metric.reason, metric.unavailable_reason]
    for fund in result.funds:
        for value in (fund.pe, fund.pb):
            texts += [value.reason, value.unavailable_reason]
    return [t for t in texts if t]


def test_the_threshold_is_sixty_percent_in_one_place():
    from app.services.analytics.valuation import VALUATION_MIN_COVERAGE
    assert VALUATION_MIN_COVERAGE == Decimal("0.60")


@pytest.mark.parametrize("known,shown", [("59.9", False), ("60", True)])
def test_fund_boundary_is_sixty_percent(db_session, monkeypatch, known, shown):
    s = _scheme(db_session)
    _batch(db_session, s, [("Known", "A", known, EQ), ("Unknown", "B", str(100 - Decimal(known)), EQ)])
    _stock(db_session, "A", "10", "2")
    result = _compute(db_session, monkeypatch, [_holding(s, "1000")])
    for value, metric in ((result.funds[0].pe, "P/E"), (result.funds[0].pb, "P/B")):
        assert (value.value is not None) == shown
        if shown:
            assert value.unavailable_reason is None
        else:
            assert value.unavailable_reason == (
                f"Not enough data: {metric} is available for 59% of this fund's shares, and we need at least 60%.")


@pytest.mark.parametrize("available,shown", [("59.9", False), ("60", True)])
def test_portfolio_boundary_is_sixty_percent(db_session, monkeypatch, available, shown):
    a, b = _scheme(db_session), _scheme(db_session)
    _batch(db_session, a, [("No ratio A", "A", "100", EQ)])
    _batch(db_session, b, [("No ratio B", "B", "100", EQ)])
    _reported(db_session, a, "pe", "30")
    result = _compute(db_session, monkeypatch, [_holding(a, available), _holding(b, str(100 - Decimal(available)))])
    assert (result.pe.ratio is not None) == shown
    if shown:
        assert result.pe.unavailable_reason is None and result.pe.reason is None
    else:
        assert result.pe.unavailable_reason == (
            "Not enough data: P/E is available for 59% of this portfolio's shares, and we need at least 60%.")
        # The older sentence is untouched.
        assert result.pe.reason == "We could not get a P/E for enough of your funds yet."
    # P/B has no figure for any fund, so it is withheld and says so with its own name and 0%.
    assert result.pb.unavailable_reason == (
        "Not enough data: P/B is available for 0% of this portfolio's shares, and we need at least 60%.")


def test_the_reason_names_the_real_percentage(db_session, monkeypatch):
    s = _scheme(db_session)
    _batch(db_session, s, [("Known", "A", "52", EQ), ("Unknown", "B", "48", EQ)])
    _stock(db_session, "A", "10", "2")
    result = _compute(db_session, monkeypatch, [_holding(s, "1000")])
    assert result.funds[0].pe.unavailable_reason == (
        "Not enough data: P/E is available for 52% of this fund's shares, and we need at least 60%.")
    # The stored older text keeps its wording; only the percentage comes from the rule.
    assert result.funds[0].pe.reason == "Less than 60% of this fund's equity has a usable P/E value."


def test_a_shown_value_has_no_unavailable_reason(db_session, monkeypatch):
    s = _scheme(db_session)
    _batch(db_session, s, [("A", "A", "60", EQ), ("B", "B", "40", EQ)])
    _stock(db_session, "A", "10", "2"); _stock(db_session, "B", "20", "4")
    result = _compute(db_session, monkeypatch, [_holding(s, "1000")])
    assert result.pe.ratio is not None and result.pb.ratio is not None
    assert result.pe.unavailable_reason is None and result.pb.unavailable_reason is None
    assert result.funds[0].pe.unavailable_reason is None and result.funds[0].pb.unavailable_reason is None


def test_no_equity_holdings_has_its_own_sentence(db_session, monkeypatch):
    s = _scheme(db_session)
    _batch(db_session, s, [("Bond", "D", "100", AssetType.DEBT)])
    result = _compute(db_session, monkeypatch, [_holding(s, "1000")])
    assert result.pe.ratio is None
    assert result.pe.unavailable_reason == "Not available: this portfolio holds no shares, so there is no P/E to show."
    assert result.pb.unavailable_reason == "Not available: this portfolio holds no shares, so there is no P/B to show."
    assert result.funds[0].pe.unavailable_reason == "Not available: this fund holds no shares, so there is no P/E to show."
    assert result.funds[0].pb.unavailable_reason == "Not available: this fund holds no shares, so there is no P/B to show."


def test_empty_portfolio_says_no_shares(db_session, monkeypatch):
    result = _compute(db_session, monkeypatch, [])
    assert result.pe.unavailable_reason == "Not available: this portfolio holds no shares, so there is no P/E to show."


@pytest.mark.parametrize("earnings_ratio", ["-5", "0"])
def test_all_loss_making_has_its_own_sentence_for_pe_only(db_session, monkeypatch, earnings_ratio):
    s = _scheme(db_session)
    _batch(db_session, s, [("Loss One", "L1", "60", EQ), ("Loss Two", "L2", "40", EQ)])
    _stock(db_session, "L1", earnings_ratio, "2"); _stock(db_session, "L2", earnings_ratio, "3")
    result = _compute(db_session, monkeypatch, [_holding(s, "1000")])
    assert result.pe.ratio is None
    assert result.pe.unavailable_reason == (
        "Not available: every share in this portfolio with an earnings figure is loss-making, so a P/E cannot be worked out.")
    assert result.funds[0].pe.unavailable_reason == (
        "Not available: every share in this fund with an earnings figure is loss-making, so a P/E cannot be worked out.")
    # P/B does not depend on earnings, so it is still shown.
    assert result.pb.ratio is not None and result.pb.unavailable_reason is None


def test_too_little_holdings_data_for_the_portfolio_has_its_own_sentence(db_session, monkeypatch):
    a, b = _scheme(db_session), _scheme(db_session)
    _batch(db_session, a, [("Good", "A", "100", EQ)])  # fund b has no holdings list at all
    _stock(db_session, "A", "25", "3.35")
    result = _compute(db_session, monkeypatch, [_holding(a, "400"), _holding(b, "600")])
    assert result.hide_headlines and result.pe.ratio is None
    expected = ("Not enough data: we have the latest holdings for only {n}% of your portfolio's value, "
                "and we need at least 50% to work out {m}.")
    assert result.pe.unavailable_reason == expected.format(n=40, m="P/E")
    assert result.pb.unavailable_reason == expected.format(n=40, m="P/B")
    # The older sentence is untouched.
    assert result.pe.reason == "Not enough portfolio holdings are available yet."


def test_old_payload_without_the_new_field_still_loads(db_session, monkeypatch):
    from app.services.analytics.schemas import ValuationSummary
    s = _scheme(db_session)
    _batch(db_session, s, [("A", "A", "100", EQ)]); _stock(db_session, "A", "10", "2")
    payload = _compute(db_session, monkeypatch, [_holding(s, "1000")]).model_dump(mode="json")
    payload["pe"].pop("unavailable_reason"); payload["pb"].pop("unavailable_reason")
    for fund in payload["funds"]:
        fund["pe"].pop("unavailable_reason"); fund["pb"].pop("unavailable_reason")
    restored = ValuationSummary.model_validate(payload)
    assert restored.pe.unavailable_reason is None and restored.funds[0].pe.unavailable_reason is None


def test_the_fund_figure_from_a_factsheet_has_no_unavailable_reason(db_session, monkeypatch):
    s = _scheme(db_session)
    _batch(db_session, s, [("No ratio", "A", "100", EQ)])
    _reported(db_session, s, "pe", "30", period=date(2026, 10, 1))
    result = _compute(db_session, monkeypatch, [_holding(s, "1000")])
    assert result.funds[0].pe.value is not None and result.funds[0].pe.unavailable_reason is None


def test_no_sentence_still_says_seventy(db_session, monkeypatch):
    s = _scheme(db_session)
    _batch(db_session, s, [("Known", "A", "52", EQ), ("Unknown", "B", "48", EQ)])
    _stock(db_session, "A", "10", "2")
    result = _compute(db_session, monkeypatch, [_holding(s, "1000")])
    texts = _all_reasons(result)
    assert texts and not any("70" in t for t in texts)
