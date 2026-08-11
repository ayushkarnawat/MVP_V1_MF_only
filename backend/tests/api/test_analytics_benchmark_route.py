def _authed_headers_and_member(client, phone: str):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


def test_analytics_benchmark_route_requires_auth(client):
    response = client.get("/analytics/household-members/00000000-0000-0000-0000-000000000000/benchmark")
    assert response.status_code == 401


def test_analytics_benchmark_route_404_for_unknown_member(client):
    headers, _ = _authed_headers_and_member(client, "+919000000040")
    response = client.get(
        "/analytics/household-members/00000000-0000-0000-0000-000000000000/benchmark", headers=headers
    )
    assert response.status_code == 404


def test_analytics_benchmark_route_returns_empty_summary_for_member_with_no_holdings(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000041")
    response = client.get(f"/analytics/household-members/{member_id}/benchmark", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["portfolio_xirr"] is None
    assert len(body["benchmarks"]) == 4


def test_analytics_aggregate_benchmark_route_lists_members(client):
    headers, _ = _authed_headers_and_member(client, "+919000000042")
    response = client.get("/analytics/household/aggregate/benchmark", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["members"]) == 1
    assert body["members"][0]["has_data"] is False
    assert body["benchmark"]["portfolio_xirr"] is None


def test_analytics_aggregate_benchmark_route_requires_auth(client):
    response = client.get("/analytics/household/aggregate/benchmark")
    assert response.status_code == 401


def test_analytics_fund_benchmark_route_requires_auth(client):
    response = client.get("/analytics/household-members/00000000-0000-0000-0000-000000000000/benchmark/funds")
    assert response.status_code == 401


def test_analytics_fund_benchmark_route_404_for_unknown_member(client):
    headers, _ = _authed_headers_and_member(client, "+919000000043")
    response = client.get(
        "/analytics/household-members/00000000-0000-0000-0000-000000000000/benchmark/funds", headers=headers
    )
    assert response.status_code == 404


def test_analytics_fund_benchmark_route_returns_empty_list_with_no_holdings(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000044")
    response = client.get(f"/analytics/household-members/{member_id}/benchmark/funds", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["funds"] == []
    assert body["overall_portfolio_xirr"] is None


def test_analytics_aggregate_fund_benchmark_route_lists_members(client):
    headers, _ = _authed_headers_and_member(client, "+919000000045")
    response = client.get("/analytics/household/aggregate/benchmark/funds", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["members"]) == 1
    assert body["comparison"]["funds"] == []


def test_analytics_aggregate_fund_benchmark_route_requires_auth(client):
    response = client.get("/analytics/household/aggregate/benchmark/funds")
    assert response.status_code == 401
