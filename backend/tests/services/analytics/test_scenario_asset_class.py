# backend/tests/services/analytics/test_scenario_asset_class.py
import pytest

from app.services.analytics.scenario_asset_class import underlying_asset_class


# Real AMFI category headings and scheme names (live file, 9 Oct).
@pytest.mark.parametrize("category, name, expected", [
    ("Equity Scheme - Flexi Cap Fund", "Parag Parikh Flexi Cap Fund", "Equity"),
    ("Solution Oriented Scheme - Retirement Fund", "HDFC Retirement Savings Fund", "Hybrid"),
    ("Debt Scheme - Liquid Fund", "SBI Liquid Fund", "Debt-short"),
    ("Debt Scheme - Credit Risk Fund", "ICICI Prudential Credit Risk Fund", "Debt-long"),
    ("Some Unclassified Category", "X", "Other"),
    # wrappers whose category says what they hold
    ("Other Scheme - Gold ETF", "Nippon India ETF Gold BeES", "Gold"),
    ("Exchange Traded Funds (ETFs) - Silver ETF", "ICICI Prudential Silver ETF", "Silver"),
    ("Exchange Traded Funds (ETFs) - Debt ETF", "SBI Nifty 10 yr Benchmark G-Sec ETF", "Debt-long"),
    ("Index Funds - Debt Funds", "Bandhan CRISIL IBX Gilt June 2027 Index Fund", "Debt-long"),
    ("Exchange Traded Funds (ETFs) - ETFs investing overseas", "Mirae Asset Hang Seng TECH ETF", "Overseas"),
    ("Other Scheme - FoF Overseas", "PGIM India Global Equity Opportunities Fund of Funds", "Overseas"),
    ("Index Funds - Equity Funds", "UTI Nifty 50 Index Fund", "Index/ETF"),
    # generic wrappers: the name decides
    ("Other Scheme - Other  ETFs", "Bharat Bond ETF - April 2030", "Debt-long"),
    ("Other Scheme - Other  ETFs", "Nippon India ETF Liquid BeES", "Debt-short"),
    ("Other Scheme - Other  ETFs", "Nippon India Silver ETF", "Silver"),
    ("Other Scheme - Other  ETFs", "Motilal Oswal NASDAQ 100 ETF", "Overseas"),
    ("Other Scheme - Other  ETFs", "Nippon India ETF Nifty PSU Bank BeES", "Index/ETF"),  # "PSU" isn't debt
    ("Other Scheme - Index Funds", "Edelweiss CRISIL IBX 50:50 Gilt Plus SDL Apr 2037 Index Fund", "Debt-long"),
    ("Other Scheme - Index Funds", "Nippon India Nifty 50 Index Fund", "Index/ETF"),
    ("Other Scheme - FoF Domestic", "SBI Gold Fund", "Gold"),
    ("Other Scheme - FoF Domestic", "ICICI Prudential Passive Multi-Asset Fund of Funds", "Hybrid"),
    ("Other Scheme - FoF Domestic", "Groww Nifty PSE ETF FOF", "Index/ETF"),
    ("Other Scheme - FoF Domestic", "Axis Multi Factor Passive FoF", "Other"),
])
def test_underlying_asset_class(category, name, expected):
    assert underlying_asset_class(category, name) == expected


def test_no_gold_silver_or_bond_wrapper_lands_in_equity():
    """The bug this replaces: a gold ETF got the equity move (-25% instead of +8% under Hormuz)."""
    for category, name in [
        ("Other Scheme - Gold ETF", "HDFC Gold ETF"),
        ("Other Scheme - Other  ETFs", "Kotak Silver ETF"),
        ("Other Scheme - Index Funds", "Axis CRISIL IBX SDL May 2027 Index Fund"),
    ]:
        assert underlying_asset_class(category, name) != "Index/ETF"


# Japan/Taiwan/ABSL/MSCI category and plan names are from the cached NAVAll on 10 Oct.
# Remaining cases exercise the overseas keyword list and arbitrage category rule.
@pytest.mark.parametrize("category,name,expected", [
    ("Equity Schemes - Thematic Fund", "Nippon India Japan Equity Fund - Direct Plan - Growth Option", "Overseas"),
    ("Equity Schemes - Thematic Fund", "Nippon India Taiwan Equity Fund - Direct Plan - Growth Option", "Overseas"),
    ("Equity Scheme - Sectoral/ Thematic", "Aditya Birla Sun Life International Equity Fund - Direct Plan - GROWTH", "Overseas"),
    ("Hybrid Scheme - Arbitrage Fund", "Kotak Equity Arbitrage Fund", "Debt-short"),
    ("Exchange Traded Funds (ETFs) - Other ETF", "360 ONE MSCI India ETF - Direct Plan - GROWTH Option", "Index/ETF"),
    ("Index Funds - Equity Funds", "Motilal Oswal NASDAQ 100 Index Fund", "Overseas"),
    ("Equity Scheme - Sectoral/ Thematic", "ICICI Prudential US Bluechip Equity Fund", "Overseas"),
    ("Equity Scheme - Sectoral/ Thematic", "Europe Equity Growth", "Overseas"),
    ("Equity Scheme - Sectoral/ Thematic", "Asia Equity Growth", "Overseas"),
    ("Equity Scheme - Sectoral/ Thematic", "Developed Markets Equity Growth", "Overseas"),
])
def test_ruling7_classifier(category, name, expected):
    assert underlying_asset_class(category, name) == expected


def test_msci_india_domestic_and_world_index_is_not_overseas():
    """Fix-round review: a real NAVAll name; its "World" is a sleeve beside the domestic index."""
    from app.services.analytics.scenario_asset_class import underlying_asset_class
    name = "Edelweiss MSCI India Domestic & World Healthcare 45 Index Fund - Regular Plan Growth"
    assert underlying_asset_class("Other Scheme - Index Funds", name) != "Overseas"
