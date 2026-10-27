"""L19: every route that reaches compute_active_sips hands it the IST date from get_now_ist."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.api.home import get_now_ist

IST_NOW = datetime(2026, 11, 1, 0, 30, tzinfo=ZoneInfo("Asia/Kolkata"))  # 31 Oct in UTC


def _headers_and_member(client, phone):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post("/household-members", json={"name": "Self", "relationship": "self"}, headers=headers).json()
    return headers, member["id"]


@pytest.fixture()
def ist_clock(client):
    client.app.dependency_overrides[get_now_ist] = lambda: IST_NOW
    yield
    client.app.dependency_overrides.pop(get_now_ist, None)


def _spy(monkeypatch, target):
    seen = []

    def fake(db, ids, **kwargs):
        seen.append(kwargs.get("today"))
        return []

    monkeypatch.setattr(target, fake)
    return seen


@pytest.mark.parametrize("url_template, target, phone", [
    ("/household-members/{m}/sips", "app.api.dashboard.compute_active_sips", "+919000000071"),
    ("/household/aggregate/sips", "app.services.dashboard.aggregate.compute_active_sips", "+919000000072"),
    ("/household-members/{m}/portfolio-insights", "app.api.portfolio_insights.compute_active_sips", "+919000000073"),
    ("/household/aggregate/portfolio-insights", "app.api.portfolio_insights.compute_active_sips", "+919000000074"),
])
def test_routes_pass_the_ist_date(client, ist_clock, monkeypatch, url_template, target, phone):
    headers, member_id = _headers_and_member(client, phone)
    seen = _spy(monkeypatch, target)
    client.get(url_template.format(m=member_id), headers=headers)
    assert seen == [date(2026, 11, 1)]


def test_monthly_routes_default_to_the_ist_month(client, ist_clock):
    headers, member_id = _headers_and_member(client, "+919000000075")
    # 31 Oct UTC vs 1 Nov IST: a month default taken from the server could be October.
    response = client.get("/household/aggregate/sips/monthly", headers=headers)
    assert response.status_code == 200
    seen = {}
    import app.api.dashboard as dashboard

    original = dashboard.get_aggregate_sips_monthly
    dashboard.get_aggregate_sips_monthly = lambda db, uid, year, month, **kw: seen.update(ym=(year, month)) or original(db, uid, year, month)
    try:
        client.get("/household/aggregate/sips/monthly", headers=headers)
    finally:
        dashboard.get_aggregate_sips_monthly = original
    assert seen["ym"] == (2026, 11)
