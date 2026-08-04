import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.user import HouseholdMember, User
from app.models.enums import Relationship
from app.models.reference import Scheme
from app.models.folio import Folio
from app.models.transaction import Transaction
from app.models.imports import Import
from app.services.import_.parser import NormalizedTransaction, ParsedInvestor, ParsedScheme, ParseResult
from app.services.import_.service import build_import_preview, confirm_import
from app.models.enums import TransactionType
from decimal import Decimal
from datetime import date


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _household_member(db):
    user = User(id=uuid.uuid4(), phone_number="+919999999999", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Self",
        relationship=Relationship.SELF, created_at=datetime.now(timezone.utc),
    )
    db.add(member)
    db.commit()
    return member


def _mocked_client(category: str | None = "Equity Scheme - Flexi Cap Fund"):
    """AsyncMock's child attributes are themselves unconfigured AsyncMocks —
    resolve_scheme must be explicitly configured or `await client.resolve_scheme(...)`
    returns a bare mock instead of the (match, status) tuple callers expect."""
    from app.services.import_.enrich import SchemeMatch

    client = AsyncMock()
    client.resolve_scheme.return_value = (
        SchemeMatch(amfi_code="125497", scheme_name="HDFC Flexi Cap Fund - Direct Plan - Growth", confidence=1.0),
        "confirmed",
    )
    client.get_scheme_category.return_value = category
    return client


def _sample_parse_result():
    txn = NormalizedTransaction(
        folio="123/45", amc="HDFC AMC", scheme_name="HDFC Flexi Cap Fund - Direct Plan - Growth",
        isin="INF123", amfi="125497", scheme_type="EQUITY", txn_date=date(2024, 1, 1),
        txn_type=TransactionType.PURCHASE, description="Purchase",
        amount=Decimal("5000.00"), units=Decimal("10.000"), nav=Decimal("500.0000"),
    )
    scheme = ParsedScheme(
        name="HDFC Flexi Cap Fund - Direct Plan - Growth", isin="INF123", amfi="125497",
        scheme_type="EQUITY", folio="123/45", amc="HDFC AMC", transaction_count=1,
        arn_code=None, plan_name_variant="direct", plan_type="direct",
    )
    return ParseResult(
        investor=ParsedInvestor(name="Test Investor", email="t@example.com", pan_masked="ABCDE****F"),
        schemes=[scheme], transactions=[txn], raw_json="{}",
        parse_warnings=[], cas_type="DETAILED", file_type="FileType.CAMS",
    )


def test_build_import_preview_confident_amfi_match_needs_no_override():
    client = _mocked_client()
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=client))

    assert preview.investor_name == "Test Investor"
    assert preview.pan_masked == "ABCDE****F"
    assert len(preview.schemes) == 1
    assert preview.schemes[0].suggested_amfi_code == "125497"
    assert preview.schemes[0].match_confidence == 1.0
    assert preview.schemes[0].plan_type == "direct"
    assert preview.transaction_count == 1


def test_confirm_import_creates_scheme_folio_and_transaction():
    db = _session()
    member = _household_member(db)
    client = _mocked_client()
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=client))

    result = confirm_import(db, preview.session_id, member.id, scheme_confirmations=[])

    assert result.added == 1
    assert result.skipped == 0
    scheme = db.query(Scheme).filter_by(amfi_code="125497").one()
    assert scheme.sebi_category == "Equity Scheme - Flexi Cap Fund"
    assert scheme.plan_name_variant.value == "direct"
    folio = db.query(Folio).filter_by(folio_number="123/45").one()
    assert folio.plan_type.value == "direct"
    assert folio.household_member_id == member.id
    txn = db.query(Transaction).one()
    assert txn.amount == Decimal("5000.00")
    imp = db.query(Import).one()
    assert imp.new_transactions_count == 1
    assert imp.source_cas_type.value == "cams"


def test_confirm_import_deduped_on_reupload():
    db = _session()
    member = _household_member(db)
    client = _mocked_client()

    preview1 = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=client))
    confirm_import(db, preview1.session_id, member.id, scheme_confirmations=[])

    preview2 = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=client))
    result2 = confirm_import(db, preview2.session_id, member.id, scheme_confirmations=[])

    assert result2.added == 0
    assert result2.skipped == 1
    assert db.query(Transaction).count() == 1


def test_confirm_import_rejects_low_confidence_scheme_without_override():
    from app.services.import_.parser import NormalizedTransaction, ParsedScheme

    db = _session()
    member = _household_member(db)
    txn = NormalizedTransaction(
        folio="1", amc="X AMC", scheme_name="Ambiguous Fund", isin=None, amfi=None,
        scheme_type="EQUITY", txn_date=date(2024, 1, 1), txn_type=TransactionType.PURCHASE,
        description="Purchase", amount=Decimal("1000.00"), units=Decimal("5.000"), nav=Decimal("200.0000"),
    )
    scheme = ParsedScheme(
        name="Ambiguous Fund", isin=None, amfi=None, scheme_type="EQUITY", folio="1", amc="X AMC",
        transaction_count=1, arn_code=None, plan_name_variant="unresolved", plan_type="unclassified",
    )
    parse_result = ParseResult(
        investor=ParsedInvestor(name=None, email=None, pan_masked=None), schemes=[scheme],
        transactions=[txn], raw_json="{}", parse_warnings=[], cas_type="DETAILED", file_type="FileType.CAMS",
    )
    client = AsyncMock()
    client.get_scheme_list = AsyncMock(return_value=[])
    client.resolve_scheme = AsyncMock(return_value=(None, "pending"))
    client.get_scheme_category.return_value = None

    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", client=client))
    assert preview.schemes[0].match_status == "pending"

    import pytest
    with pytest.raises(ValueError, match="requires an explicit AMFI code"):
        confirm_import(db, preview.session_id, member.id, scheme_confirmations=[])
