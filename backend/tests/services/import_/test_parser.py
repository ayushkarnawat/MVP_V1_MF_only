from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock

from casparser.enums import CASFileType, FileType

from app.models.enums import TransactionType
from app.services.import_.parser import (
    NormalizedTransaction,
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
    assert mask_pan("A") is None


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


def test_dedupe_hash_stable():
    txn = NormalizedTransaction(
        folio="123/45", amc="HDFC AMC", scheme_name="HDFC Flexi Cap",
        isin="INF123", amfi="125497", scheme_type="EQUITY",
        txn_date=date(2024, 1, 1), txn_type=TransactionType.PURCHASE,
        description="Purchase", amount=Decimal("5000.00"),
        units=Decimal("10.000"), nav=Decimal("500.0000"),
    )
    assert txn.dedupe_hash() == txn.dedupe_hash()


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
