import uuid
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.analytics.schemas import FundScoreRow


def _client():
    return TestClient(app)


def _fake_row(scheme_id):
    return FundScoreRow(
        scheme_id=str(scheme_id), scheme_name="Test Fund", category_unavailable=False,
        insufficient_history=False, thin_category=False, risk_adjusted_tier=4,
        cost_adjustment="0.25", final_score="72.25", return_percentile="70",
        risk_percentile="65", consistency_hit_rate="80",
    )


def test_get_fund_score_404_when_scheme_not_found(monkeypatch):
    from app.db.session import get_db
    from app.services.auth.session import get_current_user

    fake_db = type("DB", (), {"get": lambda self, model, sid: None})()
    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"id": uuid.uuid4()})()
    app.dependency_overrides[get_db] = lambda: fake_db
    client = _client()
    try:
        response = client.get(f"/analytics/funds/{uuid.uuid4()}/score")
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_get_fund_score_returns_row_for_existing_scheme():
    from app.db.session import get_db
    from app.services.auth.session import get_current_user

    scheme_id = uuid.uuid4()
    fake_scheme = type("S", (), {"id": scheme_id})()
    fake_db = type("DB", (), {"get": lambda self, model, sid: fake_scheme if sid == scheme_id else None})()

    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"id": uuid.uuid4()})()
    app.dependency_overrides[get_db] = lambda: fake_db
    client = _client()
    try:
        with patch("app.api.analytics.compute_fund_score", new=AsyncMock(return_value=_fake_row(scheme_id))):
            response = client.get(f"/analytics/funds/{scheme_id}/score")
        assert response.status_code == 200
        assert response.json()["risk_adjusted_tier"] == 4
        assert response.json()["return_percentile"] == "70"
    finally:
        app.dependency_overrides.clear()


def test_get_member_score_404_when_member_not_found():
    from app.services.auth.session import get_current_user

    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"id": uuid.uuid4()})()
    client = _client()
    try:
        with patch("app.api.analytics.get_household_member_for_user", return_value=None):
            response = client.get(f"/analytics/household-members/{uuid.uuid4()}/score")
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()
