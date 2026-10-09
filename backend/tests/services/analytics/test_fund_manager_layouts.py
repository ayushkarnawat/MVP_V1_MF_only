from pathlib import Path
import json
import re

import pytest

from app.services.analytics.fund_manager_layouts import LAYOUTS

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "factsheets"


@pytest.mark.parametrize("layout", ["nj", "ppfas", "quant", "quantum", "shriram", "sundaram", "unifi", "zerodha"])
def test_departure_annotation_never_keeps_a_current_manager(layout):
    raw = (FIXTURES / f"{layout}.txt").read_text(encoding="utf-8").split("\f")[0]
    first = LAYOUTS[layout](raw).managers[0]["name"]
    pattern = r"\s+".join(re.escape(word) for word in first.split())
    annotated = re.sub(pattern, lambda m: m.group(0) + " (Ceased to be FM Sep 10, 2026)", raw, count=1)
    found = LAYOUTS[layout](annotated)
    assert found is None or first not in [m["name"] for m in found.managers]


def test_shriram_handover_annotation_is_not_a_role():
    raw = (FIXTURES / "shriram.txt").read_text(encoding="utf-8").split("\f")[0]
    raw = raw.replace("Mr. Hitesh Savanth", "Mr. Hitesh Savanth (w.e.f. Jun 15, 2026)", 1)
    assert LAYOUTS["shriram"](raw).managers[0]["role"] is None


def test_lic_summary_pairs_by_position_even_when_words_are_reversed():
    pages = (FIXTURES / "lic.txt").read_text(encoding="utf-8").split("\f")
    boxes = json.loads((FIXTURES / "lic_words.json").read_text(encoding="utf-8"))
    reader = LAYOUTS["lic"]
    expected = [
        ("Large Cap Fund", [("Sumit Bhatnagar", "Equity", "Oct 03, 2023")]),
        ("Large & Mid Cap Fund", [("Sudhanshu Asthana", "Equity", "April 07, 2026")]),
        ("Flexi Cap Fund", [("Sudhanshu Asthana", "Equity", "April 07, 2026"), ("Nikhil Kapoor", "Equity", "July 01, 2026")]),
        ("MultiCap Fund", [("Dikshit Mittal", "Equity", "Dec 01, 2022")]),
        ("Mid Cap Fund", [("Manoj Bajpai", "Equity", "July 01, 2026")]),
        ("Small Cap Fund", [("Dikshit Mittal", "Equity", "July 24, 2025")]),
        ("Dividend Yield Fund", [("Dikshit Mittal", "Equity", "July 31, 2023")]),
        ("Value Fund", [("Mahesh Bendre", "Equity", "July 01, 2024")]),
        ("Focused Fund", [("Mahesh Bendre", "Equity", "April 07, 2026")]),
        ("Infrastructure Fund", [("Mahesh Bendre", "Equity", "July 01, 2024")]),
        ("Manufacturing Fund", [("Mahesh Bendre", "Equity", "Oct 11, 2024")]),
        ("Consumption Fund", [("Sumit Bhatnagar", "Equity", "Nov 21, 2025"), ("Nikhil Kapoor", "Equity", "July 01, 2026")]),
        ("Technology Fund", [("Sumit Bhatnagar", "Equity", "April 07, 2026"), ("Siddharth Panjwani", "Equity", "July 01, 2026")]),
        ("Banking & Financial Services Fund", [("Sudhanshu Asthana", "Equity", "April 07, 2026")]),
        ("Healthcare Fund", [("Sudhanshu Asthana", "Equity", "April 07, 2026")]),
        ("ELSS Tax Saver Fund", [("Sumit Bhatnagar", "Equity", "April 07, 2026"), ("Nikhil Kapoor", "Equity", "July 01, 2026")]),
        ("Unit Linked Insurance Scheme", [("Siddharth Panjwani", "Equity", "July 01, 2026"), ("Pratik Shroff", "Debt", "Sep 26, 2023")]),
        ("Aggressive Hybrid Fund", [("Manoj Bajpai", "Equity/Arbitrage", "July 01, 2026"), ("Pratik Shroff", "Debt", "Sep 26, 2023")]),
        ("Balanced Advantage Fund", [("Manoj Bajpai", "Equity/Arbitrage", "July 01, 2026"), ("Rahul singh", "Debt", "Nov 12, 2021")]),
        ("Equity Savings Fund", [("Siddharth Panjwani", "Equity/Arbitrage", "July 01, 2026"), ("Pratik Shroff", "Debt", "Sep 26, 2023")]),
        ("Conservative Hybrid Fund", [("Siddharth Panjwani", "Equity/Arbitrage", "July 01, 2026"), ("Pratik Shroff", "Debt", "Sep 26, 2023")]),
        ("Arbitrage Fund", [("Sumit Bhatnagar", "Equity/Arbitrage", "Oct 03, 2023"), ("Pratik Shroff", "Debt", "Sep 26, 2023"), ("Sasikant Aravamuthan", "Equity", "July 01, 2026")]),
        ("Multi Asset Allocation Fund", [("Sumit Bhatnagar", "Equity/Arbitrage", "Feb 14, 2025"), ("Pratik Shroff", "Debt", "Feb 14, 2025")]),
    ]
    for fund, since in [("Overnight Fund", "July 18, 2019"), ("Liquid Fund", "Oct 05, 2015")]:
        expected.append((fund, [("Rahul Singh", "Debt", since), ("Aakash Dhulia", "Debt", "Sep 01, 2025")]))
    for fund, since in [("Ultra Short Term Fund", "Nov 27, 2019"), ("Money Market Fund", "Aug 01, 2022"), ("Ultra Short to Short Term Fund", "Sept 07, 2015")]:
        expected.append((fund, [("Rahul Singh", "Debt", since), ("Pratik Shroff", "Debt", "Oct 01, 2025")]))
    for fund in ["Medium to Long Term Fund", "Banking & PSU Debt Fund", "Short Term Fund", "Gilt Fund"]:
        expected.append((fund, [("Pratik Shroff", "Debt", "Sep 26, 2023"), ("Rahul Singh", "Debt", "Oct 01, 2025")]))
    expected.append(("Children's Fund", [("Siddharth Panjwani", "Equity", "July 01, 2026"), ("Pratik Shroff", "Debt", "Sep 26, 2023")]))
    for fund in ["BSE Sensex ETF", "NIFTY 50 ETF", "NIFTY 100 ETF", "Nifty Midcap 100 ETF", "BSE Sensex Index Fund", "NIFTY 50 Index Fund", "Nifty Next 50 Index Fund"]:
        expected.append((fund, [("Nikhil Kapoor", "Equity", "April 07, 2026"), ("Sasikant Aravamuthan", "Equity", "July 01, 2026")]))
    for fund in ["Gold Exchange Traded Fund", "Gold ETF Fund of Fund"]:
        expected.append((fund, [("Sumit Bhatnagar", "Commodity", "June 01, 2024"), ("Sasikant Aravamuthan", "Commodity", "July 01, 2026")]))
    expected.append(("Nifty 8-13 yr G-Sec ETF", [("Pratik Shroff", "Debt", "Sep 26, 2023"), ("Rahul Singh", "Debt", "Oct 01, 2025")]))
    expected = [("LIC MF " + heading, managers) for heading, managers in expected]
    for words in (boxes[0], list(reversed(boxes[0]))):
        actual = reader(pages[0], words)
        assert [(p.heading, [(m["name"], m["role"], m["since_raw"]) for m in p.managers]) for p in actual] == expected
    # Page 11's title is artwork: do not infer it from the summary or the merger note.
    assert reader(pages[1], boxes[1]) == []
    assert reader(pages[0], []) == []


@pytest.mark.parametrize("layout,headings,managers", [
    ("sundaram_variants", ["Sundaram Multi Asset Allocation Fund", "Sundaram Long Term Micro Cap Tax Advantage Fund - Series III"], [
        [("Clyton Richard Fernandes", None, None), ("Rohit Seksaria", None, "05 Jan 2024"), ("Kumaresh Ramakrishnan", None, None),
         ("Arjun Nagarajan", None, None), ("Shalav Saket", "Overseas", None)],
        [("Rohit Seksaria", None, "01 Apr 2019")],
    ]),
    ("sundaram", ["Sundaram Large Cap Fund", "Sundaram Conservative Hybrid Fund"], [
        [("Ashwin Jain", None, "21 Oct 2024"), ("Shalav Saket", "Overseas", None)],
        [("Bharath S", None, "16 May 2022"), ("Kumaresh Ramakrishnan", None, "09 Jun 2026")],
    ]),
    ("zerodha", ["Zerodha Nifty Large Midcap250 Index Fund", "Zerodha Gold ETF"], [
        [("Kedarnath Mirajkar", None, "Nov 2023")],
        [("Shyam Agarwal", None, "Feb 2024"), ("Kedarnath Mirajkar", "Co-Fund Manager", "Sep 2024")],
    ]),
    ("unifi", ["Unifi Dynamic Asset Allocation Fund", "Unifi Liquid Fund"], [
        [("V N Saravanan", "CIO & Fund Manager", "inception"), ("Aejas Lakhani", "Equity Fund Manager", "inception"), ("Karthik Srinivas", "Debt Fund Manager", "inception")],
        [("V N Saravanan", "CIO & Fund Manager", "inception"), ("Karthik Srinivas", "Fund Manager", "inception")],
    ]),
    ("shriram", ["Shriram Multi Sector Rotation Fund", "Shriram Multi Asset Allocation Fund"], [
        [("Hitesh Savanth", None, "Jun 15, 2026"), ("Prateek Nigudkar", None, "Aug 7, 2025")],
        [("Hitesh Savanth", None, "Jun 15, 2026"), ("Prateek Nigudkar", None, "Aug 7, 2025"),
         ("Amit Modani", None, "Nov 1, 2025"), ("Sudip Suresh More", None, "Oct 3, 2024")],
    ]),
    ("quantum_variants", ["Quantum Ethical Fund", "Quantum Multi Asset Allocation Fund"], [
        [("Chirag Mehta", None, "December 20, 2024")],
        [("Sneha Pandey", "Fund Manager", "April 01, 2025"), ("Mansi Vasa", "Fund Manager", "April 01, 2025")],
    ]),
    ("quantum", ["Quantum Diversified Equity All Cap Active FOF", "Quantum Dynamic Term Fund"], [
        [("Chirag Mehta", "Fund Manager", "November 01, 2013"), ("Piyush Singh", "Associate Fund Manager", "April 01, 2025")],
        [("Sneha Pandey", None, "April 01, 2025"), ("Mayur Chauhan", None, "July 01, 2025")],
    ]),
    ("quant", ["quant Liquid Fund", "quant Overnight Fund"], [
        [("Sanjeev Sharma", None, "03 October 2019"), ("Haroonvardhan Sirohi", None, "20 February 2026")],
        [("Sanjeev Sharma", None, "05 December 2022"), ("Haroonvardhan Sirohi", None, "20 February 2026")],
    ]),
    ("ppfas", ["Parag Parikh Flexi Cap Fund", "Parag Parikh Liquid Fund"], [
        [("Rajeev Thakkar", "Chief Investment Officer - Equity and Director", "Since Inception"),
         ("Raunak Onkar", "Fund Manager Dedicated for Overseas Securities", "Since Inception"),
         ("Raj Mehta", "Executive Vice President and Fund Manager - Equity", "September 1, 2025"),
         ("Rukun Tarachandani", "Executive Vice President & Fund Manager - Equity", "May 16, 2022"),
         ("Tejas Soman", "Chief Investment Officer - Debt", "September 1, 2025"),
         ("Mansi Kariya", "Associate Vice President & Fund Manager- Debt", "December 22, 2023"),
         ("Aishwarya Dhar", "Senior Manager & Fund Manager- Debt", "September 1, 2025")],
        [("Tejas Soman", "Chief Investment Officer - Debt", "September 1, 2025"),
         ("Mansi Kariya", "Associate Vice President & Fund Manager- Debt", "December 22, 2023"),
         ("Aishwarya Dhar", "Senior Manager & Fund Manager - Debt", "September 1, 2025")],
    ]),
    ("nj", ["NJ MOMENTUM FUND", "NJ FLEXI CAP FUND"], [
        [("Viral Shah", None, "inception"), ("Dhaval Patel", None, "inception"), ("Jaimin Ilavia", None, "August 04, 2026")],
        [("Viral Shah", None, "May 1, 2024"), ("Dhaval Patel", None, "inception"), ("Jaimin Ilavia", None, "June 11, 2026")],
    ]),
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
        page = LAYOUTS[{"groww_passive": "groww", "quantum_variants": "quantum", "sundaram_variants": "sundaram"}.get(layout, layout)](raw)
        assert page is not None
        assert page.heading == heading
        assert [(m["name"], m["role"], m["since_raw"]) for m in page.managers] == expected


@pytest.mark.parametrize("layout", list(LAYOUTS))
def test_non_scheme_page_returns_none(layout):
    if layout == "lic":
        assert LAYOUTS[layout]("Contents\nGlossary\nFund Manager biographies", []) == []
    else:
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
