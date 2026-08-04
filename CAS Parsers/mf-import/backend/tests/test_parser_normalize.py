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


def test_classify_plan_from_name_direct():
    from app.parser import classify_plan_from_name

    assert classify_plan_from_name("HDFC Flexi Cap Fund - Direct Plan - Growth") == "direct"
    assert classify_plan_from_name("ICICI Prudential Bluechip Fund-Direct-Growth") == "direct"


def test_classify_plan_from_name_regular():
    from app.parser import classify_plan_from_name

    assert classify_plan_from_name("Axis Bluechip Fund - Regular Plan - Growth") == "regular"


def test_classify_plan_from_name_unresolved_when_no_signal():
    from app.parser import classify_plan_from_name

    assert classify_plan_from_name("SBI Small Cap Fund - Growth") == "unresolved"


def test_classify_plan_from_name_unresolved_when_both_present():
    """Malformed/ambiguous name mentioning both — never silently guess."""
    from app.parser import classify_plan_from_name

    assert classify_plan_from_name("Fund Direct to Regular Conversion") == "unresolved"


def test_classify_folio_plan_type_direct_confirmed_no_arn():
    from app.parser import classify_folio_plan_type

    assert classify_folio_plan_type("direct", None) == "direct"
    assert classify_folio_plan_type("direct", "") == "direct"


def test_classify_folio_plan_type_direct_contradicted_by_arn():
    """FR-5: signals disagree (direct-named scheme but has a distributor ARN) -> unclassified."""
    from app.parser import classify_folio_plan_type

    assert classify_folio_plan_type("direct", "ARN-12345") == "unclassified"


def test_classify_folio_plan_type_regular_confirmed_regardless_of_arn():
    from app.parser import classify_folio_plan_type

    assert classify_folio_plan_type("regular", "ARN-12345") == "regular"
    assert classify_folio_plan_type("regular", None) == "regular"


def test_classify_folio_plan_type_unresolved_name_always_unclassified():
    from app.parser import classify_folio_plan_type

    assert classify_folio_plan_type("unresolved", "ARN-12345") == "unclassified"
    assert classify_folio_plan_type("unresolved", None) == "unclassified"
