def _authed_headers_and_member(client, phone: str):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


def test_sips_route_requires_auth(client):
    response = client.get("/household-members/00000000-0000-0000-0000-000000000000/sips")
    assert response.status_code == 401


def test_sips_route_returns_empty_list_for_member_with_no_sips(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000020")
    response = client.get(f"/household-members/{member_id}/sips", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


def test_sips_monthly_route_requires_auth(client):
    response = client.get(
        "/household-members/00000000-0000-0000-0000-000000000000/sips/monthly"
    )
    assert response.status_code == 401


def test_sips_monthly_route_defaults_to_current_month(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000021")
    response = client.get(f"/household-members/{member_id}/sips/monthly", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


def test_sips_monthly_route_accepts_explicit_year_and_month(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000022")
    response = client.get(
        f"/household-members/{member_id}/sips/monthly",
        params={"year": 2026, "month": 3},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json() == []


def test_aggregate_sips_monthly_route_returns_member_statuses(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000023")
    response = client.get("/household/aggregate/sips/monthly", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["sips"] == []
    assert len(body["members"]) == 1
    assert body["members"][0]["id"] == member_id
