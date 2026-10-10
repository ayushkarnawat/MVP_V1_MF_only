"""Verbatim Run 9 scheme excerpts, with exact headings and manager rows."""
from pathlib import Path
import json

import pytest

from app.services.analytics.fund_manager_layouts import LAYOUTS
from app.services.analytics.amfi_factsheet_client import FundFamily, match_scheme_families

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "factsheets"


def manager(name, since=None, role=None):
    return dict(name=name, role=role, since_raw=since)


@pytest.mark.parametrize("layout,expected", [
    ("navi", [("Navi Aggressive Hybrid Fund", [manager("Ashutosh Shirwaikar", "February 14, 2025"), manager("Tanmay Sethi", "February 01, 2024")]), ("Navi Nifty Next 50 Index Fund", [manager("Ashutosh Shirwaikar", "February 14, 2025")])]),
    ("oldbridge", [("OLD BRIDGE FLEXI CAP FUND", [manager("Kenneth Andrade", "inception")]), ("OLD BRIDGE FOCUSED FUND", [manager("Kenneth Andrade", "inception"), manager("Tarang Agrawal", "inception")])]),
    ("union", [("Union Multicap Fund", [manager("Harshad Patwardhan", "November 01, 2024"), manager("Sanjay Bembalkar", "Since inception")]), ("Union Equity Savings Fund", [manager("Sanjay Bembalkar", "January 25, 2023"), manager("Gaurav Chopra", "November 01, 2024"), manager("Parijat Agrawal", "Since inception")])]),
    ("wealth", [("The Wealth Company Ethical Fund", [manager("Aparna Shanker", "October 2025", "Equity"), manager("Saloni Kapadia", "January 2026", "Equity")]), ("The Wealth Company Multi Asset Allocation Fund", [manager("Aparna Shanker", "December 2025", "Equity"), manager("Umesh Sharma", "December 2025", "Debt"), manager("Niranjan Das", "January 2026", "Commodity")])]),
    ("taurus", [("TAURUS FLEXI CAP FUND", [manager("Anuj Kapil", "June 13, 2023")]), ("Taurus Mid Cap Fund", [manager("Anuj Kapil", "November 15, 2023"), manager("Hemanshu Srivastava", "July 18, 2024", "Co-Fund Manager")])]),
    ("samco", [("Samco Active Momentum Fund", [manager("Umeshkumar Mehta", "01-Aug-2023", "Director, CIO & Fund Manager"), manager("Nirali Bhansali", "19-Feb-2025", "Fund Manager"), manager("Dhawal G. Dhanani", "Inception", "Fund Manager"), manager("Vishal Shinde", "01-Jul-2026", "Fund Manager")]), ("Samco Multi Asset Allocation Fund", [manager("Umeshkumar Mehta", "Inception", "Director, CIO & Fund Manager"), manager("Nirali Bhansali", "Inception", "Fund Manager"), manager("Dhawal G. Dhanani", "Inception", "Fund Manager"), manager("Vishal Shinde", "01-Jul-2026", "Fund Manager")])]),
])
def test_two_real_pages_exactly(layout, expected):
    pages = (FIXTURES / f"run9_{layout}.txt").read_text(encoding="utf-8").split("\f")
    assert len(pages) == 2
    for text, (heading, managers) in zip(pages, expected, strict=True):
        page = LAYOUTS[layout](text)
        assert page is not None
        assert page.heading == heading
        assert page.managers == managers


def test_hsbc_six_real_date_cases_and_ambiguous_pair_remains_null():
    expected = [
        ("HSBC Aggressive Hybrid Fund", [manager("Gautam Bhupal", "Oct 01, 2023"), manager("Shriram Ramanathan", "May 30, 2016"), manager("Mohd. Asif Rizwi", "May 01, 2024"), manager("Mayank Chaturvedi"), manager("Dipan S. Parikh")]),
        ("HSBC Global Emerging Markets Fund", [manager("Prakriti Banka", "Sep 08, 2026")]),
        ("HSBC Brazil Fund", [manager("Prakriti Banka", "Sep 08, 2026")]),
        ("HSBC Aggressive Hybrid Active FOF", [manager("Gautam Bhupal", "Oct 21, 2015")]),
        ("HSBC Income Plus Arbitrage Active FOF", [manager("Mohd Asif Rizwi", "Mar 13, 2025"), manager("Mahesh Chhabria", "Mar 13, 2025")]),
        ("HSBC Gold ETF Fund of Fund", [manager("Dipan S. Parikh", "Mar 30, 2026")]),
    ]
    texts = (FIXTURES / "run9_hsbc_dates.txt").read_text(encoding="utf-8").split("\f")
    for text, (heading, managers) in zip(texts, expected, strict=True):
        page = LAYOUTS["hsbc"](text)
        assert page.heading == heading
        assert page.managers == managers


def test_taurus_historical_manager_and_handover_note_are_not_current_or_roles():
    texts = (FIXTURES / "run9_taurus.txt").read_text(encoding="utf-8").split("\f")
    assert "Ankit Tikmany was Fund Manager" in texts[0]
    assert "w.e.f" in texts[0]
    for text in texts:
        managers = LAYOUTS["taurus"](text).managers
        assert "Ankit Tikmany" not in {m["name"] for m in managers}
        assert all("w.e.f" not in (m["role"] or "") for m in managers)


@pytest.mark.parametrize("fixture,layout,heading,managers", [
    ("navi_fof", "navi", "Navi Total Stock Market US Specific Equity Passive FoF", [manager("Ashutosh Shirwaikar", "February 14, 2025")]),
    ("navi_nasdaq", "navi", "Navi Nasdaq100 US Specific Equity Passive FOF", [manager("Ashutosh Shirwaikar", "February 14, 2025")]),
    ("union_fof", "union", "Union Income Plus Arbitrage Active FOF", [manager("Vishal Thakkar", "Since inception", "Fund Manager – Arbitrage portion"), manager("Anindya Sarkar", "Since inception", "Fund Manager - Fixed Income"), manager("Shrenuj Parekh", "Since inception", "Co\ufffeFund Manager - Fixed Income")]),
])
def test_real_fof_title_variants(fixture, layout, heading, managers):
    page = LAYOUTS[layout]((FIXTURES / f"run9_{fixture}.txt").read_text(encoding="utf-8"))
    assert page is not None and page.heading == heading
    assert page.managers == managers


def test_union_elss_printed_name_alias_is_amc_scoped():
    page = LAYOUTS["union"]((FIXTURES / "run9_union_elss.txt").read_text(encoding="utf-8"))
    base = "Union ELSS Tax Saver Fund (Formerly Union Tax Saver (ELSS) Fund"
    family = FundFamily("Union Mutual Fund", base, "ELSS", (), frozenset())
    assert match_scheme_families(page, [family])[0][0] == family
    assert match_scheme_families(page, [FundFamily("Other AMC", base, "ELSS", (), frozenset())]) == []


def test_taurus_interleaved_prose_requires_real_boxes_and_is_order_independent():
    text = (FIXTURES / "run9_taurus_banking.txt").read_text(encoding="utf-8")
    boxes = json.loads((FIXTURES / "run9_taurus_banking_boxes.json").read_text(encoding="utf-8"))
    assert LAYOUTS["taurus"](text) is None
    for words in [boxes, list(reversed(boxes))]:
        page = LAYOUTS["taurus"](text, words)
        assert page.heading == "TAURUS BANKING & FINANCIAL SERVICES FUND"
        assert page.managers == [manager("Anuj Kapil", "June 13, 2023")]


def test_hsbc_two_managers_on_separate_lines_without_a_slash_are_two_people():
    """HSBC Dynamic Term Fund, Aug 2026 (verbatim lines): the names are one per line, the experience and dates
    are slash-separated, so each manager must get their own date."""
    from app.services.analytics.fund_manager_layouts import LAYOUTS
    page = ("HSBC Dynamic Term Fund\n"
            "Fund Manager\nName of Fund Managers\nMr. Mahesh Chhabria\nMr. Shriram Ramanathan\n"
            "Total Experience 15 yrs / 25 yrs\nManaging Since May 01, 2024 / Feb 02, 2015\nMinimum Investment\n")
    managers = LAYOUTS["hsbc"](page).managers
    assert [(m["name"], m["since_raw"]) for m in managers] == [
        ("Mahesh Chhabria", "May 01, 2024"), ("Shriram Ramanathan", "Feb 02, 2015")]
