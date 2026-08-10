def _authed_headers_and_member(client, phone: str):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


def test_analytics_allocation_route_requires_auth(client):
    response = client.get("/analytics/household-members/00000000-0000-0000-0000-000000000000/allocation")
    assert response.status_code == 401


def test_analytics_allocation_route_404_for_unknown_member(client):
    headers, _ = _authed_headers_and_member(client, "+919000000020")
    response = client.get(
        "/analytics/household-members/00000000-0000-0000-0000-000000000000/allocation", headers=headers
    )
    assert response.status_code == 404


def test_analytics_allocation_route_returns_empty_summary_for_member_with_no_holdings(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000021")
    response = client.get(f"/analytics/household-members/{member_id}/allocation", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["by_category"] == []
    assert body["by_amc"] == []
    assert body["total_value"] == "0"


def test_analytics_aggregate_allocation_route_lists_members(client):
    headers, _ = _authed_headers_and_member(client, "+919000000022")
    response = client.get("/analytics/household/aggregate/allocation", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["members"]) == 1
    assert body["members"][0]["has_data"] is False
    assert body["allocation"]["by_category"] == []


def test_analytics_aggregate_allocation_route_requires_auth(client):
    response = client.get("/analytics/household/aggregate/allocation")
    assert response.status_code == 401
