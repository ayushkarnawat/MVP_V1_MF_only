def _authed_headers_and_member(client, phone: str):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


def test_analytics_category_ranking_route_requires_auth(client):
    response = client.get("/analytics/household-members/00000000-0000-0000-0000-000000000000/category-ranking")
    assert response.status_code == 401


def test_analytics_category_ranking_route_404_for_unknown_member(client):
    headers, _ = _authed_headers_and_member(client, "+919000000050")
    response = client.get(
        "/analytics/household-members/00000000-0000-0000-0000-000000000000/category-ranking", headers=headers
    )
    assert response.status_code == 404


def test_analytics_category_ranking_route_returns_empty_list_for_member_with_no_holdings(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000051")
    response = client.get(f"/analytics/household-members/{member_id}/category-ranking", headers=headers)
    assert response.status_code == 200
    assert response.json()["funds"] == []


def test_analytics_aggregate_category_ranking_route_lists_members(client):
    headers, _ = _authed_headers_and_member(client, "+919000000052")
    response = client.get("/analytics/household/aggregate/category-ranking", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["members"]) == 1
    assert body["members"][0]["has_data"] is False
    assert body["ranking"]["funds"] == []


def test_analytics_aggregate_category_ranking_route_requires_auth(client):
    response = client.get("/analytics/household/aggregate/category-ranking")
    assert response.status_code == 401
