import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import BackgroundTasks

from app.models.enums import TransactionType
from app.services.import_ import file_storage as file_storage_module
from app.services.import_.parser import (
    NormalizedTransaction,
    ParsedInvestor,
    ParsedScheme,
    ParseError,
    ParseResult,
)

# Moved to import_helpers.py (Task 6) so test_imports_people_routes.py shares them.
from .import_helpers import PAN_DISCLAIMER_VERSION, _authed_headers, _authed_headers_and_member, _parse, _test_db


@pytest.fixture(autouse=True)
def isolate_cas_file_storage(tmp_path, monkeypatch):
    """Prevent test_parse_then_confirm_lands_a_transaction_in_the_real_db (the
    only test here that reaches confirm_import's real success path) from
    writing to disk via the module-level default_file_storage singleton --
    same isolation Task 6/7 needed elsewhere, since the singleton captures
    settings.cas_file_storage_dir once at import time (monkeypatching the
    setting itself would silently no-op)."""
    monkeypatch.setattr(file_storage_module.default_file_storage, "_base_dir", tmp_path)


def test_parse_route_requires_auth(client):
    response = client.post(
        "/imports/parse",
        files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
        data={"password": "x"},
    )
    assert response.status_code == 401


def test_parse_route_rejects_non_pdf(client):
    headers, member_id = _authed_headers_and_member(client, "+919999999991")
    response = client.post(
        "/imports/parse",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"password": "x", "household_member_id": member_id},
        headers=headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_file"


def test_parse_route_rejects_spoofed_pdf_content(client):
    headers, member_id = _authed_headers_and_member(client, "+919999999981")
    with patch("app.api.imports.parse_cas_pdf_bytes") as parser:
        response = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"not-a-pdf", "application/pdf")},
            data={"password": "x", "household_member_id": member_id},
            headers=headers,
        )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_file"
    parser.assert_not_called()


def test_parse_route_rejects_oversized_pdf(client):
    headers, member_id = _authed_headers_and_member(client, "+919999999982")
    with (
        patch("app.services.import_.lifecycle_service.MAX_FILE_SIZE_BYTES", 8),
        patch("app.api.imports.parse_cas_pdf_bytes") as parser,
    ):
        response = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-too-large", "application/pdf")},
            data={"password": "x", "household_member_id": member_id},
            headers=headers,
        )

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "file_too_large"
    parser.assert_not_called()


def test_parse_route_surfaces_parse_error_as_422(client):
    headers, member_id = _authed_headers_and_member(client, "+919999999992")
    with patch(
        "app.api.imports.parse_cas_pdf_bytes",
        side_effect=ParseError("wrong_password", "Incorrect PDF password."),
    ):
        response = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={"password": "wrong", "household_member_id": member_id, "pan_disclaimer_version": PAN_DISCLAIMER_VERSION},
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


def test_confirm_route_410s_on_unknown_session(client):
    # Task 7 (C2): an unknown or expired review is 410 session_expired, not
    # the old 404 (renamed from test_confirm_route_404s_on_unknown_session).
    headers, member_id = _authed_headers_and_member(client, "+919999999993")
    response = client.post(
        "/imports/confirm",
        json={"session_id": "does-not-exist", "household_member_id": member_id, "scheme_confirmations": []},
        headers=headers,
    )
    assert response.status_code == 410
    assert response.json()["detail"] == {"code": "session_expired", "message": "This review has expired"}


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
        patch("app.api.imports.try_claim_recompute", return_value=True),
    ):
        result = confirm_import_route(body, background_tasks, user, request_db)

    assert result == response
    assert len(background_tasks.tasks) == 3
    prefetch_task, snapshot_task, dispatch_task = background_tasks.tasks
    assert snapshot_task.func.__name__ == "rebuild_member_snapshots"
    assert snapshot_task.args == (member_id,)
    assert prefetch_task.func.__name__ == "_prefetch_member_nav_history"
    assert prefetch_task.args == (member_id,)
    assert dispatch_task.args == (user.id,)


def test_confirm_route_does_not_dispatch_recompute_when_one_already_in_flight():
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
        patch("app.api.imports.try_claim_recompute", return_value=False),
    ):
        confirm_import_route(body, background_tasks, user, request_db)

    assert len(background_tasks.tasks) == 2
    assert background_tasks.tasks[0].func.__name__ == "_prefetch_member_nav_history"


def _sqlite_session_factory():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.db.base import Base

    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)


def _claimed_user(session_factory) -> uuid.UUID:
    from datetime import datetime, timezone

    from app.models.user import User
    from app.services.analytics.recompute import try_claim_recompute

    db = session_factory()
    user_id = uuid.uuid4()
    user = User(id=user_id, phone_number=f"+9199{uuid.uuid4().hex[:8]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.commit()
    assert try_claim_recompute(db, user_id) is True
    db.close()
    return user_id


def test_dispatch_and_release_on_failure_releases_the_claim_when_dispatch_fails():
    """Round-2 review's High finding, exercised at the CAS-import background-
    task layer specifically: confirm_import_route already committed the
    claim via try_claim_recompute before scheduling this task -- if
    dispatch never actually places the ECS task, the claim must not sit
    orphaned for up to the 2-hour staleness ceiling."""
    from app.api.imports import _dispatch_recompute_and_release_claim_on_failure
    from app.models.analytics import AnalyticsRecomputeStatus

    session_factory = _sqlite_session_factory()
    user_id = _claimed_user(session_factory)

    with (
        patch("app.api.imports.dispatcher.dispatch", return_value=False),
        patch("app.api.imports.SessionLocal", side_effect=session_factory),
    ):
        _dispatch_recompute_and_release_claim_on_failure(user_id)

    check_db = session_factory()
    status = check_db.get(AnalyticsRecomputeStatus, user_id)
    check_db.close()
    assert status.started_at is None


def test_dispatch_and_release_on_failure_leaves_the_claim_when_dispatch_succeeds():
    from app.api.imports import _dispatch_recompute_and_release_claim_on_failure
    from app.models.analytics import AnalyticsRecomputeStatus

    session_factory = _sqlite_session_factory()
    user_id = _claimed_user(session_factory)

    with (
        patch("app.api.imports.dispatcher.dispatch", return_value=True),
        patch("app.api.imports.SessionLocal", side_effect=session_factory),
    ):
        _dispatch_recompute_and_release_claim_on_failure(user_id)

    check_db = session_factory()
    status = check_db.get(AnalyticsRecomputeStatus, user_id)
    check_db.close()
    assert status.started_at is not None


def test_dispatch_and_release_on_failure_never_raises_when_the_session_itself_errors():
    """This runs as a fire-and-forget background task (see
    `_prefetch_member_nav_history`'s identical posture) -- an unhandled
    exception here must never propagate, or a DB hiccup on this narrow
    release path would crash the background-task runner mid-request
    instead of just leaving the claim to expire via the staleness ceiling."""
    from app.api.imports import _dispatch_recompute_and_release_claim_on_failure

    with (
        patch("app.api.imports.dispatcher.dispatch", return_value=False),
        patch("app.api.imports.SessionLocal", side_effect=RuntimeError("boom")),
    ):
        _dispatch_recompute_and_release_claim_on_failure(uuid.uuid4())  # must not raise


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
            data={"password": "x", "household_member_id": member_id, "pan_disclaimer_version": PAN_DISCLAIMER_VERSION},
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


def _sample_with_pan(pan):
    from dataclasses import replace

    sample = _sample_parse_result()
    return replace(sample, investor=replace(sample.investor, pan=pan))


def test_parse_route_requires_household_member_id(client):
    headers = _authed_headers(client, "+919999999971")
    response = client.post(
        "/imports/parse",
        files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
        data={"password": "x"},
        headers=headers,
    )
    assert response.status_code == 422


def test_parse_route_404s_for_another_users_member(client):
    _, other_member_id = _authed_headers_and_member(client, "+919999999972")
    headers = _authed_headers(client, "+919999999973")
    response = client.post(
        "/imports/parse",
        files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
        data={"password": "x", "household_member_id": other_member_id},
        headers=headers,
    )
    assert response.status_code == 404


def test_parse_route_maps_cross_account_pan_to_409_without_leaking(client, tmp_path):
    headers_a, member_a = _authed_headers_and_member(client, "+919999999974")
    assert _parse(client, headers_a, member_a, _sample_with_pan("ZZZZZ9999Z"), tmp_path).status_code == 200

    headers_b, member_b = _authed_headers_and_member(client, "+919999999975")
    response = _parse(client, headers_b, member_b, _sample_with_pan("ZZZZZ9999Z"), tmp_path)

    # Task 6 (F30): Me is found in the file by name, and Me's PAN is another
    # account's -> still today's 409 with the review session dropped.
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "cross_account_pan_blocked"
    assert member_a not in response.text


def test_parse_route_maps_same_account_pan_to_409(client, tmp_path):
    # Rewritten for Task 6 (F21). Before people detection, uploading self's
    # own CAS "for Mom" was 409 pan_belongs_to_other_member. Now the file's
    # person is recognised as Me by PAN, and the prompt is that Mom isn't in
    # this statement (U5, session kept); acknowledging it imports the
    # statement for the people actually in it, i.e. attaches it to Me.
    headers, self_id = _authed_headers_and_member(client, "+919999999976")
    mom_id = client.post(
        "/household-members", json={"name": "Mom", "relationship": "parent"}, headers=headers,
    ).json()["id"]
    first = _parse(client, headers, self_id, _sample_with_pan("ABCDE1234F"), tmp_path)
    assert first.status_code == 200
    confirm = client.post(
        "/imports/confirm",
        json={"session_id": first.json()["session_id"], "household_member_id": self_id, "scheme_confirmations": []},
        headers=headers,
    )
    assert confirm.status_code == 200

    response = _parse(client, headers, mom_id, _sample_with_pan("ABCDE1234F"), tmp_path)

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "member_not_in_file"
    ack = client.post(
        f"/imports/sessions/{detail['session_id']}/acknowledge", json={"code": "member_not_in_file"},
        headers=headers,
    )
    assert ack.status_code == 200
    me = ack.json()["people"][0]
    assert me["is_me"] is True and me["member_id"] == self_id


def test_discard_route_returns_204_and_frees_the_pan(client, tmp_path):
    # Rewritten for Task 6 (F21): the second upload used to go "for Mom" in
    # the same account, which is now U5 (Mom isn't in the file) regardless of
    # the claim. "Freed" is checked where it matters instead: another
    # account can now claim the PAN (it would be cross_account_pan_blocked
    # if the discarded session still held it).
    headers, self_id = _authed_headers_and_member(client, "+919999999977")
    session_id = _parse(client, headers, self_id, _sample_with_pan("ABCDE1234F"), tmp_path).json()["session_id"]

    discard = client.post(f"/imports/sessions/{session_id}/discard", headers=headers)

    assert discard.status_code == 204
    headers_b, self_b = _authed_headers_and_member(client, "+919999999979")
    assert _parse(client, headers_b, self_b, _sample_with_pan("ABCDE1234F"), tmp_path).status_code == 200


def test_discard_route_is_idempotent_for_unknown_sessions(client):
    headers = _authed_headers(client, "+919999999978")
    assert client.post("/imports/sessions/nope/discard", headers=headers).status_code == 204


# ---------------------------------------------- Task 9: PAN-disclaimer consent at upload

def _consent_rows(user_id):
    from app.models.consent import ConsentRecord

    db = _test_db()
    try:
        return db.query(ConsentRecord).filter_by(user_id=user_id).order_by(ConsentRecord.recorded_at).all()
    finally:
        db.close()


def _user_id(client, headers):
    return uuid.UUID(client.get("/auth/me", headers=headers).json()["user_id"])


def test_parse_without_disclaimer_is_422_and_records_nothing(client):
    headers, member_id = _authed_headers_and_member(client, "+919999999901")
    with patch("app.api.imports.parse_cas_pdf_bytes") as parser:
        response = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={"password": "x", "household_member_id": member_id},
            headers=headers,
        )
        stale = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={"password": "x", "household_member_id": member_id, "pan_disclaimer_version": "pan-old"},
            headers=headers,
        )

    for r in (response, stale):
        assert r.status_code == 422
        detail = r.json()["detail"]
        assert detail["code"] == "consent_required"
        assert detail["message"] == "Tick the box to confirm you\u2019re authorised to share this statement."
        assert detail["missing"] == ["pan_disclaimer"]
    parser.assert_not_called()
    assert _consent_rows(_user_id(client, headers)) == []


def test_parse_records_the_disclaimer_before_parsing(client):
    import hashlib

    headers, member_id = _authed_headers_and_member(client, "+919999999902")
    pdf_bytes = b"%PDF-fake-wrong-password"
    with patch(
        "app.api.imports.parse_cas_pdf_bytes",
        side_effect=ParseError("wrong_password", "Incorrect PDF password."),
    ):
        response = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", pdf_bytes, "application/pdf")},
            data={"password": "wrong", "household_member_id": member_id, "pan_disclaimer_version": PAN_DISCLAIMER_VERSION},
            headers=headers,
        )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "wrong_password"
    rows = _consent_rows(_user_id(client, headers))
    assert len(rows) == 1
    row = rows[0]
    assert row.document_type.value == "pan_disclaimer"
    assert row.purpose_code.value == "cas_pan_processing"
    assert row.action.value == "given"
    assert row.document_version == PAN_DISCLAIMER_VERSION
    assert row.surface == "import_upload"
    assert row.related_file_sha256 == hashlib.sha256(pdf_bytes).hexdigest()


def test_parse_upload_surface_header(client):
    headers, member_id = _authed_headers_and_member(client, "+919999999903")
    with patch(
        "app.api.imports.parse_cas_pdf_bytes",
        side_effect=ParseError("wrong_password", "Incorrect PDF password."),
    ):
        for surface in ("onboarding_upload", "weird", "mobile_upload"):
            r = client.post(
                "/imports/parse",
                files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
                data={"password": "x", "household_member_id": member_id, "pan_disclaimer_version": PAN_DISCLAIMER_VERSION},
                headers={**headers, "X-Upload-Surface": surface},
            )
            assert r.status_code == 422

    surfaces = [row.surface for row in _consent_rows(_user_id(client, headers))]
    assert sorted(surfaces) == sorted(["onboarding_upload", "import_upload", "mobile_upload"])


def test_parse_consent_row_stores_truncated_and_hmac_ip_never_raw(client):
    # End to end through the real request path: the ALB-style X-Forwarded-For
    # (last hop) that device_info.get_client_ip honours becomes the client IP.
    from app.models.consent import ConsentRecord
    from app.services.legal.consent import ip_hmac

    headers, member_id = _authed_headers_and_member(client, "+919999999904")
    with patch(
        "app.api.imports.parse_cas_pdf_bytes",
        side_effect=ParseError("wrong_password", "Incorrect PDF password."),
    ):
        r = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={"password": "x", "household_member_id": member_id, "pan_disclaimer_version": PAN_DISCLAIMER_VERSION},
            headers={**headers, "X-Forwarded-For": "203.0.113.7", "X-Device-Id": "dev-1"},
        )
    assert r.status_code == 422

    (row,) = _consent_rows(_user_id(client, headers))
    assert row.ip_truncated == "203.0.113.0"
    assert row.ip_hmac == ip_hmac("203.0.113.7")
    assert row.device_id == "dev-1"
    for column in ConsentRecord.__table__.columns:
        value = getattr(row, column.key)
        assert "203.0.113.7" not in str(value), column.key


from app.services.import_.parser import ParseError
def test_parse_accepts_empty_password_field(client, tmp_path):
    headers, member_id = _authed_headers_and_member(client, "+919800000201")
    with patch("app.api.imports.parse_cas_pdf_bytes", side_effect=ParseError("wrong_password", "x")):
        r = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={"password": "", "household_member_id": member_id, "pan_disclaimer_version": PAN_DISCLAIMER_VERSION},
            headers=headers,
        )
    assert r.status_code == 422 and r.json()["detail"]["code"] == "wrong_password"


import pytest
from unittest.mock import AsyncMock

@pytest.fixture(autouse=True)
def snapshot_background_test_db(monkeypatch):
    from .import_helpers import _test_db
    monkeypatch.setattr("app.services.dashboard.snapshots.SessionLocal", _test_db)
    monkeypatch.setattr("app.services.dashboard.snapshots.warm_nav_history", AsyncMock())
