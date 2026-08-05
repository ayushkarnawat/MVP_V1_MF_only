def _authed_headers(client, phone="+919999999999"):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    return {"Authorization": f"Bearer {token}"}


def test_household_members_requires_auth(client):
    response = client.get("/household-members")
    assert response.status_code == 401


def test_create_and_list_household_member(client):
    headers = _authed_headers(client)

    create_resp = client.post(
        "/household-members", json={"name": "Ayush", "relationship": "self"}, headers=headers
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["relationship"] == "self"

    list_resp = client.get("/household-members", headers=headers)
    assert list_resp.status_code == 200
    assert [m["name"] for m in list_resp.json()] == ["Ayush"]


def test_household_members_scoped_per_user(client):
    headers_a = _authed_headers(client, "+919999999999")
    headers_b = _authed_headers(client, "+919888888888")
    client.post("/household-members", json={"name": "Ayush", "relationship": "self"}, headers=headers_a)

    response = client.get("/household-members", headers=headers_b)

    assert response.json() == []
