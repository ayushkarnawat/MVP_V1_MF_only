import uuid


def _authed_headers_and_member(client, phone: str) -> tuple[dict[str, str], str]:
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


def test_member_distributor_comparison_route_requires_auth(client):
    response = client.get("/household-members/00000000-0000-0000-0000-000000000000/distributor-comparison")
    assert response.status_code == 401


def test_member_distributor_comparison_route_404s_for_another_users_member(client):
    _, other_member_id = _authed_headers_and_member(client, "+919000000004")
    headers, _ = _authed_headers_and_member(client, "+919000000005")

    response = client.get(f"/household-members/{other_member_id}/distributor-comparison", headers=headers)
    assert response.status_code == 404


def test_member_distributor_comparison_route_returns_empty_list_for_member_with_no_holdings(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000006")

    response = client.get(f"/household-members/{member_id}/distributor-comparison", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


def test_aggregate_distributor_comparison_route_requires_auth(client):
    response = client.get("/household/aggregate/distributor-comparison")
    assert response.status_code == 401


def test_aggregate_distributor_comparison_route_returns_members_and_empty_rows(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000007")

    response = client.get("/household/aggregate/distributor-comparison", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["rows"] == []
    assert len(body["members"]) == 1
    assert body["members"][0]["id"] == member_id


def test_old_fund_scoped_distributor_comparison_route_is_gone(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000008")
    scheme_id = uuid.uuid4()

    response = client.get(
        f"/household-members/{member_id}/schemes/{scheme_id}/distributor-comparison", headers=headers
    )
    assert response.status_code == 404
