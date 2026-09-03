import uuid
from datetime import datetime, timezone
from unittest.mock import patch


def _authed_headers_and_member(client, phone: str):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    verify = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()
    headers = {"Authorization": f"Bearer {verify['session_token']}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"], verify["user_id"]


def _seed_section(client, user_id, scope_key, section, payload, *, failed=False):
    from app.db.session import get_db
    from app.main import app
    from app.models.analytics import AnalyticsSection

    override = app.dependency_overrides[get_db]
    db = next(override())
    db.add(AnalyticsSection(
        # user_id and household_member_id are UUID-typed columns, but the
        # OTP-verify response and household-member route both return plain
        # JSON strings -- the exact "wasn't directly confirmed in this
        # plan's research" gap the plan's own Task 7 note flagged.
        user_id=uuid.UUID(user_id), scope_key=scope_key, section=section,
        household_member_id=None if scope_key == "combined" else uuid.UUID(scope_key),
        payload=payload, computed_at=datetime.now(timezone.utc),
        failed_at=datetime.now(timezone.utc) if failed else None,
    ))
    db.commit()
    db.close()


def test_analytics_scope_route_requires_auth(client):
    response = client.get("/analytics/combined")
    assert response.status_code == 401


def test_analytics_scope_route_404_for_unknown_member(client):
    headers, _, _ = _authed_headers_and_member(client, "+919000000030")
    response = client.get(
        "/analytics/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert response.status_code == 404


def test_analytics_scope_route_400_for_malformed_scope(client):
    headers, _, _ = _authed_headers_and_member(client, "+919000000031")
    response = client.get("/analytics/not-a-uuid-and-not-combined", headers=headers)
    assert response.status_code == 400


def test_analytics_scope_route_zero_rows_dispatches_and_returns_empty_response(client):
    headers, _, _ = _authed_headers_and_member(client, "+919000000032")
    with patch("app.api.analytics.dispatcher.dispatch") as mock_dispatch:
        response = client.get("/analytics/combined", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["sections"] == {}
    assert body["recomputing"] is True
    mock_dispatch.assert_called_once()


def test_analytics_scope_route_returns_stored_rows_with_no_live_compute(client):
    headers, member_id, user_id = _authed_headers_and_member(client, "+919000000033")

    _seed_section(
        client, user_id, member_id, "allocation",
        {"by_category": [], "by_amc": [], "total_value": "42.00"},
    )

    with patch("app.api.analytics.dispatcher.dispatch") as mock_dispatch:
        response = client.get(f"/analytics/{member_id}", headers=headers)

    mock_dispatch.assert_not_called()
    assert response.status_code == 200
    body = response.json()
    assert body["sections"]["allocation"]["payload"]["total_value"] == "42.00"
    assert body["recomputing"] is False


def test_analytics_scope_route_surfaces_a_failed_section(client):
    headers, member_id, user_id = _authed_headers_and_member(client, "+919000000034")

    _seed_section(
        client, user_id, member_id, "score",
        {"funds": [], "weighted_score": "10", "covered_value": "0", "total_value": "0", "uncovered_schemes": []},
        failed=True,
    )

    response = client.get(f"/analytics/{member_id}", headers=headers)
    body = response.json()
    assert body["sections"]["score"]["failed_at"] is not None


def test_analytics_scope_route_recovers_from_a_stale_recompute_flag(client):
    from datetime import timedelta

    from app.db.session import get_db
    from app.main import app
    from app.models.analytics import AnalyticsRecomputeStatus

    headers, _, user_id = _authed_headers_and_member(client, "+919000000038")

    override = app.dependency_overrides[get_db]
    db = next(override())
    db.add(AnalyticsRecomputeStatus(
        user_id=uuid.UUID(user_id),
        started_at=datetime.now(timezone.utc) - timedelta(hours=3),
    ))
    db.commit()
    db.close()

    with patch("app.api.analytics.dispatcher.dispatch") as mock_dispatch:
        response = client.get("/analytics/combined", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["recomputing"] is True
    mock_dispatch.assert_called_once()


def test_analytics_retry_route_requires_auth(client):
    response = client.post("/analytics/combined/retry")
    assert response.status_code == 401


def test_analytics_retry_route_404_for_unknown_member(client):
    headers, _, _ = _authed_headers_and_member(client, "+919000000035")
    response = client.post(
        "/analytics/00000000-0000-0000-0000-000000000000/retry", headers=headers
    )
    assert response.status_code == 404


def test_analytics_retry_route_dispatches_when_nothing_in_flight(client):
    headers, _, _ = _authed_headers_and_member(client, "+919000000036")
    with patch("app.api.analytics.dispatcher.dispatch") as mock_dispatch:
        response = client.post("/analytics/combined/retry", headers=headers)
    assert response.status_code == 200
    assert response.json()["dispatched"] is True
    mock_dispatch.assert_called_once()


def test_analytics_retry_route_is_a_noop_while_one_is_already_in_flight(client):
    headers, _, _ = _authed_headers_and_member(client, "+919000000037")
    with (
        patch("app.api.analytics.try_claim_recompute", return_value=False),
        patch("app.api.analytics.dispatcher.dispatch") as mock_dispatch,
    ):
        response = client.post("/analytics/combined/retry", headers=headers)
    assert response.status_code == 200
    assert response.json()["dispatched"] is False
    mock_dispatch.assert_not_called()
