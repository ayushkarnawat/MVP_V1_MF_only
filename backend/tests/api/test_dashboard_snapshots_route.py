def _authed_headers_and_member(client, phone: str):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


def test_snapshots_route_requires_auth(client):
    response = client.get("/household-members/00000000-0000-0000-0000-000000000000/snapshots")
    assert response.status_code == 401


def test_snapshots_route_returns_empty_list_for_member_with_no_transactions(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000040")
    response = client.get(f"/household-members/{member_id}/snapshots", headers=headers)
    assert response.status_code == 200
    assert response.json() == []



def test_unknown_month_is_404_and_malformed_month_is_422(client):
    headers, mid = _authed_headers_and_member(client, "+919000000041")
    for month, expected in [("2024-01-31", 404), ("2024-01-30", 404), ("bad-date", 422), ("2024-02-30", 422), ("20240131", 422)]:
        assert client.get(f"/household-members/{mid}/snapshots/{month}", headers=headers).status_code == expected
        assert client.get(f"/household/aggregate/snapshots/{month}", headers=headers).status_code == expected


def test_member_of_another_user_is_404_before_date_validation_or_compute(client, monkeypatch):
    from unittest.mock import AsyncMock
    import app.api.dashboard as dashboard_api  # the route imported the function by name: patch it where it is used
    headers, _ = _authed_headers_and_member(client, "+919000000042")
    _, other = _authed_headers_and_member(client, "+919000000043")
    compute = AsyncMock(side_effect=AssertionError("ownership must run first"))
    monkeypatch.setattr(dashboard_api, "get_month_detail", compute)
    for month in ("bad-date", "2024-01-31"):
        assert client.get(f"/household-members/{other}/snapshots/{month}", headers=headers).status_code == 404
    compute.assert_not_awaited()


def test_month_detail_routes_require_auth(client):
    assert client.get("/household/aggregate/snapshots/bad-date").status_code == 401
    assert client.get("/household-members/00000000-0000-0000-0000-000000000000/snapshots/bad-date").status_code == 401


def test_month_detail_routes_return_the_detail_and_scope_the_member_ids(client, monkeypatch):
    import uuid
    from datetime import date
    from unittest.mock import AsyncMock
    from app.services.dashboard.schemas import MonthDetail
    import app.api.dashboard as routes
    headers, mid = _authed_headers_and_member(client, "+919000000044")
    other = client.post("/household-members", json={"name": "Partner", "relationship": "spouse"}, headers=headers).json()["id"]
    payload = MonthDetail(month=date(2024, 1, 31), total_value="100.00")
    one = AsyncMock(return_value=payload)
    aggregate = AsyncMock(return_value=payload)
    monkeypatch.setattr(routes, "get_month_detail", one)
    monkeypatch.setattr(routes, "get_aggregate_month_detail", aggregate)
    response = client.get(f"/household-members/{mid}/snapshots/2024-01-31", headers=headers)
    assert response.status_code == 200 and response.json()["opening_holdings"] == "0.00"
    assert one.call_args.args[1:] == ([uuid.UUID(mid)], date(2024, 1, 31))
    assert client.get("/household/aggregate/snapshots/2024-01-31", headers=headers).status_code == 200
    assert aggregate.await_count == 1
