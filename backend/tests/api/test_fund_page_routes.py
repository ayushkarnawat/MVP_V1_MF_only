"""`fund_page.router` is registered on `app.main.app` since T3, but these
tests still use a standalone app with a single shared in-memory session --
the `client` fixture mints a fresh, empty DB per test and goes through the
real OTP/signup flow, which is unnecessary weight for routes whose fixtures
(scheme/folio/transaction rows) are built directly via `factories.py`."""
from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import fund_page
from app.db.session import get_db
from app.models.enums import SchemePlanType
from app.models.user import User
from app.services.auth.session import get_active_user
from app.services.dashboard import holdings as holdings_module
from app.services.fund_page import summary as summary_module
from tests.services.fund_page.factories import (
    TODAY,
    add_nav_factors,
    add_scheme,
    add_user_household,
    fx_hold,
    fx_nav10,
    make_session,
)


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    monkeypatch.setattr(summary_module, "warm_nav_history", AsyncMock(return_value=None))


@pytest.fixture(autouse=True)
def _isolated_holdings_cache():
    holdings_module._holdings_cache.clear()
    holdings_module._holdings_cache_generation.clear()
    yield
    holdings_module._holdings_cache.clear()
    holdings_module._holdings_cache_generation.clear()


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(fund_page.router)
    app.dependency_overrides[get_db] = make_session
    return TestClient(app)


def _authed_client(db, user: User) -> TestClient:
    app = FastAPI()
    app.include_router(fund_page.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_active_user] = lambda: user
    return TestClient(app)


def test_endpoints_require_session():
    response = _client().get(f"/fund-page/{uuid.uuid4()}/summary")
    assert response.status_code == 401


def test_summary_route_404s_for_unknown_scheme():
    db = make_session()
    household = add_user_household(db)
    user = db.get(User, household.user_id)

    response = _authed_client(db, user).get(f"/fund-page/{uuid.uuid4()}/summary")

    assert response.status_code == 404


def test_summary_route_returns_tiles_for_held_scheme():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)
    user = db.get(User, household.user_id)

    response = _authed_client(db, user).get(f"/fund-page/{hold.scheme.id}/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["held"] is True
    assert body["tiles"]["invested"] == "1600.00"
    assert len(body["details"]["folios"]) == 2


def test_folio_number_route_returns_unmasked_value_for_own_folio():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)
    user = db.get(User, household.user_id)

    response = _authed_client(db, user).get(
        f"/fund-page/{hold.scheme.id}/folios/{hold.asha_folio.id}/number"
    )

    assert response.status_code == 200
    assert response.json()["folio_number"] == "4400918/3"


def test_folio_number_route_404s_for_foreign_household():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)
    other_household = add_user_household(db, key="other")
    other_user = db.get(User, other_household.user_id)

    response = _authed_client(db, other_user).get(
        f"/fund-page/{hold.scheme.id}/folios/{hold.asha_folio.id}/number"
    )

    assert response.status_code == 404


def test_summary_response_never_contains_the_full_folio_number():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)
    user = db.get(User, household.user_id)

    response = _authed_client(db, user).get(f"/fund-page/{hold.scheme.id}/summary")

    assert "4400918/3" not in response.text
    assert "A12345678" not in response.text


def test_performance_route_returns_appendix_a_contract():
    db = make_session()
    household = add_user_household(db)
    scheme = add_scheme(
        db,
        "route-performance",
        "Equity Scheme - Flexi Cap Fund",
        SchemePlanType.DIRECT,
        "ROUTEPERF",
    )
    fx_nav10(db, scheme)
    user = db.get(User, household.user_id)

    response = _authed_client(db, user).get(
        f"/fund-page/{scheme.id}/performance",
        params={"period": "1Y"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["scheme_id"] == str(scheme.id)
    assert body["period"] == "1Y"
    assert body["start"] == TODAY.replace(year=TODAY.year - 1).isoformat()
    assert body["end"] == TODAY.isoformat()
    assert body["fund"][0]["pct"] == "0.0000"
    assert body["period_returns"]["fund"] == body["fund"][-1]["pct"]


def test_inception_returns_route_returns_appendix_a_contract():
    db = make_session()
    household = add_user_household(db)
    scheme = add_scheme(
        db,
        "route-returns",
        "Equity Scheme - Flexi Cap Fund",
        SchemePlanType.DIRECT,
        "ROUTERET",
    )
    fx_nav10(db, scheme)
    user = db.get(User, household.user_id)

    response = _authed_client(db, user).get(
        f"/fund-page/{scheme.id}/returns",
        params={"mode": "inception"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["mode"] == "inception"
    assert body["columns"] == [
        "1M",
        "3M",
        "6M",
        "1Y",
        "3Y",
        "5Y",
        "since_inception",
    ]
    assert abs(Decimal(body["rows"]["fund"]["1Y"]) - Decimal("10")) < Decimal("0.001")
    assert body["rows"]["benchmark"] is None
    assert body["benchmark_reason"] == "no_history"


def test_risk_route_returns_appendix_a_contract():
    db = make_session()
    household = add_user_household(db)
    scheme = add_scheme(
        db,
        "route-risk",
        "Equity Scheme - Flexi Cap Fund",
        SchemePlanType.DIRECT,
        "ROUTERISK",
    )
    add_nav_factors(
        db,
        scheme,
        TODAY - timedelta(days=500),
        [Decimal("1")] * 500,
    )
    user = db.get(User, household.user_id)

    response = _authed_client(db, user).get(f"/fund-page/{scheme.id}/risk")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["scheme_id"] == str(scheme.id)
    assert body["life_window"] is True
    assert body["risk_free_rate"] == "0.065"
    assert body["volatility"] == {"value": "0.0000", "band": "Low", "tone": "pos"}
    assert body["sharpe"] == {"value": None, "band": None, "tone": None}
    assert body["beta_reason"] == "insufficient_shared_dates"
