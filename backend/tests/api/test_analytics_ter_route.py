def _authed_headers_and_member(client, phone: str):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


def test_analytics_ter_route_requires_auth(client):
    response = client.get("/analytics/household-members/00000000-0000-0000-0000-000000000000/ter")
    assert response.status_code == 401


def test_analytics_ter_route_404_for_unknown_member(client):
    headers, _ = _authed_headers_and_member(client, "+919000000030")
    response = client.get(
        "/analytics/household-members/00000000-0000-0000-0000-000000000000/ter", headers=headers
    )
    assert response.status_code == 404


def test_analytics_ter_route_returns_empty_summary_for_member_with_no_holdings(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000031")
    response = client.get(f"/analytics/household-members/{member_id}/ter", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["weighted_ter"] is None
    assert body["total_value"] == "0"
    assert body["uncovered_schemes"] == []


def test_analytics_aggregate_ter_route_lists_members(client):
    headers, _ = _authed_headers_and_member(client, "+919000000032")
    response = client.get("/analytics/household/aggregate/ter", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["members"]) == 1
    assert body["members"][0]["has_data"] is False
    assert body["ter"]["weighted_ter"] is None


def test_analytics_aggregate_ter_route_requires_auth(client):
    response = client.get("/analytics/household/aggregate/ter")
    assert response.status_code == 401


def test_analytics_direct_regular_ter_route_requires_auth(client):
    response = client.get("/analytics/household-members/00000000-0000-0000-0000-000000000000/ter/direct-regular")
    assert response.status_code == 401


def test_analytics_direct_regular_ter_route_404_for_unknown_member(client):
    headers, _ = _authed_headers_and_member(client, "+919000000033")
    response = client.get(
        "/analytics/household-members/00000000-0000-0000-0000-000000000000/ter/direct-regular", headers=headers
    )
    assert response.status_code == 404


def test_analytics_direct_regular_ter_route_returns_empty_buckets_with_no_holdings(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000034")
    response = client.get(f"/analytics/household-members/{member_id}/ter/direct-regular", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["direct"]["weighted_ter"] is None
    assert body["regular"]["weighted_ter"] is None


def test_analytics_aggregate_direct_regular_ter_route_lists_members(client):
    headers, _ = _authed_headers_and_member(client, "+919000000035")
    response = client.get("/analytics/household/aggregate/ter/direct-regular", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["members"]) == 1
    assert body["ter"]["direct"]["weighted_ter"] is None


def test_analytics_aggregate_direct_regular_ter_route_requires_auth(client):
    response = client.get("/analytics/household/aggregate/ter/direct-regular")
    assert response.status_code == 401
