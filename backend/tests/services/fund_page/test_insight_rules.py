from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest


def _inputs(**values):
    from app.services.fund_page.insights.rules import InsightInputs

    return InsightInputs(**values)


@pytest.mark.parametrize(
    "rule_name, firing, quiet, missing, expected_list",
    [
        (
            "rule_peer_beat_years",
            {"calendar_years": [(Decimal("12"), Decimal("10"))] * 4 + [(Decimal("8"), Decimal("10"))]},
            {"calendar_years": [(Decimal("12"), Decimal("10"))] * 3 + [(Decimal("8"), Decimal("10"))] * 2},
            {}, "strength",
        ),
        (
            "rule_expense_ratio_vs_category",
            {"ter": Decimal("0.70"), "category_ter": Decimal("0.95")},
            {"ter": Decimal("0.71"), "category_ter": Decimal("0.95")},
            {"ter": Decimal("0.70")}, "key",
        ),
        (
            "rule_top5_weight",
            {"top5_weight": Decimal("40")},
            {"top5_weight": Decimal("-1")},
            {}, "key",
        ),
        (
            "rule_sector_concentration",
            {"sector_weights": {"Financial Services": Decimal("25")}},
            {"sector_weights": {"Financial Services": Decimal("24.9")}},
            {}, "consideration",
        ),
        (
            "rule_overlap",
            {"overlap_pairs": [("Beta Fund", Decimal("50"))]},
            {"overlap_pairs": [("Beta Fund", Decimal("29.9"))]},
            {}, "consideration",
        ),
        (
            "rule_long_term_vs_category",
            {"return_5y": Decimal("15"), "category_return_5y": Decimal("12")},
            {"return_5y": Decimal("12"), "category_return_5y": Decimal("12")},
            {"return_5y": Decimal("15")}, "strength",
        ),
        (
            "rule_manager_tenure",
            {"manager_tenure": Decimal("5"), "manager_since": date(2021, 10, 23)},
            {"manager_tenure": Decimal("4.9"), "manager_since": date(2021, 11, 30)},
            {}, "strength",
        ),
        (
            "rule_market_cap_spread",
            {"cap_shares": {"Large": Decimal("70"), "Mid": Decimal("15"), "Small": Decimal("15")}},
            {"cap_shares": {"Large": Decimal("70.1"), "Mid": Decimal("15"), "Small": Decimal("14.9")}},
            {}, "strength",
        ),
        (
            "rule_volatility_vs_category",
            {"volatility": Decimal("15.01"), "peer_volatility_median": Decimal("14")},
            {"volatility": Decimal("15"), "peer_volatility_median": Decimal("14")},
            {"volatility": Decimal("15.01")}, "consideration",
        ),
        (
            "rule_lagging_years",
            {"calendar_years": [(Decimal("8"), Decimal("10"))] * 2 + [(Decimal("12"), Decimal("10"))] * 3},
            {"calendar_years": [(Decimal("8"), Decimal("10"))] + [(Decimal("12"), Decimal("10"))] * 4},
            {}, "consideration",
        ),
    ],
)
def test_each_rule_fires_does_not_fire_and_missing_is_none(
    rule_name, firing, quiet, missing, expected_list,
):
    from app.services.fund_page.insights import rules

    rule = getattr(rules, rule_name)
    fact = rule(_inputs(**firing))

    assert fact is not None
    assert fact.list == expected_list
    assert rule(_inputs(**quiet)) is None
    assert rule(_inputs(**missing)) is None


def test_peer_beat_two_years_is_consideration_and_four_is_strength():
    from app.services.fund_page.insights.rules import rule_peer_beat_years

    two = rule_peer_beat_years(_inputs(
        calendar_years=[(Decimal("12"), Decimal("10"))] * 2 + [(Decimal("8"), Decimal("10"))] * 3,
    ))
    four = rule_peer_beat_years(_inputs(
        calendar_years=[(Decimal("12"), Decimal("10"))] * 4 + [(Decimal("8"), Decimal("10"))],
    ))

    assert two.list == "consideration"
    assert four.list == "strength"


def test_overlap_30_is_key_49_9_key_and_50_consideration():
    from app.services.fund_page.insights.rules import rule_overlap

    for value in ("30", "49.9"):
        assert rule_overlap(_inputs(overlap_pairs=[("Beta", Decimal(value))])).list == "key"
    assert rule_overlap(_inputs(overlap_pairs=[("Beta", Decimal("50"))])).list == "consideration"


def test_top_five_boundary_wording():
    from app.services.fund_page.insights.rules import rule_top5_weight

    assert "concentrated" in rule_top5_weight(_inputs(top5_weight=Decimal("40"))).text
    assert "concentrated" not in rule_top5_weight(_inputs(top5_weight=Decimal("39.9"))).text
    assert "spread" in rule_top5_weight(_inputs(top5_weight=Decimal("24.9"))).text


def test_templates_contain_no_banned_words():
    from app.services.fund_page.insights.templates import TEMPLATES

    banned = ("buy", "sell", "should", "recommend", "good fund", "experienced", "churn")
    text = " ".join(TEMPLATES.values()).lower()
    assert all(word not in text for word in banned)


def test_evidence_numbers_appear_in_text():
    from app.services.fund_page.insights.rules import ALL_RULES

    sample = _inputs(
        calendar_years=[(Decimal("12"), Decimal("10"))] * 4 + [(Decimal("8"), Decimal("10"))],
        ter=Decimal("0.70"), category_ter=Decimal("0.95"), top5_weight=Decimal("40"),
        sector_weights={"Financial Services": Decimal("25")},
        overlap_pairs=[("Beta Fund", Decimal("50"))],
        return_5y=Decimal("15"), category_return_5y=Decimal("12"),
        manager_tenure=Decimal("5"), manager_since=date(2021, 10, 23),
        cap_shares={"Large": Decimal("70"), "Mid": Decimal("15"), "Small": Decimal("15")},
        volatility=Decimal("15.01"), peer_volatility_median=Decimal("14"),
    )
    facts = [fact for rule in ALL_RULES if (fact := rule(sample)) is not None]

    assert facts
    for fact in facts:
        for _label, value in fact.evidence:
            assert value in fact.text
