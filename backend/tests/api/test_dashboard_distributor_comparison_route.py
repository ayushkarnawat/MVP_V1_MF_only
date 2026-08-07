import uuid


def _authed_headers_and_member(client, phone: str) -> tuple[dict[str, str], str]:
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


def test_distributor_comparison_route_requires_auth(client):
    scheme_id = uuid.uuid4()
    response = client.get(f"/household-members/00000000-0000-0000-0000-000000000000/schemes/{scheme_id}/distributor-comparison")
    assert response.status_code == 401


def test_distributor_comparison_route_404s_for_another_users_member(client):
    _, other_member_id = _authed_headers_and_member(client, "+919000000004")
    headers, _ = _authed_headers_and_member(client, "+919000000005")
    scheme_id = uuid.uuid4()

    response = client.get(f"/household-members/{other_member_id}/schemes/{scheme_id}/distributor-comparison", headers=headers)
    assert response.status_code == 404


def test_distributor_comparison_route_returns_empty_list_for_scheme_member_does_not_hold(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000006")
    scheme_id = uuid.uuid4()

    response = client.get(f"/household-members/{member_id}/schemes/{scheme_id}/distributor-comparison", headers=headers)
    assert response.status_code == 200
    assert response.json() == []
