def _authed_headers_and_member(client, phone: str):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


def test_cash_flow_route_requires_auth(client):
    response = client.get("/household-members/00000000-0000-0000-0000-000000000000/cash-flow")
    assert response.status_code == 401


def test_cash_flow_route_returns_empty_list_for_member_with_no_transactions(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000030")
    response = client.get(f"/household-members/{member_id}/cash-flow", headers=headers)
    assert response.status_code == 200
    assert response.json() == []
