import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

from app.db.session import get_db
from app.models.reference import Scheme
from app.services.dashboard.schemas import NavHistoryPoint, SchemeNavHistoryResponse


def _authed_headers_and_member(client, phone: str) -> tuple[dict[str, str], str]:
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": otp}
    ).json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}
    member = client.post(
        "/household-members",
        json={"name": "Self", "relationship": "self"},
        headers=headers,
    ).json()
    return headers, member["id"]


def _scheme(client) -> uuid.UUID:
    # Returns the plain id, not the ORM object: `_scheme`'s own session
    # goes out of scope (and closes) as soon as this returns, so a later
    # `scheme.id` access on a returned ORM instance would need to reload
    # from an already-closed session (DetachedInstanceError) — the id is
    # client-assigned anyway, so there's nothing to reload. commit (not
    # flush) so the row survives the session close, matching
    # `test_coverage_gaps_routes.py`'s `gap_setup` fixture.
    db = next(client.app.dependency_overrides[get_db]())
    scheme_id = uuid.uuid4()
    db.add(
        Scheme(
            id=scheme_id,
            amfi_code="125497",
            isin="INF123",
            name="HDFC Flexi Cap Fund",
            amc_name="HDFC AMC",
            sebi_category="Equity Scheme - Flexi Cap Fund",
        )
    )
    db.commit()
    return scheme_id


def _response(scheme_id, requested_period="1Y"):
    return SchemeNavHistoryResponse(
        scheme_id=str(scheme_id),
        period=requested_period,
        requested_period=requested_period,
        clamped=False,
        points=[NavHistoryPoint(date=date(2024, 1, 1), nav="100.0000", return_pct="0.00")],
        overall_return_pct="0.00",
    )


def test_fund_nav_history_route_requires_auth(client):
    response = client.get(f"/funds/{uuid.uuid4()}/nav-history")
    assert response.status_code == 401


def test_fund_nav_history_route_returns_404_for_unknown_scheme(client):
    headers, _ = _authed_headers_and_member(client, "+919000000101")
    response = client.get(f"/funds/{uuid.uuid4()}/nav-history", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Scheme not found."


def test_fund_nav_history_route_returns_expected_shape(client):
    headers, _ = _authed_headers_and_member(client, "+919000000102")
    scheme_id = _scheme(client)
    service_response = _response(scheme_id, "3Y")

    with patch(
        "app.api.dashboard.get_fund_nav_history",
        new=AsyncMock(return_value=service_response),
    ):
        response = client.get(f"/funds/{scheme_id}/nav-history?period=3Y", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "scheme_id": str(scheme_id),
        "period": "3Y",
        "requested_period": "3Y",
        "clamped": False,
        "points": [{"date": "2024-01-01", "nav": "100.0000", "return_pct": "0.00"}],
        "overall_return_pct": "0.00",
    }


def test_fund_nav_history_route_defaults_period_to_one_year(client):
    headers, _ = _authed_headers_and_member(client, "+919000000103")
    scheme_id = _scheme(client)

    with patch(
        "app.api.dashboard.get_fund_nav_history",
        new=AsyncMock(return_value=_response(scheme_id)),
    ) as service:
        response = client.get(f"/funds/{scheme_id}/nav-history", headers=headers)

    assert response.status_code == 200
    assert service.await_args.args[2] == "1Y"


def test_fund_nav_history_route_rejects_invalid_period(client):
    headers, _ = _authed_headers_and_member(client, "+919000000104")
    scheme_id = _scheme(client)
    response = client.get(f"/funds/{scheme_id}/nav-history?period=6M", headers=headers)
    assert response.status_code == 422
