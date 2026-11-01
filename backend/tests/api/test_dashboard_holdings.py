"""Run 4 family response and unchanged single-member response."""
import uuid
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, patch
from app.models.analytics import AnalyticsSection
from app.services.dashboard.schemas import HoldingRow


def _login(client):
    phone = "+919000004100"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    session = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()
    headers = {"Authorization": "Bearer " + session["session_token"]}
    members = [client.post("/household-members", json={"name": name, "relationship": relation}, headers=headers).json()
        for name, relation in [("Asha", "self"), ("Dev", "spouse")]]
    return headers, members


def _row(member, sid):
    return HoldingRow(scheme_id=str(sid), scheme_name="Shared Fund", amc_name="Synthetic AMC", household_member_id=member["id"],
        household_member_name=member["name"], plan_type="direct", units_held="10", average_nav="10", current_nav="20",
        current_nav_date=date.today(), amount_invested="100", current_value="200", current_profit_total="100",
        realized_gain="0", unrealized_gain="100", today_gain="0")


def test_single_member_view_response_is_unchanged(client):
    headers, members = _login(client); row = _row(members[0], uuid.uuid4())
    expected = row.model_dump(mode="json", exclude={"folios"})
    with patch("app.api.dashboard.compute_holdings", new=AsyncMock(return_value=[row])):
        response = client.get(f"/household-members/{members[0]['id']}/holdings", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "consolidated" not in body
    assert body["holdings"] == [expected]


def test_family_response_loads_stored_rates_once_without_a_new_engine(client):
    from app.main import app
    from app.db.session import get_db
    from app.models.user import HouseholdMember
    headers, members = _login(client); sid = uuid.uuid4(); rows = [_row(m, sid) for m in members]
    dep = app.dependency_overrides[get_db](); db = next(dep)
    owner = db.get(HouseholdMember, uuid.UUID(members[0]["id"])).user_id
    for key, payload in [("combined", {"comparison": {"funds": [{"scheme_id": str(sid), "fund_xirr": "0.25"}]}}),
        (members[0]["id"], {"funds": [{"scheme_id": str(sid), "fund_xirr": "0.10"}]})]:
        db.add(AnalyticsSection(user_id=owner, scope_key=key, section="benchmark_funds", payload=payload, computed_at=datetime.now(timezone.utc)))
    db.commit()
    from sqlalchemy import event
    reads = []
    def record(_conn, _cursor, statement, _parameters, _context, _many):
        if "FROM analytics_sections" in statement:
            reads.append(statement)
    event.listen(db.get_bind(), "before_cursor_execute", record)
    try:
        with patch("app.services.dashboard.aggregate.compute_holdings", new=AsyncMock(return_value=rows)):
            response = client.get("/household/aggregate/holdings", headers=headers)
        assert response.status_code == 200
        [parent] = response.json()["consolidated"]
        assert parent["xirr"] == "0.25"
        assert [child["xirr"] for child in parent["children"]] == ["0.10", None]
        assert len(reads) == 1
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", record)
        dep.close()
