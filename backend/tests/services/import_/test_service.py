import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.user import HouseholdMember, User
from app.models.enums import Relationship
from app.models.reference import Scheme
from app.models.folio import Folio
from app.models.transaction import Transaction
from app.models.imports import Import, ImportStatus
from app.services.import_.pan_claims import PENDING_PAN_TTL, PanBelongsToOtherMemberError
from app.services.import_.crypto import encrypt_pan, hash_pan
from app.services.import_.parser import NormalizedTransaction, ParsedInvestor, ParsedScheme, ParseResult
from app.services.import_.service import (
    SESSION_TTL_MINUTES,
    SchemeConfidenceError,
    _preview_sessions,
    build_import_preview,
    confirm_import,
    discard_import_session,
    start_import_session,
)
from app.models.enums import PlanType, TransactionType
from app.models.enums import CostSource, SchemePlanType
from tests.api.import_helpers import seed_master_scheme
from dataclasses import replace
from decimal import Decimal
from datetime import date, timedelta

import app.services.import_.file_storage as file_storage_module
from app.services.import_.file_storage import CAS_FILE_RETENTION_DAYS, storage_key_for_upload_group


@pytest.fixture(autouse=True)
def isolate_cas_file_storage(tmp_path, monkeypatch):
    """confirm_import calls store_cas_file() with no `storage=` override, so it
    always writes through the module-level `default_file_storage` singleton
    (LocalFileStorage() constructed once at import time). Monkeypatching
    settings.cas_file_storage_dir would NOT redirect it -- the singleton
    already captured its base dir at construction, before any fixture runs.
    Mutating the singleton's `_base_dir` attribute in place is the only thing
    that actually reaches the object `store_cas_file`'s default parameter
    refers to, so every test in this file writes under a fresh per-test
    tmp_path instead of the real `var/cas_files/` project directory."""
    monkeypatch.setattr(file_storage_module.default_file_storage, "_base_dir", tmp_path)
    monkeypatch.setattr("app.services.import_.service._fetch_nav_history", AsyncMock(return_value=None))


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


def _mocked_client(category=None):
    """Compatibility argument; master identification never consults it."""
    return object()


def _persist_preview(db, preview, member=None):
    """Give a pre-people preview a real owner and persisted atomic-claim row."""
    from app.services.import_ import preview_store
    member = member or _household_member(db)
    session = _preview_sessions[preview.session_id]
    session["household_member_id"],session["user_id"] = member.id,member.user_id
    preview_store.save(db,session)
    db.commit()
    return member


def _assert_only_preview_remains(db, preview):
    row = db.query(Import).one()
    assert row.id == uuid.UUID(preview.session_id)
    assert row.status == ImportStatus.PREVIEWING and row.preview_state is not None
    assert db.query(Transaction).count() == 0


def _confirm_for_member(db, preview, member, scheme_confirmations=None):
    if db.get(Import, uuid.UUID(preview.session_id)) is None:
        _persist_preview(db, preview, member)
    return confirm_import(
        db,
        preview.session_id,
        member.id,
        scheme_confirmations=scheme_confirmations or [],
        user_id=member.user_id,
    )


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

    db = _session()
    seed_master_scheme(db)
    client = _mocked_client()
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=client, db=db))

    assert preview.investor_name == "Test Investor"
    assert preview.pan_masked == "ABCDE****F"
    assert len(preview.schemes) == 1
    assert preview.schemes[0].suggested_amfi_code == "125497"
    assert preview.schemes[0].match_confidence == 1.0
    assert preview.schemes[0].plan_type == "direct"
    assert preview.transaction_count == 1


def test_build_preview_prices_opening_lots():

    db = _session()
    seed_master_scheme(db)
    result = _sample_parse_result()
    result.transactions = []
    scheme = result.schemes[0]
    scheme.open_units, scheme.valuation_cost = Decimal("100"), Decimal("4000")
    result.statement_from = date(2016, 1, 1)
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(
        return_value=[(date(2015, 1, 1), Decimal("30")), (date(2015, 12, 31), Decimal("45"))],
    )):
        preview = asyncio.run(build_import_preview(result, "cas.pdf", b"%PDF", _mocked_client(), db=db))
    lot = _preview_sessions[preview.session_id]["opening_lots"][preview.schemes[0].temp_id]
    assert lot.cost_source == CostSource.CAS_COST and lot.nav == Decimal("40.0000")
    assert preview.schemes[0].opening_units == "100"


def test_build_preview_keys_schemes_by_isin():

    db = _session()
    seed_master_scheme(db)
    result = _sample_parse_result()
    result.schemes.append(replace(result.schemes[0], isin="INF456"))
    preview = asyncio.run(build_import_preview(result, "cas.pdf", b"%PDF", _mocked_client(), db=db))
    assert len({s.temp_id for s in preview.schemes}) == 2
    keys = _preview_sessions[preview.session_id]["key_to_temp"]
    assert set(keys) == {("123/45", "HDFC AMC", "INF123"), ("123/45", "HDFC AMC", "INF456")}


def test_build_preview_missing_start_warns_and_skips_opening_lots():

    db = _session()
    seed_master_scheme(db)
    result = _sample_parse_result()
    result.schemes[0].open_units = Decimal("100")
    preview = asyncio.run(build_import_preview(result, "cas.pdf", b"%PDF", _mocked_client(), db=db))
    assert _preview_sessions[preview.session_id]["opening_lots"] == {}
    assert "Statement start date not found; earlier holdings couldn’t be added." in preview.parse_warnings


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


def _identification_fixture(db, name, code, folio):
    parsed = _parsed_scheme(name, code, folio)
    parsed.valuation_date, parsed.valuation_nav = date(2026, 10, 5), Decimal("10")
    db.add(Scheme(amfi_code=code, isin=parsed.isin, name=f"Resolved {name}",
                  amc_name=parsed.amc, sebi_category=f"Category {code}", plan_type=SchemePlanType.DIRECT))
    db.commit()
    return parsed


def test_build_import_preview_resolves_schemes_concurrently():
    db = _session()
    schemes = [_identification_fixture(db, "First Fund", "100001", "1"),
               _identification_fixture(db, "Second Fund", "100002", "2")]
    both_started, started = asyncio.Event(), set()

    async def fetch(code):
        started.add(code)
        if len(started) == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=1)
        return [(date(2026, 10, 5), Decimal("10"))]

    with patch("app.services.import_.service._fetch_nav_history", new=fetch):
        preview = asyncio.run(build_import_preview(_parse_result_with_schemes(*schemes), "test.pdf", b"%PDF", db=db))
    assert started == {"100001", "100002"}
    assert [p.name for p in preview.schemes] == ["First Fund", "Second Fund"]




def test_build_import_preview_preserves_input_order_when_resolution_finishes_out_of_order():
    db = _session()
    schemes = [_identification_fixture(db, "Slow First Fund", "100001", "1"),
               _identification_fixture(db, "Fast Second Fund", "100002", "2")]
    second_finished, finished = asyncio.Event(), []

    async def fetch(code):
        if code == "100001":
            await asyncio.wait_for(second_finished.wait(), timeout=1)
        else:
            second_finished.set()
        finished.append(code)
        return [(date(2026, 10, 5), Decimal("10"))]

    with patch("app.services.import_.service._fetch_nav_history", new=fetch):
        preview = asyncio.run(build_import_preview(_parse_result_with_schemes(*schemes), "test.pdf", b"%PDF", db=db))
    assert finished == ["100002", "100001"]
    assert [p.name for p in preview.schemes] == ["Slow First Fund", "Fast Second Fund"]
    assert [p.suggested_name for p in preview.schemes] == ["Resolved Slow First Fund", "Resolved Fast Second Fund"]
    assert [p.category for p in preview.schemes] == ["Category 100001", "Category 100002"]




def test_build_import_preview_fails_whole_call_when_one_scheme_resolution_raises():
    db = _session()
    schemes = [_identification_fixture(db, "Good Fund", "100001", "1"),
               _identification_fixture(db, "Bad Fund", "100002", "2")]

    async def fetch(code):
        if code == "100002":
            raise RuntimeError("mfapi.in blew up")
        return [(date(2026, 10, 5), Decimal("10"))]

    before = set(_preview_sessions)
    with patch("app.services.import_.service._fetch_nav_history", new=fetch), pytest.raises(RuntimeError, match="mfapi.in blew up"):
        asyncio.run(build_import_preview(_parse_result_with_schemes(*schemes), "test.pdf", b"%PDF", db=db))
    assert set(_preview_sessions) == before




def test_confirm_import_creates_scheme_folio_and_transaction():

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    client = _mocked_client()
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=client, db=db))

    result = _confirm_for_member(db, preview, member)

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


def test_confirm_import_stores_cas_file_and_sets_expiry():
    """Task 6 headline behavior: confirm_import must wire store_cas_file into
    the real confirm flow, not just have it available as a helper. Verifies
    the committed Import row actually carries a file_reference in
    storage_key_for_import's format and a file_expires_at ~30 days out,
    end-to-end through confirm_import (not by calling store_cas_file
    directly, which test_file_storage.py already covers)."""

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    client = _mocked_client()
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=client, db=db))

    before = datetime.now(timezone.utc)
    _confirm_for_member(db, preview, member)

    imp = db.query(Import).one()
    # Task 8/9: one stored file per upload group, keyed by the group id.
    assert imp.upload_group_id is not None
    assert imp.file_reference == storage_key_for_upload_group(member.user_id, imp.upload_group_id)
    expected_expiry = before + timedelta(days=CAS_FILE_RETENTION_DAYS)
    # sqlite's DateTime(timezone=True) round-trips as a naive datetime (UTC
    # wall-clock value preserved, tzinfo dropped) once re-read via a fresh
    # query -- reattach UTC before comparing, matching test_file_storage.py's
    # same-process (never-requeried) comparison style otherwise.
    actual_expiry = imp.file_expires_at
    if actual_expiry.tzinfo is None:
        actual_expiry = actual_expiry.replace(tzinfo=timezone.utc)
    assert abs((actual_expiry - expected_expiry).total_seconds()) < 5


def test_confirm_import_invalidates_member_holdings_cache_after_commit():

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=_mocked_client(), db=db))

    def assert_commit_finished(_member_id):
        assert not db.in_transaction()

    with patch(
        # Task 9: confirm's writes (and the cache invalidation) moved to confirm_people.
        "app.services.import_.confirm_people.invalidate_holdings_cache",
        side_effect=assert_commit_finished,
    ) as invalidate:
        _confirm_for_member(db, preview, member)

    invalidate.assert_called_once_with(member.id)


def test_confirm_import_deduped_on_reupload():

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    client = _mocked_client()

    preview1 = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=client, db=db))
    _confirm_for_member(db, preview1, member)

    preview2 = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=client, db=db))
    from app.services.import_.confirm_people import AlreadyImportedError
    with pytest.raises(AlreadyImportedError):
        _confirm_for_member(db, preview2, member)
    assert db.query(Transaction).count() == 1


def test_confirm_import_rejects_low_confidence_scheme_without_override():
    # 6 Oct: a held fund with nothing to offer imports as "unlisted"; one that
    # has a candidate (same AMC and base name as a master fund) still asks.

    from app.services.import_.parser import NormalizedTransaction, ParsedScheme

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    txn = NormalizedTransaction(
        folio="1", amc="HDFC AMC", scheme_name="HDFC Flexi Cap Fund - Growth", isin=None, amfi=None,
        scheme_type="EQUITY", txn_date=date(2024, 1, 1), txn_type=TransactionType.PURCHASE,
        description="Purchase", amount=Decimal("1000.00"), units=Decimal("5.000"), nav=Decimal("200.0000"),
    )
    scheme = ParsedScheme(
        name="HDFC Flexi Cap Fund - Growth", isin=None, amfi=None, scheme_type="EQUITY", folio="1", amc="HDFC AMC",
        transaction_count=1, close_units=Decimal("5"), arn_code=None, plan_name_variant="unresolved", plan_type="unclassified",
    )
    parse_result = ParseResult(
        investor=ParsedInvestor(name=None, email=None, pan_masked=None), schemes=[scheme],
        transactions=[txn], raw_json="{}", parse_warnings=[], cas_type="DETAILED", file_type="FileType.CAMS",
    )
    client = AsyncMock()

    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", b"%PDF-1.4 fake", client=client, db=db))
    assert preview.schemes[0].match_status == "pending"

    import pytest
    with pytest.raises(SchemeConfidenceError, match="requires an explicit AMFI code"):
        _confirm_for_member(db, preview, member)


def test_confirm_import_rejection_writes_nothing_even_for_earlier_confident_scheme():
    # 6 Oct: a held fund with nothing to offer imports as "unlisted"; one that
    # has a candidate (same AMC and base name as a master fund) still asks.
    """Fix 2 regression: confirm_import validates every referenced scheme
    before writing anything. A mix of one confident scheme (which used to get
    flushed to the session before the loop reached the low-confidence one)
    and one low-confidence scheme must leave zero rows in every table."""


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
        folio="1", amc="HDFC AMC", scheme_name="HDFC Flexi Cap Fund - Growth", isin=None, amfi=None,
        scheme_type="EQUITY", txn_date=date(2024, 1, 1), txn_type=TransactionType.PURCHASE,
        description="Purchase", amount=Decimal("1000.00"), units=Decimal("5.000"), nav=Decimal("200.0000"),
    )
    ambiguous_scheme = ParsedScheme(
        name="HDFC Flexi Cap Fund - Growth", isin=None, amfi=None, scheme_type="EQUITY", folio="1", amc="HDFC AMC",
        transaction_count=1, close_units=Decimal("5"), arn_code=None, plan_name_variant="unresolved", plan_type="unclassified",
    )
    parse_result = ParseResult(
        investor=ParsedInvestor(name="Test Investor", email="t@example.com", pan_masked="ABCDE****F"),
        schemes=[confident_scheme, ambiguous_scheme], transactions=[confident_txn, ambiguous_txn],
        raw_json="{}", parse_warnings=[], cas_type="DETAILED", file_type="FileType.CAMS",
    )

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)

    client = AsyncMock()

    async def _resolve_scheme(name, amfi, isin=None):
        if amfi == "125497":
            return SchemeMatch(amfi_code="125497", scheme_name=name, confidence=1.0), "confirmed"
        return None, "pending"


    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", b"%PDF-1.4 fake", client=client, db=db))

    import pytest
    with pytest.raises(SchemeConfidenceError, match="requires an explicit AMFI code"):
        _confirm_for_member(db, preview, member)

    _assert_only_preview_remains(db, preview)
    assert db.query(Scheme).count() == 1  # the existing master is unchanged
    assert db.query(Folio).count() == 0
    assert db.query(Transaction).count() == 0


def test_confirm_import_keeps_same_key_transactions_within_one_upload():
    """Two transactions sharing (folio, date, amount, units, type) within the
    SAME confirm (e.g. same-day SIP instalments) are genuine twins since #2:
    both are kept, numbered by `occurrence`. This still guards the original
    Fix 1 failure — both rows used to pass the duplicate check and then blow
    up the unique constraint at commit, because the session's autoflush=False
    hides the first db.add() from the second row's query."""

    db = _session()
    seed_master_scheme(db)
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

    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", b"%PDF-1.4 fake", client=client, db=db))
    result = _confirm_for_member(db, preview, member)

    # #2 (2026-10-06): identical rows inside one statement are genuine twins
    # (e.g. two same-day SIPs). Both are kept, numbered by `occurrence`, and
    # the commit must not hit the unique constraint.
    assert result.added == 2
    assert result.skipped == 0
    db.commit()
    assert sorted(t.occurrence for t in db.query(Transaction).all()) == [1, 2]


def test_confirm_import_does_not_dedupe_across_different_transaction_types():
    """Regression test: before the redemption sign-normalization fix, a
    same-day purchase and redemption of equal amount/units had opposite
    signs and couldn't collide on the old 4-column dedupe key. After that
    fix normalized both to positive magnitudes, they could — and the
    second one would be silently dropped as a false duplicate. Both must
    now be inserted; only `type` distinguishes them here."""

    db = _session()
    seed_master_scheme(db)
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

    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", b"%PDF-1.4 fake", client=client, db=db))
    result = _confirm_for_member(db, preview, member)

    assert result.added == 2
    assert result.skipped == 0
    assert db.query(Transaction).count() == 2
    types = {t.type for t in db.query(Transaction).all()}
    assert types == {TransactionType.PURCHASE, TransactionType.REDEMPTION}


def test_confirm_import_rejects_pending_status_scheme_even_above_raw_threshold():
    db = _session()
    # 6 Oct: a held fund with nothing to offer imports as "unlisted"; one that
    # has a candidate (same AMC and base name as a master fund) still asks.
    seed_master_scheme(db)
    member = _household_member(db)
    result = _sample_parse_result()
    result.schemes[0].isin, result.schemes[0].amfi = "INF_UNKNOWN", None
    result.schemes[0].close_units = Decimal("10")
    result.transactions[0].isin = "INF_UNKNOWN"
    preview = asyncio.run(build_import_preview(result, "test.pdf", b"%PDF", db=db))
    preview.schemes[0].match_confidence = 0.95
    assert preview.schemes[0].match_status == "pending" and preview.schemes[0].match_confidence == 0.95
    with pytest.raises(SchemeConfidenceError):
        _confirm_for_member(db, preview, member)
    _assert_only_preview_remains(db, preview)




def test_confirm_import_separate_folios_for_same_scheme_via_different_distributors():
    """FR-8: two folios holding the same scheme name via two different
    distributors (two different ARN codes) each get their own Folio row with
    their own arn_code, sharing one Scheme row — not merged."""

    db = _session()
    seed_master_scheme(db)
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

    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", b"%PDF-1.4 fake", client=client, db=db))
    result = _confirm_for_member(db, preview, member)

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

    db = _session()
    seed_master_scheme(db)
    from datetime import timedelta

    from app.services.import_.service import _preview_sessions, _sweep_expired_sessions

    client = _mocked_client()
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=client, db=db))
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

    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=_mocked_client(), db=db))
    temp_id = preview.schemes[0].temp_id

    import pytest
    with pytest.raises(SchemeConfidenceError, match="was not found in AMFI"):
        _confirm_for_member(
            db, preview, member,
            scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, amfi_code="999999")],
        )


def test_confirm_import_accepts_override_amfi_code_when_name_plausibly_matches():
    """A genuinely found override code paired with a plausibly-matching name
    is accepted, and the existing master name is retained."""

    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=_mocked_client(), db=db))
    temp_id = preview.schemes[0].temp_id

    db.add(Scheme(amfi_code="222222", name='HDFC Flexi Cap Fund Direct Growth', amc_name="A", sebi_category="EQUITY", plan_type=SchemePlanType.REGULAR))
    db.commit()
    result = _confirm_for_member(
        db, preview, member,
        scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, amfi_code="222222")],
    )

    assert result.added == 1
    scheme = db.query(Scheme).filter_by(amfi_code="222222").one()
    assert scheme.name == 'HDFC Flexi Cap Fund Direct Growth'


def test_confirm_import_persists_canonical_name_when_override_code_disagrees_with_cas_name():
    """DATA-001's more concrete bug: `Scheme.name` was always the CAS-parsed
    name regardless of an override's corrected `amfi_code`, so a legitimate
    manual correction could still persist a `Scheme` row whose name doesn't
    match its code. When the override code's real (master-list) name is NOT
    plausibly similar to the CAS-parsed name, the canonical name must be
    persisted instead."""

    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=_mocked_client(), db=db))
    temp_id = preview.schemes[0].temp_id

    db.add(Scheme(amfi_code="222222", name='SBI Bluechip Fund - Regular Plan - Growth', amc_name="A", sebi_category="EQUITY", plan_type=SchemePlanType.REGULAR))
    db.commit()
    result = _confirm_for_member(
        db, preview, member,
        scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, amfi_code="222222")],
    )

    assert result.added == 1
    scheme = db.query(Scheme).filter_by(amfi_code="222222").one()
    assert scheme.name == "SBI Bluechip Fund - Regular Plan - Growth"

    assert db.query(Folio).one().plan_type == PlanType.REGULAR

def test_confirm_import_override_degrades_gracefully_when_master_list_not_cached():
    # Remote caches are irrelevant: a missing local-master code is always rejected.
    from app.services.import_.schemas import SchemeConfirmation
    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF", db=db))
    with pytest.raises(SchemeConfidenceError, match="was not found in AMFI"):
        _confirm_for_member(db, preview, member, [SchemeConfirmation(temp_id=preview.schemes[0].temp_id, amfi_code="333333")])
    _assert_only_preview_remains(db, preview)




def test_confirm_import_rejects_plan_type_override_contradicting_parsed_plan_name():
    """Combined fix for CLAUDE.md's "no server-side 409 backstop on plan-type
    override" gap: the sample scheme's own CAS-parsed name unambiguously says
    "Direct Plan" (plan_name_variant="direct"). An override claiming
    "regular" contradicts that unambiguous signal and must be rejected."""

    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=_mocked_client(), db=db))
    temp_id = preview.schemes[0].temp_id

    import pytest
    with pytest.raises(SchemeConfidenceError, match="contradicts"):
        _confirm_for_member(
            db, preview, member,
            scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, plan_type_override=PlanType.REGULAR)],
        )


def test_confirm_import_accepts_plan_type_override_matching_parsed_plan_name():
    """Sanity check: an override that agrees with the CAS-parsed plan name is
    never rejected by the new backstop."""

    from app.services.import_.schemas import SchemeConfirmation

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    preview = asyncio.run(build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=_mocked_client(), db=db))
    temp_id = preview.schemes[0].temp_id

    result = _confirm_for_member(
        db, preview, member,
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
    seed_master_scheme(db)
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
    preview = asyncio.run(build_import_preview(parse_result, "test.pdf", b"%PDF-1.4 fake", client=_mocked_client(), db=db))
    temp_id = preview.schemes[0].temp_id

    result = _confirm_for_member(
        db, preview, member,
        scheme_confirmations=[SchemeConfirmation(temp_id=temp_id, plan_type_override=PlanType.REGULAR)],
    )

    assert result.added == 1
    folio = db.query(Folio).filter_by(folio_number="123/45").one()
    assert folio.plan_type.value == "regular"


def test_confirm_import_returns_generic_cross_account_warning():

    db = _session()
    seed_master_scheme(db)
    selected_member = _household_member(db)
    other_user = User(
        id=uuid.uuid4(),
        phone_number="+919000000001",
        created_at=datetime.now(timezone.utc),
    )
    other_member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=other_user.id,
        name="Private Other Account",
        relationship=Relationship.SELF,
        created_at=datetime.now(timezone.utc),
    )
    scheme = db.query(Scheme).filter_by(amfi_code="125497").one()
    db.add_all([other_user, other_member, scheme])
    db.flush()
    db.add(
        Folio(
            id=uuid.uuid4(),
            household_member_id=other_member.id,
            scheme_id=scheme.id,
            folio_number="123/45",
            plan_type=PlanType.DIRECT,
        )
    )
    db.commit()
    preview = asyncio.run(
        build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=_mocked_client(), db=db)
    )

    _persist_preview(db, preview, selected_member)
    result = confirm_import(
        db,
        preview.session_id,
        selected_member.id,
        scheme_confirmations=[],
        user_id=selected_member.user_id,
    )

    assert result.warnings == []
    assert db.query(Import).one().status == ImportStatus.CONFIRMED


def test_confirm_import_returns_no_warning_without_cross_account_match():

    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    preview = asyncio.run(
        build_import_preview(_sample_parse_result(), "test.pdf", b"%PDF-1.4 fake", client=_mocked_client(), db=db)
    )

    _persist_preview(db, preview, member)
    result = confirm_import(
        db,
        preview.session_id,
        member.id,
        scheme_confirmations=[],
        user_id=member.user_id,
    )

    assert result.warnings == []


from dataclasses import replace as _replace


def _with_pan(parse_result, pan):
    return _replace(parse_result, investor=_replace(parse_result.investor, pan=pan))


def _db_member(db, *, name="Test Investor", relationship=Relationship.SELF, user=None):
    # Default name = the sample CAS's holder, so a first upload finds Me by
    # name (Task 6 people detection) rather than raising U2.
    if user is None:
        user = User(id=uuid.uuid4(), phone_number=f"+91{uuid.uuid4().int % 10**10:010d}",
                    created_at=datetime.now(timezone.utc))
        db.add(user)
        db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name=name,
                             relationship=relationship, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _start(db, member, parse_result):
    seed_master_scheme(db)
    return asyncio.run(start_import_session(
        db, member.user_id, member, parse_result, "cas.pdf", b"%PDF-1.4 fake", client=_mocked_client(),
    ))


def test_pending_pan_ttl_outlives_the_preview_session():
    assert PENDING_PAN_TTL > timedelta(minutes=SESSION_TTL_MINUTES)


def test_start_import_session_claims_pan_as_pending_and_binds_session(db_session):
    member = _db_member(db_session)
    preview = _start(db_session, member, _with_pan(_sample_parse_result(), "ABCDE1234F"))

    db_session.refresh(member)
    assert member.pan_lookup_hash == hash_pan("ABCDE1234F")
    assert member.pan_pending_until is not None
    session = _preview_sessions[preview.session_id]
    assert session["household_member_id"] == member.id
    assert session["user_id"] == member.user_id


def test_start_import_session_conflict_creates_no_session(db_session):
    me = _db_member(db_session)
    spouse = _db_member(db_session, name="Priya", relationship=Relationship.SPOUSE,
                        user=db_session.get(User, me.user_id))
    spouse.pan_encrypted = encrypt_pan("BCDEF2222B")
    spouse.pan_lookup_hash = hash_pan("BCDEF2222B")
    db_session.commit()
    before = set(_preview_sessions)

    with pytest.raises(PanBelongsToOtherMemberError):
        _start(db_session, me, _with_pan(_sample_parse_result(), "BCDEF2222B"))

    assert set(_preview_sessions) == before
    db_session.refresh(me)
    assert me.pan_lookup_hash is None


def test_fresh_account_first_import_confirms_straight_through(db_session):
    # Regression for the 2026-09-23 staging bug: a brand-new member with no
    # PAN and no folios must be able to import their first CAS.
    # Rewritten for Task 6/7 (F21): a CAS name unrelated to the onboarding
    # name is now U2 (self_name_mismatch, session kept, nothing claimed), and
    # "Use this name" then lets the same review confirm straight through.
    from app.services.import_.service import ImportPromptError, resolve_name

    member = _db_member(db_session, name="Me")
    with pytest.raises(ImportPromptError) as prompt:
        _start(db_session, member, _with_pan(_sample_parse_result(), "ABCDE1234F"))
    assert prompt.value.code == "self_name_mismatch"
    db_session.refresh(member)
    assert member.pan_lookup_hash is None

    preview = resolve_name(db_session, prompt.value.session_id, member.user_id, "Test Investor")
    result = confirm_import(db_session, preview.session_id, member.id, scheme_confirmations=[],
                            user_id=member.user_id)

    assert result.added == 1
    db_session.refresh(member)
    assert member.name == "Test Investor"
    assert member.pan_lookup_hash == hash_pan("ABCDE1234F")
    assert member.pan_pending_until is None


def test_confirm_rejects_session_bound_to_another_member(db_session):
    member = _db_member(db_session)
    other = _db_member(db_session, name="Mom", relationship=Relationship.PARENT,
                       user=db_session.get(User, member.user_id))
    preview = _start(db_session, member, _sample_parse_result())

    with pytest.raises(ValueError):
        confirm_import(db_session, preview.session_id, other.id, scheme_confirmations=[],
                       user_id=member.user_id)


def test_confirm_rejects_expired_session(db_session):
    member = _db_member(db_session)
    preview = _start(db_session, member, _sample_parse_result())
    _preview_sessions[preview.session_id]["created_at"] -= timedelta(minutes=SESSION_TTL_MINUTES + 1)

    with pytest.raises(ValueError):
        confirm_import(db_session, preview.session_id, member.id, scheme_confirmations=[],
                       user_id=member.user_id)
    assert preview.session_id not in _preview_sessions


def test_discard_releases_pending_pan_and_drops_session(db_session):
    member = _db_member(db_session)
    preview = _start(db_session, member, _with_pan(_sample_parse_result(), "ABCDE1234F"))

    discard_import_session(db_session, preview.session_id, member.user_id)

    assert preview.session_id not in _preview_sessions
    db_session.refresh(member)
    assert member.pan_lookup_hash is None


def test_discard_ignores_other_users_session(db_session):
    member = _db_member(db_session)
    preview = _start(db_session, member, _with_pan(_sample_parse_result(), "ABCDE1234F"))

    discard_import_session(db_session, preview.session_id, uuid.uuid4())

    assert preview.session_id in _preview_sessions
    db_session.refresh(member)
    assert member.pan_lookup_hash == hash_pan("ABCDE1234F")


def test_discard_unknown_session_is_a_noop(db_session):
    discard_import_session(db_session, "does-not-exist", uuid.uuid4())


def test_confirm_after_sibling_session_discard_still_stores_pan(db_session):
    # Review Focus 1: two review sessions for the same member + PAN.
    member = _db_member(db_session)
    first = _start(db_session, member, _with_pan(_sample_parse_result(), "ABCDE1234F"))
    second = _start(db_session, member, _with_pan(_sample_parse_result(), "ABCDE1234F"))

    discard_import_session(db_session, first.session_id, member.user_id)
    confirm_import(db_session, second.session_id, member.id, scheme_confirmations=[],
                   user_id=member.user_id)

    db_session.refresh(member)
    assert member.pan_lookup_hash == hash_pan("ABCDE1234F")
    assert member.pan_pending_until is None


def test_start_import_session_does_not_hold_the_claim_during_scheme_enrichment(db_session):
    member = _db_member(db_session)
    seed_master_scheme(db_session)
    seen = []
    result = _with_pan(_sample_parse_result(), "ABCDE1234F")
    result.schemes[0].valuation_date, result.schemes[0].valuation_nav = date(2026, 10, 5), Decimal("10")

    async def fetch(code):
        seen.append(member.pan_lookup_hash)
        return None

    with patch("app.services.import_.service._fetch_nav_history", new=fetch):
        asyncio.run(start_import_session(db_session, member.user_id, member, result, "cas.pdf", b"%PDF"))
    assert seen == [None]




def test_gift_row_priced_from_nav_history_at_preview():
    """#3: a GIFT_IN the CAS printed without a NAV is priced at the fund's NAV
    on the gift date (decided 5 Oct)."""

    db = _session()
    seed_master_scheme(db)
    from dataclasses import replace as _replace
    from datetime import date as _date
    from decimal import Decimal as _D
    from unittest.mock import AsyncMock as _AsyncMock, patch as _patch

    from app.models.enums import TransactionType as _TT
    from tests.api.import_helpers import family_result as _family_result

    result = _family_result([{"name": "ADITI SHARMA", "pan": "ABCDE1234K"}])
    tmpl = result.transactions[0]
    result.transactions = [_replace(tmpl, txn_type=_TT.GIFT_IN, txn_date=_date(2021, 4, 1), units=_D("1500.000"),
                                    amount=_D("0.00"), nav=_D("0.0000"), needs_price=True)]
    client = AsyncMock()
    with _patch("app.services.import_.service._fetch_nav_history",
                new=_AsyncMock(return_value=[(_date(2021, 3, 31), _D("20")), (_date(2021, 4, 2), _D("21"))])):
        preview = asyncio.run(build_import_preview(result, "cas.pdf", b"%PDF", client, db=db))
    gift = _preview_sessions[preview.session_id]["parse_result"].transactions[0]
    assert gift.nav == _D("20.0000") and gift.amount == _D("30000.00") and not gift.needs_price


def test_gift_row_without_history_warns_and_stays_zero():

    db = _session()
    seed_master_scheme(db)
    from dataclasses import replace as _replace
    from datetime import date as _date
    from decimal import Decimal as _D
    from unittest.mock import AsyncMock as _AsyncMock, patch as _patch

    from app.models.enums import TransactionType as _TT
    from tests.api.import_helpers import family_result as _family_result

    result = _family_result([{"name": "ADITI SHARMA", "pan": "ABCDE1234K"}])
    tmpl = result.transactions[0]
    result.transactions = [_replace(tmpl, txn_type=_TT.GIFT_IN, txn_date=_date(2021, 4, 1), units=_D("1.000"),
                                    amount=_D("0.00"), nav=_D("0.0000"), needs_price=True)]
    client = AsyncMock()
    with _patch("app.services.import_.service._fetch_nav_history", new=_AsyncMock(return_value=None)):
        preview = asyncio.run(build_import_preview(result, "cas.pdf", b"%PDF", client, db=db))
    assert any("No price found for a gift" in w for w in preview.parse_warnings)



def test_mfapi_outage_does_not_make_isin_funds_pending(db_session):
    import httpx
    from app.models.enums import SchemePlanType
    db_session.add(Scheme(amfi_code="125497", isin="INF123", name="HDFC Flexi Cap Fund - Direct Plan - Growth",
                         plan_type=SchemePlanType.DIRECT, amc_name="HDFC AMC", sebi_category="EQUITY"))
    db_session.commit()
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(side_effect=httpx.ConnectError("down"))):
        preview = asyncio.run(build_import_preview(_sample_parse_result(), "cas.pdf", b"%PDF", db=db_session))
    assert preview.schemes[0].match_status == "confirmed" and preview.schemes[0].identified_by == "isin"


def test_preview_shares_one_nav_fetch_for_identification_opening_and_gift():
    db = _session()
    seed_master_scheme(db)
    result = _sample_parse_result()
    scheme = result.schemes[0]
    scheme.open_units = Decimal("10")
    scheme.valuation_date, scheme.valuation_nav = date(2026, 10, 5), Decimal("30")
    result.statement_from = date(2021, 4, 1)
    result.transactions[0] = replace(result.transactions[0], txn_type=TransactionType.GIFT_IN,
                                     txn_date=date(2021, 4, 1), needs_price=True, amount=Decimal("0"), nav=Decimal("0"))
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=[
        (date(2021, 3, 31), Decimal("20")), (date(2026, 10, 5), Decimal("30")),
    ])) as fetch:
        preview = asyncio.run(build_import_preview(result, "cas.pdf", b"%PDF", client=object(), db=db))
    fetch.assert_awaited_once_with("125497")
    assert preview.schemes[0].identified_by == "isin"
    assert result.transactions[0].nav == Decimal("20")
    assert _preview_sessions[preview.session_id]["opening_lots"][preview.schemes[0].temp_id].nav == Decimal("20")


def test_needs_review_only_when_a_held_fund_has_candidates_to_choose_from():
    # Phase 7 Task 2 + the 6 Oct decision: a held fund in no master and with
    # nothing to offer imports as "unlisted" (no question); a held fund with
    # candidates is the one case that asks; a closed unknown fund never asks.
    db = _session()
    seed_master_scheme(db)  # "HDFC Flexi Cap Fund", HDFC AMC
    result = _sample_parse_result()
    result.schemes[0].close_units = Decimal("10")
    unknown_held = ParsedScheme(
        name="Zephyr Emerging Opportunities Fund - Direct Plan - Growth", isin="INF000Z01ZZ9", amfi=None,
        scheme_type="EQUITY", folio="7700001", amc="Zephyr Mutual Fund", transaction_count=0,
        arn_code=None, plan_name_variant="direct", plan_type="direct", close_units=Decimal("5"),
    )
    result.schemes.append(unknown_held)

    def preview_for(r):
        with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=None)):
            return asyncio.run(build_import_preview(r, "cas.pdf", b"%PDF", db=db))

    unlisted = preview_for(result)
    assert [s.identification for s in unlisted.schemes] == ["verified", "unlisted"]
    assert unlisted.schemes[1].match_status == "confirmed"
    assert unlisted.needs_review is False

    # Same AMC and base name as the master scheme, but an unknown ISIN: one candidate.
    unknown_held.name, unknown_held.amc = "HDFC Flexi Cap Fund - Regular Plan - Growth", "HDFC AMC"
    unknown_held.isin = "INF999X01ZZ9"
    ask = preview_for(result)
    assert ask.schemes[1].identification == "ask"
    assert [c.amfi_code for c in ask.schemes[1].candidates] == ["125497"]
    assert ask.needs_review is True

    unknown_held.close_units = Decimal("0")
    assert preview_for(result).needs_review is False


def _unlisted_parse_result(name="Zephyr Emerging Opportunities Fund - Direct Plan - Growth",
                           isin="INF000Z01ZZ9", amc="Zephyr Mutual Fund"):
    txn = NormalizedTransaction(
        folio="7700001", amc=amc, scheme_name=name, isin=isin, amfi=None, scheme_type="EQUITY",
        txn_date=date(2024, 5, 6), txn_type=TransactionType.PURCHASE, description="Purchase",
        amount=Decimal("2000.00"), units=Decimal("100.000"), nav=Decimal("20.0000"),
    )
    scheme = ParsedScheme(
        name=name, isin=isin, amfi=None, scheme_type="EQUITY", folio="7700001", amc=amc, transaction_count=1,
        arn_code=None, plan_name_variant="direct", plan_type="direct", close_units=Decimal("100"),
        valuation_nav=Decimal("23.4100"), valuation_date=date(2026, 10, 5),
    )
    return ParseResult(
        investor=ParsedInvestor(name="Test Investor", email="t@example.com", pan_masked="ABCDE****F"),
        schemes=[scheme], transactions=[txn],
        raw_json='{"investor_info": {"name": "Test Investor"}, "folios": []}',
        parse_warnings=[], cas_type="DETAILED", file_type="FileType.CAMS",
    )


def test_unlisted_held_fund_imports_with_the_statement_prices():
    # Decided 6 Oct: a held fund in no master is imported, valued at the NAV the
    # statement prints, and the dashboard says the price is from the statement.
    from app.models.enums import SchemeSource
    from app.models.reference import NavHistory
    from app.services.dashboard.holdings import compute_holdings
    db = _session()
    member = _household_member(db)
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=None)):
        preview = asyncio.run(build_import_preview(_unlisted_parse_result(), "cas.pdf", b"%PDF", db=db))
    assert preview.needs_review is False
    result = _confirm_for_member(db, preview, member)
    assert result.added == 1
    scheme = db.query(Scheme).filter_by(isin="INF000Z01ZZ9").one()
    assert scheme.source == SchemeSource.CAS_ONLY and scheme.amfi_code is None
    prices = {(n.date, n.nav) for n in db.query(NavHistory).filter_by(scheme_id=scheme.id)}
    assert prices == {(date(2024, 5, 6), Decimal("20.0000")), (date(2026, 10, 5), Decimal("23.4100"))}
    [row] = asyncio.run(compute_holdings(db, [member.id]))
    assert Decimal(row.current_value) == Decimal("2341.00")
    assert row.price_from_statement is True and row.nav_unavailable is False


def test_not_listed_choice_imports_a_held_fund_as_unlisted():
    # The fallback dialog's "Not listed" for a held fund that has candidates.
    from app.models.enums import SchemeSource
    from app.services.import_.service import SchemeConfirmation
    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    parse = _unlisted_parse_result(name="HDFC Flexi Cap Fund - Regular Plan - Growth", isin="INF999X01ZZ9", amc="HDFC AMC")
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=None)):
        preview = asyncio.run(build_import_preview(parse, "cas.pdf", b"%PDF", db=db))
    assert preview.needs_review is True
    temp_id = preview.schemes[0].temp_id
    result = _confirm_for_member(db, preview, member, [SchemeConfirmation(temp_id=temp_id, unlisted=True)])
    assert result.added == 1
    assert db.query(Scheme).filter_by(isin="INF999X01ZZ9").one().source == SchemeSource.CAS_ONLY


def _import_unlisted(db, member, parse):
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=None)):
        preview = asyncio.run(build_import_preview(parse, "cas.pdf", b"%PDF", db=db))
    return _confirm_for_member(db, preview, member)


def test_unlisted_fund_joining_the_master_is_not_counted_twice():
    # 6B-decisions review H1: an NFO imported as unlisted, then added to the
    # AMFI master; the next statement must move the folio, not add a second one.
    from app.models.enums import SchemeSource
    db = _session()
    member = _household_member(db)
    _import_unlisted(db, member, _unlisted_parse_result())
    master = Scheme(id=uuid.uuid4(), amfi_code="999001", isin="INF000Z01ZZ9",
                    name="Zephyr Emerging Opportunities Fund - Direct Plan - Growth", base_name="Zephyr Emerging Opportunities Fund",
                    plan_type=SchemePlanType.DIRECT, amc_name="Zephyr Mutual Fund", sebi_category="Equity Scheme - Mid Cap Fund",
                    source=SchemeSource.AMFI)
    db.add(master)
    db.commit()
    later = _unlisted_parse_result()
    later.transactions.append(_replace(later.transactions[0], txn_date=date(2024, 6, 6), amount=Decimal("2100.00"),
                                       units=Decimal("100.000"), nav=Decimal("21.0000")))
    later.schemes[0].close_units, later.schemes[0].transaction_count = Decimal("200"), 2
    result = _import_unlisted(db, member, later)
    folios = db.query(Folio).filter_by(household_member_id=member.id).all()
    assert len(folios) == 1 and folios[0].scheme_id == master.id
    assert result.added == 1 and db.query(Transaction).count() == 2


def test_same_statement_with_a_newer_valuation_refreshes_an_unlisted_price():
    # Review M1: a re-downloaded statement with no new rows must still update
    # the unlisted fund's price, not answer "already imported".
    from app.models.reference import NavHistory
    db = _session()
    member = _household_member(db)
    _import_unlisted(db, member, _unlisted_parse_result())
    again = _unlisted_parse_result()
    again.schemes[0].valuation_date, again.schemes[0].valuation_nav = date(2026, 11, 5), Decimal("24.0000")
    _import_unlisted(db, member, again)
    scheme = db.query(Scheme).filter_by(isin="INF000Z01ZZ9").one()
    assert db.get(NavHistory, (scheme.id, date(2026, 11, 5))).nav == Decimal("24.0000")


def test_unlisted_fund_has_no_todays_gain():
    # Review M2: the move since the previous statement price isn't today's.
    from app.services.dashboard.holdings import compute_holdings
    db = _session()
    member = _household_member(db)
    _import_unlisted(db, member, _unlisted_parse_result())
    [row] = asyncio.run(compute_holdings(db, [member.id]))
    assert Decimal(row.today_gain) == 0


def test_only_printed_navs_become_statement_prices():
    # Review M3: a conversion leg's NAV is a cost basis the parser computed.
    from app.models.reference import NavHistory
    db = _session()
    member = _household_member(db)
    parse = _unlisted_parse_result()
    parse.transactions[0].nav_printed = False
    _import_unlisted(db, member, parse)
    scheme = db.query(Scheme).filter_by(isin="INF000Z01ZZ9").one()
    assert {n.date for n in db.query(NavHistory).filter_by(scheme_id=scheme.id)} == {date(2026, 10, 5)}


def test_not_listed_after_a_code_was_picked_keeps_one_folio():
    # 6 Oct re-review: the reverse of H1. The first statement's fund was given
    # an AMFI code; a later one says "Not listed": still the same folio.
    from app.services.import_.service import SchemeConfirmation
    db = _session()
    seed_master_scheme(db)
    member = _household_member(db)
    parse = _unlisted_parse_result(name="HDFC Flexi Cap Fund - Regular Plan - Growth", isin="INF999X01ZZ9", amc="HDFC AMC")
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=None)):
        first = asyncio.run(build_import_preview(parse, "cas.pdf", b"%PDF", db=db))
    _confirm_for_member(db, first, member, [SchemeConfirmation(temp_id=first.schemes[0].temp_id, amfi_code="125497")])
    later = _unlisted_parse_result(name="HDFC Flexi Cap Fund - Regular Plan - Growth", isin="INF999X01ZZ9", amc="HDFC AMC")
    later.transactions.append(_replace(later.transactions[0], txn_date=date(2024, 6, 6), amount=Decimal("2100.00"),
                                       units=Decimal("100.000"), nav=Decimal("21.0000")))
    later.schemes[0].close_units, later.schemes[0].transaction_count = Decimal("200"), 2
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=None)):
        second = asyncio.run(build_import_preview(later, "cas.pdf", b"%PDF", db=db))
    result = _confirm_for_member(db, second, member, [SchemeConfirmation(temp_id=second.schemes[0].temp_id, unlisted=True)])
    assert db.query(Folio).filter_by(household_member_id=member.id).count() == 1
    assert result.added == 1 and db.query(Transaction).count() == 2


def test_not_listed_reuse_keeps_the_confirmed_plan_and_identical_reupload_is_already_imported():
    # Review of the removal snapshot, findings 1-2: reusing the AMFI folio via
    # "Not listed" must not overwrite its confirmed plan, and the same
    # statement again is "already imported".
    from app.services.import_.confirm_people import AlreadyImportedError
    from app.services.import_.service import SchemeConfirmation
    db = _session()
    seed_master_scheme(db)  # 125497 is a Direct master scheme
    member = _household_member(db)
    parse = lambda: _unlisted_parse_result(name="HDFC Flexi Cap Fund - Growth", isin="INF999X01ZZ9", amc="HDFC AMC")
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=None)):
        first = asyncio.run(build_import_preview(parse(), "cas.pdf", b"%PDF", db=db))
    _confirm_for_member(db, first, member, [SchemeConfirmation(temp_id=first.schemes[0].temp_id, amfi_code="125497")])
    folio = db.query(Folio).one()
    assert (folio.plan_type.value, folio.plan_verified) == ("direct", True)
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=None)):
        again = asyncio.run(build_import_preview(parse(), "cas.pdf", b"%PDF", db=db))
    with pytest.raises(AlreadyImportedError):
        _confirm_for_member(db, again, member, [SchemeConfirmation(temp_id=again.schemes[0].temp_id, unlisted=True)])
    db.refresh(folio)
    assert (folio.plan_type.value, folio.plan_verified) == ("direct", True)
    assert db.query(Scheme).filter_by(isin="INF999X01ZZ9").count() == 0
