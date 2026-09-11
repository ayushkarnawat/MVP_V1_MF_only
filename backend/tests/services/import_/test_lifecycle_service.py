import asyncio
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
from app.services.import_.attribution import (
    AttributionConfirmationRequiredError,
    AttributionDecision,
    AttributionStatus,
    CrossAccountDuplicateWarning,
)
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
        asyncio.run(create_cas_import(
            db=db_session,
            user_id=user.id,
            household_member_id=member.id,
            file_bytes=non_pdf_bytes,
            filename="statement.txt",
            password="PASSWORD",
        ))


def test_file_size_cap_rejects_oversized_files(db_session, sample_user_and_member):
    user, member = sample_user_and_member
    oversized_bytes = b"%PDF-" + b"0" * (26 * 1024 * 1024)

    with pytest.raises(FileTooLargeError):
        asyncio.run(create_cas_import(
            db=db_session,
            user_id=user.id,
            household_member_id=member.id,
            file_bytes=oversized_bytes,
            filename="huge_statement.pdf",
            password="PASSWORD",
        ))


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

    import_rec = asyncio.run(create_cas_import(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
        file_bytes=fake_pdf,
        filename="statement.pdf",
        password="WRONG_PASS",
    ))

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
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.detect_cross_account_duplicate",
        lambda *args, **kwargs: CrossAccountDuplicateWarning(detected=True, reason="folio_match"),
    )

    # Initial submission with wrong password
    import_rec = asyncio.run(create_cas_import(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
        file_bytes=fake_pdf,
        filename="statement.pdf",
        password="WRONG_PASS",
    ))
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
    assert updated_rec.household_member_id == member.id
    assert updated_rec.parse_warnings == [
        "This investment may already be tracked under a different Unifolio account. "
        "If that's you, consider using that account instead."
    ]
    # Buffer cache should be wiped on success
    assert get_pdf_buffer(str(import_rec.id)) is None


def test_cross_account_warning_does_not_block_new_import(
    db_session, sample_user_and_member, monkeypatch
):
    user, member = sample_user_and_member
    now = datetime.now(timezone.utc)
    other_user = User(
        id=uuid.uuid4(),
        phone_number="+919900000001",
        created_at=now,
    )
    other_member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=other_user.id,
        name="Private Other Account",
        relationship=Relationship.SELF,
        created_at=now,
    )
    existing_scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code="cross-account-existing",
        name="Existing Fund",
        amc_name="SBI Mutual Fund",
        sebi_category="Equity",
    )
    # Flush the user before adding the member: without an ORM relationship()
    # between User and HouseholdMember, the unit-of-work's insert ordering
    # doesn't follow add_all()'s list order, so a single flush can attempt
    # the FK-dependent insert first.
    db_session.add(other_user)
    db_session.flush()
    db_session.add_all([other_member, existing_scheme])
    db_session.flush()
    db_session.add(
        Folio(
            id=uuid.uuid4(),
            household_member_id=other_member.id,
            scheme_id=existing_scheme.id,
            folio_number="CROSS-ACCOUNT-123",
            plan_type=PlanType.DIRECT,
        )
    )
    db_session.commit()

    parse_result = ParseResult(
        investor=ParsedInvestor(
            name="Different Investor Name",
            email="investor@example.com",
            pan_masked="A*****1",
        ),
        schemes=[
            ParsedScheme(
                name="Freshly Parsed Fund",
                isin=None,
                amfi="cross-account-parsed",
                scheme_type="Equity",
                folio="CROSS-ACCOUNT-123",
                amc="SBI Mutual Fund",
                transaction_count=0,
            )
        ],
        transactions=[],
        raw_json="{}",
    )
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.parse_cas_pdf_bytes",
        lambda _bytes, _password: parse_result,
    )
    import_rec = asyncio.run(
        create_cas_import(
            db=db_session,
            user_id=user.id,
            household_member_id=member.id,
            file_bytes=b"%PDF-1.4 statement",
            filename="statement.pdf",
            password="PASS",
        )
    )

    assert import_rec.status == ImportStatus.IMPORT_SUCCESSFUL
    assert import_rec.household_member_id == member.id
    assert import_rec.parse_warnings == [
        "This investment may already be tracked under a different Unifolio account. "
        "If that's you, consider using that account instead."
    ]
    assert "Private Other Account" not in " ".join(import_rec.parse_warnings)


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
    rec1 = asyncio.run(create_cas_import(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
        file_bytes=fake_pdf,
        filename="statement1.pdf",
        password="PASS",
    ))
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

    rec2 = asyncio.run(create_cas_import(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
        file_bytes=fake_pdf,
        filename="statement2.pdf",
        password="PASS",
    ))
    assert rec2.status == ImportStatus.IMPORT_SUCCESSFUL
    assert rec2.new_transactions_count == 1  # only txn2 added
    assert rec2.duplicate_transactions_count == 1  # txn1 skipped as duplicate


def _confirmation_required_decision(member: HouseholdMember) -> AttributionDecision:
    return AttributionDecision(
        status=AttributionStatus.MISMATCH_CONFIRMATION_REQUIRED,
        resolved_member_id=member.id,
        matched_member_name=member.name,
        requires_confirmation=True,
        prompt_message="Confirm the matched family member.",
    )


def _empty_parse_result() -> ParseResult:
    return ParseResult(
        investor=ParsedInvestor(name="Parsed Investor", email=None, pan_masked=None),
        schemes=[],
        transactions=[],
        raw_json="{}",
    )


def test_create_cas_import_requires_attribution_confirmation(
    db_session, sample_user_and_member, monkeypatch
):
    user, member = sample_user_and_member
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.parse_cas_pdf_bytes",
        lambda _bytes, _password: _empty_parse_result(),
    )
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.resolve_attribution",
        lambda *_args, **_kwargs: _confirmation_required_decision(member),
    )

    with pytest.raises(AttributionConfirmationRequiredError):
        asyncio.run(
            create_cas_import(
                db=db_session,
                user_id=user.id,
                household_member_id=member.id,
                file_bytes=b"%PDF-1.4 statement",
                filename="statement.pdf",
                password="PASS",
            )
        )


def test_create_cas_import_accepts_attribution_confirmation_override(
    db_session, sample_user_and_member, monkeypatch
):
    user, member = sample_user_and_member
    matched_member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Matched Family Member",
        relationship=Relationship.SPOUSE,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(matched_member)
    db_session.commit()
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.parse_cas_pdf_bytes",
        lambda _bytes, _password: _empty_parse_result(),
    )
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.resolve_attribution",
        lambda *_args, **_kwargs: _confirmation_required_decision(matched_member),
    )

    import_rec = asyncio.run(
        create_cas_import(
            db=db_session,
            user_id=user.id,
            household_member_id=member.id,
            file_bytes=b"%PDF-1.4 statement",
            filename="statement.pdf",
            password="PASS",
            confirmed_member_override=True,
        )
    )

    assert import_rec.status == ImportStatus.IMPORT_SUCCESSFUL
    assert import_rec.household_member_id == member.id


def test_retry_cas_import_password_requires_attribution_confirmation(
    db_session, sample_user_and_member, monkeypatch
):
    user, member = sample_user_and_member
    import_rec = Import(
        id=uuid.uuid4(),
        household_member_id=member.id,
        status=ImportStatus.PASSWORD_REQUIRED,
        uploaded_at=datetime.now(timezone.utc),
    )
    db_session.add(import_rec)
    db_session.commit()
    store_pdf_buffer(str(import_rec.id), b"%PDF-1.4 cached")
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.parse_cas_pdf_bytes",
        lambda _bytes, _password: _empty_parse_result(),
    )
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.resolve_attribution",
        lambda *_args, **_kwargs: _confirmation_required_decision(member),
    )

    with pytest.raises(AttributionConfirmationRequiredError):
        retry_cas_import_password(
            db=db_session,
            import_id=import_rec.id,
            user_id=user.id,
            new_password="PASS",
        )


def test_retry_cas_import_password_accepts_attribution_confirmation_override(
    db_session, sample_user_and_member, monkeypatch
):
    user, member = sample_user_and_member
    matched_member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Matched Family Member",
        relationship=Relationship.SPOUSE,
        created_at=datetime.now(timezone.utc),
    )
    import_rec = Import(
        id=uuid.uuid4(),
        household_member_id=member.id,
        status=ImportStatus.PASSWORD_REQUIRED,
        uploaded_at=datetime.now(timezone.utc),
    )
    db_session.add_all([matched_member, import_rec])
    db_session.commit()
    store_pdf_buffer(str(import_rec.id), b"%PDF-1.4 cached")
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.parse_cas_pdf_bytes",
        lambda _bytes, _password: _empty_parse_result(),
    )
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.resolve_attribution",
        lambda *_args, **_kwargs: _confirmation_required_decision(matched_member),
    )

    updated_rec = retry_cas_import_password(
        db=db_session,
        import_id=import_rec.id,
        user_id=user.id,
        new_password="PASS",
        confirmed_member_override=True,
    )

    assert updated_rec.status == ImportStatus.IMPORT_SUCCESSFUL
    assert updated_rec.household_member_id == member.id
