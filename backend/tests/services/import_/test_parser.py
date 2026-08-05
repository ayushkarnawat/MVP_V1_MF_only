from decimal import Decimal
from unittest.mock import MagicMock

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


def test_mask_pan():
    assert mask_pan("ABCDE1234F") == "A********F"
    assert mask_pan(None) is None
    assert mask_pan("") == ""
    assert mask_pan("A") == "*"
    assert mask_pan("AB") == "**"


def test_normalize_txn_type_maps_to_monolith_enum():
    assert normalize_txn_type("PURCHASE") == TransactionType.PURCHASE
    assert normalize_txn_type("PURCHASE_SIP") == TransactionType.PURCHASE_SIP
    assert normalize_txn_type("STT_TAX") == TransactionType.STT
    assert normalize_txn_type("STAMP_DUTY_TAX") == TransactionType.STAMP_DUTY
    assert normalize_txn_type("UNKNOWN_TYPE") == TransactionType.MISC


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
    assert result.investor.pan_masked == "A********F"


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
