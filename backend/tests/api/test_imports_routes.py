import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import BackgroundTasks

from app.models.enums import TransactionType
from app.services.import_.parser import (
    NormalizedTransaction,
    ParsedInvestor,
    ParsedScheme,
    ParseError,
    ParseResult,
)


def _authed_headers(client, phone: str) -> dict[str, str]:
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    return {"Authorization": f"Bearer {token}"}


def _authed_headers_and_member(client, phone: str) -> tuple[dict[str, str], str]:
    headers = _authed_headers(client, phone)
    member = client.post(
        "/household-members",
        json={"name": "Self", "relationship": "self"},
        headers=headers,
    ).json()
    return headers, member["id"]


def test_parse_route_requires_auth(client):
    response = client.post(
        "/imports/parse",
        files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
        data={"password": "x"},
    )
    assert response.status_code == 401


def test_parse_route_rejects_non_pdf(client):
    headers = _authed_headers(client, "+919999999991")
    response = client.post(
        "/imports/parse",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"password": "x"},
        headers=headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_file"


def test_parse_route_surfaces_parse_error_as_422(client):
    headers = _authed_headers(client, "+919999999992")
    with patch(
        "app.api.imports.parse_cas_pdf_bytes",
        side_effect=ParseError("wrong_password", "Incorrect PDF password."),
    ):
        response = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={"password": "wrong"},
            headers=headers,
        )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "wrong_password"


def test_confirm_route_requires_auth(client):
    response = client.post(
        "/imports/confirm",
        json={"session_id": "x", "household_member_id": "00000000-0000-0000-0000-000000000000", "scheme_confirmations": []},
    )
    assert response.status_code == 401


def test_confirm_route_404s_on_unknown_session(client):
    headers, member_id = _authed_headers_and_member(client, "+919999999993")
    response = client.post(
        "/imports/confirm",
        json={"session_id": "does-not-exist", "household_member_id": member_id, "scheme_confirmations": []},
        headers=headers,
    )
    assert response.status_code == 404


def test_confirm_route_400s_on_malformed_household_member_id(client):
    headers = _authed_headers(client, "+919999999994")
    response = client.post(
        "/imports/confirm",
        json={"session_id": "x", "household_member_id": "not-a-uuid", "scheme_confirmations": []},
        headers=headers,
    )
    assert response.status_code == 400


def test_confirm_route_422s_on_malformed_plan_type_override(client):
    """Fix 3a: plan_type_override must be validated against the PlanType enum
    at the request boundary — a garbage string should never reach the service
    layer (where it used to raise an unhandled ValueError, indistinguishable
    from "session not found")."""
    headers, member_id = _authed_headers_and_member(client, "+919999999995")
    response = client.post(
        "/imports/confirm",
        json={
            "session_id": "x",
            "household_member_id": member_id,
            "scheme_confirmations": [{"temp_id": "t1", "plan_type_override": "not-a-real-plan-type"}],
        },
        headers=headers,
    )
    assert response.status_code == 422


def test_confirm_route_404s_when_household_member_belongs_to_another_user(client):
    """IDOR gate: a session token authenticates the caller, but
    household_member_id is still client-supplied — it must be checked against
    the authenticated user, not merely validated as a well-formed UUID."""
    _, other_users_member_id = _authed_headers_and_member(client, "+919999999996")
    headers = _authed_headers(client, "+919999999997")

    response = client.post(
        "/imports/confirm",
        json={"session_id": "does-not-exist", "household_member_id": other_users_member_id, "scheme_confirmations": []},
        headers=headers,
    )
    assert response.status_code == 404


def test_confirm_route_409s_on_low_confidence_scheme_without_override(client):
    """Fix 3b: SchemeConfidenceError (needs an AMFI override) is a distinct,
    fixable-by-the-client situation from "session not found" — it must surface
    as 409, not be swallowed into the same 404 as a missing/expired session."""
    from app.services.import_.service import SchemeConfidenceError

    headers, member_id = _authed_headers_and_member(client, "+919999999998")
    with patch("app.api.imports.confirm_import", side_effect=SchemeConfidenceError("needs an override")):
        response = client.post(
            "/imports/confirm",
            json={
                "session_id": "some-session",
                "household_member_id": member_id,
                "scheme_confirmations": [],
            },
            headers=headers,
        )
    assert response.status_code == 409


def test_confirm_route_schedules_nav_prefetch_after_successful_confirm():
    from app.api.imports import confirm_import_route
    from app.services.import_.schemas import ImportConfirmRequest, ImportConfirmResponse

    member_id = uuid.uuid4()
    body = ImportConfirmRequest(
        session_id="session-1",
        household_member_id=str(member_id),
        scheme_confirmations=[],
    )
    background_tasks = BackgroundTasks()
    user = MagicMock(id=uuid.uuid4())
    request_db = MagicMock()
    response = ImportConfirmResponse(added=1, skipped=0, import_id=str(uuid.uuid4()))

    with (
        patch("app.api.imports.get_household_member_for_user", return_value=MagicMock()),
        patch("app.api.imports.confirm_import", return_value=response),
    ):
        result = confirm_import_route(body, background_tasks, user, request_db)

    assert result == response
    assert len(background_tasks.tasks) == 1
    task = background_tasks.tasks[0]
    assert task.func.__name__ == "_prefetch_member_nav_history"
    assert task.args == (member_id,)
    assert request_db not in task.args


def test_nav_prefetch_uses_fresh_session_and_never_raises():
    import asyncio

    from app.api.imports import _prefetch_member_nav_history

    fresh_db = MagicMock()
    fresh_db.query.return_value.join.return_value.filter.return_value.all.return_value = []

    with patch("app.api.imports.SessionLocal", return_value=fresh_db) as session_factory:
        asyncio.run(_prefetch_member_nav_history(uuid.uuid4()))

    session_factory.assert_called_once_with()
    fresh_db.close.assert_called_once_with()

    broken_db = MagicMock()
    broken_db.query.side_effect = RuntimeError("database unavailable")
    with patch("app.api.imports.SessionLocal", return_value=broken_db):
        asyncio.run(_prefetch_member_nav_history(uuid.uuid4()))
    broken_db.close.assert_called_once_with()


def test_nav_prefetch_invalidates_only_when_a_newer_nav_lands():
    import asyncio

    from app.api.imports import _prefetch_member_nav_history

    member_id = uuid.uuid4()
    scheme = MagicMock(id=uuid.uuid4())
    fresh_db = MagicMock()
    fresh_db.query.return_value.join.return_value.filter.return_value.all.return_value = [scheme]

    with (
        patch("app.api.imports.SessionLocal", return_value=fresh_db),
        patch("app.api.imports._latest_nav_dates", side_effect=[{scheme.id: date(2024, 1, 1)}, {scheme.id: date(2024, 1, 2)}]),
        patch("app.api.imports.get_navs_on_or_before", new=AsyncMock()),
        patch("app.api.imports.invalidate_holdings_cache") as invalidate,
    ):
        asyncio.run(_prefetch_member_nav_history(member_id))
    invalidate.assert_called_once_with(member_id)

    with (
        patch("app.api.imports.SessionLocal", return_value=fresh_db),
        patch("app.api.imports._latest_nav_dates", side_effect=[{scheme.id: date(2024, 1, 2)}, {scheme.id: date(2024, 1, 2)}]),
        patch("app.api.imports.get_navs_on_or_before", new=AsyncMock()),
        patch("app.api.imports.invalidate_holdings_cache") as invalidate,
    ):
        asyncio.run(_prefetch_member_nav_history(member_id))
    invalidate.assert_not_called()


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


def test_parse_then_confirm_lands_a_transaction_in_the_real_db(client, tmp_path):
    """Route -> service -> DB integration test. Only parse_cas_pdf_bytes and
    the MfApiClient's network-touching methods are mocked — build_import_preview
    and confirm_import run for real against a real (test) database via the
    shared `client` fixture's DB override. This is exactly the kind of test
    that would have caught Fix 1's dedupe race: the pre-fix route tests never
    reached a real DB."""
    from app.models.transaction import Transaction
    from app.services.import_.enrich import mfapi_client

    headers, member_id = _authed_headers_and_member(client, "+919999999999")

    # Only the network boundary is mocked (MfApiClient._get_json) — resolve_scheme
    # and get_scheme_category run for real. The sample scheme carries
    # amfi="125497" from the CAS; resolve_scheme now cross-checks that code
    # against the master list's own name for it (DATA-001 fix) before
    # short-circuiting to "confirmed", so the mocked scheme-list response must
    # contain a plausibly-matching (code, name) pair, not just the category
    # lookup's payload.
    async def _fake_get_json(_self, url):
        if url.endswith("/latest"):
            return {"meta": {"scheme_category": "Equity Scheme - Flexi Cap Fund"}}
        return [{"schemeCode": "125497", "schemeName": "HDFC Flexi Cap Fund - Direct Plan - Growth"}]

    # Review finding (round 2): the module-level `mfapi_client` singleton's
    # default disk cache (backend/.cache/mfapi/) is real and gitignored, but
    # NOT test-isolated — a prior run's mocked payload can persist there for
    # 24h (its TTL) and silently feed a *different* shape into a later run.
    # Redirect it to a per-test tmp_path and reset any in-process cache this
    # or an earlier test may have already populated.
    with (
        patch("app.api.imports.parse_cas_pdf_bytes", return_value=_sample_parse_result()),
        patch(
            "app.services.import_.enrich.MfApiClient._get_json",
            new=_fake_get_json,
        ),
        patch.object(mfapi_client, "cache_dir", tmp_path),
        patch.object(mfapi_client, "_schemes", None),
    ):
        parse_response = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={"password": "x"},
            headers=headers,
        )
        assert parse_response.status_code == 200
        session_id = parse_response.json()["session_id"]

        confirm_response = client.post(
            "/imports/confirm",
            json={
                "session_id": session_id,
                "household_member_id": member_id,
                "scheme_confirmations": [],
            },
            headers=headers,
        )
        assert confirm_response.status_code == 200
        assert confirm_response.json()["added"] == 1

    from app.db.session import get_db
    from app.main import app

    override = app.dependency_overrides[get_db]
    db = next(override())
    try:
        assert db.query(Transaction).count() == 1
    finally:
        db.close()
