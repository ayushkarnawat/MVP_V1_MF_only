from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import fund_page
from app.db.session import get_db
from app.models.enums import SchemePlanType
from app.models.user import User
from app.services.auth.session import get_active_user
from app.services.fund_page.schemas import Unavailable
from tests.services.fund_page.factories import add_scheme, add_user_household, make_session


def _client(db=None, user=None) -> TestClient:
    app = FastAPI()
    app.include_router(fund_page.router)
    app.dependency_overrides[get_db] = (lambda: db) if db is not None else make_session
    if user is not None:
        app.dependency_overrides[get_active_user] = lambda: user
    return TestClient(app)


def _setup():
    db = make_session()
    household = add_user_household(db)
    user = db.get(User, household.user_id)
    fund_a = add_scheme(
        db, "overlap-route-a", "Equity Scheme - Flexi Cap Fund",
        SchemePlanType.DIRECT, "OVERLAPROUTEA",
    )
    fund_b = add_scheme(
        db, "overlap-route-b", "Equity Scheme - Flexi Cap Fund",
        SchemePlanType.DIRECT, "OVERLAPROUTEB",
    )
    return db, household, user, fund_a, fund_b


@pytest.mark.parametrize("suffix", ["overlap", f"overlap/{uuid.uuid4()}"])
def test_overlap_routes_require_session(suffix):
    assert _client().get(f"/fund-page/{uuid.uuid4()}/{suffix}").status_code == 401


def test_overlap_route_404s_for_unknown_scheme():
    db, _household, user, _fund_a, _fund_b = _setup()
    response = _client(db, user).get(f"/fund-page/{uuid.uuid4()}/overlap")
    assert response.status_code == 404


def test_comparison_route_404s_for_unknown_other_scheme():
    db, _household, user, fund_a, _fund_b = _setup()
    response = _client(db, user).get(
        f"/fund-page/{fund_a.id}/overlap/{uuid.uuid4()}"
    )
    assert response.status_code == 404


@pytest.mark.parametrize("comparison", [False, True])
def test_overlap_routes_reject_foreign_member_scope(comparison):
    db, _household, user, fund_a, fund_b = _setup()
    foreign = add_user_household(db, key="other")
    suffix = f"overlap/{fund_b.id}" if comparison else "overlap"
    response = _client(db, user).get(
        f"/fund-page/{fund_a.id}/{suffix}", params={"scope": str(foreign.asha_id)},
    )
    assert response.status_code == 404


@pytest.mark.parametrize("comparison", [False, True])
def test_overlap_routes_reject_malformed_scope(comparison):
    db, _household, user, fund_a, fund_b = _setup()
    suffix = f"overlap/{fund_b.id}" if comparison else "overlap"
    response = _client(db, user).get(
        f"/fund-page/{fund_a.id}/{suffix}", params={"scope": "not-a-member"},
    )
    assert response.status_code == 400


@pytest.mark.parametrize(
    ("comparison", "builder_name"),
    [(False, "build_fund_overlap"), (True, "build_fund_comparison")],
)
def test_overlap_routes_pass_distinct_combined_and_member_scopes(
    monkeypatch, comparison, builder_name,
):
    db, household, user, fund_a, fund_b = _setup()

    async def fake_builder(*args):
        ctx = args[-2]
        return Unavailable(reason=ctx.scope_key)

    spy = AsyncMock(side_effect=fake_builder)
    monkeypatch.setattr(fund_page, builder_name, spy, raising=False)
    suffix = f"overlap/{fund_b.id}" if comparison else "overlap"
    client = _client(db, user)

    combined = client.get(f"/fund-page/{fund_a.id}/{suffix}")
    member = client.get(
        f"/fund-page/{fund_a.id}/{suffix}", params={"scope": str(household.asha_id)},
    )

    assert combined.status_code == member.status_code == 200
    assert combined.json()["reason"] == "combined"
    assert member.json()["reason"] == str(household.asha_id)
    assert len(spy.await_args_list) == 2
