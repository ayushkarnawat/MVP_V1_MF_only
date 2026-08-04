from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock

from app.models.enums import TransactionType
from app.services.import_.parser import (
    NormalizedTransaction,
    classify_folio_plan_type,
    classify_plan_from_name,
    mask_pan,
    normalize_txn_type,
)


def test_mask_pan():
    assert mask_pan("ABCDE1234F") == "ABCDE****F"
    assert mask_pan(None) is None


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
