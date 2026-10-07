from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from casparser.enums import CASFileType, FileType
from casparser.enums import TransactionType as CasTxnType
from casparser.types import CASData, Folio, InvestorInfo, Scheme, SchemeValuation, StatementPeriod, TransactionData

from app.models.enums import TransactionType
from app.services.import_.parser import (
    _normalize_cas_data,
    classify_folio_plan_type,
    classify_plan_from_name,
    mask_pan,
    normalize_txn_type,
)


@pytest.mark.parametrize(
    "pan, masked",
    [("BXQPS5678L", "BX******8L"), ("ABCD", "****"), ("A", "*"), ("AB", "**"), (None, None), ("", "")],
)
def test_mask_pan_shows_first_two_and_last_two(pan, masked):
    assert mask_pan(pan) == masked


def test_normalize_txn_type_maps_to_monolith_enum():
    assert normalize_txn_type("PURCHASE") == TransactionType.PURCHASE
    assert normalize_txn_type("PURCHASE_SIP") == TransactionType.PURCHASE_SIP
    assert normalize_txn_type("STT_TAX") == TransactionType.STT
    assert normalize_txn_type("STAMP_DUTY_TAX") == TransactionType.STAMP_DUTY
    assert normalize_txn_type("UNKNOWN_TYPE") == TransactionType.MISC
    assert normalize_txn_type("REVERSAL") == TransactionType.REVERSAL
    assert normalize_txn_type("GIFT_IN") == TransactionType.GIFT_IN
    assert normalize_txn_type("GIFT_OUT") == TransactionType.GIFT_OUT
    assert normalize_txn_type("TDS_TAX") == TransactionType.MISC


def test_classify_plan_from_name_direct():
    assert classify_plan_from_name("HDFC Flexi Cap Fund - Direct Plan - Growth") == "direct"


def test_classify_folio_plan_type_disagreement_is_unclassified():
    assert classify_folio_plan_type("direct", "ARN-12345") == "unclassified"


def test_normalize_cas_data_captures_arn_and_plan_type():
    """Regular-plan scheme with an ARN: name signal 'regular' wins regardless
    of ARN presence (FR-5 — Regular-named schemes are always regular)."""
    txn = MagicMock(
        date="2024-01-01", description="Purchase", amount="5000", units="10",
        nav="500", type="PURCHASE",
    )
    scheme = MagicMock(
        scheme="HDFC Flexi Cap Fund - Regular Plan - Growth",
        isin="INF123", amfi="125497", type="EQUITY", advisor="ARN-99999",
        transactions=[txn],
    )
    folio = MagicMock(folio="123/45", amc="HDFC AMC", PAN="ABCDE1234F", schemes=[scheme])
    data = MagicMock(
        cas_type=CASFileType.DETAILED, file_type=FileType.CAMS,
        investor_info=MagicMock(email="t@example.com"),
        folios=[folio], parse_warnings=[],
    )
    data.model_dump_json.return_value = "{}"

    result = _normalize_cas_data(data)

    assert len(result.schemes) == 1
    parsed_scheme = result.schemes[0]
    assert parsed_scheme.arn_code == "ARN-99999"
    assert parsed_scheme.plan_name_variant == "regular"
    assert parsed_scheme.plan_type == "regular"


def test_normalize_cas_data_direct_scheme_no_arn():
    """Direct-plan scheme with no ARN: name + corroborating-absence signal
    both agree -> direct (not unclassified)."""
    txn = MagicMock(
        date="2024-01-01", description="Purchase", amount="5000", units="10",
        nav="500", type="PURCHASE",
    )
    scheme = MagicMock(
        scheme="ICICI Prudential Bluechip Fund - Direct Plan - Growth",
        isin="INF456", amfi="120716", type="EQUITY", advisor=None,
        transactions=[txn],
    )
    folio = MagicMock(folio="678/90", amc="ICICI AMC", PAN="ABCDE1234F", schemes=[scheme])
    data = MagicMock(
        cas_type=CASFileType.DETAILED, file_type=FileType.CAMS,
        investor_info=MagicMock(email="t@example.com"),
        folios=[folio], parse_warnings=[],
    )
    data.model_dump_json.return_value = "{}"

    result = _normalize_cas_data(data)

    parsed_scheme = result.schemes[0]
    assert parsed_scheme.arn_code is None
    assert parsed_scheme.plan_name_variant == "direct"
    assert parsed_scheme.plan_type == "direct"


def test_normalize_cas_data_direct_scheme_with_non_arn_advisor_placeholder():
    """Some AMC/RTA CAS templates print a literal non-ARN placeholder in the
    "(Advisor: ...)" annotation for direct-plan folios with no real
    distributor (e.g. "DIRECT", "NIL") instead of omitting it outright.
    That placeholder is not a genuine ARN/RIA code, so it must not be
    treated as corroborating-Regular evidence -> still plain "direct"."""
    txn = MagicMock(
        date="2024-01-01", description="Purchase", amount="5000", units="10",
        nav="500", type="PURCHASE",
    )
    scheme = MagicMock(
        scheme="Aditya Birla Sun Life Frontline Equity Fund - Direct Plan - Growth",
        isin="INF789", amfi="118989", type="EQUITY", advisor="DIRECT",
        transactions=[txn],
    )
    folio = MagicMock(folio="111/22", amc="ABSL AMC", PAN="ABCDE1234F", schemes=[scheme])
    data = MagicMock(
        cas_type=CASFileType.DETAILED, file_type=FileType.CAMS,
        investor_info=MagicMock(email="t@example.com"),
        folios=[folio], parse_warnings=[],
    )
    data.model_dump_json.return_value = "{}"

    result = _normalize_cas_data(data)

    parsed_scheme = result.schemes[0]
    assert parsed_scheme.arn_code is None
    assert parsed_scheme.plan_name_variant == "direct"
    assert parsed_scheme.plan_type == "direct"


def test_normalize_cas_data_redemption_units_and_amount_are_positive():
    """casparser flips units/amount negative for balance-decreasing rows
    (redemptions/switch-outs); TransactionType alone encodes direction, so
    normalization must emit non-negative magnitudes."""
    txn = MagicMock(
        date="2024-01-01", description="Redemption", amount="-3000", units="-50",
        nav="60", type="REDEMPTION",
    )
    scheme = MagicMock(
        scheme="HDFC Flexi Cap Fund - Regular Plan - Growth",
        isin="INF123", amfi="125497", type="EQUITY", advisor="ARN-99999",
        transactions=[txn],
    )
    folio = MagicMock(folio="123/45", amc="HDFC AMC", PAN="ABCDE1234F", schemes=[scheme])
    data = MagicMock(
        cas_type=CASFileType.DETAILED, file_type=FileType.CAMS,
        investor_info=MagicMock(email="t@example.com"),
        folios=[folio], parse_warnings=[],
    )
    data.model_dump_json.return_value = "{}"

    result = _normalize_cas_data(data)

    norm = result.transactions[0]
    assert norm.txn_type == TransactionType.REDEMPTION
    assert norm.units == Decimal("50.000")
    assert norm.amount == Decimal("3000.00")


def test_normalize_cas_data_purchase_units_and_amount_unchanged():
    """abs() must be a no-op for already-positive purchase-side rows."""
    txn = MagicMock(
        date="2024-01-01", description="Purchase", amount="5000", units="10",
        nav="500", type="PURCHASE",
    )
    scheme = MagicMock(
        scheme="HDFC Flexi Cap Fund - Regular Plan - Growth",
        isin="INF123", amfi="125497", type="EQUITY", advisor="ARN-99999",
        transactions=[txn],
    )
    folio = MagicMock(folio="123/45", amc="HDFC AMC", PAN="ABCDE1234F", schemes=[scheme])
    data = MagicMock(
        cas_type=CASFileType.DETAILED, file_type=FileType.CAMS,
        investor_info=MagicMock(email="t@example.com"),
        folios=[folio], parse_warnings=[],
    )
    data.model_dump_json.return_value = "{}"

    result = _normalize_cas_data(data)

    norm = result.transactions[0]
    assert norm.units == Decimal("10.000")
    assert norm.amount == Decimal("5000.00")


def _real_cas_data(*, pan: str | None, txn_kwargs: dict) -> CASData:
    """Builds a real (non-Mock) casparser CASData tree so .model_copy(deep=True)
    and .model_dump_json() actually run and can be asserted on."""
    txn = TransactionData(date="2024-01-01", description="Purchase", type=CasTxnType.PURCHASE, **txn_kwargs)
    valuation = SchemeValuation(date="2024-01-31", nav=Decimal("550"), value=Decimal("5500"))
    scheme = Scheme(
        scheme="HDFC Flexi Cap Fund - Direct Plan - Growth", rta_code="HDFC01", rta="CAMS",
        isin="INF123", amfi="125497", open=Decimal("0"), close=Decimal("10"),
        close_calculated=Decimal("10"), valuation=valuation, transactions=[txn],
    )
    folio = Folio(folio="123/45", amc="HDFC AMC", PAN=pan, schemes=[scheme])
    investor = InvestorInfo(name="Test Investor", email="t@example.com", address="addr", mobile="9999999999")
    statement_period = StatementPeriod(**{"from": "2024-01-01", "to": "2024-01-31"})
    return CASData(
        statement_period=statement_period, folios=[folio], investor_info=investor,
        cas_type=CASFileType.DETAILED, file_type=FileType.CAMS, parse_warnings=[],
    )


def test_normalize_cas_data_redacts_pan_from_raw_json():
    """Fix 1 regression: raw_json is persisted verbatim into
    imports.raw_parser_output by confirm_import — the unmasked PAN must never
    reach it, even though pan_masked (a separately-derived field) is fine to
    keep in the transient preview response."""
    data = _real_cas_data(
        pan="ABCDE1234F",
        txn_kwargs={"amount": Decimal("5000"), "units": Decimal("10"), "nav": Decimal("500")},
    )

    result = _normalize_cas_data(data)

    assert "ABCDE1234F" not in result.raw_json
    assert result.investor.pan_masked == "AB******4F"


def test_normalize_cas_data_carries_raw_pan_alongside_masked():
    """ParseResult.investor.pan carries the raw PAN in memory for attribution
    matching, alongside the separately-masked pan_masked field. The raw PAN is
    not persisted to raw_json (test_normalize_cas_data_redacts_pan_from_raw_json
    verifies that separately)."""
    data = _real_cas_data(
        pan="ABCDE1234F",
        txn_kwargs={"amount": Decimal("5000"), "units": Decimal("10"), "nav": Decimal("500")},
    )

    result = _normalize_cas_data(data)

    assert result.investor.pan == "ABCDE1234F"
    assert result.investor.pan_masked == "AB******4F"


def test_normalize_cas_data_skips_transaction_missing_amount_and_warns():
    """Fix 3 regression: Transaction.amount/units/nav are NOT NULL downstream.
    A transaction line missing any of them must be excluded (not crash, not
    reach the DB null) and surfaced via parse_warnings for the preview."""
    data = _real_cas_data(
        pan=None,
        txn_kwargs={"amount": None, "units": Decimal("10"), "nav": Decimal("500")},
    )

    result = _normalize_cas_data(data)

    assert result.transactions == []
    assert len(result.parse_warnings) == 1
    assert "missing amount, units, or NAV" in result.parse_warnings[0]


def test_parse_cas_pdf_bytes_fills_people_and_person_keys(monkeypatch):
    import casparser

    from app.services.import_ import parser as parser_mod
    from app.services.import_.parser import parse_cas_pdf_bytes

    data = _real_cas_data(
        pan="ABCDE1234F",
        txn_kwargs={"amount": Decimal("5000"), "units": Decimal("10"), "nav": Decimal("500")},
    )
    monkeypatch.setattr(casparser, "read_cas_pdf", lambda path, pw: data)
    data.folios[0].amc = "HDFC AMC Mutual Fund"
    lines = ["HDFC AMC Mutual Fund", "Folio No: 123 / 45 PAN: ABCDE1234F", "TEST INVESTOR"]
    monkeypatch.setattr(parser_mod, "read_pdf_lines", lambda path, pw: lines)
    result = parse_cas_pdf_bytes(b"%PDF", "pw")

    assert [p.key for p in result.people] == ["p1"]
    assert result.people[0].name == "TEST INVESTOR" and result.people[0].name_source == "holder_line"
    assert result.people[0].pan_masked == "AB******4F"
    assert result.unassigned_folio_keys == []
    assert result.schemes and all(s.person_key == "p1" for s in result.schemes)
    assert result.transactions and all(t.person_key == "p1" for t in result.transactions)
    assert "ABCDE1234F" not in result.raw_json


def test_normalize_without_lines_empty_pan_and_no_name_is_unassigned():
    data = _real_cas_data(pan="", txn_kwargs={"amount": Decimal("5"), "units": Decimal("1"), "nav": Decimal("5")})
    result = _normalize_cas_data(data)
    # no PAN and no readable name -> unassigned, schemes carry no person key
    assert result.people == [] and len(result.unassigned_folio_keys) == 1
    assert result.schemes[0].person_key is None


def test_normalize_same_folio_number_two_amcs_and_empty_pan():
    data = _real_cas_data(pan="ABCDE1234F", txn_kwargs={"amount": Decimal("5"), "units": Decimal("1"), "nav": Decimal("5")})
    other = data.model_copy(deep=True).folios[0]
    other.amc = "Axis Mutual Fund"
    other.PAN = ""  # casparser's "no PAN on header"
    data.folios[0].amc = "HDFC Mutual Fund"
    data.folios.append(other)
    lines = ["HDFC Mutual Fund", "Folio No: 123 / 45 PAN: ABCDE1234F", "ADITI SHARMA",
             "Axis Mutual Fund", "Folio No: 123 / 45", "MEERA SHARMA"]
    result = _normalize_cas_data(data, lines)
    by_amc = {s.amc: s.person_key for s in result.schemes}
    assert by_amc == {"HDFC Mutual Fund": "p1", "Axis Mutual Fund": "p2"}
    assert {t.amc: t.person_key for t in result.transactions} == by_amc
    assert [(p.key, p.pan) for p in result.people] == [("p1", "ABCDE1234F"), ("p2", None)]


# ------------------------------------------------ statement period (staging-QA fix 6)

from datetime import date as _date
from pathlib import Path

from app.services.import_.parser import parse_cas_pdf_bytes, parse_statement_date

import os

# Untracked synthetic CAS PDFs; UNIFOLIO_QA_FIXTURES points elsewhere.
_FIXTURES = Path(os.environ.get(
    "UNIFOLIO_QA_FIXTURES",
    Path(__file__).resolve().parents[4] / "Docs/orchestration/qa-fixtures/synthetic-cas",
))


def test_parse_statement_date_formats():
    assert parse_statement_date("01-Apr-2025") == _date(2025, 4, 1)
    assert parse_statement_date("2025-04-01") == _date(2025, 4, 1)
    assert parse_statement_date(_date(2025, 4, 1)) == _date(2025, 4, 1)


def test_unreadable_period_gives_none():
    for bad in (None, "", "April 2025", "31-Foo-2025", 12):
        assert parse_statement_date(bad) is None


@pytest.mark.skipif(not (_FIXTURES / "family_cas_1.pdf").exists(), reason="synthetic CAS fixtures not on disk")
def test_fixture_statement_period_is_parsed():
    result = parse_cas_pdf_bytes((_FIXTURES / "family_cas_1.pdf").read_bytes(), "MF@123")
    assert (result.statement_from, result.statement_to) == (_date(2025, 4, 1), _date(2025, 9, 30))


def test_parse_statement_date_accepts_an_iso_datetime():
    assert parse_statement_date("2025-04-01T00:00:00") == _date(2025, 4, 1)


import pypdfium2
from casparser.exceptions import CASParseError, IncorrectPasswordError

from app.services.import_.parser import classify_parse_error


def test_incorrect_password_maps_to_wrong_password():
    assert classify_parse_error(IncorrectPasswordError("bad")).code == "wrong_password"


def test_pdfium_error_maps_to_damaged_pdf():
    assert classify_parse_error(pypdfium2.PdfiumError("Data format error")).code == "damaged_pdf"


def test_unknown_issuer_with_text_maps_to_unknown_issuer():
    exc = CASParseError("Could not identify the CAS issuer. Supported issuers are CAMS, KFintech, NSDL, and CDSL.")
    assert classify_parse_error(exc, has_text=True).code == "unknown_issuer"


def test_unparseable_nsdl_statement_maps_to_demat_cas():
    # Phase 7 gate (errors/err_nsdl.pdf): casparser recognises an NSDL/CDSL
    # statement but can't read it; the user must get the demat message, not
    # casparser's internals.
    exc = CASParseError("Could not extract investor info from NSDL/CDSL CAS PDF. Expected a `CAS ID:` / `NSDL ID:` marker")
    err = classify_parse_error(exc, has_text=True)
    assert err.code == "demat_cas"
    assert "CAS ID" not in err.message


def test_scanned_pdf_maps_to_scanned_pdf():
    exc = CASParseError("Could not identify the CAS issuer. Supported issuers are CAMS, KFintech, NSDL, and CDSL.")
    err = classify_parse_error(exc, has_text=False)
    assert err.code == "scanned_pdf"
    assert "NSDL" not in err.message


def test_unrelated_text_error_is_not_scanned():
    # The old keyword rule mapped any message containing "text" to unreadable.
    assert classify_parse_error(ValueError("bad text encoding in row 3")).code == "parse_failed"


def _synthetic_pdf_dir():
    """Generated synthetic CAS PDFs live outside the repo (2026-10-07; see
    Docs/CAS Files/synthetic/pdf_dir.py). Override with UNIFOLIO_SYNTHETIC_CAS."""
    import os
    from pathlib import Path
    env = os.environ.get("UNIFOLIO_SYNTHETIC_CAS")
    if env:
        return Path(env)
    for candidate in ("/mnt/c/Users/Dell/Desktop/Unifolio/CAS Files/synthetic",
                      "C:/Users/Dell/Desktop/Unifolio/CAS Files/synthetic"):
        if Path(candidate).is_dir():
            return Path(candidate)
    return Path(candidate)


def test_parse_error_on_error_pdfs():
    from app.services.import_.parser import ParseError, parse_cas_pdf_bytes
    errors = _synthetic_pdf_dir() / "errors"
    if not errors.exists():
        pytest.skip("synthetic error PDFs not generated (Task 0)")
    expected = {"err_scanned.pdf": "scanned_pdf", "err_truncated.pdf": "damaged_pdf"}
    for name, code in expected.items():
        with pytest.raises(ParseError) as info:
            parse_cas_pdf_bytes((errors / name).read_bytes(), "MF@123")
        assert info.value.code == code, name


def test_skipped_stamp_duty_rows_do_not_warn():
    txn = MagicMock(date="2024-01-01", description="*** Stamp Duty ***", amount="0.25", units=None,
                    nav=None, type="STAMP_DUTY_TAX")
    scheme = MagicMock(scheme="X Fund - Direct Plan - Growth", isin="INF1", amfi="1", type="EQUITY",
                       advisor=None, transactions=[txn])
    folio = MagicMock(folio="1/1", amc="X", PAN="ABCDE1234F", schemes=[scheme])
    data = MagicMock(cas_type=CASFileType.DETAILED, file_type=FileType.CAMS,
                     investor_info=MagicMock(email="t@example.com"), folios=[folio], parse_warnings=[])
    data.model_dump_json.return_value = "{}"
    assert not any("Stamp" in w for w in _normalize_cas_data(data).parse_warnings)


@pytest.mark.parametrize("message,code", [("Data format error", "damaged_pdf"), ("Incorrect password", "wrong_password")])
def test_wrapped_pdfium_error_is_classified(message, code):
    try:
        raise CASParseError("opening failed") from pypdfium2.PdfiumError(message)
    except CASParseError as exc:
        assert classify_parse_error(exc).code == code


def test_bare_pdfium_cas_error_is_damaged_pdf():
    exc = CASParseError("Unhandled error while opening PDF: PDFium: Data format error")
    assert classify_parse_error(exc).code == "damaged_pdf"


def test_synthetic_parse_releases_temp_pdf():
    from app.services.import_.parser import parse_cas_pdf_bytes
    pdf = _synthetic_pdf_dir() / "p3_FY.pdf"
    if not pdf.exists():
        pytest.skip("synthetic CAS PDFs not on disk (UNIFOLIO_SYNTHETIC_CAS)")
    result = parse_cas_pdf_bytes(pdf.read_bytes(), "MF@123")
    assert result.schemes


def _scheme(name, isin, txns, open_="0", close="0", cost="0", nav="10", vdate="2026-10-05"):
    return MagicMock(scheme=name, isin=isin, amfi=None, type="DEBT", advisor=None, transactions=txns,
                     open=open_, close=close, valuation=MagicMock(cost=cost, nav=nav, date=vdate))


def _t(d, desc, amount, units, nav, type_, balance=None):
    return MagicMock(date=d, description=desc, amount=amount, units=units, nav=nav, type=type_, balance=balance)


def _data(*schemes, folio="9/9", amc="HDFC Mutual Fund"):
    f = MagicMock(folio=folio, amc=amc, PAN="ABCDE1234F", schemes=list(schemes))
    d = MagicMock(cas_type=CASFileType.DETAILED, file_type=FileType.CAMS,
                  investor_info=MagicMock(email="t@example.com"), folios=[f], parse_warnings=[])
    d.model_dump_json.return_value = "{}"
    return d


def test_same_name_two_isins_stay_separate():
    old = _scheme("HDFC Liquid Fund - Growth", "INF179KB1HK0", [_t("2010-01-04", "Purchase", "1000", "100", "10", "PURCHASE")], close="0")
    new = _scheme("HDFC Liquid Fund - Growth", "INF179KB1HP9", [], open_="5", close="5")
    result = _normalize_cas_data(_data(old, new))
    assert {s.isin for s in result.schemes} == {"INF179KB1HK0", "INF179KB1HP9"}


def test_scheme_keeps_open_close_and_valuation():
    s = _scheme("X Fund - Direct Plan - Growth", "INF1", [], open_="7251.691", close="7251.691", cost="512000", nav="128.30")
    [parsed] = _normalize_cas_data(_data(s)).schemes
    assert parsed.open_units == Decimal("7251.691")
    assert parsed.close_units == Decimal("7251.691")
    assert parsed.valuation_cost == Decimal("512000")
    assert parsed.valuation_nav == Decimal("128.30")


def test_empty_scheme_is_dropped():
    s = _scheme("Dead Fund - Growth", "INF0", [], open_="0", close="0")
    assert _normalize_cas_data(_data(s)).schemes == []


def test_face_value_conversion_moves_cost():
    old = _scheme("HDFC Liquid Fund - Growth", "INF_OLD", [
        _t("2010-01-04", "Purchase", "958000", "95800", "10", "PURCHASE"),
        _t("2012-03-12", "Face Value Change - Units Debited", None, "-95800", None, "MISC"),
    ], close="0")
    new = _scheme("HDFC Liquid Fund - Growth", "INF_NEW", [
        _t("2012-03-12", "Face Value Change - Units Credited", None, "829.43", None, "MISC"),
    ], close="829.43")
    result = _normalize_cas_data(_data(old, new))
    by_isin = {t.isin: t for t in result.transactions if t.txn_date.isoformat() == "2012-03-12"}
    assert by_isin["INF_OLD"].txn_type == TransactionType.SWITCH_OUT
    assert by_isin["INF_NEW"].txn_type == TransactionType.SWITCH_IN
    assert by_isin["INF_OLD"].amount == by_isin["INF_NEW"].amount == Decimal("958000.00")
    assert by_isin["INF_NEW"].units == Decimal("829.430")


def test_merger_without_amount_is_paired_across_folio_schemes():
    a = _scheme("Old Small Cap - Direct Plan - Growth", "INF_A", [
        _t("2015-01-01", "Purchase", "1000", "100", "10", "PURCHASE"),
        _t("2018-06-01", "Switch-Out - Merger", None, "-100", None, "SWITCH_OUT_MERGER"),
    ])
    b = _scheme("New Small Cap - Direct Plan - Growth", "INF_B", [
        _t("2018-06-01", "Switch-In - Merger", None, "80", None, "SWITCH_IN_MERGER"),
    ], close="80")
    tx = {t.isin: t for t in _normalize_cas_data(_data(a, b)).transactions if t.txn_date.isoformat() == "2018-06-01"}
    assert tx["INF_A"].amount == tx["INF_B"].amount == Decimal("1000.00")
    assert tx["INF_B"].nav == Decimal("12.5000")


def test_conversion_from_opening_lot_is_marked():
    old = _scheme("HDFC Liquid Fund - Growth", "INF_OLD", [
        _t("2016-03-12", "Face Value Change - Units Debited", None, "-95800", None, "MISC"),
    ], open_="95800", close="0")
    new = _scheme("HDFC Liquid Fund - Growth", "INF_NEW", [
        _t("2016-03-12", "Face Value Change - Units Credited", None, "829.43", None, "MISC"),
    ], close="829.43")
    tx = [t for t in _normalize_cas_data(_data(old, new)).transactions if t.txn_date.isoformat() == "2016-03-12"]
    assert len(tx) == 2
    assert all(t.conversion_from_opening for t in tx) and all(t.amount == 0 for t in tx)


def test_conversion_balance_is_quantized():
    old = _scheme("Old Fund - Growth", "INF_OLD", [
        _t("2015-01-01", "Purchase", "1000", "100", "10", "PURCHASE"),
        _t("2018-06-01", "Switch-Out - Merger", None, "-100", None, "SWITCH_OUT_MERGER", "0.0004"),
    ])
    new = _scheme("New Fund - Growth", "INF_NEW", [
        _t("2018-06-01", "Switch-In - Merger", None, "80", None, "SWITCH_IN_MERGER", "80.1234"),
    ], close="80")
    rows = [t for t in _normalize_cas_data(_data(old, new)).transactions if t.txn_date.isoformat() == "2018-06-01"]
    assert len(rows) == 2
    assert {t.isin: t.balance for t in rows} == {"INF_OLD": Decimal("0.000"), "INF_NEW": Decimal("80.123")}


@pytest.mark.parametrize("label", ["Face Value Change", "Merger"])
def test_conversion_description_pairs_redemption_and_purchase(label):
    old = _scheme("Old Fund - Growth", "INF_OLD", [
        _t("2015-01-01", "Purchase", "1000", "100", "10", "PURCHASE"),
        _t("2018-06-01", f"{label} - Units Debited", None, "-100", None, "REDEMPTION"),
    ])
    new = _scheme("New Fund - Growth", "INF_NEW", [
        _t("2018-06-01", f"{label} - Units Credited", None, "80", None, "PURCHASE"),
    ], close="80")
    result = _normalize_cas_data(_data(old, new))
    paired = {t.isin: t for t in result.transactions if t.txn_date.isoformat() == "2018-06-01"}
    assert set(paired) == {"INF_OLD", "INF_NEW"}
    assert paired["INF_OLD"].txn_type == TransactionType.SWITCH_OUT
    assert paired["INF_NEW"].txn_type == TransactionType.SWITCH_IN
    assert paired["INF_OLD"].amount == paired["INF_NEW"].amount == Decimal("1000.00")


def test_face_value_redemption_with_amount_stays_redemption():
    s = _scheme("Fund - Growth", "INF1", [
        _t("2018-06-01", "face value redemption", "1000", "-100", "10", "REDEMPTION"),
    ])
    [row] = _normalize_cas_data(_data(s)).transactions
    assert row.txn_type == TransactionType.REDEMPTION
    assert row.amount == Decimal("1000.00") and not row.conversion_from_opening


def test_two_face_value_out_legs_are_skipped_with_warning():
    old = _scheme("Old Fund - Growth", "INF_OLD", [
        _t("2018-06-01", "Face Value Change - Units Debited", None, "-100", None, "REDEMPTION"),
        _t("2018-06-01", "Face Value Change - Units Debited", None, "-50", None, "REDEMPTION"),
    ])
    new = _scheme("New Fund - Growth", "INF_NEW", [
        _t("2018-06-01", "Face Value Change - Units Credited", None, "80", None, "PURCHASE"),
    ], close="80")
    result = _normalize_cas_data(_data(old, new))
    assert result.transactions == []
    warnings = [w for w in result.parse_warnings if "Skipped transaction" in w]
    assert len(warnings) == 3
    assert all("missing amount, units, or NAV" in warning for warning in warnings)


def test_conversion_with_amount_but_missing_nav_is_skipped():
    old = _scheme("Old Fund - Growth", "INF_OLD", [
        _t("2018-06-01", "face value", "1000", "-100", None, "SWITCH_OUT"),
    ])
    new = _scheme("New Fund - Growth", "INF_NEW", [
        _t("2018-06-01", "face value", None, "80", None, "SWITCH_IN"),
    ], close="80")
    result = _normalize_cas_data(_data(old, new))
    assert result.transactions == []
    assert len([w for w in result.parse_warnings if "Skipped transaction" in w]) == 2


# ---- Phase 3 (#3): every row type, direction kept ----


def _one(t):
    return _normalize_cas_data(_data(_scheme("X Fund - Direct Plan - Growth", "INF1", [t], close="1"))).transactions


def test_payout_row_kept_with_zero_units():
    [row] = _one(_t("2022-03-01", "IDCW Paid", "2500", None, None, "DIVIDEND_PAYOUT"))
    assert row.txn_type == TransactionType.DIVIDEND_PAYOUT
    assert row.units == 0 and row.nav == 0 and row.amount == Decimal("2500.00")


def test_bonus_row_kept_at_zero_cost():
    [row] = _one(_t("2018-06-01", "Bonus Units Allotted", None, "444.000", None, "PURCHASE"))
    assert row.txn_type == TransactionType.BONUS and row.amount == 0 and row.nav == 0
    assert row.units == Decimal("444.000")


def test_bonus_row_with_zero_amount_and_price_is_bonus():
    [row] = _one(_t("2018-06-01", "BONUS", "0", "10.000", "0", "PURCHASE"))
    assert row.txn_type == TransactionType.BONUS


def test_reversal_maps_to_reversal():
    [row] = _one(_t("2020-02-07", "SIP Purchase - Reversal", "-5000", "-43.21", "115.71", "REVERSAL"))
    assert row.txn_type == TransactionType.REVERSAL and row.units == Decimal("43.210")
    assert row.amount == Decimal("5000.00")


def test_only_a_nav_the_cas_printed_is_marked_printed():
    # 6 Oct re-review: a reversal's NAV derived as amount/units is not a price
    # the statement printed, so it must not become a CAS-only fund's price.
    [printed] = _one(_t("2020-02-07", "SIP Purchase - Reversal", "-5000", "-43.21", "115.71", "REVERSAL"))
    [derived] = _one(_t("2020-02-07", "SIP Purchase - Reversal", "-5000", "-43.21", None, "REVERSAL"))
    assert printed.nav_printed is True and derived.nav_printed is False


def test_reversal_without_nav_derives_it():
    [row] = _one(_t("2020-02-07", "Reversal", "-5000", "-50.000", None, "REVERSAL"))
    assert row.txn_type == TransactionType.REVERSAL and row.nav == Decimal("100.0000")


def test_gift_without_nav_needs_price():
    [row] = _one(_t("2021-04-01", "Gift - Units Credited", None, "1500.000", None, "GIFT_IN"))
    assert row.txn_type == TransactionType.GIFT_IN and row.needs_price
    assert row.amount == 0 and row.nav == 0


def test_gift_with_nav_is_priced_from_cas():
    [row] = _one(_t("2021-04-01", "Gift - Units Debited", None, "-10.000", "20.5", "GIFT_OUT"))
    assert row.txn_type == TransactionType.GIFT_OUT and not row.needs_price
    assert row.amount == Decimal("205.00") and row.units == Decimal("10.000")


def test_segregation_kept():
    [row] = _one(_t("2020-01-24", "Segregated Portfolio Allotment", None, "1200.000", None, "SEGREGATION"))
    assert row.txn_type == TransactionType.SEGREGATION and row.units == Decimal("1200.000")
    assert row.amount == 0 and row.nav == 0


def test_tds_without_units_is_silent():
    result = _normalize_cas_data(_data(_scheme("X Fund", "INF1", [_t("2022-03-01", "TDS", "12", None, None, "TDS_TAX")], close="1")))
    assert result.transactions == []
    assert not any("TDS" in w for w in result.parse_warnings)


def test_unknown_amountless_row_still_warns():
    result = _normalize_cas_data(_data(_scheme("X Fund", "INF1", [_t("2022-03-01", "Odd row", None, "5", None, "MISC")], close="1")))
    assert result.transactions == []
    assert any("Odd row" in w for w in result.parse_warnings)


def test_conversion_cost_skips_a_bounced_sip_lot():
    # review finding 2: buy 40 @125 (bounced), buy 10 @100, then convert 10 units → cost 1,000, not 1,250
    old = _scheme("Old Fund - Direct Plan - Growth", "INF_A", [
        _t("2015-01-01", "SIP Purchase", "5000", "40", "125", "PURCHASE_SIP"),
        _t("2015-01-05", "SIP Purchase - Reversal", "-5000", "-40", "125", "REVERSAL"),
        _t("2015-02-01", "Purchase", "1000", "10", "100", "PURCHASE"),
        _t("2018-06-01", "Switch-Out - Merger", None, "-10", None, "SWITCH_OUT_MERGER"),
    ])
    new = _scheme("New Fund - Direct Plan - Growth", "INF_B", [
        _t("2018-06-01", "Switch-In - Merger", None, "8", None, "SWITCH_IN_MERGER"),
    ], close="8")
    tx = {t.isin: t for t in _normalize_cas_data(_data(old, new)).transactions if t.txn_date.isoformat() == "2018-06-01"}
    assert tx["INF_A"].amount == tx["INF_B"].amount == Decimal("1000.00")


def test_bonus_description_on_a_reversal_is_not_bonus():
    # review finding 4: the bonus rule applies to unit-adding rows only
    [row] = _one(_t("2019-01-01", "Bonus units gifted", None, "-5.000", None, "GIFT_OUT"))
    assert row.txn_type == TransactionType.GIFT_OUT and row.needs_price

