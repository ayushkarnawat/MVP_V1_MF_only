import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.enums import Relationship, TransactionType
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.import_.parser import (
    NormalizedTransaction,
    ParsedInvestor,
    ParsedScheme,
    ParseError,
    ParseResult,
)

client = TestClient(app)


def test_parse_route_rejects_non_pdf():
    response = client.post(
        "/imports/parse",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"password": "x"},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_file"


def test_parse_route_surfaces_parse_error_as_422():
    with patch(
        "app.api.imports.parse_cas_pdf_bytes",
        side_effect=ParseError("wrong_password", "Incorrect PDF password."),
    ):
        response = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={"password": "wrong"},
        )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "wrong_password"


def test_confirm_route_404s_on_unknown_session():
    response = client.post(
        "/imports/confirm",
        json={"session_id": "does-not-exist", "household_member_id": "00000000-0000-0000-0000-000000000000", "scheme_confirmations": []},
    )
    assert response.status_code == 404


def test_confirm_route_400s_on_malformed_household_member_id():
    response = client.post(
        "/imports/confirm",
        json={"session_id": "x", "household_member_id": "not-a-uuid", "scheme_confirmations": []},
    )
    assert response.status_code == 400


def test_confirm_route_422s_on_malformed_plan_type_override():
    """Fix 3a: plan_type_override must be validated against the PlanType enum
    at the request boundary — a garbage string should never reach the service
    layer (where it used to raise an unhandled ValueError, indistinguishable
    from "session not found")."""
    response = client.post(
        "/imports/confirm",
        json={
            "session_id": "x",
            "household_member_id": "00000000-0000-0000-0000-000000000000",
            "scheme_confirmations": [{"temp_id": "t1", "plan_type_override": "not-a-real-plan-type"}],
        },
    )
    assert response.status_code == 422


def test_confirm_route_409s_on_low_confidence_scheme_without_override():
    """Fix 3b: SchemeConfidenceError (needs an AMFI override) is a distinct,
    fixable-by-the-client situation from "session not found" — it must surface
    as 409, not be swallowed into the same 404 as a missing/expired session."""
    from app.services.import_.service import SchemeConfidenceError

    with patch("app.api.imports.confirm_import", side_effect=SchemeConfidenceError("needs an override")):
        response = client.post(
            "/imports/confirm",
            json={
                "session_id": "some-session",
                "household_member_id": "00000000-0000-0000-0000-000000000000",
                "scheme_confirmations": [],
            },
        )
    assert response.status_code == 409


def _sample_parse_result() -> ParseResult:
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


def test_parse_then_confirm_lands_a_transaction_in_the_real_db():
    """Route -> service -> DB integration test. Only parse_cas_pdf_bytes and
    the MfApiClient's network-touching methods are mocked — build_import_preview
    and confirm_import run for real against a real (test) database via
    app.dependency_overrides[get_db]. This is exactly the kind of test that
    would have caught Fix 1's dedupe race: the pre-fix route tests never
    reached a real DB."""
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    # autoflush=False to match production's real SessionLocal (app/db/session.py).
    TestSessionLocal = sessionmaker(autoflush=False, bind=engine)

    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    setup_db = TestSessionLocal()
    user = User(id=uuid.uuid4(), phone_number="+919999999998", created_at=datetime.now(timezone.utc))
    setup_db.add(user)
    setup_db.flush()
    member = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Self",
        relationship=Relationship.SELF, created_at=datetime.now(timezone.utc),
    )
    setup_db.add(member)
    setup_db.commit()
    member_id = member.id
    setup_db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        # Only the network boundary is mocked (MfApiClient._get_json) — resolve_scheme
        # and get_scheme_category run for real. The sample scheme carries
        # amfi="125497" from the CAS, so resolve_scheme's amfi_from_cas
        # short-circuit fires without calling _get_json at all; get_scheme_category
        # does call it (for the category lookup), which is what this mocks.
        with (
            patch("app.api.imports.parse_cas_pdf_bytes", return_value=_sample_parse_result()),
            patch(
                "app.services.import_.enrich.MfApiClient._get_json",
                new=AsyncMock(return_value={"meta": {"scheme_category": "Equity Scheme - Flexi Cap Fund"}}),
            ),
        ):
            parse_response = client.post(
                "/imports/parse",
                files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
                data={"password": "x"},
            )
            assert parse_response.status_code == 200
            session_id = parse_response.json()["session_id"]

            confirm_response = client.post(
                "/imports/confirm",
                json={
                    "session_id": session_id,
                    "household_member_id": str(member_id),
                    "scheme_confirmations": [],
                },
            )
            assert confirm_response.status_code == 200
            assert confirm_response.json()["added"] == 1
    finally:
        app.dependency_overrides.pop(get_db, None)

    verify_db = TestSessionLocal()
    try:
        assert verify_db.query(Transaction).count() == 1
    finally:
        verify_db.close()
