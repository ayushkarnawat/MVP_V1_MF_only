"""Run 8 readers: verbatim excerpts from the supplied and public factsheets."""
from pathlib import Path
import json

import pytest

from app.services.analytics.fund_manager_layouts import LAYOUTS
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind

FIXTURES = Path(__file__).parents[2] / "fixtures/factsheets"

CASES = [
    ("sbi", [("SBI LARGE CAP FUND", [("Saurabh Pant", None, "April 2024")]),
             ("SBI Nifty 50 ETF", [("Viral Chhadva", None, "March 2026")])]),
    ("tata", [("Tata Large Cap Fund", [("Abhinav Sharma", None, "05-Apr-2023"), ("Hasmukh Vishariya", None, "01-Mar\ufffe2025")]),
              ("Tata Flexi Cap Fund", [("Anand Sharma", None, "03-Oct-2025"), ("Aditya Bagul", None, "03-Oct\ufffe2023")])]),
    ("mahindra", [("Mahindra Manulife Multi Cap Fund", [("Vishal Jajoo", None, "November 3, 2025"), ("Neelesh Dhamnaskar", None, "July 21, 2026")]),
                  ("Mahindra Manulife Mid Cap Fund", [("Kirti Dalvi", None, "December 03, 2024"), ("Neelesh Dhamnaskar", None, "February 16, 2026"), ("Krishna Sanghavi", None, "October 24, 2024")])]),
    ("motilal", [("Motilal Oswal Large Cap Fund", [("Atul Mehra", "Equity Component", "06-Feb-2024"), ("Ajay Khandelwal", "Equity Component", "06-Feb-2024"), ("Rakesh Shetty", "Debt Component", "06-Feb-2024"), ("Swapnil Mayekar", "Foreign Securities", "November 18, 2025")]),
                 ("Motilal Oswal Nasdaq 100 ETF", [("Swapnil Mayekar", None, "13-October-2025"), ("Dishant Mehta", "Associate Fund Manager", "13-October-2025")])]),
    ("bandhan", [("Bandhan Large Cap Fund", [("Manish Gunwani", None, "02 December 2024"), ("Prateek Poddar", None, "02 December 2024")]),
                  ("Bandhan Nifty 50 ETF", [("Abhishek Jain", None, "08 March 2025"), ("Mayuresh Nagvekar", None, "17 February 2026")])]),
    ("invesco", [("Invesco India Multi Cap Fund", [("Taher Badshah", None, "July 01, 2025"), ("Manish Poddar", None, "July 01, 2025")]),
                  ("Invesco India Aggressive Hybrid Fund", [("Amey Sathe", "Equity Investments", "November 04, 2025"), ("Hiten Jain", "Equity Investments", "December 01, 2023"), ("Krishna Cheemalapati", "Debt Investments", "June 30, 2018")])]),
    ("jm", [("JM ELSS - Tax Saver Fund", [("Deepak Gupta", None, "April 11, 2025"), ("Satish Ramanathan", "Co Fund Manager", "October 01, 2024"), ("Asit Bhandarkar", "Co Fund Manager", "December, 2021"), ("Ruchi Fozdar", "Debt Fund Manager", "October 04, 2024")]),
             ("JM Short Term Fund", [("Killol Pandya", None, "November 05, 2024"), ("Ruchi Fozdar", "Co Fund Manager", "April 03, 2024"), ("Jayant Dhoot", "Co Fund Manager", "August 01, 2025")])]),
]


@pytest.mark.parametrize("layout,expected", CASES)
def test_two_real_pages_exact_headings_managers_roles_dates(layout, expected):
    texts = (FIXTURES / f"run8_{layout}.txt").read_text(encoding="utf-8").split("\f")
    for text, (heading, managers) in zip(texts, expected, strict=True):
        page = LAYOUTS[layout](text)
        assert page.heading == heading
        assert page.managers == [dict(name=n, role=r, since_raw=d) for n, r, d in managers]


@pytest.mark.parametrize("amc,layout,proof", [
    ("Bandhan Mutual Fund", "bandhan", "401"),
    ("Invesco Mutual Fund", "invesco", "CloudFront 403"),
    ("JM Financial Mutual Fund", "jm", "AppTrana 406"),
])
def test_manual_registry_has_reader_and_access_control_proof(amc, layout, proof):
    entry = AMC_RESOLVERS[amc]
    assert entry.kind is ResolverKind.MANUAL
    assert entry.layout == layout
    assert proof in entry.note
    assert "user imports monthly via import_manual_fund_managers.py" in entry.note


@pytest.mark.parametrize("layout,heads", [
    ("bandhan", ["Bandhan Large & Mid Cap Fund", "Bandhan Arbitrage Fund"]),
    ("invesco", ["Invesco India Gold ETF Fund of Fund", "Invesco India Income Plus Arbitrage Active Fund of Fund"]),
    ("jm", ["JM Focused Fund", "JM Multi Asset Allocation Fund"]),
])
def test_real_title_variants_do_not_match_holdings_or_old_fund_names(layout, heads):
    for text, heading in zip((FIXTURES / f"run8_{layout}_variants.txt").read_text(encoding="utf-8").split("\f"), heads, strict=True):
        page = LAYOUTS[layout](text)
        assert page.heading == heading
        if heading == "JM Multi Asset Allocation Fund":
            assert page.managers == [dict(name=n, role=r, since_raw="July 15, 2026") for n, r in [
                ("Asit Bhandarkar", None), ("Deepak Gupta", "Co Fund Manager"),
                ("Killol Pandya", "Debt Fund Manager"), ("Satish Ramanathan", "Advisor for-Asset Allocation")]]


@pytest.mark.parametrize("layout", ["bandhan", "invesco", "jm"])
def test_real_ceased_policy_and_wef_operational_notes_are_not_managers(layout):
    for text in (FIXTURES / f"run8_{layout}_audit.txt").read_text(encoding="utf-8").split("\f"):
        assert "ceased" in text or "w.e.f." in text
        assert LAYOUTS[layout](text) is None


def test_tata_real_wef_exit_load_notes_are_not_manager_roles():
    for text in (FIXTURES / "run8_tata_audit.txt").read_text(encoding="utf-8").split("\f"):
        assert "w.e.f." in text
        assert LAYOUTS["tata"](text) is None


@pytest.mark.parametrize("amc,layout,endpoint,patterns", [
    ("SBI Mutual Fund", "sbi", "https://www.sbimf.com/ajaxcall/CMS/GetRecentFactSheets", ["all-sbimf-schemes-factsheet-august-2026.pdf", "sbi-mf-passives-(index-etf-fof)-factsheet-august-2026.pdf"]),
    ("Tata Mutual Fund", "tata", "https://prod-dist-api.tatamfdev.com/cms-data/api/CMSDATA_corporate_factsheets", []),
    ("Motilal Oswal Mutual Fund", "motilal", "https://www.motilaloswalmf.com/content/aem-cloud-dept-backend-motilal-oswal/api/search-documents.json", ["Most%20Factsheet%20August%202026%20Active.pdf", "factsheet-july-2026-passive-funds.pdf"]),
    ("Mahindra Manulife Mutual Fund", "mahindra", "https://investorapi.mahindramanulife.com/api/v1/web/preLogin/downloads", []),
])
def test_public_registry_records_verified_request_and_required_files(amc, layout, endpoint, patterns):
    import re
    entry = AMC_RESOLVERS[amc]
    assert entry.kind is ResolverKind.JSON_API and entry.layout == layout
    assert entry.endpoint_url == endpoint
    assert "200" in entry.note and "2026-10-10" in entry.note
    assert len(entry.documents) == len(patterns)
    for pattern, filename in zip(entry.documents, patterns, strict=True):
        assert re.search(pattern, filename, re.I)


def test_ask_single_fund_real_scheme_and_portfolio_pages():
    scheme, portfolio = (FIXTURES / "run8_ask.txt").read_text(encoding="utf-8").split("\f")
    page = LAYOUTS["ask"](scheme)
    assert page.heading == "ASK Liquid Fund"
    assert page.managers == [dict(name=n, role=None, since_raw="01st Sept 2026") for n in ["Dinesh Ahuja", "Yash Sanghvi"]]
    assert LAYOUTS["ask"](portfolio) is None
    assert AMC_RESOLVERS["ASK MUTUAL FUND"].layout == "ask"
    assert AMC_RESOLVERS["ASK MUTUAL FUND"].min_schemes == 1


def test_360_performance_footnotes_dates_belong_to_manager_roles():
    texts = (FIXTURES / "run8_360_dates.txt").read_text(encoding="utf-8").split("\f")
    boxes = json.loads((FIXTURES / "run8_360_dates_boxes.json").read_text(encoding="utf-8"))
    expected = [
        [("Mayur Patel", None, "11 November 2019"), ("Viral Mehta", "Co-Fund Manager", "30 June, 2026")],
        [("Pranav Mise", None, "30 June, 2026"), ("Viral Mehta", "Co-Fund Manager", "7 August, 2026")],
    ]
    for text, words, managers in zip(texts, boxes, expected, strict=True):
        page = LAYOUTS["360"](text, list(reversed(words)))
        assert page.managers == [dict(name=n, role=r, since_raw=d) for n, r, d in managers]


def test_360_ambiguous_or_incomplete_role_mapping_keeps_dates_null():
    text = (FIXTURES / "run8_360_dates.txt").read_text(encoding="utf-8").split("\f")[0]
    words = json.loads((FIXTURES / "run8_360_dates_boxes.json").read_text(encoding="utf-8"))[0]
    # Removing the co-manager label makes both rows primary. Text order must
    # never decide which primary manager receives the performance date.
    words = [w for w in words if w[4] != "Co-"]
    assert all(m["since_raw"] is None for m in LAYOUTS["360"](text, words).managers)


@pytest.mark.parametrize("layout,expected", [
    ("mahindra", [("Mahindra Manulife Manufacturing Fund", [("Renjith Sivaram", "Equity", "June 24, 2024"), ("Navin Matta", "Equity", "December 02, 2025")]),
                  ("Mahindra Manulife Equity Savings Fund", [("Renjith Sivaram", "Equity", "July 03, 2023"), ("Navin Matta", "Equity", "December 02, 2025"), ("Rahul Pal", "Debt", "February 1, 2017"), ("Kush Sonigara", "Debt", "January 01, 2026")])]),
    ("motilal", [("Motilal Oswal Gold and Silver Passive Fund of Funds", [("Swapnil Mayekar", None, "12-June-2025"), ("Rakesh Shetty", "Debt Component", "24-Dec-2022")]),
                 ("Motilal Oswal Diversified Equity Flexicap Passive Fund of Funds", [("Rakesh Shetty", "Debt Component", "22nd January, 2026"), ("Swapnil Mayekar", None, "22nd January, 2026")])]),
    ("sbi", [("SBI MULTICAP FUND", [("Ruchit Mehta", None, "June 2026")]),
             ("SBI RETIREMENT BENEFIT FUND-AGGRESSIVE PLAN", [("Rohit Shimpi", "Equity", "Oct 2021"), ("Ardhendu Bhattacharya", "Debt", "June 2021")])]),
])
def test_role_date_and_departure_variants_from_real_pages(layout, expected):
    for text, (heading, managers) in zip((FIXTURES / f"run8_{layout}_variants.txt").read_text(encoding="utf-8").split("\f"), expected, strict=True):
        page = LAYOUTS[layout](text)
        assert page.heading == heading
        assert page.managers == [dict(name=n, role=r, since_raw=d) for n, r, d in managers]


def test_360_printed_comma_dates_are_persistable():
    from datetime import date
    from app.services.analytics.amfi_factsheet_client import _parse_managing_since
    assert _parse_managing_since("30 June, 2026") == date(2026, 6, 30)
    assert _parse_managing_since("7 August, 2026") == date(2026, 8, 7)


@pytest.mark.parametrize("fixture,expected", [
    ("passive", [("NIFTY 1D RATE LIQUID ETF - Growth", [("Jignesh Shah", None, "August 08, 2025")]), ("NIFTY NEXT 50 INDEX FUND", [("Viral Chhadva", None, "March 2026")])]),
    ("debt", [("SBI MONEY MARKET FUND", [("Rajeev Radhakrishnan", None, "Dec-2023"), ("Sankalp Jain", "Co-Fund Manager", "1st Jul 2026")]), ("SBI BANKING & PSU DEBT FUND", [("Ardhendhu Bhattacharya", "Co Fund Manager", "Dec 2023")])]),
    ("roles", [("SBI EQUITY SAVINGS FUND", [("Nidhi Chawla", "Equity", "Jan 2022"), ("Mohit Jain", "Debt", "May 2025"), ("Neeraj Kumar", "Arbitrage", "May 2015"), ("Vandna Soni", "Commodities", "Jan 2024")]), ("SBI BALANCED ADVANTAGE FUND", [("Dinesh Balachandran", "Equity", "Aug 2021"), ("Mansi Sajeja", "Debt", "Dec 2023"), ("Rajeev Radhakrishnan", "Co Fund Manager Debt", "Aug 2021")])]),
    ("gilt", [("SBI 10 YEAR CONSTANT MATURITY GILT FUND", [("Sudhir Agarwal", None, "July 1st\ufffe2025")])]),
])
def test_sbi_full_current_manager_rows_and_printed_titles(fixture, expected):
    for text, (heading, managers) in zip((FIXTURES / f"run8_sbi_{fixture}.txt").read_text(encoding="utf-8").split("\f"), expected, strict=True):
        page = LAYOUTS["sbi"](text)
        assert page.heading == heading
        assert page.managers == [dict(name=n, role=r, since_raw=d) for n, r, d in managers]


def test_sbi_passive_appointments_use_explicit_co_manager_caption():
    texts = (FIXTURES / "run8_sbi_appointments.txt").read_text(encoding="utf-8").split("\f")
    for text, heading, names, since in zip(texts, ["NIFTY G-SEC JUL 2031 INDEX FUND", "CRISIL - IBX FINANCIAL SERVICES 3-6 MONTHS DEBT INDEX FUND"], [["Jignesh Shah", "Ranjana Gupta"], ["Ranjana Gupta", "Sankalp Jain"]], ["May 26, 2026", "April 2026"], strict=True):
        page = LAYOUTS["sbi"](text)
        assert page.heading == heading
        assert page.managers == [dict(name="Rajeev Radhakrishnan", role=None, since_raw=since)] + [dict(name=n, role="Co-Fund Manager", since_raw="1st July, 2026") for n in names]


def test_sbi_unbranded_financial_service_titles_match_only_their_exact_amc_alias():
    from app.models.reference import Scheme
    from app.services.analytics.amfi_factsheet_client import build_families, match_scheme_families
    families = build_families([Scheme(amfi_code=str(i), name=n, base_name=n, amc_name="SBI Mutual Fund", sebi_category="Debt Index Fund") for i, n in enumerate([
        "SBI CRISIL-IBX Financial Services 3-6 Months Debt Index Fund", "SBI CRISIL-IBX Financial Services 9-12 Months Debt Index Fund"])])
    texts = [(FIXTURES / "run8_sbi_appointments.txt").read_text(encoding="utf-8").split("\f")[1], (FIXTURES / "run8_sbi_financial.txt").read_text(encoding="utf-8")]
    for text, family in zip(texts, families, strict=True):
        page = LAYOUTS["sbi"](text)
        assert match_scheme_families(page, families)[0][0] == family


def test_bandhan_printed_month_alias_does_not_choose_a_neighbouring_maturity():
    from app.models.reference import Scheme
    from app.services.analytics.amfi_factsheet_client import build_families, match_scheme_families
    names = ["BANDHAN CRISIL IBX 90:10 SDL PLUS GILT - NOV 2026 INDEX FUND", "Bandhan CRISIL IBX 90:10 SDL Plus Gilt September 2027 Index Fund"]
    families = build_families([Scheme(amfi_code=str(i), name=n, base_name=n, amc_name="Bandhan Mutual Fund", sebi_category="Debt Index Fund") for i, n in enumerate(names)])
    for text, family, month, day in zip((FIXTURES / "run8_bandhan_maturity.txt").read_text(encoding="utf-8").split("\f"), families, ["November 2026", "September 2027"], ["17", "24"], strict=True):
        page = LAYOUTS["bandhan"](text)
        assert page.heading == f"Bandhan CRISIL IBX 90:10 SDL Plus Gilt {month} Index Fund"
        assert page.managers == [dict(name=n, role=None, since_raw=f"{day} November 2022") for n in ["Gautam Kaul", "Harshal Joshi"]]
        assert match_scheme_families(page, families)[0][0] == family
