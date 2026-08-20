import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

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
from app.services.import_.service import SchemeConfidenceError, build_import_preview, confirm_import
from app.models.enums import PlanType, TransactionType
from decimal import Decimal
from datetime import date


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    # autoflush=False to match production's real SessionLocal (app/db/session.py) —
    # the SQLAlchemy default (autoflush=True) hid Fix 1's dedupe race: it made
    # earlier db.add()s in the same confirm_import call visible to the dedupe
    # query, which production's real session config never does.
    return sessionmaker(autoflush=False, bind=engine)()


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
        schemes=[scheme], transactions=[txn],
        raw_json='{"investor_info": {"name": "Test Investor"}, "folios": []}',
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


def _parse_result_with_schemes(*schemes):
    sample = _sample_parse_result()
    return ParseResult(
        investor=sample.investor, schemes=list(schemes), transactions=[],
        raw_json=sample.raw_json, parse_warnings=sample.parse_warnings,
        cas_type=sample.cas_type, file_type=sample.file_type,
    )


def _parsed_scheme(name: str, amfi: str, folio: str):
    return ParsedScheme(
        name=name, isin=f"ISIN-{amfi}", amfi=amfi, scheme_type="EQUITY",
        folio=folio, amc="Test AMC", transaction_count=0, arn_code=None,
        plan_name_variant="direct", plan_type="direct",
    )


def test_build_import_preview_resolves_schemes_concurrently():
    from app.services.import_.enrich import SchemeMatch

    schemes = (
        _parsed_scheme("First Fund", "100001", "folio-1"),
        _parsed_scheme("Second Fund", "100002", "folio-2"),
    )
    client = AsyncMock()
    both_resolutions_started = asyncio.Event()
    started: set[str] = set()

    async def resolve(name, amfi, isin=None):
        started.add(amfi)
        if len(started) == 2:
            both_resolutions_started.set()
        await asyncio.wait_for(both_resolutions_started.wait(), timeout=1)
        return SchemeMatch(amfi_code=amfi, scheme_name=name, confidence=1.0), "confirmed"

    client.resolve_scheme.side_effect = resolve
    client.get_scheme_category.return_value = "Equity"

    preview = asyncio.run(build_import_preview(
        _parse_result_with_schemes(*schemes), "test.pdf", client=client,
    ))

    assert [scheme.name for scheme in preview.schemes] == ["First Fund", "Second Fund"]


def test_build_import_preview_preserves_input_order_when_resolution_finishes_out_of_order():
    from app.services.import_.enrich import SchemeMatch

    schemes = (
        _parsed_scheme("Slow First Fund", "100001", "folio-1"),
        _parsed_scheme("Fast Second Fund", "100002", "folio-2"),
    )
    client = AsyncMock()
    second_finished = asyncio.Event()

    async def resolve(name, amfi, isin=None):
        if amfi == "100001":
            await asyncio.wait_for(second_finished.wait(), timeout=1)
            confidence = 0.93
        else:
            confidence = 0.99
            second_finished.set()
        return SchemeMatch(amfi_code=amfi, scheme_name=f"Resolved {name}", confidence=confidence), "confirmed"

    async def category(amfi):
        return f"Category {amfi}"

    client.resolve_scheme.side_effect = resolve
    client.get_scheme_category.side_effect = category

    preview = asyncio.run(build_import_preview(
        _parse_result_with_schemes(*schemes), "test.pdf", client=client,
    ))

    assert [scheme.name for scheme in preview.schemes] == ["Slow First Fund", "Fast Second Fund"]
    assert [scheme.suggested_name for scheme in preview.schemes] == [
        "Resolved Slow First Fund", "Resolved Fast Second Fund",
    ]
    assert [scheme.category for scheme in preview.schemes] == ["Category 100001", "Category 100002"]


def test_build_import_preview_fails_whole_call_when_one_scheme_resolution_raises():
    """Concurrent resolution via asyncio.gather must preserve the old
    sequential loop's contract: an unexpected error from any single scheme's
    resolve_scheme/get_scheme_category fails the whole preview call and
    leaves no partial session behind, exactly like the old loop (which
    likewise never caught these exceptions and would abort partway)."""
    from app.services.import_.service import _preview_sessions

    schemes = (
        _parsed_scheme("Good Fund", "100001", "folio-1"),
        _parsed_scheme("Bad Fund", "100002", "folio-2"),
    )
    client = AsyncMock()

    async def resolve(name, amfi, isin=None):
        if amfi == "100002":
            raise RuntimeError("mfapi.in blew up")
        from app.services.import_.enrich import SchemeMatch
        return SchemeMatch(amfi_code=amfi, scheme_name=name, confidence=1.0), "confirmed"

    client.resolve_scheme.side_effect = resolve
    client.get_scheme_category.return_value = "Equity"

    sessions_before = set(_preview_sessions)
    import pytest
    with pytest.raises(RuntimeError, match="mfapi.in blew up"):
        asyncio.run(build_import_preview(_parse_result_with_schemes(*schemes), "test.pdf", client=client))

    assert set(_preview_sessions) == sessions_before


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
    # Fix 6: raw_parser_output must be the parsed structure itself (real JSON
    # for the JSONB column), not {"raw": "<escaped-json-string>"}.
    assert imp.raw_parser_output == {"investor_info": {"name": "Test Investor"}, "folios": []}


def test_confirm_import_invalidates_member_holdings_cache_after_commit():
    db = _session()
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=_mocked_client()))

    def assert_commit_finished(_member_id):
        assert not db.in_transaction()

    with patch(
        "app.services.import_.service.invalidate_holdings_cache",
        side_effect=assert_commit_finished,
    ) as invalidate:
        confirm_import(db, preview.session_id, member.id, scheme_confirmations=[])

    invalidate.assert_called_once_with(member.id)


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
    with pytest.raises(SchemeConfidenceError, match="requires an explicit AMFI code"):
        confirm_import(db, preview.session_id, member.id, scheme_confirmations=[])


def test_confirm_import_rejection_writes_nothing_even_for_earlier_confident_scheme():
    """Fix 2 regression: confirm_import validates every referenced scheme
    before writing anything. A mix of one confident scheme (which used to get
    flushed to the session before the loop reached the low-confidence one)
    and one low-confidence scheme must leave zero rows in every table."""
    from app.services.import_.enrich import SchemeMatch

    confident_txn = NormalizedTransaction(
        folio="123/45", amc="HDFC AMC", scheme_name="HDFC Flexi Cap Fund - Direct Plan - Growth",
        isin="INF123", amfi="125497", scheme_type="EQUITY", txn_date=date(2024, 1, 1),
        txn_type=TransactionType.PURCHASE, description="Purchase",
        amount=Decimal("5000.00"), units=Decimal("10.000"), nav=Decimal("500.0000"),
    )
    confident_scheme = ParsedScheme(
        name="HDFC Flexi Cap Fund - Direct Plan - Growth", isin="INF123", amfi="125497",
        scheme_type="EQUITY", folio="123/45", amc="HDFC AMC", transaction_count=1,
        arn_code=None, plan_name_variant="direct", plan_type="direct",
    )
    ambiguous_txn = NormalizedTransaction(
        folio="1", amc="X AMC", scheme_name="Ambiguous Fund", isin=None, amfi=None,
        scheme_type="EQUITY", txn_date=date(2024, 1, 1), txn_type=TransactionType.PURCHASE,
        description="Purchase", amount=Decimal("1000.00"), units=Decimal("5.000"), nav=Decimal("200.0000"),
    )
    ambiguous_scheme = ParsedScheme(
        name="Ambiguous Fund", isin=None, amfi=None, scheme_type="EQUITY", folio="1", amc="X AMC",
        transaction_count=1, arn_code=None, plan_name_variant="unresolved", plan_type="unclassified",
    )
    parse_result = ParseResult(
        investor=ParsedInvestor(name="Test Investor", email="t@example.com", pan_masked="ABCDE****F"),
        schemes=[confident_scheme, ambiguous_scheme], transactions=[confident_txn, ambiguous_txn],
        raw_json="{}", parse_warnings=[], cas_type="DETAILED", file_type="FileType.CAMS",
    )

    db = _session()
    member = _household_member(db)

    client = AsyncMock()

    async def _resolve_scheme(name, amfi, isin=None):
        if amfi == "125497":
            return SchemeMatch(amfi_code="125497", scheme_name=name, confidence=1.0), "confirmed"
        return None, "pending"

    client.resolve_scheme.side_effect = _resolve_scheme
    client.get_scheme_category.return_value = "Equity Scheme - Flexi Cap Fund"

    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", client=client))

    import pytest
    with pytest.raises(SchemeConfidenceError, match="requires an explicit AMFI code"):
        confirm_import(db, preview.session_id, member.id, scheme_confirmations=[])

    assert db.query(Import).count() == 0
    assert db.query(Scheme).count() == 0
    assert db.query(Folio).count() == 0
    assert db.query(Transaction).count() == 0


def test_confirm_import_dedupes_same_key_transactions_within_one_upload():
    """Fix 1 regression: two transactions sharing (folio, date, amount, units)
    within the SAME confirm_import call (e.g. same-day SIP installments, or a
    stamp-duty/STT row sharing date/amount/units with another row) must be
    deduped, not both inserted and left to blow up the UniqueConstraint at
    commit. A DB-only dedupe check misses this because the real session's
    autoflush=False means the first db.add() isn't visible to the second
    row's query yet — confirm_import must also track keys added in-memory."""
    db = _session()
    member = _household_member(db)
    client = _mocked_client()

    txn1 = NormalizedTransaction(
        folio="123/45", amc="HDFC AMC", scheme_name="HDFC Flexi Cap Fund - Direct Plan - Growth",
        isin="INF123", amfi="125497", scheme_type="EQUITY", txn_date=date(2024, 1, 1),
        txn_type=TransactionType.PURCHASE, description="Purchase",
        amount=Decimal("5000.00"), units=Decimal("10.000"), nav=Decimal("500.0000"),
    )
    txn2 = NormalizedTransaction(
        folio="123/45", amc="HDFC AMC", scheme_name="HDFC Flexi Cap Fund - Direct Plan - Growth",
        isin="INF123", amfi="125497", scheme_type="EQUITY", txn_date=date(2024, 1, 1),
        txn_type=TransactionType.PURCHASE, description="Same date/amount/units, e.g. STT row",
        amount=Decimal("5000.00"), units=Decimal("10.000"), nav=Decimal("500.0000"),
    )
    scheme = ParsedScheme(
        name="HDFC Flexi Cap Fund - Direct Plan - Growth", isin="INF123", amfi="125497",
        scheme_type="EQUITY", folio="123/45", amc="HDFC AMC", transaction_count=2,
        arn_code=None, plan_name_variant="direct", plan_type="direct",
    )
    parse_result = ParseResult(
        investor=ParsedInvestor(name="Test Investor", email="t@example.com", pan_masked="ABCDE****F"),
        schemes=[scheme], transactions=[txn1, txn2], raw_json="{}",
        parse_warnings=[], cas_type="DETAILED", file_type="FileType.CAMS",
    )

    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", client=client))
    result = confirm_import(db, preview.session_id, member.id, scheme_confirmations=[])

    assert result.added == 1
    assert result.skipped == 1
    assert db.query(Transaction).count() == 1


def test_confirm_import_does_not_dedupe_across_different_transaction_types():
    """Regression test: before the redemption sign-normalization fix, a
    same-day purchase and redemption of equal amount/units had opposite
    signs and couldn't collide on the old 4-column dedupe key. After that
    fix normalized both to positive magnitudes, they could — and the
    second one would be silently dropped as a false duplicate. Both must
    now be inserted; only `type` distinguishes them here."""
    db = _session()
    member = _household_member(db)
    client = _mocked_client()

    txn1 = NormalizedTransaction(
        folio="123/45", amc="HDFC AMC", scheme_name="HDFC Flexi Cap Fund - Direct Plan - Growth",
        isin="INF123", amfi="125497", scheme_type="EQUITY", txn_date=date(2024, 1, 1),
        txn_type=TransactionType.PURCHASE, description="Purchase",
        amount=Decimal("5000.00"), units=Decimal("10.000"), nav=Decimal("500.0000"),
    )
    txn2 = NormalizedTransaction(
        folio="123/45", amc="HDFC AMC", scheme_name="HDFC Flexi Cap Fund - Direct Plan - Growth",
        isin="INF123", amfi="125497", scheme_type="EQUITY", txn_date=date(2024, 1, 1),
        txn_type=TransactionType.REDEMPTION, description="Same-day redemption, same amount/units",
        amount=Decimal("5000.00"), units=Decimal("10.000"), nav=Decimal("500.0000"),
    )
    scheme = ParsedScheme(
        name="HDFC Flexi Cap Fund - Direct Plan - Growth", isin="INF123", amfi="125497",
        scheme_type="EQUITY", folio="123/45", amc="HDFC AMC", transaction_count=2,
        arn_code=None, plan_name_variant="direct", plan_type="direct",
    )
    parse_result = ParseResult(
        investor=ParsedInvestor(name="Test Investor", email="t@example.com", pan_masked="ABCDE****F"),
        schemes=[scheme], transactions=[txn1, txn2], raw_json="{}",
        parse_warnings=[], cas_type="DETAILED", file_type="FileType.CAMS",
    )

    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", client=client))
    result = confirm_import(db, preview.session_id, member.id, scheme_confirmations=[])

    assert result.added == 2
    assert result.skipped == 0
    assert db.query(Transaction).count() == 2
    types = {t.type for t in db.query(Transaction).all()}
    assert types == {TransactionType.PURCHASE, TransactionType.REDEMPTION}


def test_confirm_import_rejects_pending_status_scheme_even_above_raw_threshold():
    """Fix 2 regression: 0.95 confidence clears CONFIDENCE_THRESHOLD (0.92) as
    a raw number, but resolve_scheme labels [0.92, 0.98) "pending" — shown to
    the user in the preview as needs-review. confirm_import must gate on that
    same match_status, not recompute its own confidence comparison, or a
    scheme the preview called "pending" gets silently written."""
    from app.services.import_.enrich import SchemeMatch

    db = _session()
    member = _household_member(db)
    client = AsyncMock()
    client.resolve_scheme = AsyncMock(
        return_value=(SchemeMatch(amfi_code="999999", scheme_name="Some Fund", confidence=0.95), "pending")
    )
    client.get_scheme_category.return_value = None

    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=client))
    assert preview.schemes[0].match_status == "pending"
    assert preview.schemes[0].match_confidence == 0.95

    import pytest
    with pytest.raises(SchemeConfidenceError):
        confirm_import(db, preview.session_id, member.id, scheme_confirmations=[])


def test_confirm_import_separate_folios_for_same_scheme_via_different_distributors():
    """FR-8: two folios holding the same scheme name via two different
    distributors (two different ARN codes) each get their own Folio row with
    their own arn_code, sharing one Scheme row — not merged."""
    db = _session()
    member = _household_member(db)
    client = _mocked_client()

    txn_a = NormalizedTransaction(
        folio="AAA111", amc="HDFC AMC", scheme_name="HDFC Flexi Cap Fund - Regular Plan - Growth",
        isin="INF123", amfi="125497", scheme_type="EQUITY", txn_date=date(2024, 1, 1),
        txn_type=TransactionType.PURCHASE, description="Purchase",
        amount=Decimal("5000.00"), units=Decimal("10.000"), nav=Decimal("500.0000"),
    )
    txn_b = NormalizedTransaction(
        folio="BBB222", amc="HDFC AMC", scheme_name="HDFC Flexi Cap Fund - Regular Plan - Growth",
        isin="INF123", amfi="125497", scheme_type="EQUITY", txn_date=date(2024, 1, 2),
        txn_type=TransactionType.PURCHASE, description="Purchase",
        amount=Decimal("3000.00"), units=Decimal("6.000"), nav=Decimal("500.0000"),
    )
    scheme_a = ParsedScheme(
        name="HDFC Flexi Cap Fund - Regular Plan - Growth", isin="INF123", amfi="125497",
        scheme_type="EQUITY", folio="AAA111", amc="HDFC AMC", transaction_count=1,
        arn_code="ARN-1111", plan_name_variant="regular", plan_type="regular",
    )
    scheme_b = ParsedScheme(
        name="HDFC Flexi Cap Fund - Regular Plan - Growth", isin="INF123", amfi="125497",
        scheme_type="EQUITY", folio="BBB222", amc="HDFC AMC", transaction_count=1,
        arn_code="ARN-2222", plan_name_variant="regular", plan_type="regular",
    )
    parse_result = ParseResult(
        investor=ParsedInvestor(name="Test Investor", email="t@example.com", pan_masked="ABCDE****F"),
        schemes=[scheme_a, scheme_b], transactions=[txn_a, txn_b], raw_json="{}",
        parse_warnings=[], cas_type="DETAILED", file_type="FileType.CAMS",
    )

    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", client=client))
    result = confirm_import(db, preview.session_id, member.id, scheme_confirmations=[])

    assert result.added == 2
    schemes = db.query(Scheme).all()
    assert len(schemes) == 1
    folios = db.query(Folio).order_by(Folio.folio_number).all()
    assert len(folios) == 2
    assert {f.folio_number for f in folios} == {"AAA111", "BBB222"}
    assert {f.arn_code for f in folios} == {"ARN-1111", "ARN-2222"}
    assert all(f.scheme_id == schemes[0].id for f in folios)


def test_sweep_expired_sessions_removes_backdated_entries():
    """Fix 5: _preview_sessions must not grow forever — an abandoned preview
    older than the TTL is swept on the next build_import_preview call."""
    from datetime import timedelta

    from app.services.import_.service import _preview_sessions, _sweep_expired_sessions

    client = _mocked_client()
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=client))
    assert preview.session_id in _preview_sessions

    # Backdate the session past the default 60-minute TTL.
    _preview_sessions[preview.session_id]["created_at"] = datetime.now(timezone.utc) - timedelta(minutes=61)

    _sweep_expired_sessions()

    assert preview.session_id not in _preview_sessions


def test_confirm_import_rejects_override_amfi_code_not_in_master_list():
    """DATA-001: a user-supplied override.amfi_code used to be trusted
    unconditionally with no cross-check. A code that doesn't even exist in
    AMFI's own master list is a data-entry error, not a legitimate
    correction -- must be rejected (409) rather than silently accepted."""
    from app.services.import_.enrich import mfapi_client
    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=_mocked_client()))
    temp_id = preview.schemes[0].temp_id

    scheme_list = [{"schemeCode": "125497", "schemeName": "HDFC Flexi Cap Fund - Direct Plan - Growth"}]
    with patch.object(mfapi_client, "_schemes", scheme_list):
        import pytest
        with pytest.raises(SchemeConfidenceError, match="was not found in AMFI"):
            confirm_import(
                db, preview.session_id, member.id,
                scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, amfi_code="999999")],
            )


def test_confirm_import_accepts_override_amfi_code_when_name_plausibly_matches():
    """A genuinely found override code paired with a plausibly-matching name
    is accepted, and the CAS-parsed name is kept as-is (no unnecessary
    rewrite when the pairing is already trustworthy)."""
    from app.services.import_.enrich import mfapi_client
    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=_mocked_client()))
    temp_id = preview.schemes[0].temp_id

    scheme_list = [{"schemeCode": "222222", "schemeName": "HDFC Flexi Cap Fund Direct Growth"}]
    with patch.object(mfapi_client, "_schemes", scheme_list):
        result = confirm_import(
            db, preview.session_id, member.id,
            scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, amfi_code="222222")],
        )

    assert result.added == 1
    scheme = db.query(Scheme).filter_by(amfi_code="222222").one()
    assert scheme.name == "HDFC Flexi Cap Fund - Direct Plan - Growth"


def test_confirm_import_persists_canonical_name_when_override_code_disagrees_with_cas_name():
    """DATA-001's more concrete bug: `Scheme.name` was always the CAS-parsed
    name regardless of an override's corrected `amfi_code`, so a legitimate
    manual correction could still persist a `Scheme` row whose name doesn't
    match its code. When the override code's real (master-list) name is NOT
    plausibly similar to the CAS-parsed name, the canonical name must be
    persisted instead."""
    from app.services.import_.enrich import mfapi_client
    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=_mocked_client()))
    temp_id = preview.schemes[0].temp_id

    scheme_list = [{"schemeCode": "222222", "schemeName": "SBI Bluechip Fund - Regular Plan - Growth"}]
    with patch.object(mfapi_client, "_schemes", scheme_list):
        result = confirm_import(
            db, preview.session_id, member.id,
            scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, amfi_code="222222")],
        )

    assert result.added == 1
    scheme = db.query(Scheme).filter_by(amfi_code="222222").one()
    assert scheme.name == "SBI Bluechip Fund - Regular Plan - Growth"


def test_confirm_import_override_degrades_gracefully_when_master_list_not_cached():
    """A fresh process (master list never fetched this session, e.g. every
    scheme in the CAS already carried a confirmed AMFI code) has nothing to
    cross-check an override against -- must not block the confirm, and keeps
    the pre-fix behavior (CAS-parsed name) rather than erroring out."""
    from app.services.import_.enrich import mfapi_client
    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=_mocked_client()))
    temp_id = preview.schemes[0].temp_id

    with patch.object(mfapi_client, "_schemes", None):
        result = confirm_import(
            db, preview.session_id, member.id,
            scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, amfi_code="333333")],
        )

    assert result.added == 1
    scheme = db.query(Scheme).filter_by(amfi_code="333333").one()
    assert scheme.name == "HDFC Flexi Cap Fund - Direct Plan - Growth"


def test_confirm_import_rejects_plan_type_override_contradicting_parsed_plan_name():
    """Combined fix for CLAUDE.md's "no server-side 409 backstop on plan-type
    override" gap: the sample scheme's own CAS-parsed name unambiguously says
    "Direct Plan" (plan_name_variant="direct"). An override claiming
    "regular" contradicts that unambiguous signal and must be rejected."""
    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=_mocked_client()))
    temp_id = preview.schemes[0].temp_id

    import pytest
    with pytest.raises(SchemeConfidenceError, match="contradicts"):
        confirm_import(
            db, preview.session_id, member.id,
            scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, plan_type_override=PlanType.REGULAR)],
        )


def test_confirm_import_accepts_plan_type_override_matching_parsed_plan_name():
    """Sanity check: an override that agrees with the CAS-parsed plan name is
    never rejected by the new backstop."""
    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", client=_mocked_client()))
    temp_id = preview.schemes[0].temp_id

    result = confirm_import(
        db, preview.session_id, member.id,
        scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, plan_type_override=PlanType.DIRECT)],
    )

    assert result.added == 1
    folio = db.query(Folio).filter_by(folio_number="123/45").one()
    assert folio.plan_type.value == "direct"


def test_confirm_import_does_not_reject_override_when_name_lacks_plan_designator_phrase():
    """Review finding (round 2): classify_plan_from_name is a loose substring
    match (FR-5's own documented trade-off) -- plan_name_variant can say
    "direct" purely because the scheme's base name happens to contain the
    word "Direct" somewhere, with no actual "Direct Plan"/"Regular Plan"
    designator in the name. The 409 backstop must not treat that loose
    signal as an unambiguous veto over a legitimate override -- it only
    fires when the scheme's own name contains the standard SEBI-mandated
    "Direct Plan"/"Regular Plan" phrase matching plan_name_variant."""
    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    member = _household_member(db)
    # "Direct" appears in the base name, not as a "Direct Plan" designator --
    # plan_name_variant is forced to "direct" here exactly as
    # classify_plan_from_name's loose substring match would produce for a
    # name like this.
    scheme = ParsedScheme(
        name="HDFC Direct Opportunities Fund - Growth", isin="INF999", amfi="125497",
        scheme_type="EQUITY", folio="123/45", amc="HDFC AMC", transaction_count=1,
        arn_code=None, plan_name_variant="direct", plan_type="direct",
    )
    txn = NormalizedTransaction(
        folio="123/45", amc="HDFC AMC", scheme_name="HDFC Direct Opportunities Fund - Growth",
        isin="INF999", amfi="125497", scheme_type="EQUITY", txn_date=date(2024, 1, 1),
        txn_type=TransactionType.PURCHASE, description="Purchase",
        amount=Decimal("5000.00"), units=Decimal("10.000"), nav=Decimal("500.0000"),
    )
    parse_result = ParseResult(
        investor=ParsedInvestor(name="Test Investor", email="t@example.com", pan_masked="ABCDE****F"),
        schemes=[scheme], transactions=[txn],
        raw_json='{"investor_info": {"name": "Test Investor"}, "folios": []}',
        parse_warnings=[], cas_type="DETAILED", file_type="FileType.CAMS",
    )
    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", client=_mocked_client()))
    temp_id = preview.schemes[0].temp_id

    result = confirm_import(
        db, preview.session_id, member.id,
        scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, plan_type_override=PlanType.REGULAR)],
    )

    assert result.added == 1
    folio = db.query(Folio).filter_by(folio_number="123/45").one()
    assert folio.plan_type.value == "regular"
