from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from app.models.enums import PlanType
from app.services.dashboard.schemas import HoldingRow


def _authed_headers_and_member(client, phone: str) -> tuple[dict[str, str], str]:
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


def test_holdings_route_requires_auth(client):
    response = client.get("/household-members/00000000-0000-0000-0000-000000000000/holdings")
    assert response.status_code == 401


def test_holdings_route_404s_for_another_users_member(client):
    _, other_member_id = _authed_headers_and_member(client, "+919000000001")
    headers, _ = _authed_headers_and_member(client, "+919000000002")

    response = client.get(f"/household-members/{other_member_id}/holdings", headers=headers)
    assert response.status_code == 404


def test_holdings_route_returns_empty_list_for_member_with_no_folios(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000003")
    response = client.get(f"/household-members/{member_id}/holdings", headers=headers)
    assert response.status_code == 200
    assert response.json() == {
        "holdings": [],
        "realized_summary": {"total": "0.00", "funds": []},
        "lifetime_xirr": None,
        "current_holdings_xirr": None,
        "lifetime_xirr_disclaimer": None,
        "current_holdings_xirr_disclaimer": None,
    }


def test_holdings_route_rows_carry_sebi_category(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000004")
    row = HoldingRow(
        scheme_id="00000000-0000-0000-0000-000000000001",
        scheme_name="HDFC Flexi Cap Fund",
        amc_name="HDFC AMC",
        asset_class="Equity",
        household_member_id=member_id,
        household_member_name="Self",
        plan_type=PlanType.DIRECT,
        units_held="10",
        average_nav="10",
        current_nav="12",
        current_nav_date=date.today(),
        amount_invested="100",
        current_value="120",
        current_profit_total="20",
        realized_gain="0",
        unrealized_gain="20",
        today_gain="0",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )

    with patch("app.api.dashboard.compute_holdings", new=AsyncMock(return_value=[row])):
        response = client.get(f"/household-members/{member_id}/holdings", headers=headers)

    assert response.status_code == 200
    assert response.json()["holdings"][0]["sebi_category"] == "Equity Scheme - Flexi Cap Fund"
