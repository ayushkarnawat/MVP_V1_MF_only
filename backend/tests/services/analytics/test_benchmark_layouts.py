import importlib
from datetime import date
from pathlib import Path
from decimal import Decimal
import uuid
import pytest

from app.models.reference import Scheme

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "factsheets"


def module():
    return importlib.import_module("app.services.analytics.benchmark_layouts")


def test_tier2_is_stored_but_tier1_is_compared(db_session):
    from app.services.analytics.amfi_factsheet_client import import_benchmarks
    from app.models.reference import SchemeBenchmark
    scheme = Scheme(id=uuid.uuid4(), name="Example Fund", base_name="Example Fund", amc_name="Example AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db_session.add(scheme); db_session.commit()
    reading = module().BenchmarkReading("Example Fund", "Nifty 500 TRI", "Nifty 50 TRI")
    assert import_benchmarks(db_session, "Example AMC", [reading], date(2026, 10, 1)) == (1, 0)
    db_session.flush()
    row = db_session.get(SchemeBenchmark, scheme.id)
    assert row.mapped_index_key == "nifty_500"
    assert row.additional_benchmark_name == "Nifty 50 TRI"


def test_index_fund_tracked_index_is_read_from_the_same_line():
    # Real Axis line, axis.txt: '(An open ended scheme replicating/ tracking the Nifty Midcap 50 Index)'.
    page = (FIXTURES / "axis_etf.txt").read_text().split("\f")[0]
    readings = module().read_benchmarks("axis", [page], None)
    assert readings and readings[0].tier1_name == "Nifty 50 TRI"
    assert readings[0].tracked_index_name is not None


def test_a_house_that_failed_this_month_keeps_last_months_mapping_marked_with_its_age(db_session):
    from app.services.analytics.amfi_factsheet_client import import_benchmarks
    from app.models.reference import SchemeBenchmark
    scheme = Scheme(id=uuid.uuid4(), name="Example Fund", base_name="Example Fund", amc_name="Example AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db_session.add(scheme); db_session.commit()
    import_benchmarks(db_session, "Example AMC", [module().BenchmarkReading("Example Fund", "Nifty 500 TRI", None)], date(2026, 9, 1))
    db_session.flush()
    import_benchmarks(db_session, "Example AMC", [], date(2026, 10, 1))
    row = db_session.get(SchemeBenchmark, scheme.id)
    assert row.mapped_index_key == "nifty_500"
    assert module().mapping_age_days(row, date(2026, 10, 1)) == 30


@pytest.mark.parametrize("layout", ["whiteoak", "uti", "groww", "franklin"])
def test_layout_with_label_and_value_in_separate_runs_reads_the_value(layout):
    # Synthetic geometry: the holdings column must never supply the index name.
    words = [(10, 700, 80, 710, "BENCHMARK"), (90, 700, 115, 710, "Nifty"), (120, 700, 135, 710, "500"), (140, 700, 160, 710, "TRI"),
             (300, 700, 325, 710, "Nifty"), (330, 700, 340, 710, "50"), (345, 700, 365, 710, "TRI")]
    assert module().benchmark_block(layout, "BENCHMARK\nNifty 50 TRI\nNifty 500 TRI", words) == ("Nifty 500 TRI", None)


@pytest.mark.parametrize("layout,filename,expected", [("nj", "nj.txt", "Nifty 500 TRI"), ("kotak", "kotak.txt", "Nifty Infrastructure TRI"), ("hdfc", "hdfc.txt", "NIFTY 100 Total Returns Index (TRI)"), ("absl", "absl.txt", "Nifty 100 TRI")])
def test_real_house_declarations(layout, filename, expected):
    page = (FIXTURES / filename).read_text().split("\f")[0]
    assert module().read_benchmarks(layout, [page], None)[0].tier1_name == expected


def test_real_prefix_weighted_blend_is_preserved():
    # run7_franklin_multi.txt: prefix weights, with part of the name wrapped.
    text = "BENCHMARK\n65% Nifty 500+ 20% Nifty Short Duration\nIndex+ 5% Domestic price of gold+ 5% Domestic price of silver+ 5% iCOMDEX\nFUND SIZE"
    primary, _ = module().benchmark_block("nj", text, None)
    assert primary == "65% Nifty 500+ 20% Nifty Short Duration Index+ 5% Domestic price of gold+ 5% Domestic price of silver+ 5% iCOMDEX"


def test_franklin_real_boxes_keep_the_benchmark_in_its_own_panel():
    import json
    pages = (FIXTURES / "run7_franklin.txt").read_text().split("\f")
    words = json.loads((FIXTURES / "run7_franklin_boxes.json").read_text())
    assert [r.tier1_name for r in module().read_benchmarks("franklin", pages, words)] == ["BSE 200 TRI", "NIFTY 500 Multicap 50:25:25 TRI"]


def test_nj_tier2_and_additional_are_stored_separately(db_session):
    from app.services.analytics.amfi_factsheet_client import import_benchmarks
    from app.models.reference import SchemeBenchmark
    page = next(p for p in (FIXTURES / "nj.txt").read_text().split("\f") if "Tier 2 Benchmark:" in p)
    reading = module().read_benchmarks("nj", [page])[0]
    assert reading.tier2_name == "Nifty 500 Quality 50 TRI"
    assert reading.additional_name == "Nifty 50 TRI"
    fund = Scheme(id=uuid.uuid4(), name=reading.heading, base_name=reading.heading, amc_name="NJ AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db_session.add(fund); db_session.commit()
    import_benchmarks(db_session, "NJ AMC", [reading], date(2026, 10, 1)); db_session.flush()
    row = db_session.get(SchemeBenchmark, fund.id)
    assert row.mapped_index_key == "nifty_500"
    assert row.tier2_benchmark_name == reading.tier2_name
    assert row.additional_benchmark_name == reading.additional_name


def test_axis_printed_returns_read_the_benchmark_row_not_the_fund_or_sip_row():
    page = (FIXTURES / "axis.txt").read_text().split("\f")[0]
    reading = module().read_benchmarks("axis", [page])[0]
    assert (reading.printed_return_1y, reading.printed_return_3y, reading.printed_return_5y) == (Decimal("1.99"), Decimal("10.58"), Decimal("9.63"))
    assert reading.printed_as_of == date(2026, 8, 31)


@pytest.mark.parametrize("layout", ["whiteoak", "uti", "groww"])
def test_unverified_geometry_fails_closed_for_two_adjacent_index_names(layout):
    words = [(10,700,60,710,"Benchmark"),(65,700,90,710,"Nifty"),(95,700,110,710,"500"),(115,700,130,710,"TRI"),(140,700,165,710,"Nifty"),(170,700,185,710,"50"),(190,700,205,710,"TRI")]
    assert module().benchmark_block(layout, "", words) == (None,None)
