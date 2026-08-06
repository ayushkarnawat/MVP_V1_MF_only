def _authed_headers(client, phone: str):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    return {"Authorization": f"Bearer {token}"}


def test_aggregate_holdings_requires_auth(client):
    response = client.get("/household/aggregate/holdings")
    assert response.status_code == 401


def test_aggregate_holdings_returns_members_and_empty_holdings(client):
    headers = _authed_headers(client, "+919000000050")
    client.post("/household-members", json={"name": "Mom", "relationship": "parent"}, headers=headers)
    client.post("/household-members", json={"name": "Dad", "relationship": "parent"}, headers=headers)

    response = client.get("/household/aggregate/holdings", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert {m["name"] for m in body["members"]} == {"Mom", "Dad"}
    assert body["holdings"] == []


def test_aggregate_allocation_returns_empty_summary(client):
    headers = _authed_headers(client, "+919000000051")
    response = client.get("/household/aggregate/allocation", headers=headers)
    assert response.status_code == 200
    assert response.json()["allocation"]["total_value"] == "0"


def test_aggregate_sips_returns_empty_list(client):
    headers = _authed_headers(client, "+919000000052")
    response = client.get("/household/aggregate/sips", headers=headers)
    assert response.status_code == 200
    assert response.json()["sips"] == []


def test_aggregate_cash_flow_returns_empty_list(client):
    headers = _authed_headers(client, "+919000000053")
    response = client.get("/household/aggregate/cash-flow", headers=headers)
    assert response.status_code == 200
    assert response.json()["cash_flow"] == []


def test_aggregate_snapshots_returns_empty_list(client):
    headers = _authed_headers(client, "+919000000054")
    response = client.get("/household/aggregate/snapshots", headers=headers)
    assert response.status_code == 200
    assert response.json()["snapshots"] == []
