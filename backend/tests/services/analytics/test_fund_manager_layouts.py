from pathlib import Path

import pytest

from app.services.analytics.fund_manager_layouts import LAYOUTS

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "factsheets"


@pytest.mark.parametrize("layout,headings,managers", [
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
        page = LAYOUTS[layout](raw)
        assert page is not None
        assert page.heading == heading
        assert [(m["name"], m["role"], m["since_raw"]) for m in page.managers] == expected


@pytest.mark.parametrize("layout", ["nippon", "edelweiss", "hdfc", "kotak", "absl"])
def test_non_scheme_page_returns_none(layout):
    assert LAYOUTS[layout]("Contents\nGlossary\nFund Manager biographies") is None


def test_mrs_prefix_is_removed_whole():
    """'Mrs. Aishwarya …' must not become 's. Aishwarya …' (the Mr/Mrs alternation order bug)."""
    from app.services.analytics.fund_manager_layouts import _clean_name
    assert _clean_name("Mrs. Aishwarya Deepak Agarwal") == "Aishwarya Deepak Agarwal"
    assert _clean_name("Mr. Rahul Baijal") == "Rahul Baijal"
    assert _clean_name("Mrinal Singh") == "Mrinal Singh"  # a name starting with "Mr" keeps it


def test_hdfc_handover_note_is_not_a_role():
    """Real HDFC text (Aug 2026, Housing Opportunities): a bracketed "(X w.e.f DATE)" under a
    manager announces a handover. The file describes the fund as at its month-end, so the listed
    manager stays and the note isn't stored as a role; next month's file names the new manager."""
    page = ("HDFC Housing Opportunities Fund\nAn open ended equity scheme\nFUND MANAGER ¥\nName Since Total Exp\n"
            "Srinivasan Ramamurthy\n(Ashish Shah w.e.f \nSeptember 11, 2026)\nJanuary \n12, 2024\nOver 18 \nyears\n"
            "DATE OF ALLOTMENT/INCEPTION DATE\n")
    managers = LAYOUTS["hdfc"](page).managers
    assert [(m["name"], m["role"], m["since_raw"]) for m in managers] == [("Srinivasan Ramamurthy", None, "January 12, 2024")]
