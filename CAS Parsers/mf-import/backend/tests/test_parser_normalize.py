from datetime import date
from decimal import Decimal

from app.parser import normalize_txn_type
from app.models import TxnType


def test_normalize_txn_type_mapping():
    assert normalize_txn_type("PURCHASE") == TxnType.PURCHASE
    assert normalize_txn_type("PURCHASE_SIP") == TxnType.PURCHASE_SIP
    assert normalize_txn_type("STT_TAX") == TxnType.STT
    assert normalize_txn_type("STAMP_DUTY_TAX") == TxnType.STAMP_DUTY
    assert normalize_txn_type("TDS_TAX") == TxnType.MISC
    assert normalize_txn_type("UNKNOWN") == TxnType.MISC


def test_mask_pan():
    from app.parser import mask_pan

    assert mask_pan("ABCDE1234F") == "ABCDE****F"
    assert mask_pan(None) is None


def test_dedupe_hash_stable():
    from app.parser import NormalizedTransaction

    txn = NormalizedTransaction(
        folio="123/45",
        amc="HDFC AMC",
        scheme_name="HDFC Flexi Cap",
        isin="INF123",
        amfi="125497",
        scheme_type="EQUITY",
        txn_date=date(2024, 1, 1),
        txn_type=TxnType.PURCHASE,
        description="Purchase",
        amount=Decimal("5000.00"),
        units=Decimal("10.000"),
        nav=Decimal("500.0000"),
    )
    h1 = txn.dedupe_hash()
    h2 = txn.dedupe_hash()
    assert h1 == h2
    assert len(h1) == 64
