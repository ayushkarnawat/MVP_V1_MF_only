import asyncio
from datetime import date, datetime, timezone
from decimal import Decimal
import uuid
import pytest

from app.models.enums import ImportStatus, Relationship, TransactionType
from app.models.imports import Import
from app.models.user import HouseholdMember, User
from app.services.import_.buffer_cache import get_pdf_buffer, store_pdf_buffer
from app.services.import_.attribution import (
    AttributionConfirmationRequiredError,
    AttributionDecision,
    AttributionStatus,
    CrossAccountPanBlockedError,
)
from app.services.import_.crypto import encrypt_pan, hash_pan
from app.services.import_ import file_storage as file_storage_module
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


@pytest.fixture(autouse=True)
def isolate_cas_file_storage(tmp_path, monkeypatch):
    """Prevent tests that reach a real success path (store_cas_file) from
    writing to disk via the module-level default_file_storage singleton —
    same isolation Task 6 needed for the sync path's test_service.py, since
    the singleton captures settings.cas_file_storage_dir once at import
    time (monkeypatching the setting itself would silently no-op)."""
    monkeypatch.setattr(file_storage_module.default_file_storage, "_base_dir", tmp_path)


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

    # In-place password retry without re-uploading file. Uses
    # confirmed_member_override=True: this test's intent is the retry/parse
    # flow, not attribution matching, and the member has no PAN on file, so
    # a real resolve_attribution call would otherwise land on
    # UNRECOGNIZED_MEMBER and require confirmation.
    updated_rec = retry_cas_import_password(
        db=db_session,
        import_id=import_rec.id,
        user_id=user.id,
        new_password="CORRECT_PASS",
        confirmed_member_override=True,
    )

    assert updated_rec.status == ImportStatus.IMPORT_SUCCESSFUL
    assert updated_rec.new_transactions_count == 1
    assert updated_rec.duplicate_transactions_count == 0
    assert updated_rec.household_member_id == member.id
    # Buffer cache should be wiped on success
    assert get_pdf_buffer(str(import_rec.id)) is None


def test_cross_account_pan_match_blocks_import(
    db_session, sample_user_and_member, monkeypatch
):
    """Cross-account attribution is now a hard PAN block, not a
    response-only advisory (attribution.py rewrite, Task 5). Folio-based
    matching in resolve_attribution only ever looks within the caller's own
    household now, so a same-folio-different-account scenario (this test's
    old shape) is no longer observable here at all -- the only real
    cross-account signal left is a PAN match to a member of a different
    account, which raises CrossAccountPanBlockedError directly out of
    create_cas_import (uncaught by its ParseError-only try/except)."""
    user, member = sample_user_and_member
    now = datetime.now(timezone.utc)
    other_user = User(
        id=uuid.uuid4(),
        phone_number="+919900000001",
        created_at=now,
    )
    # Flush the user before adding the member: without an ORM relationship()
    # between User and HouseholdMember, the unit-of-work's insert ordering
    # doesn't follow add_all()'s list order, so a single flush can attempt
    # the FK-dependent insert first.
    db_session.add(other_user)
    db_session.flush()
    other_member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=other_user.id,
        name="Private Other Account",
        relationship=Relationship.SELF,
        created_at=now,
        pan_encrypted=encrypt_pan("ZZZZZ9999Z"),
        pan_lookup_hash=hash_pan("ZZZZZ9999Z"),
    )
    db_session.add(other_member)
    db_session.commit()

    parse_result = ParseResult(
        investor=ParsedInvestor(
            name="Different Investor Name",
            email="investor@example.com",
            pan_masked="Z*****9Z",
            pan="ZZZZZ9999Z",
        ),
        schemes=[],
        transactions=[],
        raw_json="{}",
    )
    monkeypatch.setattr(
        "app.services.import_.lifecycle_service.parse_cas_pdf_bytes",
        lambda _bytes, _password: parse_result,
    )

    with pytest.raises(CrossAccountPanBlockedError):
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

    # First import. confirmed_member_override=True: this test's intent is
    # dedup fingerprinting, not attribution matching, and the member has no
    # PAN or pre-existing folio on file, so real resolve_attribution would
    # otherwise land on UNRECOGNIZED_MEMBER and require confirmation.
    rec1 = asyncio.run(create_cas_import(
        db=db_session,
        user_id=user.id,
        household_member_id=member.id,
        file_bytes=fake_pdf,
        filename="statement1.pdf",
        password="PASS",
        confirmed_member_override=True,
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
        confirmed_member_override=True,
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
