# backend/tests/services/analytics/test_portfolio_disclosure_parsing.py
import io
from decimal import Decimal

import openpyxl
import pytest
import xlwt

from app.services.analytics.portfolio_disclosure_parsing import (
    find_header_row, market_value_multiplier, parse_sheet_rows, parse_workbook,
    sniff_workbook_format,
)


@pytest.mark.parametrize('fmt', ['xlsx', 'xls'])
@pytest.mark.parametrize('sheet_name,code_header', [('Index', 'Scheme Code'), ('Index', 'Short Name'), ('Sheet1', 'Scheme'), ('Scheme', 'ACRONYM')])
def test_run3b_read_index_header_variants_and_product_description(fmt, sheet_name, code_header):
    from app.services.analytics.portfolio_disclosure_parsing import read_index_sheet
    make = _xlsx_bytes if fmt == 'xlsx' else _xls_bytes
    data = make({sheet_name: [['INDEX'], [code_header, 'Scheme Names'], ['YB01', 'Fund A\n(An Open Ended Liquid Scheme)']], 'YB01': [['holdings']]})
    assert read_index_sheet(data) == {'YB01': 'Fund A'}


def test_run3b_read_index_prefers_actual_sheet_short_code_and_rejects_conflicts():
    from app.services.analytics.portfolio_disclosure_parsing import read_index_sheet
    data = _xlsx_bytes({'Index': [['Scheme Code', 'Scheme Short code', 'Scheme Name'],
                                  ['007', 'SMEEF', 'SBI ESG Exclusionary Strategy Fund'],
                                  ['008', 'BAD', 'Fund One'], ['008', 'BAD', 'Fund Two']],
                        'SMEEF': [['holdings']], 'BAD': [['holdings']]})
    assert read_index_sheet(data) == {'SMEEF': 'SBI ESG Exclusionary Strategy Fund'}


def test_run3b_read_index_absent_does_not_infer_name_from_holdings():
    from app.services.analytics.portfolio_disclosure_parsing import read_index_sheet
    assert read_index_sheet(_xlsx_bytes({'Fund A': _HOLDING_ROWS})) == {}


@pytest.mark.parametrize('filename,code,name', [
    ('bank-of-india_asof_2026-09-30.xlsx', 'YB01', 'Bank Of India Liquid Fund'),
    ('jio-blackrock-all-schemes_asof_2026-09-30.xlsx', 'JBFLEXI', 'JioBlackRock Flexi Cap Fund'),
    ('abakkus-all-schemes_asof_2026-09-30.xlsx', 'ABAFC', 'Abakkus Flexi Cap Fund'),
])
def test_run3b_read_real_index_sheet(filename, code, name):
    from app.services.analytics.portfolio_disclosure_parsing import read_index_sheet
    assert read_index_sheet((_FIXTURES / filename).read_bytes())[code] == name


def test_run3b_quantum_full_name_and_kotak_abbreviations_headers():
    from app.services.analytics.portfolio_disclosure_parsing import read_index_sheet
    quantum = read_index_sheet((_FIXTURES / 'quantum_asof_2026-09-30.xlsx').read_bytes())
    kotak = read_index_sheet((_FIXTURES / 'kotak-mahindra_asof_2026-09-30-trimmed.xlsx').read_bytes())
    assert len(quantum) == 15 and 'QLTEVF' in quantum
    assert kotak['SEF'] == 'Kotak Flexicap Fund'


def _xlsx_bytes(sheets: dict[str, list[list]]) -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _xls_bytes(sheets: dict[str, list[list]]) -> bytes:
    wb = xlwt.Workbook()
    for name, rows in sheets.items():
        ws = wb.add_sheet(name)
        for r, row in enumerate(rows):
            for c, value in enumerate(row):
                ws.write(r, c, value)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_sniff_workbook_format_detects_both():
    assert sniff_workbook_format(_xlsx_bytes({"S1": [["a"]]})) == "xlsx"
    assert sniff_workbook_format(_xls_bytes({"S1": [["a"]]})) == "xls"


def test_sniff_workbook_format_rejects_unknown():
    with pytest.raises(ValueError):
        sniff_workbook_format(b"not a workbook")


def test_market_value_multiplier_recognizes_units():
    assert market_value_multiplier("Market Value") == Decimal("1")
    assert market_value_multiplier("Market Value (Rs.)") == Decimal("1")
    assert market_value_multiplier("Market Value (₹)") == Decimal("1")
    assert market_value_multiplier("Market Value (Rs. in Lakhs)") == Decimal("100000")
    assert market_value_multiplier("Market Value (Rs. in Crores)") == Decimal("10000000")


def test_market_value_multiplier_raises_on_unrecognized_unit():
    # A future AMC's "(Rs. in '000s)" must not be silently treated as bare rupees --
    # the parenthetical names a scale this function doesn't recognize.
    with pytest.raises(ValueError):
        market_value_multiplier("Market Value (Rs. in '000s)")

# append to backend/tests/services/analytics/test_portfolio_disclosure_parsing.py
from app.models.enums import AssetType

_HOLDING_ROWS = [
    ["Name of the Instrument", "ISIN", "Industry", "Quantity", "Market Value (Rs. in Lakhs)", "% to NAV"],
    ["Equity & Equity Related", "", "", "", "", ""],
    ["HDFC Bank Ltd", "INE040A01034", "Banks", 1000, 15.00, 2.5],
    ["Reliance Industries Ltd", "INE002A01018", "Petroleum Products", 500, 20.00, 3.3],
    ["Sub Total", "", "", "", 35.00, 5.8],
    ["Money Market Instruments", "", "", "", "", ""],
    ["Net Receivables/Payables", "", "", "", 1.00, 0.2],
    ["Total", "", "", "", 36.00, 6.0],
]


def test_find_header_row_locates_header_below_a_title_banner():
    rows = [["Nippon India Large Cap Fund - Portfolio as on 31-Aug-2026"], [], *_HOLDING_ROWS]
    result = find_header_row(rows)
    assert result is not None
    row_index, columns = result
    assert row_index == 2
    assert columns["instrument_name"] == 0
    assert columns["isin"] == 1
    assert columns["market_value"] == 4
    assert columns["pct_to_nav"] == 5


def test_find_header_row_returns_none_for_a_non_holdings_sheet():
    assert find_header_row([["Index"], ["Scheme Code", "Scheme Name"], ["YB01", "Scheme A"]]) is None


def test_find_header_row_matches_pct_to_aum_header():
    # Choice and Aditya Birla Sun Life label this column "% to AUM", not "% to NAV".
    rows = [["Name of the Instrument", "ISIN", "Industry", "Quantity", "Market Value", "% to AUM"],
            ["HDFC Bank Ltd", "INE040A01034", "Banks", 1000, 15.00, 2.5]]
    result = find_header_row(rows)
    assert result is not None
    assert result[1]["pct_to_nav"] == 5


def test_parse_sheet_rows_stops_at_total_catches_sub_total_and_stamps_asset_type():
    _, columns = find_header_row(_HOLDING_ROWS)
    holdings = parse_sheet_rows(_HOLDING_ROWS[1:], columns, Decimal("100000"))
    # 2 equities + the cash/receivables line, not the "Sub Total" or "Total" rows --
    # the original exact-match terminator check would have ingested "Sub Total" as a
    # third equity holding, double-counting that section's weight.
    assert len(holdings) == 3
    assert holdings[0].instrument_name == "HDFC Bank Ltd"
    assert holdings[0].isin == "INE040A01034"
    assert holdings[0].market_value == Decimal("1500000.00")
    assert holdings[0].asset_type == AssetType.EQUITY_DOMESTIC
    assert holdings[1].asset_type == AssetType.EQUITY_DOMESTIC
    assert holdings[2].instrument_name == "Net Receivables/Payables"
    assert holdings[2].isin is None
    assert holdings[2].asset_type == AssetType.CASH_EQUIVALENT


def test_parse_sheet_rows_defaults_to_other_before_any_section_header():
    rows = [["Some Unlabeled Instrument", "", "", "", 1.00, 0.1], ["Total", "", "", "", 1.00, 0.1]]
    _, columns = find_header_row([_HOLDING_ROWS[0], *rows])
    holdings = parse_sheet_rows(rows, columns, Decimal("1"))
    assert holdings[0].asset_type == AssetType.OTHER


def test_parse_sheet_rows_handles_percent_values_written_as_text():
    rows = [["HDFC Bank Ltd", "INE040A01034", "Banks", 1000, "15.00", "2.50%"],
            ["Total", "", "", "", "15.00", "2.50%"]]
    _, columns = find_header_row([_HOLDING_ROWS[0], *rows])
    holdings = parse_sheet_rows(rows, columns, Decimal("1"))
    assert len(holdings) == 1
    assert holdings[0].pct_to_nav == Decimal("2.50")


def test_parse_workbook_skips_non_holdings_sheets_and_normalizes_crores():
    crore_rows = [
        ["Name of the Instrument", "ISIN", "Industry", "Quantity", "Market Value (Rs. in Crores)", "% to NAV"],
        ["Equity & Equity Related", "", "", "", "", ""],
        ["Infosys Ltd", "INE009A01021", "IT - Software", 2000, 1.50, 4.0],
    ]
    data = _xlsx_bytes({"Index": [["Scheme Code", "Scheme Name"], ["YB01", "Fund A"]], "Fund A": crore_rows})
    sheets = parse_workbook(data)
    names = {s.sheet_name for s in sheets}
    assert names == {"Fund A"}  # "Index" has no SEBI header row -- silently skipped, not an error
    fund_a = next(s for s in sheets if s.sheet_name == "Fund A")
    assert fund_a.error is None
    assert fund_a.holdings[0].market_value == Decimal("15000000.00")
    assert fund_a.holdings[0].asset_type == AssetType.EQUITY_DOMESTIC

# append to backend/tests/services/analytics/test_portfolio_disclosure_parsing.py
import zipfile
import re
from functools import lru_cache
from pathlib import Path

import xlrd

from app.services.analytics.portfolio_disclosure_parsing import extract_zip_members


def test_extract_zip_members_returns_only_workbook_files():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("Fund A.xlsx", _xlsx_bytes({"Sheet1": [["a"]]}))
        zf.writestr("Fund B.xls", _xls_bytes({"Sheet1": [["a"]]}))
        zf.writestr("readme.txt", "not a workbook")
    members = extract_zip_members(buf.getvalue())
    names = {name for name, _ in members}
    assert names == {"Fund A.xlsx", "Fund B.xls"}


def test_fraction_scale_is_detected_per_sheet_and_stops_at_grand_total():
    rows = [
        _HOLDING_ROWS[0],
        ["Equity & Equity Related"],
        ["Bank", "INE040A01034", "Banks", 10, 1, "0.925"],
        ["Sub Total", "", "", "", 1, "0.925"],
        [],
        ["Net Receivables / (Payables)", "", "", "", 1, "0.075"],
        ["GRAND TOTAL", "", "", "", 2, 1],
        ["Annexure Bank", "INE040A01034", "Banks", 10, 10000, 500],
    ]
    point_rows = [list(r) for r in rows[:7]]
    point_rows[2][-1] = "92.5"
    point_rows[5][-1] = "7.5"
    point_rows[6][-1] = "100"
    sheets = parse_workbook(_xlsx_bytes({"Fraction": rows, "Points": point_rows}))
    assert len(sheets) == 2
    for sheet in sheets:
        assert len(sheet.holdings) == 2
        assert sum((h.pct_to_nav for h in sheet.holdings), Decimal(0)) == Decimal(100)
        assert sheet.holdings[-1].asset_type == AssetType.CASH_EQUIVALENT


def test_header_positions_isin_first_and_shifted_isin_cells():
    rows = [
        ["", "ISIN Code", "Name of Instrument", "Industry", "Quantity", "Mkt Value Rs. in Lacs", "% of Net Asset"],
        ["", "Equity & Equity Related"],
        ["code", "**", "Bank", "Banks", 10, 1, 100, "INE040A01034"],
    ]
    sheet = parse_workbook(_xlsx_bytes({"Holding": rows}))[0]
    assert sheet.error is None
    assert sheet.holdings[0].isin == "INE040A01034"
    assert sheet.holdings[0].market_value == Decimal(100000)


@pytest.mark.parametrize("text", ["NaN", "Infinity", "-Infinity", "#VALUE!"])
def test_nonfinite_or_error_cells_never_become_holdings(text):
    rows = [["Bank", "INE040A01034", "Banks", 10, text, 100]]
    _, columns = find_header_row([_HOLDING_ROWS[0], *rows])
    assert parse_sheet_rows(rows, columns, Decimal(1)) == []


def test_merged_name_header_and_total_label_in_another_column():
    rows = [
        ["Name of Instrument", "", "", "ISIN", "Industry", "Quantity", "Market Value (Rs.in Lacs)", "% to NAV"],
        ["Equity & Equity Related"],
        ["", "", "Bank", "INE040A01034", "Banks", 10, 1, 0.95],
        ["", "", "Net Current Assets", "", "", "", 1, 0.05],
        ["", "", "", "", "Grand Total", "", 2, 1],
    ]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert [h.instrument_name for h in sheet.holdings] == ["Bank", "Net Current Assets"]
    assert sheet.holdings[0].pct_to_nav == Decimal(95)


def test_numeric_category_headers_are_not_positions_and_underscore_total_stops():
    rows = [
        _HOLDING_ROWS[0],
        ["Debt Instruments", "", "", "", 10, 0.95],
        ["Listed / Awaiting Listing On Stock Exchanges", "", "", "", 10, 0.95],
        ["Government Securities", "", "", "", 10, 0.95],
        ["Bond", "IN0020250018", "Sovereign", 10, 10, 0.95],
        ["Net Receivables", "", "", "", 1, 0.05],
        ["GRAND_TOTAL", "", "", "", 11, 1],
        ["Notes:", "", "", "", "", ""],
        ["Bond annexure", "IN0020250018", "Sovereign", 10, 10, 0.95],
    ]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert len(sheet.holdings) == 2
    assert sheet.holdings[0].asset_type == AssetType.DEBT
    assert sum((h.pct_to_nav for h in sheet.holdings), Decimal(0)) == Decimal(100)


def test_declared_total_is_scaled_but_derivative_positions_remain_disclosed():
    rows = [_HOLDING_ROWS[0], ["Equity & Equity Related"],
            ["Bank", "INE040A01034", "Banks", 10, 1, 0.9],
            ["Derivatives"], ["Bank Future", "", "Banks", -10, -1, -0.8],
            ["Net Current Assets", "", "", "", 1, 0.1],
            ["Grand Total", "", "", "", 2, 1]]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert sheet.declared_total == Decimal(100)
    assert sheet.holdings[1].pct_to_nav == Decimal(-80)
    assert sheet.holdings[1].asset_type is AssetType.DERIVATIVE
    assert sum((h.pct_to_nav for h in sheet.holdings), Decimal(0)) == Decimal(20)


def test_sector_raw_is_not_normalized_and_cash_liabilities_override_previous_section():
    rows = [_HOLDING_ROWS[0], ["Equity & Equity Related"],
            ["Bank", "INE040A01034", "  Banks /\n Rating  ", 10, 1, 95],
            ["Foreign Securities"], ["NET CURRENT LIABILITIES", "", "", "", 1, 5]]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert sheet.holdings[0].sector_raw == "  Banks /\n Rating  "
    assert sheet.holdings[1].asset_type is AssetType.CASH_EQUIVALENT


def test_scheme_marker_blocks_do_not_mix_portfolios_or_annexures():
    rows = []
    for code in ("001", "002"):
        rows += [[f"SCHEME CODE{code}STARTS"], [f"SCHEME: Fund {code}"], _HOLDING_ROWS[0],
                 ["Equity & Equity Related"], ["Bank", "INE040A01034", "Banks", 1, 1, 100],
                 [f"TOTAL : Fund {code}", "", "", "", 1, ""],
                 ["Defaulted Annexure", "INE040A01034", "Banks", 1, 1, 500],
                 [f"SCHEME CODE{code}ENDS"]]
    sheets = parse_workbook(_xlsx_bytes({"EXPOSURE": rows}))
    assert [s.sheet_name for s in sheets] == ["EXPOSURE:001", "EXPOSURE:002"]
    assert all(len(s.holdings) == 1 for s in sheets)
    assert all(s.declared_total is None for s in sheets)


def test_irs_section_is_derivative():
    rows = [_HOLDING_ROWS[0], ["IRS"], ["IRS - Contract", "", "", 1, 1, 5]]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert sheet.holdings[0].asset_type is AssetType.DERIVATIVE


def test_zero_value_segregated_positions_with_tiny_weight_marker_are_retained():
    rows = [_HOLDING_ROWS[0], ["Debt Instruments"],
            ["Defaulted Bond", "INE528G08352", "ICRA-D", 950, 0, "*"],
            ["Net Current Assets", "", "", "", 0, "*"]]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert len(sheet.holdings) == 2
    assert all(h.market_value == Decimal(0) and h.pct_to_nav == Decimal(0) for h in sheet.holdings)


def test_gold_silver_related_section_classifies_its_positions():
    rows = [_HOLDING_ROWS[0], ["Gold/Silver related"], ["Metal Position", "", "", 10, 1, 100]]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert sheet.holdings[0].asset_type is AssetType.GOLD_SILVER


def test_invalid_declared_total_is_a_sheet_error_and_does_not_lose_other_sheets():
    good = [_HOLDING_ROWS[0], ["Bank", "INE040A01034", "Banks", 1, 1, 100]]
    bad = [*good, ["Grand Total", "", "", "", 1, "#VALUE!"]]
    sheets = {s.sheet_name: s for s in parse_workbook(_xlsx_bytes({"Good": good, "Bad": bad}))}
    assert sheets["Good"].error is None
    assert sheets["Good"].holdings
    assert sheets["Bad"].error is not None
    assert "declared total" in sheets["Bad"].error


_FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "portfolio_disclosures"
_NON_HOLDINGS = {"index", "scheme", "sheet1-index", "derivative", "annexure", "f & o disclosure",
                 "common notes", "xdo_metadata"}
# Only legitimately exceptional totals may be listed here, with a reason per sheet.
REAL_SHEET_SUM_ALLOWLIST = {
    ('quant-all-schemes_asof_2026-09-30.xlsx', 'qMES'):
        ('Source-duplicated TREPS/NCA rows inflate the non-derivative sum.', Decimal('115.744795'), Decimal('100.000000')),
    ('quant-all-schemes_asof_2026-09-30.xlsx', 'qMAB'):
        ('Source-duplicated TREPS/NCA rows inflate the non-derivative sum.', Decimal('102.254827'), Decimal('100.000000')),
    ('quant-arbitrage_asof_2026-09-30.xlsx', 'quant_Arbitrage_Fund'):
        ('Source-duplicated TREPS/NCA rows inflate the non-derivative sum.', Decimal('102.254827'), Decimal('100.000000')),
    ('tata_asof_2026-09-30.xlsx', 'TMAOF'):
        ('Negative commodity hedges are memo; non-derivative rows total 94.73 against a 100 Grand Total.', Decimal('94.730000'), Decimal('100.000000')),
    ('uti-consolidated_asof_2026-09-30.zip', 'EXPOSURE:176'):
        ('Source numeric weights total 101.28%; NCA has a rounded-zero marker.', Decimal('101.280000'), None),
    ('uti-consolidated_asof_2026-09-30.zip', 'EXPOSURE:747'):
        ('Zero-NAV segregated YES Bank portfolio.', Decimal('0.000000'), None),
    ('uti-consolidated_asof_2026-09-30.zip', 'EXPOSURE:748'):
        ('Zero-NAV segregated YES Bank portfolio.', Decimal('0.000000'), None),
}


@lru_cache(maxsize=None)
def _fixture_workbooks(filename):
    data = (_FIXTURES / filename).read_bytes()
    if data.startswith(b"PK"):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if "[Content_Types].xml" not in archive.namelist():
                return [(n, archive.read(n)) for n in archive.namelist() if n.lower().endswith((".xls", ".xlsx"))]
    return [(filename, data)]


def _raw_sheets(data):
    if data.startswith(b"PK"):
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
        try:
            for ws in wb:
                if ws.title.lower() in _NON_HOLDINGS or ws.title.lower().startswith("derivative"):
                    continue
                rows = []
                for row in ws.iter_rows(values_only=True):
                    rows.append(list(row))
                    if any(re.match(r"grand\s+total", str(c or ""), re.I) for c in row):
                        break
                yield ws.title, rows
        finally:
            wb.close()
    else:
        wb = xlrd.open_workbook(file_contents=data)
        try:
            for ws in wb.sheets():
                yield ws.name, [ws.row_values(i) for i in range(ws.nrows)]
        finally:
            wb.release_resources()


def _fixture_cases():
    cases = []
    for path in sorted(_FIXTURES.iterdir()):
        if path.suffix.lower() not in {".xls", ".xlsx", ".zip"}:
            continue
        for member, data in _fixture_workbooks(path.name):
            for name, rows in _raw_sheets(data):
                if name.lower() in _NON_HOLDINGS or "performance" in name.lower():
                    continue
                # Independent SEBI-header inventory, so parser skips cannot hide a fixture.
                is_holdings = any(
                    re.search(r"name.*instrument|instrument.*name|company/issuer", " ".join(str(c or "") for c in row), re.I)
                    and any("%" in str(c) and re.search(r"nav|aum|asset", str(c), re.I) for c in row)
                    for row in rows[:40]
                )
                if is_holdings:
                    codes = [re.search(r"SCHEME CODE(\d+)STARTS", str(c)) for row in rows for c in row]
                    codes = [m.group(1) for m in codes if m]
                    if codes:
                        cases.extend((path.name, member, f"{name}:{code}") for code in codes)
                    else:
                        cases.append((path.name, member, name))
    return cases


@lru_cache(maxsize=None)
def _parsed_fixture(filename, member):
    data = dict(_fixture_workbooks(filename))[member]
    return {s.sheet_name: s for s in parse_workbook(data)}


@pytest.mark.parametrize("filename,member,name", _fixture_cases())
def test_every_real_holdings_sheet_parses_with_a_plausible_scaled_total(filename, member, name, request):
    parsed = _parsed_fixture(filename, member)
    assert name in parsed, f"Holdings sheet skipped: {filename}/{member}/{name}"
    sheet = parsed[name]
    assert sheet.error is None, sheet.error
    assert sheet.holdings, f"Empty holdings: {filename}/{name}"
    declared = sheet.declared_total
    all_sum = sum((h.pct_to_nav for h in sheet.holdings), Decimal(0))
    nd_sum = sum((h.pct_to_nav for h in sheet.holdings if h.asset_type != AssetType.DERIVATIVE), Decimal(0))
    # A Grand Total reconciles on either basis (derivatives are in NAV for some AMCs, memo for others).
    total = all_sum if declared is None else (all_sum if abs(all_sum - declared) <= abs(nd_sum - declared) else nd_sum)
    key = (filename, name)
    if key in REAL_SHEET_SUM_ALLOWLIST:
        reason, expected_sum, expected_declared = REAL_SHEET_SUM_ALLOWLIST[key]
        assert reason
        assert total.quantize(Decimal("0.000001")) == expected_sum.quantize(Decimal("0.000001")), f"{key}: {total}"
        assert (declared.quantize(Decimal("0.000001")) if declared is not None else None) == expected_declared
        # An exception to the fixture gate never becomes an exception to Write.
        import uuid
        from datetime import date
        from app.models.reference import Scheme, DisclosureBatch, SchemeHolding
        from app.models.enums import DisclosureBatchStatus
        from app.services.analytics.amfi_factsheet_client import build_families
        from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch
        db = request.getfixturevalue("db_session")
        scheme = Scheme(id=uuid.uuid4(), name=name, base_name=name, amc_name="Fixture AMC", sebi_category="Test")
        db.add(scheme)
        db.flush()
        write_disclosure_batch(db, build_families([scheme])[0], date(2026, 9, 30), "Fixture AMC",
                               "https://example.test/fixture", sheet.holdings, "EXACT", Decimal(1),
                               declared_total=declared)
        batch = db.query(DisclosureBatch).filter_by(scheme_id=scheme.id).one()
        assert batch.status is DisclosureBatchStatus.FAILED
        assert db.query(SchemeHolding).filter_by(batch_id=batch.id).count() == len(sheet.holdings)
    elif declared is not None:
        from app.services.analytics.portfolio_disclosure_writer import declared_total_reconciles
        assert declared_total_reconciles(sheet.holdings, declared), f"{key}: all={all_sum}, nonderiv={nd_sum}, declared={declared}"
    else:
        assert Decimal(90) <= total <= Decimal(101), f"{key}: sum={total}"


# FIX ROUND 1: regressions from the independent review.
def test_fix_h1_numeric_position_named_like_a_section_is_retained():
    rows = [_HOLDING_ROWS[0], ["Debt Instruments"],
            ["Government Securities", "IN0020250018", "Sovereign", 10, 28597, 3.56],
            ["Government Securities", "", "", 10, 5, 0.5]]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert len(sheet.holdings) == 2
    assert sheet.holdings[0].isin == "IN0020250018"


def test_fix_h1_icici_banpsu_keeps_every_government_security_position():
    filename = "icici-prudential_asof_2026-09-30-trimmed.zip"
    member = "ICICI Prudential Banking and PSU Debt Fund.xlsx"
    sheet = _parsed_fixture(filename, member)["BANPSU"]
    rows = dict(_raw_sheets(dict(_fixture_workbooks(filename))[member]))["BANPSU"]
    header, columns = find_header_row(rows)
    source = [r for r in rows[header+1:] if str(r[columns["instrument_name"]]).strip() == "Government Securities"
              and re.fullmatch(r"IN[A-Z0-9]{10}", str(r[columns["isin"]]))]
    positions = [h for h in sheet.holdings if h.instrument_name == "Government Securities" and h.isin]
    assert len(source) >= 9
    assert len(positions) == len(source)
    assert any(h.isin == "IN0020250018" for h in positions)


@pytest.mark.parametrize("marker", ["^", "$", "*"])
def test_fix_m1_tiny_weight_markers_keep_nonzero_positions(marker):
    rows = [_HOLDING_ROWS[0], ["Equity & Equity Related"],
            ["Oil India", "INE274J01014", "Oil", 10, 157, marker]]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert len(sheet.holdings) == 1
    assert sheet.holdings[0].market_value == Decimal(15700000)
    assert sheet.holdings[0].pct_to_nav == Decimal(0)


def test_fix_m2_fraction_rows_with_explicit_percent_total_are_scaled_from_rows():
    rows = [_HOLDING_ROWS[0], ["Equity & Equity Related"],
            ["Bank", "INE040A01034", "Banks", 10, 1, 0.95],
            ["Net Current Assets", "", "", "", 1, 0.05],
            ["Grand Total", "", "", "", 2, "100%"]]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert sheet.error is None
    assert sheet.declared_total == Decimal(100)
    assert sum((h.pct_to_nav for h in sheet.holdings), Decimal(0)) == Decimal(100)


def test_fix_m2_inconsistent_numeric_total_scale_is_rejected():
    rows = [_HOLDING_ROWS[0], ["Bank", "INE040A01034", "Banks", 10, 1, 0.95],
            ["Net Current Assets", "", "", "", 1, 0.05],
            ["Grand Total", "", "", "", 2, 100]]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert sheet.error is not None and "scale" in sheet.error.lower()
    assert sheet.holdings  # retained for FAILED-batch diagnostics


def test_fix_h3_arbitrage_keeps_long_equity_and_types_short_or_contract_rows():
    rows = [_HOLDING_ROWS[0], ["ARBITRAGE"],
            ["Tata Steel Limited", "INE081A01020", "Metals", 10, 1, 70],
            ["Tata Steel Limited Oct26", "", "Stock Futures", -10, -1, -60],
            ["Bank LTD^", "INE040A01034", "Banks", -10, -1, -5],
            ["Bank Oct2026", "", "Banks", 10, 1, 2],
            ["Index contract", "", "Index Options", 1, 1, 1]]
    holdings = parse_workbook(_xlsx_bytes({"Fund": rows}))[0].holdings
    assert holdings[0].asset_type is AssetType.EQUITY_DOMESTIC
    assert all(h.asset_type is AssetType.DERIVATIVE for h in holdings[1:])


@pytest.mark.parametrize("filename,member,name", [
    ("dsp_asof_2026-09-30.zip", "DSP Equity FOF ISIN Portfolio as on 30 Sep 2026.xlsx", "ARBITRAGE"),
    ("dsp_asof_2026-09-30.zip", "DSP Equity FOF ISIN Portfolio as on 30 Sep 2026.xlsx", "DAAF"),
    ("dsp_asof_2026-09-30.zip", "DSP Equity FOF ISIN Portfolio as on 30 Sep 2026.xlsx", "VALUE"),
    ("tata_asof_2026-09-30.xlsx", "tata_asof_2026-09-30.xlsx", "TAF"),
    ("tata_asof_2026-09-30.xlsx", "tata_asof_2026-09-30.xlsx", "TMAOF"),
])
def test_fix_h3_real_negative_equity_exposures_are_derivatives(filename, member, name):
    sheet = _parsed_fixture(filename, member)[name]
    negatives = [h for h in sheet.holdings if h.quantity is not None and h.quantity < 0]
    assert negatives
    assert all(h.asset_type is AssetType.DERIVATIVE for h in negatives)


def test_fix_h3_physical_gold_silver_do_not_inherit_equity():
    rows = [_HOLDING_ROWS[0], ["Equity & Equity Related"], ["COMMODITIES & COMMODITIES RELATED"],
            ["A) Physical Commodities"], ["SILVER (30 KG) COMMODITY", "", "", 10, 1, 100]]
    assert parse_workbook(_xlsx_bytes({"Fund": rows}))[0].holdings[0].asset_type is AssetType.GOLD_SILVER


def test_fix_l1_biff_skips_derivative_and_performance_sheets():
    data = _xls_bytes({"Holdings": _HOLDING_ROWS, "DerivativeMemo": _HOLDING_ROWS,
                       "Fund Performance": _HOLDING_ROWS})
    assert [s.sheet_name for s in parse_workbook(data)] == ["Holdings"]


def test_fix_l2_terminal_banner_before_header_does_not_truncate_xlsx():
    rows = [["Net Assets", "100"], *_HOLDING_ROWS]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert len(sheet.holdings) == 3


@pytest.mark.parametrize("fmt", ["xlsx", "xls"])
def test_fix_m2_percent_formatted_gross_position_over_one_with_negative_cash(fmt):
    rows = [_HOLDING_ROWS[0], ["Mutual Fund Units"],
            ["Gold ETF", "INF204KB17I5", "", 10, 1, 1.02],
            ["Net Current Assets", "", "", "", -1, -0.02],
            ["Grand Total", "", "", "", 1, 1]]
    if fmt == "xlsx":
        wb = openpyxl.Workbook()
        ws = wb.active
        for row in rows: ws.append(row)
        for row in (3, 4, 5): ws.cell(row, 6).number_format = "0.00%"
    else:
        wb = xlwt.Workbook()
        ws = wb.add_sheet("Fund")
        style = xlwt.easyxf(num_format_str="0.00%")
        for r, row in enumerate(rows):
            for c, cell in enumerate(row):
                ws.write(r, c, cell, style if r >= 2 and c == 5 else xlwt.Style.default_style)
    out = io.BytesIO()
    wb.save(out)
    sheet = parse_workbook(out.getvalue())[0]
    assert sheet.error is None
    assert sheet.holdings[0].pct_to_nav == Decimal(102)
    assert sheet.holdings[1].pct_to_nav == Decimal(-2)
    assert sheet.declared_total == Decimal(100)


def test_fix_h1_position_named_notes_does_not_end_a_live_isin_table():
    rows = [_HOLDING_ROWS[0], ["Debt Instruments"],
            ["Notes:", "IN000438C043", "Sovereign", 10, 1, 40],
            ["Bond", "IN000439C041", "Sovereign", 10, 1, 60],
            ["Grand Total", "", "", "", 2, 100]]
    sheet = parse_workbook(_xlsx_bytes({"Fund": rows}))[0]
    assert len(sheet.holdings) == 2


@pytest.mark.parametrize("name,member", [
    ("BAF", "ICICI Prudential Balanced Advantage Fund.xlsx"),
    ("ARBITRAGE", "ICICI Prudential Arbitrage Fund.xlsx"),
])
def test_fix_h1_icici_numeric_aggregate_summaries_do_not_duplicate_positions(name, member):
    sheet = _parsed_fixture("icici-prudential_asof_2026-09-30-trimmed.zip", member)[name]
    assert abs(sum((h.pct_to_nav for h in sheet.holdings), Decimal(0))-sheet.declared_total) <= Decimal("1.5")


def test_fix_h1_absl_notes_named_bond_does_not_drop_tail_positions():
    sheet = _parsed_fixture("aditya-birla-sun-life_asof_2026-09-30.zip", "30092026_ABSLMF_MonthlyDisclosure.xls")["BSLIF"]
    assert any(h.isin == "IN000438C043" for h in sheet.holdings)
    assert abs(sum((h.pct_to_nav for h in sheet.holdings), Decimal(0))-sheet.declared_total) <= Decimal("1.5")


# Frozen independent NAVAll base-name snapshot (local capture cache, 2026-10-14).
# Includes stale/segregated families; tests never depend on the ignored live cache.
_UTI_REALISTIC_FAMILY_NAMES = (
    'UTI - Arbitrage Fund',
    'UTI - BSE Sensex Next 50 Exchange Traded Fund',
    'UTI - Banking and Financial Services Fund',
    'UTI - Bond Fund ( Segregated - 17022020 )',
    'UTI - Capital Protection Oriented Scheme - Series IX-I (1467 Days)',
    'UTI - Capital Protection Oriented Scheme - Series IX-II (1462 Days)',
    'UTI - Capital Protection Oriented Scheme - Series IX-III (1389 Days)',
    'UTI - Capital Protection Oriented Scheme - Series VIII-II (1831 Days)',
    'UTI - Capital Protection Oriented Scheme - Series VIII-III (1281 Days)',
    'UTI - Capital Protection Oriented Scheme - Series VIII-IV (1996 Days)',
    'UTI - Capital Protection Oriented Scheme - Series X-II (1134 Days)',
    'UTI - Corporate Bond Fund',
    'UTI - Credit Risk Fund (Segregated - 06032020)',
    'UTI - Credit Risk Fund (Segregated - 07072020)',
    'UTI - Credit Risk Fund (Segregated - 17022019)',
    'UTI - Credit Risk Fund.',
    'UTI - Dividend Yield Fund',
    'UTI - Dual Advantage Fixed Term Fund Series II - I (1998 Days)',
    'UTI - Dual Advantage Fixed Term Fund Series II-II (1997 Days)',
    'UTI - Dual Advantage Fixed Term Fund Series II-III (1998 Days)',
    'UTI - Dual Advantage Fixed Term Fund Series II-IV (1997 Days)',
    'UTI - Dual Advantage Fixed Term Fund Series II-V (1997 Days)',
    'UTI - Dual Advantage Fixed Term Fund Series III-I (1998 Days)',
    'UTI - Dual Advantage Fixed Term Fund Series IV-I (1279 Days)',
    'UTI - Dual Advantage Fixed Term Fund Series IV-II (1278 Days)',
    'UTI - Dual Advantage Fixed Term Fund Series IV-III (1279 Days)',
    'UTI - Dual Advantage Fixed Term Fund Series IV-IV (1997 Days)',
    'UTI - Dual Advantage Fixed Term Fund Series V - I (1103 Days)',
    'UTI - Dynamic Bond Fund ( Segregated - 17022020)',
    'UTI - Equity Savings Fund',
    'UTI - FIIF Annual Interval Plan II',
    'UTI - FIIF Annual Interval Plan IV',
    'UTI - FIIF Half Yearly Plan I',
    'UTI - FIIF Half Yearly Plan II',
    'UTI - FIIF Monthly Interval Plan I',
    'UTI - FIIF Monthly Interval Plan II',
    'UTI - FIIF Quarterly Interval Plan III',
    'UTI - FIIF Sr-2 Quarterly Interval Plan IV',
    'UTI - FIIF Sr-2 Quarterly Interval Plan VII',
    'UTI - FTIF - Series XXVI - Plan IX(1113 Days)',
    'UTI - FTIF - Series XXVI - Plan X (1107 Days)',
    'UTI - FTIF - Series XXVI - Plan XI (1105 Days)',
    'UTI - FTIF - Series XXVI - Plan XII (1096 Days)',
    'UTI - FTIF - Series XXVI - Plan XIII (1124 Days)',
    'UTI - FTIF - Series XXVI - Plan XIV (1105 Days)',
    'UTI - FTIF - Series XXVI - Plan XV (1097 Days)',
    'UTI - FTIF - Series XXVII - Plan I (1113 Days)',
    'UTI - FTIF - Series XXVII - Plan II (1161 Days)',
    'UTI - FTIF - Series XXVII - Plan III (1096 Days)',
    'UTI - FTIF - Series XXVII - Plan IV (1113 Days)',
    'UTI - FTIF - Series XXVII - Plan V (1097 Days)',
    'UTI - FTIF - Series XXVII - Plan VI (1113 Days)',
    'UTI - FTIF - Series XXVII - Plan VII (1104 Days)',
    'UTI - FTIF SERIES XXVII - PLAN IX (1160 DAYS)',
    'UTI - FTIF SERIES XXVII - PLAN VIII (1117 DAYS)',
    'UTI - FTIF SERIES XXVII - PLAN X (1118 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN I (1230 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN II (1210 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN III (1203 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN IV (1204 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN IX (1168 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN V (1190 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN VI (1190 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN VII (1169 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN VIII (1171 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN X (1153 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN XI (1161 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN XII (1154 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN XIII (1134 DAYS)',
    'UTI - FTIF SERIES XXVIII - PLAN XIV (1147 DAYS)',
    'UTI - FTIF Series XXIV - XIV (1831 Days)',
    'UTI - FTIF Series XXV-Plan-X (1229 Days)',
    'UTI - FTIF Series XXV-Plan-XI (1211 Days)',
    'UTI - FTIF Series XXV-Plan-XII (1198 Days)',
    'UTI - FTIF Series XXVI-Plan-I (1182 Days)',
    'UTI - FTIF Series XXVI-Plan-II (1176 Days)',
    'UTI - FTIF Series XXVI-Plan-III (1169 Days)',
    'UTI - FTIF Series XXVI-Plan-V (1160 Days)',
    'UTI - FTIF Series XXVI-Plan-VI (1146 Days)',
    'UTI - FTIF Series XXVI-Plan-VII (1140 Days)',
    'UTI - FTIF Series XXVI-Plan-VIII (1154 Days)',
    'UTI - Fixed Term Income Fund Series XXX-III (1106 Days)',
    'UTI - Fixed Term Income Fund Series XXX-IV (1125 Days)',
    'UTI - Fixed Term Income Fund Series XXX-IX (1266 Days)',
    'UTI - Fixed Term Income Fund Series XXX-V (1135 Days)',
    'UTI - Fixed Term Income Fund Series XXX-VI (1107 Days)',
    'UTI - Fixed Term Income Fund Series XXX-VIII (1286 Days)',
    'UTI - Fixed Term Income Fund Series XXX-X (1267 Days)',
    'UTI - Fixed Term Income Fund Series XXX-XI (1246 Days)',
    'UTI - Fixed Term Income Fund Series XXX-XII (1254 Days)',
    'UTI - Fixed Term Income Fund Series XXX-XIII (1224 Days)',
    'UTI - Fixed Term Income Fund Series XXX-XIV (1209 Days)',
    'UTI - Fixed Term Income Fund Series XXX-XV (1223 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-I (1209 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-II (1222 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-III (1174 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-IV (1204 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-IX (1168 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-V (1174 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-VI (1167 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-VII (1155 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-VIII (1153 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-X (1168 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-XI (1169 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-XII (1148 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-XIII (1127 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-XIV (1111 Days)',
    'UTI - Fixed Term Income Fund Series XXXI-XV (1099 Days)',
    'UTI - Fixed Term Income Fund Series XXXII-I(1126 Days)',
    'UTI - Fixed Term Income Fund Series XXXII-II(1111 Days)',
    'UTI - Fixed Term Income Fund Series XXXIII-I (1135 Days)',
    'UTI - Fixed Term Income fund - Series XXIX - I (1134 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - II (1118 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - III (1131 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - IV (1422 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - IX (1109 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - V (1113 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - VI (1135 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - VII (1135 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - VIII (1127 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - XI (1112 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - XIII (1122 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - XIV (1131 DAYS)',
    'UTI - Fixed Term Income fund - Series XXIX - XV (1124 DAYS)',
    'UTI - Fixed Term Income fund - Series XXX - I (1104 DAYS)',
    'UTI - Fixed Term Income fund - Series XXX - II (1107 DAYS)',
    'UTI - Flexi Cap Fund.',
    'UTI - Focussed Equity Fund - Series I ( 2195 Days)',
    'UTI - Focussed Equity Fund - Series IV (1104 Days)',
    'UTI - Focussed Equity Fund - Series V (1102 Days)',
    'UTI - Focussed Equity Fund - Series VI (1150 Days)',
    'UTI - Gilt Fund',
    'UTI - Gold Exchange Traded Fund',
    'UTI - Healthcare Fund',
    'UTI - India Consumer Fund',
    'UTI - Infrastructure Fund',
    'UTI - Large Cap Fund',
    'UTI - Liquid Fund',
    'UTI - Long Term Advantage Fund Series III',
    'UTI - Long Term Advantage Fund Series IV',
    'UTI - Long Term Advantage Fund Series V',
    'UTI - Long Term Advantage Fund Series VI',
    'UTI - Long Term Advantage Fund Series VII',
    'UTI - MNC Fund',
    'UTI - Master Equity Plan Unit Scheme',
    'UTI - Medium Term Fund ( Segregated - 06032020)',
    'UTI - Medium Term Fund (Segregated - 07072020)',
    'UTI - Medium Term Fund (Segregated - 17022020)',
    'UTI - Mid Cap Fund',
    'UTI - Money Market Fund',
    'UTI - Nifty Next 50 Exchange Traded Fund',
    'UTI - Nifty Next 50 Index Fund',
    'UTI - Overnight Fund',
    'UTI - Regular Saving Fund (Segregated - 17022020)',
    'UTI - Transportation and Logistics Fund',
    'UTI - Unit Linked Insurance Plan',
    'UTI 10 year Constant Maturity Gilt Fund',
    'UTI Aggressive Hybrid Fund',
    'UTI Annual Interval Fund - I',
    'UTI Annual Interval Fund - II',
    'UTI BSE Housing Index Fund',
    'UTI BSE India Sector Leaders Exchange Traded Fund',
    'UTI BSE India Sector Leaders Index Fund',
    'UTI BSE Low Volatility Index Fund',
    'UTI BSE Sensex ETF',
    'UTI BSE Sensex Index Fund',
    'UTI Balanced Advantage Fund',
    'UTI Balanced Hybrid Fund',
    'UTI Banking & PSU Debt Fund',
    'UTI CRISIL SDL Maturity April 2033 Index Fund',
    'UTI CRISIL SDL Maturity June 2027 Index Fund',
    "UTI Children's Equity Fund",
    "UTI Children's Hybrid Fund",
    'UTI Conservative Hybrid Fund',
    'UTI Dynamic Term Fund',
    'UTI ELSS Tax Saver Fund',
    'UTI Fixed Term Income Fund - Series XXXV-I (1260Days)',
    'UTI Fixed Term Income Fund - Series XXXV-II (1223 Days)',
    'UTI Fixed Term Income Fund - Series XXXV-III (1176 Days)',
    'UTI Fixed Term Income Fund Series XXXVI - I (1574 Days)',
    'UTI Floating Interest Rates Fund',
    'UTI Focused Fund (30 stocks)',
    'UTI Gold ETF Fund of Fund',
    'UTI Income Plus Arbitrage Active Fund of Fund',
    'UTI Innovation Fund',
    'UTI Large & Mid Cap Fund',
    'UTI Long Term Fund',
    'UTI Medium Term Fund',
    'UTI Medium to Long Term Fund',
    'UTI Multi Asset Allocation Fund',
    'UTI Multi Cap Fund',
    'UTI NIFTY SDL Plus AAA PSU Bond Apr 2026 75:25 Index Fund',
    'UTI NIFTY SDL Plus AAA PSU Bond Apr 2028- 75:25 Index Fund',
    'UTI Nifty 10 yr Benchmark G-Sec ETF',
    'UTI Nifty 1D Rate Liquid ETF - Growth',
    'UTI Nifty 200 Momentum 30 Index Fund',
    'UTI Nifty 200 Quality 30 Index Fund',
    'UTI Nifty 5 yr Benchmark G-Sec ETF',
    'UTI Nifty 50 ETF',
    'UTI Nifty 50 Index Fund',
    'UTI Nifty 500 Exchange Traded Fund',
    'UTI Nifty 500 Index Fund',
    'UTI Nifty 500 Value 50 Index Fund',
    'UTI Nifty Alpha Low-Volatility 30 Index Fund',
    'UTI Nifty Bank ETF',
    'UTI Nifty IT ETF',
    'UTI Nifty India Manufacturing Index Fund',
    'UTI Nifty Midcap 150 Exchange Traded Fund',
    'UTI Nifty Midcap 150 Index Fund',
    'UTI Nifty Midcap 150 Quality 50 Index Fund',
    'UTI Nifty Midsmallcap 400 Momentum Quality 100 Index Fund',
    'UTI Nifty Private Bank Index Fund',
    'UTI Nifty50 Equal Weight Index Fund',
    'UTI Nifty500 Shariah Index Fund',
    'UTI Quant Fund',
    'UTI Quarterly Interval Fund - I',
    'UTI Quarterly Interval Fund - II',
    'UTI Quarterly Interval Fund - III',
    'UTI Retirement Fund',
    'UTI Short Term Fund',
    'UTI Silver ETF Fund of Fund',
    'UTI Silver Exchange Traded Fund',
    'UTI Small Cap Fund',
    'UTI Ultra Short Term Fund',
    'UTI Ultra Short to Short Term Fund',
    'UTI Value Fund',
    'UTi - Credit Risk Fund (Segregated - 13092019)',
)

# Exact SCHEME: titles from the unchanged September fixture, frozen before reader implementation.
_UTI_CAPTURED_TITLES = (
    ('EXPOSURE:002', 'UTI - Unit Linked Insurance Plan'),
    ('EXPOSURE:017', 'UTI - Large Cap Fund'),
    ('EXPOSURE:042', 'UTI - Flexi Cap Fund.'),
    ('EXPOSURE:049', 'UTI Large & Mid Cap Fund'),
    ('EXPOSURE:055', "UTI Children's Hybrid Fund"),
    ('EXPOSURE:064', 'UTI Retirement Fund'),
    ('EXPOSURE:066', 'UTI Aggressive Hybrid Fund'),
    ('EXPOSURE:078', 'UTI - Money Market Fund'),
    ('EXPOSURE:101', 'UTI - MNC Fund'),
    ('EXPOSURE:103', 'UTI Medium to Long Term Fund'),
    ('EXPOSURE:118', 'UTI - Healthcare Fund'),
    ('EXPOSURE:125', 'UTI ELSS Tax Saver Fund'),
    ('EXPOSURE:128', 'UTI Nifty 50 Index Fund'),
    ('EXPOSURE:151', 'UTI - Master Equity Plan Unit Scheme'),
    ('EXPOSURE:153', 'UTI - Liquid Fund'),
    ('EXPOSURE:154', 'UTI Short Term Fund'),
    ('EXPOSURE:156', 'UTI - Overnight Fund'),
    ('EXPOSURE:157', "UTI Children's Equity Fund"),
    ('EXPOSURE:160', 'UTI - Mid Cap Fund'),
    ('EXPOSURE:161', 'UTI - Infrastructure Fund'),
    ('EXPOSURE:162', 'UTI - Transportation and Logistics Fund'),
    ('EXPOSURE:163', 'UTI - Banking and Financial Services Fund'),
    ('EXPOSURE:165', 'UTI Ultra Short to Short Term Fund'),
    ('EXPOSURE:171', 'UTI - Gilt Fund'),
    ('EXPOSURE:176', 'UTI Ultra Short Term Fund'),
    ('EXPOSURE:177', 'UTI Conservative Hybrid Fund'),
    ('EXPOSURE:190', 'UTI - Dividend Yield Fund'),
    ('EXPOSURE:193', 'UTI Value Fund'),
    ('EXPOSURE:209', 'UTI - Arbitrage Fund'),
    ('EXPOSURE:233', 'UTI - Gold Exchange Traded Fund'),
    ('EXPOSURE:251', 'UTI - India Consumer Fund'),
    ('EXPOSURE:253', 'UTI Annual Interval Fund - I'),
    ('EXPOSURE:322', 'UTI Multi Asset Allocation Fund'),
    ('EXPOSURE:340', 'UTI Dynamic Term Fund'),
    ('EXPOSURE:399', 'UTI - Credit Risk Fund.'),
    ('EXPOSURE:446', 'UTI Banking & PSU Debt Fund'),
    ('EXPOSURE:540', 'UTI Medium Term Fund'),
    ('EXPOSURE:561', 'UTI Nifty 50 ETF'),
    ('EXPOSURE:562', 'UTI BSE Sensex ETF'),
    ('EXPOSURE:656', 'UTI - Nifty Next 50 Exchange Traded Fund'),
    ('EXPOSURE:691', 'UTI - Nifty Next 50 Index Fund'),
    ('EXPOSURE:703', 'UTI - Corporate Bond Fund'),
    ('EXPOSURE:704', 'UTI - Equity Savings Fund'),
    ('EXPOSURE:713', 'UTI Floating Interest Rates Fund'),
    ('EXPOSURE:728', 'UTI - BSE Sensex Next 50 Exchange Traded Fund'),
    ('EXPOSURE:745', 'UTI Nifty Bank ETF'),
    ('EXPOSURE:747', 'UTI - Credit Risk Fund ( Segregated -06032020)'),
    ('EXPOSURE:748', 'UTI - Medium Term Fund ( Segregated - 06032020)'),
    ('EXPOSURE:751', 'UTI Small Cap Fund'),
    ('EXPOSURE:752', 'UTI Nifty 200 Momentum 30 Index Fund'),
    ('EXPOSURE:753', 'UTI Focused Fund (30 stocks)'),
    ('EXPOSURE:754', 'UTI BSE Sensex Index Fund'),
    ('EXPOSURE:755', 'UTI BSE Low Volatility Index Fund'),
    ('EXPOSURE:756', 'UTI Nifty Midcap 150 Quality 50 Index Fund'),
    ('EXPOSURE:757', 'UTI 10 year Constant Maturity Gilt Fund'),
    ('EXPOSURE:758', 'UTI Gold ETF Fund of Fund'),
    ('EXPOSURE:761', 'UTI CRISIL SDL Maturity April 2033 Index Fund'),
    ('EXPOSURE:762', 'UTI CRISIL SDL Maturity June 2027 Index Fund'),
    ('EXPOSURE:765', 'UTI Fixed Term Income Fund Series XXXVI - I (1574 Days)'),
    ('EXPOSURE:766', 'UTI NIFTY SDL Plus AAA PSU Bond Apr 2028- 75:25 Index Fund'),
    ('EXPOSURE:767', 'UTI Long Term Fund'),
    ('EXPOSURE:768', 'UTI Silver Exchange Traded Fund'),
    ('EXPOSURE:769', 'UTI Silver ETF Fund of Fund'),
    ('EXPOSURE:770', 'UTI Nifty 500 Value 50 Index Fund'),
    ('EXPOSURE:771', 'UTI Nifty50 Equal Weight Index Fund'),
    ('EXPOSURE:772', 'UTI BSE Housing Index Fund'),
    ('EXPOSURE:773', 'UTI Balanced Advantage Fund'),
    ('EXPOSURE:774', 'UTI Nifty Midcap 150 Exchange Traded Fund'),
    ('EXPOSURE:775', 'UTI Innovation Fund'),
    ('EXPOSURE:776', 'UTI Nifty IT ETF'),
    ('EXPOSURE:777', 'UTI Nifty 5 yr Benchmark G-Sec ETF'),
    ('EXPOSURE:778', 'UTI Nifty 10 yr Benchmark G-Sec ETF'),
    ('EXPOSURE:779', 'UTI Nifty 200 Quality 30 Index Fund'),
    ('EXPOSURE:780', 'UTI Nifty Private Bank Index Fund'),
    ('EXPOSURE:781', 'UTI Nifty Alpha Low-Volatility 30 Index Fund'),
    ('EXPOSURE:782', 'UTI Nifty Midcap 150 Index Fund'),
    ('EXPOSURE:783', 'UTI Quant Fund'),
    ('EXPOSURE:784', 'UTI Nifty Midsmallcap 400 Momentum Quality 100 Index Fund'),
    ('EXPOSURE:785', 'UTI Nifty India Manufacturing Index Fund'),
    ('EXPOSURE:786', 'UTI Income Plus Arbitrage Active Fund of Fund'),
    ('EXPOSURE:787', 'UTI Multi Cap Fund'),
    ('EXPOSURE:788', 'UTI Nifty500 Shariah Index Fund'),
    ('EXPOSURE:789', 'UTI Nifty 1D Rate Liquid ETF - Growth'),
    ('EXPOSURE:790', 'UTI Nifty 500 Exchange Traded Fund'),
    ('EXPOSURE:791', 'UTI Nifty 500 Index Fund'),
    ('EXPOSURE:792', 'UTI Balanced Hybrid Fund'),
    ('EXPOSURE:793', 'UTI BSE India Sector Leaders Exchange Traded Fund'),
    ('EXPOSURE:794', 'UTI BSE India Sector Leaders Index Fund'),
)

def test_run3b_uti_titles_and_realistic_family_coverage():
    import uuid
    from app.models.reference import Scheme
    from app.services.analytics.amfi_factsheet_client import build_families
    from app.services.analytics.portfolio_disclosure_matching import match_scheme_name
    from app.services.analytics.portfolio_disclosure_parsing import extract_zip_members, ParsedSheet
    data = dict(extract_zip_members((_FIXTURES / 'uti-consolidated_asof_2026-09-30.zip').read_bytes()))['Sebi Exposure as on 30 Sep 2026_FINAL.xlsx']
    sheets = parse_workbook(data)
    assert [(s.sheet_name, s.scheme_title) for s in sheets] == list(_UTI_CAPTURED_TITLES)
    families = build_families([Scheme(id=uuid.uuid4(), name=n+' - Direct - Growth', base_name=n,
                                     amc_name='UTI Mutual Fund') for n in _UTI_REALISTIC_FAMILY_NAMES])
    unmatched = [s.sheet_name for s in sheets if match_scheme_name(s.scheme_title, families) is None]
    assert len(sheets) == 88 and len(sheets)-len(unmatched) == 84
    assert unmatched == ['EXPOSURE:399', 'EXPOSURE:540', 'EXPOSURE:747', 'EXPOSURE:748']
    assert ParsedSheet('No title', [], None).scheme_title is None
