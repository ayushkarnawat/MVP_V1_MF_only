"""Live August 2026 files downloaded 10 Oct; fixtures contain two verbatim pages."""
import json
from pathlib import Path

import pytest

from app.services.analytics.fund_manager_layouts import LAYOUTS

FIXTURES = Path(__file__).parents[2] / "fixtures/factsheets"

CASES = [
    ("360", [("360 ONE FOCUSED FUND", [("Mayur Patel", None, None), ("Viral Mehta", "Co-Fund Manager", None)]),
              ("360 ONE QUANT FUND", [("Pranav Mise", None, None), ("Viral Mehta", "Co-Fund Manager", None)])]),
    ("angel", [("Angel One Nifty Total Market ETF", [("Kewal Shah", None, "February 2025")]),
                ("Angel One Gold ETF", [("Kewal Shah", None, "September 2025")])]),
    ("boi", [("Bank of India Flexi Cap Fund", [("Alok Singh", None, "June 29, 2020")]),
              ("Bank of India Small Cap Fund", [("Alok Singh", None, "October 1, 2024"), ("Nav Bhardwaj", None, "July 14, 2025")])]),
    ("baroda", [("Baroda BNP Paribas Large Cap Fund", [("Jitendra Sriram", None, "16-Jun-22"), ("Kushant Arora", None, "21-Oct-24")]),
                 ("Baroda BNP Paribas Large and Mid Cap Fund", [("Jitendra Sriram", None, "01-Jul-26"), ("Kirtan Mehta", None, "01-Jan-25")])]),
    ("franklin", [("Franklin India Multi-Factor Fund", [("Arihant Jain", None, None), ("Mukesh Jain", None, "January 12, 2026")]),
                   ("Franklin India Multi Cap Fund", [("Kiran Sebastian", None, None), ("Akhil Kalluri", None, None), ("R. Janakiraman", None, None), ("Sandeep Manam", "dedicated for making investments for Foreign Securities", None)])]),
    ("jio", [("JioBlackRock Flexi Cap Fund", [("Tanvi Kacheria", None, "October 2025"), ("Sahil Chaudhary", None, "October 2025")]),
              ("JioBlackRock Sector Rotation Fund", [("Tanvi Kacheria", None, "February 2026"), ("Sahil Chaudhary", None, "February 2026")])]),
]


@pytest.mark.parametrize("layout,expected", CASES)
def test_two_real_pages_have_exact_headings_names_roles_and_dates(layout, expected):
    pages = (FIXTURES / f"run7_{layout}.txt").read_text(encoding="utf-8").split("\f")
    boxes = json.loads((FIXTURES / f"run7_{layout}_boxes.json").read_text(encoding="utf-8")) if layout in {"360", "franklin"} else [None, None]
    for text, words, (heading, managers) in zip(pages, boxes, expected, strict=True):
        reader = LAYOUTS[layout]
        result = reader(text, list(reversed(words))) if words else reader(text)
        assert result.heading == heading
        assert result.managers == [dict(name=n, role=r, since_raw=d) for n, r, d in managers]


def test_360_does_not_guess_names_from_prose_without_boxes():
    text = (FIXTURES / "run7_360.txt").read_text(encoding="utf-8").split("\f")[0]
    assert LAYOUTS["360"](text) is None


@pytest.mark.parametrize("layout,fixture,heads,names", [
    ("boi", "boi_variants", ["Bank of India Multi Cap Fund", "Bank of India Multi Asset Allocation Fund"], [["Nitin Gosar"], ["Mithraem Bharucha", "Nilesh Jethani"]]),
    ("360", "360_etf", ["360 ONE GOLD ETF", "360 ONE SILVER ETF"], [["Rahul Khetawat"], ["Rahul Khetawat"]]),
    ("angel", "angel_fof", ["Angel One Gold ETF FOF", "Angel One Silver ETF FOF"], [["Kewal Shah"], ["Kewal Shah"]]),
    ("baroda", "baroda_fof", ["Baroda BNP Paribas Aqua Fund of Fund", "Baroda BNP Paribas Multi Asset Active Fund of Funds"], [["Swapna Shelar", "Stuti Singhee"], ["Gurvinder Singh Wasan", "Swapna Shelar"]]),
])
def test_real_additional_title_and_manager_formats(layout, fixture, heads, names):
    texts = (FIXTURES / f"run7_{fixture}.txt").read_text(encoding="utf-8").split("\f")
    boxes = json.loads((FIXTURES / f"run7_{fixture}_boxes.json").read_text(encoding="utf-8")) if layout == "360" else [None, None]
    for i, (text, words) in enumerate(zip(texts, boxes, strict=True)):
        result = LAYOUTS[layout](text, list(reversed(words))) if words else LAYOUTS[layout](text)
        assert result.heading == heads[i]
        if names:
            assert [m["name"] for m in result.managers] == names[i]
        if layout == "boi":
            assert all(m["since_raw"] is None and m["role"] is None for m in result.managers)
        if layout == "360":
            assert result.managers == [dict(name=n, role=None, since_raw=None) for n in names[i]]
        if layout == "angel":
            assert result.managers == [dict(name="Kewal Shah", role=None, since_raw=["September 2025", "March 2026"][i])]
        if layout == "baroda":
            dates = [["21-Oct-24", "01-May-26"], ["05-Jun-25", "01-May-26"]][i]
            assert result.managers == [dict(name=n, role=None, since_raw=d) for n, d in zip(names[i], dates, strict=True)]


def test_boi_portfolio_holding_is_not_the_arbitrage_page_title():
    text, conservative = (FIXTURES / "run7_boi_arbitrage.txt").read_text(encoding="utf-8").split("\f")
    page = LAYOUTS["boi"](text)
    assert page.heading == "Bank of India Arbitrage Fund"
    assert page.managers == [dict(name="Nilesh Jethani", role=None, since_raw="July 14, 2025")]
    page = LAYOUTS["boi"](conservative)
    assert page.heading == "Bank of India Conservative Hybrid Fund"
    assert page.managers == [dict(name="Alok Singh", role=None, since_raw=None)]


def test_baroda_wrapped_name_and_all_gold_fof_managers():
    text, equity_savings = (FIXTURES / "run7_baroda_wrapped.txt").read_text(encoding="utf-8").split("\f")
    page = LAYOUTS["baroda"](text)
    assert page.heading == "Baroda BNP Paribas Gold ETF Fund of Fund"
    assert page.managers == [dict(name=n, role=None, since_raw=d) for n, d in [
        ("Gurvinder Singh Wasan", "20-Aug-25"), ("Vikram Pamnani", "18-May-26"),
        ("Swapna Shelar", "20-Aug-25"), ("Stuti Singhee", "01-May-26")]]
    page = LAYOUTS["baroda"](equity_savings)
    assert page.heading == "Baroda BNP Paribas Equity Savings Fund"
    assert page.managers == [dict(name=n, role=r, since_raw=d) for n, r, d in [
        ("Jitendra Sriram", "Equity Category", "01-Jul-26"), ("Kushant Arora", "Equity Category", "01-Jul-26"),
        ("Neeraj Saxena", "Equity Category", "21-Oct-24"), ("Gurvinder Singh Wasan", "Fixed Income", "21-Oct-24")]]


def test_franklin_interleaved_headers_are_refused_pending_positional_reader():
    for text in (FIXTURES / "run7_franklin_ambiguous.txt").read_text(encoding="utf-8").split("\f"):
        assert LAYOUTS["franklin"](text) is None


def test_franklin_requires_boxes_even_when_text_happens_to_be_contiguous():
    for text in (FIXTURES / "run7_franklin.txt").read_text(encoding="utf-8").split("\f"):
        assert LAYOUTS["franklin"](text) is None


def test_franklin_boxes_keep_overseas_manager_and_date_with_its_name():
    texts = (FIXTURES / "run7_franklin_position.txt").read_text(encoding="utf-8").split("\f")
    boxes = json.loads((FIXTURES / "run7_franklin_position_boxes.json").read_text(encoding="utf-8"))
    expected = [
        ("Franklin India Large Cap Fund", [("Venkatesh Sanjeevi", None, None), ("Ajay Argal", None, "December 1, 2023"), ("Sandeep Manam", "dedicated for making investments for Foreign Securities", None)]),
        ("Franklin India NSE Nifty 50 Index Fund", [("Shyam Sundar Sriram", None, "September 26, 2024"), ("Sandeep Manam", "dedicated for making investments for Foreign Securities", None)]),
    ]
    for text, words, (heading, managers) in zip(texts, boxes, expected, strict=True):
        result = LAYOUTS["franklin"](text, list(reversed(words)))
        assert result.heading == heading
        assert result.managers == [dict(name=n, role=r, since_raw=d) for n, r, d in managers]


def test_franklin_two_scheme_page_uses_titles_not_portfolio_holdings():
    text, multi_asset = (FIXTURES / "run7_franklin_multi.txt").read_text(encoding="utf-8").split("\f")
    words, multi_asset_words = json.loads((FIXTURES / "run7_franklin_multi_boxes.json").read_text(encoding="utf-8"))
    pages = LAYOUTS["franklin"](text, list(reversed(words)))
    assert [p.heading for p in pages] == ["Franklin India Income Plus Arbitrage Active Fund of Funds", "Franklin India Dynamic Asset Allocation Active Fund of Funds"]
    assert pages[0].managers == [dict(name=n, role=None, since_raw="July 04, 2025") for n in ["Rohan Maru", "Pallab Roy", "Rahul Goswami"]]
    assert pages[1].managers == [dict(name=n, role=None, since_raw=d) for n, d in [
        ("Rajasa Kakulavarapu", None), ("Venkatesh Sanjeevi", None), ("Chandni Gupta", "March 13, 2026")]]
    page = LAYOUTS["franklin"](multi_asset, list(reversed(multi_asset_words)))
    assert page.heading == "Franklin India Multi Asset Allocation Fund"
    assert page.managers == [dict(name=n, role=None, since_raw=None) for n in [
        "R. Janakiraman", "Rajasa Kakulavarapu", "Rohan Maru", "Pallab Roy"]] + [dict(
            name="Sandeep Manam", role="dedicated for making investments for Foreign Securities", since_raw=None)]


def test_franklin_us_fof_excludes_underlying_fund_staff():
    text = (FIXTURES / "run7_franklin_ambiguous.txt").read_text(encoding="utf-8").split("\f")[0]
    words = json.loads((FIXTURES / "run7_franklin_ambiguous_boxes.json").read_text(encoding="utf-8"))[0]
    page = LAYOUTS["franklin"](text, list(reversed(words)))
    assert page.heading == "Franklin U.S. Opportunities Equity Active Fund of Funds"
    assert page.managers == [dict(name="Sandeep Manam", role=None, since_raw=None)]


def test_real_commentary_and_handover_notes_are_not_current_manager_rows():
    commentary, handover = (FIXTURES / "run7_audit_notes.txt").read_text(encoding="utf-8").split("\f")
    assert "ceased to be current" in commentary
    assert LAYOUTS["360"](commentary) is None
    assert "in place of Mr. Sanjay Chawla" in handover
    assert LAYOUTS["baroda"](handover) is None
