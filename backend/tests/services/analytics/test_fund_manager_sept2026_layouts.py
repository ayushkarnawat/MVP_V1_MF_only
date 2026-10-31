"""September 2026 layout changes (found 31 Oct while probing the real files for the this-month-only import).
SBI's passive file and Mahindra's factsheet both changed how fund managers are printed; the old readers
read 0 scheme pages from them, so the monthly job rejected both files as 'not_a_factsheet'."""
from app.services.analytics.fund_manager_layouts import LAYOUTS, mahindra_managers, sbi_managers

SBI_PASSIVE_PAGE = (
    "SBI NIFTY 50 ETF\nAn open-ended scheme replicating the Nifty 50 index\n"
    "Fund Manager Details Name of Fund Managers Mr. Viral Chhadva Total Experience Over 19 Years "
    "Managing Since March 2026 AUM as on September 30, 2026 ` 13,219 Crs"
)
SBI_PASSIVE_TWO = (
    "Fund Manager Details Name of Fund Managers Mr. Harsh Sethi Total Experience Over 23 Years Managing Since March 2026 "
    "Ms. Test Person Total Experience Over 11 Years Managing Since June 2024 AUM as on September 30, 2026"
)
MAHINDRA_TWO = (
    "Mahindra Manulife ELSS Tax Saver Fund (An open-ended scheme)\n"
    "Fund Manager: Mr. Hemang Kapasi Total Experience: 20 years Managing Since: 25-Sep-26 "
    "Mr. Neelesh Dhamnaskar Total Experience: 22 years Managing Since: 16-Feb-26 Fund Manager Details Date of Inception"
)
MAHINDRA_NAMED_AND_KERNED = (
    "Fund Manager: Mr. Vishal Jajoo Total Experience: 19 years M anaging Since: 3-Nov-25 "
    "Name of Fund Manager: Mr. Neelesh Dhamnaskar Total Experience: 22 years Managing Since: 21-Jul-26 Fund Manager Details"
)
MAHINDRA_OLD = "Fund Manager (Equity): Mr. Old Style Total Experience: 10 years (Managing since August 26, 2026.)"


def test_sbi_passive_new_layout_reads_the_manager_and_date():
    assert sbi_managers(SBI_PASSIVE_PAGE) == [dict(name="Viral Chhadva", role=None, since_raw="March 2026")]


def test_sbi_passive_new_layout_reads_two_managers():
    got = sbi_managers(SBI_PASSIVE_TWO)
    assert [(m["name"], m["since_raw"]) for m in got] == [("Harsh Sethi", "March 2026"), ("Test Person", "June 2024")]


def test_sbi_passive_reader_still_gives_the_scheme_heading():
    page = LAYOUTS["sbi"](SBI_PASSIVE_PAGE)
    assert page is not None and page.heading == "SBI NIFTY 50 ETF"


def test_mahindra_new_layout_reads_both_managers_with_dd_mon_yy_dates():
    got = mahindra_managers(MAHINDRA_TWO)
    assert [(m["name"], m["since_raw"]) for m in got] == [("Hemang Kapasi", "25-Sep-26"), ("Neelesh Dhamnaskar", "16-Feb-26")]


def test_mahindra_new_layout_handles_the_named_second_block_and_kerned_since():
    got = mahindra_managers(MAHINDRA_NAMED_AND_KERNED)
    assert [(m["name"], m["since_raw"]) for m in got] == [("Vishal Jajoo", "3-Nov-25"), ("Neelesh Dhamnaskar", "21-Jul-26")]


def test_mahindra_old_layout_still_reads():
    got = mahindra_managers(MAHINDRA_OLD)
    assert got == [dict(name="Old Style", role="Equity", since_raw="August 26, 2026")]


def test_mahindra_page_without_managers_is_none():
    assert mahindra_managers("Performance snapshot of sectoral indices") is None
