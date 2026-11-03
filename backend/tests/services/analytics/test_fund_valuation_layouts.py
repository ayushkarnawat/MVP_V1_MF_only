"""Real October-supplied text/geometry excerpts; no PDF or network needed."""
import asyncio
import json
import re
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from app.models.reference import SchemeReportedValuation
from app.services.analytics import amfi_factsheet_client as fc
from tests.services.analytics.test_amfi_factsheet_client import _scheme

ROOT = Path(__file__).parents[2] / "fixtures/factsheets"
PERIOD = date(2026, 10, 1)


def _pages(house):
    texts = (ROOT / f"{house}_valuation.txt").read_text().split("\f")
    path = ROOT / f"{house}_valuation_boxes.json"
    boxes = json.loads(path.read_text()) if path.exists() else [[] for _ in texts]
    pages = fc.FactsheetPages(texts, boxes)
    pages.source_files = [f"{house}.pdf"] * len(texts)
    pages.page_numbers = [int(re.search(r"source page index (\d+)", text)[1]) + 1 for text in texts]
    return pages


def _read(house):
    from app.services.analytics.fund_valuation_layouts import read_valuation
    pages = _pages(house)
    return read_valuation(house, pages, pages.words)


def test_invesco_forward_pe_and_trailing_pb():
    rows = _read("invesco")
    assert [(r.heading, r.pe, r.pb, r.pe_basis, r.pb_basis, r.method, r.page) for r in rows] == [
        ("Invesco India Small Cap Fund", Decimal("37.78"), Decimal("4.84"), "forward", "trailing", "harmonic", 12),
        ("Invesco India Financial Services Fund", Decimal("19.07"), Decimal("2.93"), "forward", "trailing", "harmonic", 13),
    ]
    assert rows[0].source_file == "invesco.pdf"


def test_iti_column_order():
    rows = _read("iti")
    assert [(r.heading, r.pe, r.pb) for r in rows] == [
        ("ITI Small Cap Fund", Decimal("47.01"), Decimal("11.64")),
        ("ITI Value Fund", Decimal("24.53"), Decimal("6.20")),
    ]
    assert all((r.pe_basis, r.pb_basis, r.method) == ("not_stated",) * 3 for r in rows)


def test_kotak_label_and_value_in_separate_runs():
    rows = _read("kotak")
    assert [(r.heading, r.pe, r.pb) for r in rows] == [
        ("KOTAK MNC FUND", Decimal("44.29"), Decimal("7.50")),
        ("KOTAK TRANSPORTATION & LOGISTICS FUND", Decimal("31.42"), Decimal("4.16")),
    ]
    assert all((r.pe_basis, r.pb_basis, r.method) == ("not_stated",) * 3 for r in rows)


def test_absl_equity_snapshot_row():
    rows = _read("absl")
    assert [(r.heading, r.pe, r.pb) for r in rows] == [
        ("Aditya Birla Sun Life Small Cap Fund", Decimal("33.97"), Decimal("4.24")),
        ("Aditya Birla Sun Life Value Fund", Decimal("27.83"), Decimal("3.53")),
        ("Aditya Birla Sun Life Business Cycle Fund", Decimal("31.11"), Decimal("5.81")),
        ("Aditya Birla Sun Life Conglomerate Fund", Decimal("30.43"), Decimal("3.66")),
    ]
    assert all((r.pe_basis, r.pb_basis, r.method) == ("not_stated",) * 3 for r in rows)
    from app.services.analytics.fund_valuation_layouts import read_valuation
    pages = _pages("absl")
    assert read_valuation("absl_september", pages, pages.words) == rows


@pytest.mark.parametrize("house", ["invesco", "iti", "kotak", "absl"])
def test_page_with_no_values_returns_nothing(house):
    from app.services.analytics.fund_valuation_layouts import read_valuation
    pages = _pages(house)
    assert read_valuation(house, [pages[-1]], [pages.words[-1]]) == []
    assert read_valuation("uti", pages, pages.words) == []
    assert read_valuation("unknown", pages, pages.words) == []


@pytest.mark.parametrize("pe,pb", [("2.99", "0.19"), ("200.01", "40.01"), ("-15", "-2"),
                                   ("NA", "not available"), ("NaN", "Infinity")])
def test_absurd_or_negative_or_text_values_are_dropped_and_logged(pe, pb, caplog):
    from app.services.analytics.fund_valuation_layouts import read_valuation
    text = _pages("invesco")[0].replace("37.78", pe).replace("4.84", pb)
    assert read_valuation("invesco", [text], None) == []
    assert "pe" in caplog.text and "pb" in caplog.text
    assert "not found" in caplog.text


def test_direct_and_regular_plans_share_the_scheme_value(db_session):
    from dataclasses import replace
    schemes = [_scheme("Invesco India Small Cap Fund", plan=plan, amc="Invesco Mutual Fund")
               for plan in ("Direct Plan - Growth", "Regular Plan - Growth")]
    other = _scheme("Invesco India Small Cap Fund", amc="Another AMC")
    db_session.add_all(schemes + [other]); db_session.flush()
    reading = _read("invesco")[0]
    assert fc.import_reported_valuation(db_session, "Invesco Mutual Fund", [reading], PERIOD) == (1, 0)
    db_session.flush()
    assert db_session.query(SchemeReportedValuation).count() == 4
    newer = replace(reading, pe=Decimal("38.25"), pb=None)
    assert fc.import_reported_valuation(db_session, "Invesco Mutual Fund", [newer, newer], PERIOD) == (1, 0)
    db_session.flush()
    rows = db_session.query(SchemeReportedValuation).all()
    assert len(rows) == 4
    assert {r.scheme_id for r in rows} == {s.id for s in schemes}
    assert {r.value for r in rows if r.metric == "pe"} == {Decimal("38.25")}
    assert {r.value for r in rows if r.metric == "pb"} == {Decimal("4.84")}
    assert all(r.source_file == "invesco.pdf" and r.page == 12 and r.parsed_at is not None for r in rows)
    assert fc.import_reported_valuation(db_session, "Invesco Mutual Fund", [reading], date(2026, 11, 1)) == (1, 0)
    db_session.flush()
    assert db_session.query(SchemeReportedValuation).count() == 8


def test_unknown_scheme_is_skipped_not_guessed(db_session):
    from dataclasses import replace
    db_session.add(_scheme("Invesco India Small Cap Fund", amc="Invesco Mutual Fund"))
    db_session.flush()
    reading = replace(_read("invesco")[0], heading="Invesco India Small Cap Opportunities Fund")
    assert fc.import_reported_valuation(db_session, "Invesco Mutual Fund", [reading], PERIOD) == (0, 1)
    assert db_session.query(SchemeReportedValuation).count() == 0


def _monthly(monkeypatch, db_session, pages):
    from dataclasses import replace
    from app.services.analytics.fund_manager_resolvers import ResolverKind
    # Exercise the automatic per-AMC loop with a controlled enabled source.
    entry = replace(fc.AMC_RESOLVERS["Invesco Mutual Fund"], min_schemes=1, kind=ResolverKind.STATIC_LINK)
    monkeypatch.setattr(fc, "AMC_RESOLVERS", {"Invesco Mutual Fund": entry})
    monkeypatch.setattr(fc, "_fetch_amfi_directory", AsyncMock(return_value={str(i): "unused" for i in range(60)}))
    monkeypatch.setattr(fc, "_resolve_and_read", AsyncMock(return_value=(pages, "ok")))
    monkeypatch.setattr(fc, "import_pages", lambda *args, **kwargs: (1, 0))
    return asyncio.run(fc.refresh_fund_managers(db_session))


@pytest.mark.parametrize("previous,current,alert", [(True, False, True), (False, False, False), (True, True, False)])
def test_valuation_alert_when_a_house_that_had_values_returns_none(db_session, monkeypatch, caplog, previous, current, alert):
    today_period = date.today().replace(day=1)
    from datetime import timedelta
    previous_period = (today_period - timedelta(days=1)).replace(day=1)
    scheme = _scheme("Invesco India Small Cap Fund", amc="Invesco Mutual Fund")
    db_session.add(scheme); db_session.flush()
    if previous:
        fc.import_reported_valuation(db_session, scheme.amc_name, [_read("invesco")[0]], previous_period)
        db_session.commit()
    pages = _pages("invesco") if current else ["No valuation figures this month"]
    result = _monthly(monkeypatch, db_session, pages)
    assert result.amcs_processed == 1 and result.amcs_failed == 0
    assert ("FUND_MANAGER_ALERT amc=Invesco Mutual Fund reason=valuation_missing" in caplog.text) is alert
    if current:
        assert db_session.query(SchemeReportedValuation).filter_by(reference_period=today_period).count() == 2


@pytest.mark.parametrize("house,pe,pb", [("iti", "47.01", "11.64"), ("kotak", "44.29", "7.50")])
def test_manual_import_reads_valuation_from_the_same_pdf(db_session, tmp_path, monkeypatch, house, pe, pb):
    from scripts.jobs import import_manual_fund_managers as cli
    from app.services.analytics.fund_valuation_layouts import read_valuation
    amc = {"iti": "ITI Mutual Fund", "kotak": "Kotak Mahindra Mutual Fund"}[house]
    heading = {"iti": "ITI Small Cap Fund", "kotak": "KOTAK MNC FUND"}[house]
    db_session.add(_scheme(heading, amc=amc)); db_session.flush()
    pages = _pages(house)
    pdf = tmp_path / f"{house}.pdf"; pdf.write_bytes(b"fake-pdf")
    monkeypatch.setattr(cli, "extract_page_text", lambda _: list(pages))
    monkeypatch.setattr(cli, "extract_page_words", lambda _: pages.words)
    monkeypatch.setattr(cli, "looks_like_current_factsheet", lambda *a, **kw: (True, "ok"))
    monkeypatch.setattr(cli, "import_pages", lambda *a, **kw: (1, 0))
    assert cli.run(db_session, amc, [pdf], date(2026, 10, 12)) == {"matched": 1, "unmatched": 0}
    rows = {r.metric: r for r in db_session.query(SchemeReportedValuation).all()}
    assert rows["pe"].value == Decimal(pe) and rows["pb"].value == Decimal(pb)
    assert all(r.source_file == pdf.name and r.page == 1 for r in rows.values())


def test_positional_reader_does_not_use_text_order_or_an_adjacent_column():
    from app.services.analytics.fund_valuation_layouts import read_valuation
    for house in ("iti", "kotak"):
        pages = _pages(house)
        assert read_valuation(house, pages, None) == []
        assert read_valuation(house, pages, [[] for _ in pages]) == []
        # Scramble all unrelated text; geometry still carries the correct ratios.
        assert read_valuation(house, [pages[0]], [list(reversed(pages.words[0]))])[0].pe == _read(house)[0].pe


@pytest.mark.parametrize("pe,pb", [("3", "0.2"), ("200", "40")])
def test_sanity_range_endpoints_are_included(pe, pb):
    from app.services.analytics.fund_valuation_layouts import read_valuation
    text = _pages("invesco")[0].replace("37.78", pe).replace("4.84", pb)
    row, = read_valuation("invesco", [text], None)
    assert (row.pe, row.pb) == (Decimal(pe), Decimal(pb))


# ---- UTI "Fund Watch" (Active): real Oct 2026 pages 29, 34, 36, 38 (30 Sep 2026 data) ----

def test_uti_reads_the_fund_column_with_trailing_and_harmonic_wording():
    rows = _read("uti")
    assert [(r.heading, r.pe, r.pb, r.page) for r in rows] == [
        ("UTI HEALTHCARE FUND", Decimal("42.22"), Decimal("5.32"), 29),          # benchmark column prints 43.41 / 5.47
        ("UTI BALANCED ADVANTAGE FUND", Decimal("20.32"), Decimal("2.87"), 34),  # second page of a hybrid fund
        ("UTI MULTI ASSET ALLOCATION FUND", Decimal("23.54"), Decimal("4.53"), 36),
        ("UTI AGGRESSIVE HYBRID FUND", Decimal("16.38"), Decimal("2.29"), 38),   # other tables share the row
    ]
    assert all((r.pe_basis, r.pb_basis, r.method) == ("trailing", "trailing", "harmonic") for r in rows)


def test_uti_wording_is_not_stated_when_the_note_is_absent():
    from app.services.analytics.fund_valuation_layouts import read_valuation
    pages = _pages("uti")
    page = re.sub(r"(?s)Calculation Methodology.*", "", pages[0])
    row, = read_valuation("uti", [page], [pages.words[0]])
    assert (row.pe, row.pb, row.pe_basis, row.pb_basis, row.method) == (Decimal("42.22"), Decimal("5.32"), "not_stated", "not_stated", "not_stated")


def _uti_with(old, new):
    from app.services.analytics.fund_valuation_layouts import read_valuation
    pages = _pages("uti")
    boxes = [[*w[:4], new] if w[4] == old else w for w in pages.words[0]]
    return read_valuation("uti", [pages[0]], [boxes])


def test_uti_footnote_digit_glued_to_a_value_drops_only_that_value():
    row, = _uti_with("42.22", "42.221")
    assert (row.pe, row.pb) == (None, Decimal("5.32"))
    row, = _uti_with("5.32", "5.32*")  # a symbol is a footnote mark, not part of the number
    assert (row.pe, row.pb) == (Decimal("42.22"), Decimal("5.32"))


@pytest.mark.parametrize("value", ["2.99", "200.01", "N.A", "-15.00"])
def test_uti_out_of_range_or_missing_pe_is_dropped(value):
    row, = _uti_with("42.22", value)
    assert row.pe is None and row.pb == Decimal("5.32")


def test_uti_without_geometry_or_the_table_or_a_heading_returns_nothing():
    from app.services.analytics.fund_valuation_layouts import read_valuation
    pages = _pages("uti")
    assert read_valuation("uti", pages, None) == []
    assert read_valuation("uti", pages, [[] for _ in pages]) == []
    no_header = [[w for w in page if w[4] != "Indicators"] for page in pages.words]
    assert read_valuation("uti", pages, no_header) == []
    # A page whose text carries no scheme heading is skipped; the others are untouched.
    assert [r.heading for r in read_valuation("uti", ["no heading here"] + list(pages[1:]), pages.words)][0] == "UTI BALANCED ADVANTAGE FUND"
    two_labels = list(pages.words[0]) + [[w[0], w[1] - 6, w[2], w[3] - 6, w[4]] for w in pages.words[0] if w[4] == "P/E"]
    assert read_valuation("uti", [pages[0]], [two_labels]) == []


def test_groww_prints_no_pe_or_pb_so_it_has_no_valuation_reader():
    from app.services.analytics.fund_valuation_layouts import read_valuation, LAYOUTS
    assert "groww" not in LAYOUTS
    pages = _pages("uti")
    assert read_valuation("groww", pages, pages.words) == []
    assert read_valuation("uti_passive", pages, pages.words) == []  # the Passive file prints no ratios either


def test_uti_needs_word_boxes_like_the_other_positional_houses():
    from app.services.analytics.fund_valuation_layouts import NEEDS_BOXES, LAYOUTS
    assert {"iti", "kotak", "uti"} <= NEEDS_BOXES and set(LAYOUTS) == {"invesco", "iti", "kotak", "absl", "uti"}
