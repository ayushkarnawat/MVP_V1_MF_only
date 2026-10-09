from pathlib import Path

import pytest

from app.services.analytics.fund_manager_layouts import LAYOUTS

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "factsheets"


@pytest.mark.parametrize("layout,headings,managers", [
    ("hsbc", ["HSBC Large Cap Fund", "HSBC Multi Asset Allocation Fund"], [
        [("Neelotpal Sahai", None, "May 27, 2013"), ("Mayank Chaturvedi", None, "Oct 01, 2025"), ("Dipan S. Parikh", None, "Aug 26, 2026")],
        [("Cheenu Gupta", None, "Feb 28, 2024"), ("Mahesh Chhabria", None, "Feb 28, 2024"), ("Mohd. Asif Rizwi", None, "Feb 01, 2025"),
         ("Dipan Parikh", None, "Feb 28, 2024"), ("Mayank Chaturvedi", None, "Oct 01, 2025"), ("Praveen Ayathan", None, "Mar 18, 2026")],
    ]),
    ("helios", ["Helios Flexi Cap Fund", "Helios Balanced Advantage Fund"], [
        [("Alok Bahl", None, "Inception"), ("Pratik Singh", None, "April 20, 2024")],
        [("Alok Bahl", "for equities", "Inception"), ("Pratik Singh", "for equities", "Inception"),
         ("Devesh Kumar Bhatt", "for Fixed Income securities", "June 01, 2026")],
    ]),
    ("groww_passive", ["GROWW Nifty Total Market Index Fund", "GROWW Nifty 50 Index Fund"], [
        [("Aakash Chauhan", "Fund Manager for Passive Schemes (Equity) & Dealer - Equity", "April 14, 2025"),
         ("Nikhil Satam", "Fund Manager & Dealer - Equity", "February 21, 2025"), ("Shashi Kumar", "Fund Manager & Dealer – Equity", "May 16, 2025")],
        [("Aakash Chauhan", "Fund Manager & Dealer – Equity", None), ("Nikhil Satam", "Fund manager & Dealer Equity", None),
         ("Shashi Kumar", "Fund Manager & Dealer – Equity", None)],
    ]),
    ("groww", ["GROWW Large Cap Fund", "GROWW Aggressive Hybrid Fund"], [
        # Gagan Thareja is printed with "(Ceased to be FM Sep 10, 2026)": not a current manager (Run 3 review).
        [("Anupam Tiwari", "Head-Equity", "May 11, 2023"),
         ("Saptarshee Chatterjee", "Senior Research Analyst & Fund Manager - Equity", "Sep 24, 2025"), ("Nikhil Satam", "Fund Manager & Dealer - Equity", "July 22, 2026")],
        [("Paras Matalia", "Equity", "April 01, 2026"), ("Wilfred Gonsalves", "Fund Manager & Dealer- Fixed Income", "June 04, 2026"),
         ("Nikhil Satam", "Equity - Fund Manager & Dealer", "April 01, 2026"), ("Kaustubh Sule", "Debt - Senior Fund Manager Fixed Income", "May 11, 2023")],
    ]),
    ("dsp", ["DSP Flexi Cap Fund", "DSP Dynamic Asset Allocation Fund"], [
        [("Bhavin Gandhi", None, "March 01, 2024")],
        [("Rohit Singhania", "Equity Portion", "November 2023"), ("Preethi R S", None, "October 2025"),
         ("Shantanu Godambe", "Debt Portion", "January 2025"), ("Kaivalya Nadkarni", "Equity portion", "October 2024")],
    ]),
    ("capitalmind", ["Capitalmind Flexi Cap Fund", "Capitalmind Liquid Fund"], [
        [("Anoop Vijaykumar", None, "Inception"), ("Prateek Jain", None, "Aug 2025"), ("Divyansh Agnani", None, "Apr 2026")],
        [("Prateek Jain", None, "Inception"), ("Anoop Vijaykumar", None, "Inception")],
    ]),
    ("canara", ["CANARA ROBECO CONSERVATIVE HYBRID FUND", "CANARA ROBECO BALANCED ADVANTAGE FUND"], [
        [("Avnish Jain", "For Debt Portfolio", "7-Oct-13"), ("Suman Prasad", None, "01-Dec-25"), ("Amit Kadam", "For Equity Portfolio", "10-April-24")],
        [("Ennette Fernandes", None, "02-Aug-24"), ("Pranav Gokhale", None, "05-May-25"), ("Suman Prasad", None, "02-Aug-24"),
         ("Amit Kadam", "Dedicated Fund Manager for Overseas investments", "02-Aug-24"), ("Avnish Jain", None, "01-Dec-25")],
    ]),
    ("abakkus", ["Abakkus Small Cap Fund", "Abakkus Liquid Fund"], [
        [("Sanjay Doshi", "Equity", "17th March 2026"), ("Abhishek K S", "Fixed Income", "23rd March 2026")],
        [("Abhishek K S", "Fixed Income", "23rd March 2026"), ("Sanjay Doshi", "Equity", "12th December 2025")],
    ]),
    ("absl_september", ["Aditya Birla Sun Life Large Cap Fund", "Aditya Birla Sun Life Flexi Cap Fund"], [
        [("Harish Krishnan", None, "January 07,2026")],
        [("Harish Krishnan", None, "November 03,2023"), ("Dhaval Joshi", None, "November 21,2022")],
    ]),
    ("nippon", ["Nippon India Large Cap Fund", "Nippon India Vision Large & Mid Cap Fund"], [
        [("Sailesh Raj Bhan", None, "August 2007"), ("Bhavik Dave", "Assistant Fund Manager", "August 2024")],
        [("Aishwarya Deepak Agarwal", None, "June 2021")],
    ]),
    ("edelweiss", ["Edelweiss Large & Mid Cap Fund", "Edelweiss Small Cap Fund"], [
        [("Sumanta Khan", None, "Apr 01, 2024"), ("Trideep Bhattacharya", None, "Oct 01, 2021"), ("Ashish Sood", None, "Aug 03, 2026")],
        [("Dhruv Bhatia", None, "Oct 14, 2024"), ("Trideep Bhattacharya", None, "Dec 24, 2021"), ("Raj Koradia", None, "Aug 01, 2024")],
    ]),
    ("hdfc", ["HDFC Large Cap Fund", "HDFC Mid Cap Fund"], [
        # The "¥ Fund Manager for Overseas Investments" footnote names co-managers too (A04 Run 1 ruling).
        [("Rahul Baijal", None, "July 29, 2022"), ("Bhagyesh Kagalkar", "Gold/Silver Instruments", "August 26,2026"), ("Dhruv Muchhal", "Overseas Investments", "June 22, 2023"), ("Gopal Agrawal", "Overseas Investments", "September 01, 2026")],
        [("Chirag Setalvad", None, "June 25, 2007"), ("Bhagyesh Kagalkar", "Gold/Silver Instruments", "August 26,2026"), ("Dhruv Muchhal", "Overseas Investments", "June 22, 2023"), ("Gopal Agrawal", "Overseas Investments", "September 01, 2026")],
    ]),
    ("kotak", ["KOTAK INFRASTRUCTURE & ECONOMIC REFORM FUND", "KOTAK LIQUID FUND"], [
        [("Nalin Rasik Bhatt", None, None)],
        [("Deepak Agrawal", None, None), ("Sunil Pandey", None, "June 01, 2025")],
    ]),
    ("absl", ["Aditya Birla Sun Life Large Cap Fund", "Aditya Birla Sun Life Flexi Cap Fund"], [
        [("Harish Krishnan", None, "January 07, 2026")],
        [("Harish Krishnan", None, "November 03, 2023"), ("Dhaval Joshi", None, "November 21, 2022")],
    ]),
])
def test_real_scheme_pages(layout, headings, managers):
    pages = (FIXTURES / f"{layout}.txt").read_text(encoding="utf-8").split("\f")
    assert len(pages) == 2
    for raw, heading, expected in zip(pages, headings, managers):
        page = LAYOUTS["groww" if layout == "groww_passive" else layout](raw)
        assert page is not None
        assert page.heading == heading
        assert [(m["name"], m["role"], m["since_raw"]) for m in page.managers] == expected


@pytest.mark.parametrize("layout", list(LAYOUTS))
def test_non_scheme_page_returns_none(layout):
    assert LAYOUTS[layout]("Contents\nGlossary\nFund Manager biographies") is None


def test_hsbc_parenthetical_name_and_logo_are_distinguished():
    pages = (FIXTURES / "hsbc_headings.txt").read_text(encoding="utf-8").split("\f")
    expected = [
        ("HSBC Asia Pacific (Ex Japan) Dividend Yield Fund", [("Prakriti Banka", None, "Sep 08, 2026")]),
        ("HSBC Corporate Bond Fund", [("Mohd. Asif Rizwi", None, "Feb 01, 2025"), ("Shriram Ramanathan", None, "Jun 30, 2014")]),
    ]
    for raw, (heading, managers) in zip(pages, expected):
        page = LAYOUTS["hsbc"](raw)
        assert page.heading == heading
        assert [(m["name"], m["role"], m["since_raw"]) for m in page.managers] == managers


def test_groww_heading_ignores_underlying_fund_holdings():
    pages = (FIXTURES / "groww_headings.txt").read_text(encoding="utf-8").split("\f")
    expected = [
        ("GROWW Multi Asset Allocation Fund", [("Paras Matalia", "Fund Manager - Equities", "September 30, 2025"), ("Kaustubh Sule", "Debt - Senior Fund Manager Fixed Income", "September 30, 2025"), ("Wilfred Gonsalves", "Fund Manager & Dealer - Fixed Income", "September 30, 2025"), ("Nikhil Satam", "Fund manager & Dealer Equity", "Nov 21, 2025")]),
        ("GROWW Multi Asset Omni FOF", [("Paras Matalia", "Fund Manager - Equities", "Inception"), ("Wilfred Gonsalves", "Fund Manager & Dealer-Fixed Income", "Inception"), ("Shashi Kumar", "Fund Manager & Dealer - Equity", "Inception")]),
    ]
    for raw, (heading, managers) in zip(pages, expected):
        page = LAYOUTS["groww"](raw)
        assert page.heading == heading
        assert [(m["name"], m["role"], m["since_raw"]) for m in page.managers] == managers


def test_dsp_heading_ignores_underlying_portfolio_caption():
    pages = (FIXTURES / "dsp_headings.txt").read_text(encoding="utf-8").split("\f")
    for raw, heading in zip(pages, ["DSP World Gold Mining Overseas Equity Omni FoF", "DSP US Specific Equity Omni FoF"]):
        page = LAYOUTS["dsp"](raw)
        assert page.heading == heading
        assert page.managers == [{"name": "Kaivalya Nadkarni", "role": None, "since_raw": "May 2025"}]


def test_mrs_prefix_is_removed_whole():
    """'Mrs. Aishwarya …' must not become 's. Aishwarya …' (the Mr/Mrs alternation order bug)."""
    from app.services.analytics.fund_manager_layouts import _clean_name
    assert _clean_name("Mrs. Aishwarya Deepak Agarwal") == "Aishwarya Deepak Agarwal"
    assert _clean_name("Mr. Rahul Baijal") == "Rahul Baijal"
    assert _clean_name("Mrinal Singh") == "Mrinal Singh"  # a name starting with "Mr" keeps it


def test_absl_heading_is_the_scheme_not_an_underlying_holding_or_creation_unit_note():
    pages = (FIXTURES / "absl_headings.txt").read_text(encoding="utf-8").split("\f")
    assert len(pages) == 2
    expected = [
        ("Aditya Birla Sun Life Nifty 200 Momentum 30 ETF", [("Mehul Dama", None, "July 07,2026"), ("Priya Sridhar", None, "December 31,2024")]),
        ("Aditya Birla Sun Life Dynamic Asset Allocation Omni FOF", [("Kartikeya Singh", None, "August 28,2026")]),
    ]
    for raw, (heading, managers) in zip(pages, expected):
        page = LAYOUTS["absl_september"](raw)
        assert page.heading == heading
        assert [(m["name"], m["role"], m["since_raw"]) for m in page.managers] == managers


def test_canara_footnote_marker_does_not_join_the_scheme_type_into_the_heading():
    from app.services.analytics.fund_manager_layouts import _canara_heading
    raw = "25\nCANARA ROBECO AGGRESSIVE HYBRID FUND&&\n(An open ended hybrid scheme investing predominantly in equity and equity related instruments)"
    assert _canara_heading(raw) == "CANARA ROBECO AGGRESSIVE HYBRID FUND"


def test_hdfc_handover_note_is_not_a_role():
    """Real HDFC text (Aug 2026, Housing Opportunities): a bracketed "(X w.e.f DATE)" under a
    manager announces a handover. The file describes the fund as at its month-end, so the listed
    manager stays and the note isn't stored as a role; next month's file names the new manager."""
    page = ("HDFC Housing Opportunities Fund\nAn open ended equity scheme\nFUND MANAGER ¥\nName Since Total Exp\n"
            "Srinivasan Ramamurthy\n(Ashish Shah w.e.f \nSeptember 11, 2026)\nJanuary \n12, 2024\nOver 18 \nyears\n"
            "DATE OF ALLOTMENT/INCEPTION DATE\n")
    managers = LAYOUTS["hdfc"](page).managers
    assert [(m["name"], m["role"], m["since_raw"]) for m in managers] == [("Srinivasan Ramamurthy", None, "January 12, 2024")]


def test_canara_manager_without_a_parseable_date_is_kept_not_dropped():
    """Review (10 Oct): silently dropping a name leaves a partial list that looks complete."""
    page = ("CANARA ROBECO SMALL CAP FUND\nFUND MANAGER: 1) Mr. Pranav Gokhale (Managing fund since recently)\n"
            "2) Mr. Shridatta Bhandwaldar (Managing fund since February 1, 2019 & Overall Experience 18 years)\nDATE OF ALLOTMENT: 2019\n")
    managers = LAYOUTS["canara"](page).managers
    assert [(m["name"], m["since_raw"]) for m in managers] == [("Pranav Gokhale", None), ("Shridatta Bhandwaldar", "February 1, 2019")]
