"""UTI "Fund Watch" and Groww monthly factsheet benchmark readers.

Fixtures are small excerpts of the real Sept/Oct 2026 files (page text lines plus the
word boxes of the benchmark panel and the performance table only; no PDF). The page
numbers in each fixture's first line are the real pages, which the hand checks in the
run report refer to.
"""
import json
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.models.reference import Scheme, SchemeBenchmark
from app.services.analytics.benchmark_layouts import benchmark_block, read_benchmarks
from app.services.analytics.benchmark_names import normalise_benchmark_name

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "factsheets"
D = Decimal


def _load(name):
    return ((FIXTURES / f"{name}.txt").read_text(encoding="utf-8").split("\f"),
            json.loads((FIXTURES / f"{name}_boxes.json").read_text()))


def _uti(real_page):
    pages, boxes = _load("uti_fund_watch")
    i = next(i for i, p in enumerate(pages) if p.startswith(f"### UTI {real_page[0]} Oct 2026 page {real_page[1]}\n"))
    return pages[i], [list(w) for w in boxes[i]]


def _groww(real_page):
    pages, boxes = _load("groww_sep2026")
    i = next(i for i, p in enumerate(pages) if p.startswith(f"### Groww Sep 2026 page {real_page}\n"))
    return pages[i], [list(w) for w in boxes[i]]


def _read(layout, page_and_boxes):
    page, boxes = page_and_boxes
    return read_benchmarks(layout, [page], [boxes])


def _returns(reading):
    return reading.printed_return_1y, reading.printed_return_3y, reading.printed_return_5y


# ---------------------------------------------------------------- UTI

def test_uti_normal_equity_scheme_reads_name_additional_returns_and_date():
    # Real Active p29: "BSE Healthcare TRI"; table row "1 Y 17.14 16.77 -7.09 11,714 11,677 9,291".
    reading, = _read("uti", _uti(("Active", 29)))
    assert reading.heading == "UTI HEALTHCARE FUND"
    assert reading.tier1_name == "BSE Healthcare TRI"
    assert reading.additional_name == "Nifty 50 TRI"
    assert _returns(reading) == (D("16.77"), D("21.28"), D("14.60"))  # the benchmark column, not 17.14 / -7.09
    assert reading.printed_as_of == date(2026, 9, 30)


def test_uti_negative_benchmark_return():
    reading, = _read("uti", _uti(("Active", 26)))  # India Consumer: row "1 Y -7.23 -7.49 -7.09 ..."
    assert (reading.tier1_name, reading.printed_return_1y) == ("Nifty India Consumption TRI", D("-7.49"))


def test_uti_weighted_blend_is_read_whole_and_its_generic_header_is_accepted():
    # Real Active p35: the name wraps over three rows; the table header only says "Benchmark@".
    reading, = _read("uti", _uti(("Active", 35)))
    assert reading.tier1_name == ("65% BSE 200 TRI + 25% CRISIL Composite Bond Index + 7% Domestic Price of Gold "
                                  "+ 2% Domestic Price of Silver + 1% iCOMDEX Composite Index")
    assert _returns(reading) == (D("1.58"), D("10.48"), D("9.11"))
    match = normalise_benchmark_name(reading.tier1_name)
    assert match.key is None and [w for _, w in match.blend] == [D(65), D(25), D(7), D(2), D(1)]


def test_uti_scheme_with_no_additional_column_and_a_short_history():
    # Real Active p70: only fund and benchmark columns, no 5 Y row.
    reading, = _read("uti", _uti(("Active", 70)))
    assert reading.additional_name is None
    assert _returns(reading) == (D("1.33"), D("6.17"), None)


def test_uti_rows_before_1_year_do_not_pollute_the_header_or_the_columns():
    # Real Active p53 (overnight fund) prints "7 Days", "15 Days", "1 Month" rows first.
    reading, = _read("uti", _uti(("Active", 53)))
    assert reading.tier1_name == "CRISIL Liquid Overnight Index"
    assert reading.additional_name == "CRISIL 1 Year T-Bill Index"
    assert _returns(reading) == (D("5.24"), D("6.06"), D("5.76"))


def test_uti_name_missing_from_the_registry_is_returned_as_printed(db_session):
    # Real Passive p26: the Gold ETF prints "Price of Gold", which no registry entry matches.
    reading, = _read("uti", _uti(("Passive", 26)))
    assert reading.tier1_name == "Price of Gold"
    assert _returns(reading) == (D("29.04"), D("37.02"), D("26.36"))
    match = normalise_benchmark_name(reading.tier1_name)
    assert (match.key, match.declared_name) == (None, "Price of Gold")
    from app.services.analytics.amfi_factsheet_client import import_benchmarks
    scheme = Scheme(id=uuid.uuid4(), name="UTI GOLD ETF - Direct Plan - Growth", base_name="UTI GOLD ETF",
                    amc_name="UTI Mutual Fund", sebi_category="Other Scheme - Gold ETF", amfi_code="x1")
    db_session.add(scheme); db_session.commit()
    assert import_benchmarks(db_session, "UTI Mutual Fund", [reading], date(2026, 11, 1)) == (1, 0)
    db_session.flush()
    row = db_session.get(SchemeBenchmark, scheme.id)
    assert (row.declared_benchmark_name, row.mapped_index_key) == ("Price of Gold", None)
    assert (row.printed_return_1y, row.printed_return_5y, row.printed_as_of) == (D("29.04"), D("26.36"), date(2026, 9, 30))


def test_uti_registry_name_is_stored_with_the_printed_returns(db_session):
    from app.services.analytics.amfi_factsheet_client import import_benchmarks
    reading, = _read("uti", _uti(("Passive", 3)))  # NIFTY 50 TRI, "1 Y -7.36 -7.09 -8.74 ..."
    assert reading.tier1_name == "NIFTY 50 TRI" and reading.printed_return_1y == D("-7.09")
    scheme = Scheme(id=uuid.uuid4(), name="UTI NIFTY 50 INDEX FUND - Direct Plan - Growth", base_name="UTI NIFTY 50 INDEX FUND",
                    amc_name="UTI Mutual Fund", sebi_category="Other Scheme - Index Funds", amfi_code="x2")
    db_session.add(scheme); db_session.commit()
    import_benchmarks(db_session, "UTI Mutual Fund", [reading], date(2026, 11, 1)); db_session.flush()
    row = db_session.get(SchemeBenchmark, scheme.id)
    assert row.mapped_index_key == "nifty_50" and row.printed_return_3y == D("6.06")


def test_uti_header_that_does_not_match_the_declared_name_gives_no_returns():
    # Real Passive p20: the panel says "CRISIL IBX SDL Index – April 2033", the table header
    # "CRISIL IBX SDL Apr 2033 Index". The name is still read; no returns are attached.
    reading, = _read("uti", _uti(("Passive", 20)))
    assert reading.tier1_name == "CRISIL IBX SDL Index – April 2033"
    assert _returns(reading) == (None, None, None) and reading.printed_as_of is None


def test_uti_table_without_a_one_year_row_gives_no_returns():
    reading, = _read("uti", _uti(("Passive", 18)))  # fund launched Feb 2026: only "6 Months" and "SI*"
    assert reading.tier1_name == "Nifty500 Shariah TRI"  # the number follows the family name directly
    assert _returns(reading) == (None, None, None)


def test_uti_scheme_with_no_printed_benchmark_yields_nothing():
    page, boxes = _uti(("Active", 29))
    no_label = [w for w in boxes if w[4] != "Index" or w[0] > 100]  # drop the "Index" of "Benchmark Index"
    assert read_benchmarks("uti", [page], [no_label]) == []
    two_labels = boxes + [[w[0], w[1] - 40, w[2], w[3] - 40, w[4]] for w in boxes if w[4] in ("Benchmark", "Index") and w[0] < 70]
    assert read_benchmarks("uti", [page], [two_labels]) == []  # ambiguous: never guess between two


def test_uti_no_next_label_or_no_boxes_fails_closed():
    page, boxes = _uti(("Active", 29))
    assert read_benchmarks("uti", [page], [[w for w in boxes if w[4] != "Manager"]]) == []
    assert read_benchmarks("uti", [page], None) == []
    assert read_benchmarks("uti", [page], [[]]) == []


def test_uti_footnote_digit_glued_to_a_value_leaves_that_period_empty_and_a_symbol_is_dropped():
    page, boxes = _uti(("Active", 29))

    def with_value(old, new):
        return [[*w[:4], new] if w[4] == old else w for w in boxes]
    glued = read_benchmarks("uti", [page], [with_value("16.77", "16.771")])[0]
    assert _returns(glued) == (None, D("21.28"), D("14.60"))
    marked = read_benchmarks("uti", [page], [with_value("16.77", "16.77*")])[0]
    assert _returns(marked) == (D("16.77"), D("21.28"), D("14.60"))


def test_uti_columns_that_do_not_tie_to_their_printed_values_are_not_trusted():
    page, boxes = _uti(("Active", 29))
    shifted = [[*w[:4], "12,677"] if w[4] == "11,677" else w for w in boxes]  # benchmark's own "value of 10,000"
    reading, = read_benchmarks("uti", [page], [shifted])
    assert reading.tier1_name == "BSE Healthcare TRI"
    assert _returns(reading) == (None, None, None)


def test_uti_returns_need_their_as_on_date():
    page, boxes = _uti(("Active", 29))
    reading, = read_benchmarks("uti", [page.replace("as on 30th September, 2026", "as on")], [boxes])
    assert reading.tier1_name == "BSE Healthcare TRI" and _returns(reading) == (None, None, None)


def test_uti_benchmark_name_that_is_not_an_index_name_is_refused():
    page, boxes = _uti(("Active", 29))
    renamed = [[*w[:4], "Maybe"] if w[4] == "BSE" and w[0] < 100 else w for w in boxes]
    assert benchmark_block("uti", page, renamed)[0] is None


# ---------------------------------------------------------------- Groww

def test_groww_normal_scheme_reads_label_additional_returns_and_date():
    # Real p30: "BENCHMARK / NIFTY 100 - TRI"; Regular and Direct rows share the benchmark column
    # "-5.1797 9,482.03", "7.7984 12,531.88", "7.0604 14,067.77".
    reading, = _read("groww", _groww(30))
    assert reading.heading == "GROWW Large Cap Fund"
    assert reading.tier1_name == "NIFTY 100 - TRI" and reading.additional_name == "BSE SENSEX-TRI"
    assert _returns(reading) == (D("-5.1797"), D("7.7984"), D("7.0604"))
    assert reading.printed_as_of == date(2026, 9, 30)
    assert normalise_benchmark_name(reading.tier1_name).key == "nifty_100"


def test_groww_name_wrapped_over_two_rows_is_read_whole():
    reading, = _read("groww", _groww(34))  # "Nifty Financial Services Total" / "Return Index"
    assert reading.tier1_name == "Nifty Financial Services Total Return Index"
    assert _returns(reading) == (D("-4.4152"), None, None)  # only a 1 Year row is printed


def test_groww_hybrid_name_with_a_dash_and_a_right_hand_column_neighbour():
    reading, = _read("groww", _groww(36))
    assert reading.tier1_name == "CRISIL Hybrid 35+65 - Aggressive Index"
    assert _returns(reading) == (D("-0.9163"), D("8.1069"), D("7.5709"))


def test_groww_weighted_blend_and_a_last_1_year_row():
    reading, = _read("groww", _groww(37))
    assert reading.tier1_name == ("Nifty 500 TRI (60%) CRISIL Composite Bond Fund Index (30%) "
                                  "Domestic Gold Prices (5%) Domestic Silver Prices (5%)")
    assert _returns(reading) == (D("3.5102"), None, None)
    assert normalise_benchmark_name(reading.tier1_name).key is None  # never reduced to one part


def test_groww_scheme_without_a_performance_table_still_gets_its_name():
    reading, = _read("groww", _groww(38))  # launched Apr 2026; no table printed
    assert reading.tier1_name == "Nifty 50 Arbitrage TRI"
    assert _returns(reading) == (None, None, None) and reading.printed_as_of is None


def test_groww_six_month_rows_are_not_one_year_returns():
    reading, = _read("groww", _groww(35))
    assert reading.tier1_name == "Nifty Smallcap 250 Index"
    assert _returns(reading) == (None, None, None)
    reading, = _read("groww", _groww(44))
    assert reading.tier1_name == "CRISIL Money Market Index A-I"
    assert _returns(reading) == (None, None, None)


def test_groww_footnote_that_names_a_different_index_gives_no_returns():
    # Real p45: panel "Nifty Total Market Index TRI"; footnote "*NIFTY Total Return Index".
    reading, = _read("groww", _groww(45))
    assert reading.tier1_name == "Nifty Total Market Index TRI"
    assert _returns(reading) == (None, None, None)


def test_groww_overlaid_duplicate_words_do_not_double_the_name():
    # Real p82 draws every word of its panel twice at the same place.
    reading, = _read("groww", _groww(82))
    assert reading.tier1_name == "Domestic Price of Gold"


def test_groww_gold_name_not_in_the_registry_keeps_its_printed_form():
    reading, = _read("groww", _groww(58))
    assert reading.tier1_name == "Domestic Price of Physical Gold"
    assert _returns(reading) == (D("28.6264"), None, None)
    match = normalise_benchmark_name(reading.tier1_name)
    assert match.key is None and match.declared_name == "Domestic Price of Physical Gold"


def test_groww_plans_that_disagree_on_the_benchmark_leave_the_period_empty():
    page, boxes = _groww(30)
    direct_row = "1 Year -3.3483 9,665.17 -5.1797 9,482.03 -8.7422 9,125.78"
    assert direct_row in page
    changed = page.replace(direct_row, direct_row.replace("-5.1797 9,482.03", "-5.2797 9,472.03"))
    reading, = read_benchmarks("groww", [changed], [boxes])
    assert _returns(reading) == (None, D("7.7984"), D("7.0604"))


def test_groww_footnote_digit_glued_to_a_value_and_a_symbol():
    page, boxes = _groww(30)
    glued = page.replace("-5.1797 9,482.03", "-5.17971 9,482.03")
    reading, = read_benchmarks("groww", [glued], [boxes])
    assert _returns(reading) == (None, D("7.7984"), D("7.0604"))
    marked = page.replace("-5.1797 9,482.03", "-5.1797* 9,482.03")
    reading, = read_benchmarks("groww", [marked], [boxes])
    assert _returns(reading) == (D("-5.1797"), D("7.7984"), D("7.0604"))


def test_groww_return_that_does_not_tie_to_its_value_is_not_trusted():
    page, boxes = _groww(30)
    reading, = read_benchmarks("groww", [page.replace("9,482.03", "10,482.03")], [boxes])
    assert reading.tier1_name == "NIFTY 100 - TRI" and _returns(reading) == (None, None, None)


def test_groww_without_the_date_line_gives_no_returns_and_without_boxes_nothing():
    page, boxes = _groww(30)
    reading, = read_benchmarks("groww", [page.replace("Data as on 30th September 2026.", "")], [boxes])
    assert reading.tier1_name == "NIFTY 100 - TRI" and _returns(reading) == (None, None, None)
    assert read_benchmarks("groww", [page], None) == []


def test_groww_two_benchmark_labels_or_a_non_index_name_fail_closed():
    page, boxes = _groww(30)
    labels = [w for w in boxes if w[4] == "BENCHMARK"]
    twice = boxes + [[w[0] + 5, w[1] - 30, w[2] + 5, w[3] - 30, w[4]] for w in labels]
    assert benchmark_block("groww", page, twice) == (None, None)
    renamed = [[*w[:4], "Something"] if w[4] == "NIFTY" else w for w in boxes]
    assert benchmark_block("groww", page, renamed) == (None, None)
