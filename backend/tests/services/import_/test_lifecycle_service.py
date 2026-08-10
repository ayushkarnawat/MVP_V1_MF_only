from datetime import date, datetime, timezone
from decimal import Decimal
import uuid
import pytest

from app.models.enums import ImportStatus, PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.import_.buffer_cache import get_pdf_buffer, store_pdf_buffer
from app.services.import_.lifecycle_service import (
    FileTooLargeError,
    InvalidFileFormatError,
    SessionExpiredError,
    create_cas_import,
    retry_cas_import_password,
)
from app.services.import_.parser import (
    NormalizedTransaction,
    ParsedInvestor,
    ParsedScheme,
    ParseResult,
)


@pytest.fixture
def sample_user_and_member(db_session):
    now = datetime.now(timezone.utc)
    user = User(
        id=uuid.uuid4(),
        phone_number="+919988776655",
        email="investor@example.com",
        created_at=now,
    )
    db_session.add(user)
    db_session.flush()

    member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Test Investor",
        relationship=Relationship.SELF,
        created_at=now,
    )
    db_session.add(member)
    db_session.commit()
    return user, member


def test_magic_byte_validation_rejects_non_pdf(db_session, sample_user_and_member):
    user, member = sample_user_and_member
    non_pdf_bytes = b"Hello, this is a plain text file, not a PDF."

    with pytest.raises(InvalidFileFormatError):
        create_cas_import(
            db=db_session,
            user_id=user.id,
            household_member_id=member.id,
            file_bytes=non_pdf_bytes,
            filename="statement.txt",
            password="PASSWORD",
        )


def test_file_size_cap_rejects_oversized_files(db_session, sample_user_and_member):
    user, member = sample_user_and_member
    oversized_bytes = b"%PDF-" + b"0" * (26 * 1024 * 1024)

    with pytest.raises(FileTooLargeError):
        create_cas_import(
            db=db_session,
            user_id=user.id,
            household_member_id=member.id,
            file_bytes=oversized_bytes,
            filename="huge_statement.pdf",
            password="PASSWORD",
        )


def test_wrong_password_caches_buffer_and_sets_password_required(db_session, sample_user_and_member, monkeypatch):
    user, member = sample_user_and_member
    fake_pdf = b"%PDF-1.4 sample encrypted pdf bytes"

    from app.services.import_.parser import ParseError

    def mock_parse(pdf_bytes, password):
        if password != "CORRECT_PASS":
            raise ParseError("wrong_password", "Incorrect PDF password.")
        return ParseResult(
            investor=ParsedInvestor(name="Test Investor", email="investor@example.com", pan_masked="A*****1"),
            schemes=[],
            transactions=[],
            raw_json="{}",
        )

    monkeypatch.setattr("app.services.import_.lifecycle_service.parse_cas_pdf_bytes", mock_parse)

    import_rec = create_cas_import(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
        file_bytes=fake_pdf,
        filename="statement.pdf",
        password="WRONG_PASS",
    )

    assert import_rec.status == ImportStatus.PASSWORD_REQUIRED
    assert import_rec.error_code == "wrong_password"
    # Check buffer was cached for in-place retry
    assert get_pdf_buffer(str(import_rec.id)) == fake_pdf


def test_retry_password_unlocks_and_completes_import(db_session, sample_user_and_member, monkeypatch):
    user, member = sample_user_and_member
    fake_pdf = b"%PDF-1.4 sample encrypted pdf bytes"

    from app.services.import_.parser import ParseError

    def mock_parse(pdf_bytes, password):
        if password != "CORRECT_PASS":
            raise ParseError("wrong_password", "Incorrect PDF password.")
        return ParseResult(
            investor=ParsedInvestor(name="Test Investor", email="investor@example.com", pan_masked="A*****1"),
            schemes=[
                ParsedScheme(
                    name="HDFC Top 100 Fund - Growth",
                    isin="INF179K01BE2",
                    amfi="100033",
                    scheme_type="Equity",
                    folio="12345/67",
                    amc="HDFC Mutual Fund",
                    transaction_count=1,
                    plan_type="direct",
                )
            ],
            transactions=[
                NormalizedTransaction(
                    folio="12345/67",
                    amc="HDFC Mutual Fund",
                    scheme_name="HDFC Top 100 Fund - Growth",
                    isin="INF179K01BE2",
                    amfi="100033",
                    scheme_type="Equity",
                    txn_date=date(2024, 1, 15),
                    txn_type=TransactionType.PURCHASE,
                    description="Purchase",
                    amount=Decimal("10000.00"),
                    units=Decimal("100.000"),
                    nav=Decimal("100.0000"),
                )
            ],
            raw_json='{"folios": []}',
        )

    monkeypatch.setattr("app.services.import_.lifecycle_service.parse_cas_pdf_bytes", mock_parse)

    # Initial submission with wrong password
    import_rec = create_cas_import(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
        file_bytes=fake_pdf,
        filename="statement.pdf",
        password="WRONG_PASS",
    )
    assert import_rec.status == ImportStatus.PASSWORD_REQUIRED

    # In-place password retry without re-uploading file
    updated_rec = retry_cas_import_password(
        db=db_session,
        import_id=import_rec.id,
        user_id=user.id,
        new_password="CORRECT_PASS",
    )

    assert updated_rec.status == ImportStatus.IMPORT_SUCCESSFUL
    assert updated_rec.new_transactions_count == 1
    assert updated_rec.duplicate_transactions_count == 0
    # Buffer cache should be wiped on success
    assert get_pdf_buffer(str(import_rec.id)) is None


def test_deduplication_fingerprint_skips_duplicates(db_session, sample_user_and_member, monkeypatch):
    user, member = sample_user_and_member
    fake_pdf = b"%PDF-1.4 statement"

    txn1 = NormalizedTransaction(
        folio="12345/67",
        amc="HDFC Mutual Fund",
        scheme_name="HDFC Top 100 Fund - Growth",
        isin="INF179K01BE2",
        amfi="100033",
        scheme_type="Equity",
        txn_date=date(2024, 1, 15),
        txn_type=TransactionType.PURCHASE,
        description="Purchase 1",
        amount=Decimal("10000.00"),
        units=Decimal("100.000"),
        nav=Decimal("100.0000"),
    )
    txn2 = NormalizedTransaction(
        folio="12345/67",
        amc="HDFC Mutual Fund",
        scheme_name="HDFC Top 100 Fund - Growth",
        isin="INF179K01BE2",
        amfi="100033",
        scheme_type="Equity",
        txn_date=date(2024, 2, 15),
        txn_type=TransactionType.PURCHASE_SIP,
        description="SIP 2",
        amount=Decimal("5000.00"),
        units=Decimal("50.000"),
        nav=Decimal("100.0000"),
    )

    parse_res_1 = ParseResult(
        investor=ParsedInvestor(name="Test Investor", email="investor@example.com", pan_masked="A*****1"),
        schemes=[
            ParsedScheme(
                name="HDFC Top 100 Fund - Growth",
                isin="INF179K01BE2",
                amfi="100033",
                scheme_type="Equity",
                folio="12345/67",
                amc="HDFC Mutual Fund",
                transaction_count=1,
                plan_type="direct",
            )
        ],
        transactions=[txn1],
        raw_json='{"folios": []}',
    )

    monkeypatch.setattr("app.services.import_.lifecycle_service.parse_cas_pdf_bytes", lambda b, p: parse_res_1)

    # First import
    rec1 = create_cas_import(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
        file_bytes=fake_pdf,
        filename="statement1.pdf",
        password="PASS",
    )
    assert rec1.status == ImportStatus.IMPORT_SUCCESSFUL
    assert rec1.new_transactions_count == 1
    assert rec1.duplicate_transactions_count == 0

    # Second import containing txn1 (duplicate) + txn2 (new)
    parse_res_2 = ParseResult(
        investor=ParsedInvestor(name="Test Investor", email="investor@example.com", pan_masked="A*****1"),
        schemes=[
            ParsedScheme(
                name="HDFC Top 100 Fund - Growth",
                isin="INF179K01BE2",
                amfi="100033",
                scheme_type="Equity",
                folio="12345/67",
                amc="HDFC Mutual Fund",
                transaction_count=2,
                plan_type="direct",
            )
        ],
        transactions=[txn1, txn2],
        raw_json='{"folios": []}',
    )
    monkeypatch.setattr("app.services.import_.lifecycle_service.parse_cas_pdf_bytes", lambda b, p: parse_res_2)

    rec2 = create_cas_import(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
        file_bytes=fake_pdf,
        filename="statement2.pdf",
        password="PASS",
    )
    assert rec2.status == ImportStatus.IMPORT_SUCCESSFUL
    assert rec2.new_transactions_count == 1  # only txn2 added
    assert rec2.duplicate_transactions_count == 1  # txn1 skipped as duplicate
