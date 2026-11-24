from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock
from uuid import UUID

import pytest

from app.api import analytics, dashboard
from app.models.user import User, HouseholdMember
from app.services.export.pass_routes import PASS_READ_ROUTES
from fastapi import Request


def request(passed):
    result = Request({"type": "http", "method": "GET", "path": "/"})
    if passed:
        result.state.export_pass = True
    return result


@pytest.fixture
def owner(db_session):
    user = User(id=UUID(int=1), phone_number="+919900000301", created_at=datetime.now(timezone.utc))
    db_session.add(user)
    db_session.commit()
    member = HouseholdMember(id=UUID(int=11), user_id=user.id, name="Invented member", created_at=datetime.now(timezone.utc))
    db_session.add(member)
    db_session.commit()
    return user, member


@pytest.mark.parametrize("passed", [False, True])
def test_analytics_pass_never_writes_or_dispatches_but_sessions_keep_cold_start(db_session, owner, monkeypatch, passed):
    user, _ = owner
    claim, dispatch = Mock(return_value=True), Mock(return_value=True)
    monkeypatch.setattr(analytics, "should_dispatch_recompute", Mock(return_value=True))
    monkeypatch.setattr(analytics, "try_claim_recompute", claim)
    monkeypatch.setattr(analytics.dispatcher, "dispatch", dispatch)
    result = analytics.get_analytics_scope("combined", request(passed), user, db_session)
    assert result.sections == {}
    assert claim.call_count == dispatch.call_count == (0 if passed else 1)


@pytest.mark.parametrize("aggregate", [False, True])
@pytest.mark.parametrize("passed", [False, True])
def test_snapshots_pass_reads_stored_rows_and_sessions_keep_rebuild_path(db_session, owner, monkeypatch, passed, aggregate):
    import asyncio
    from datetime import date
    from decimal import Decimal
    from app.models.snapshot import PortfolioSnapshot
    user, member = owner
    db_session.add(PortfolioSnapshot(household_member_id=member.id, snapshot_month=date(2026, 10, 31),
                                    total_value=Decimal("123.45"), invested_value=Decimal("100.00"),
                                    computed_at=datetime.now(timezone.utc), is_partial=True))
    db_session.commit()
    rebuild = AsyncMock(return_value=[])
    aggregate_rebuild = AsyncMock(return_value={"members": [], "snapshots": []})
    monkeypatch.setattr(dashboard, "get_snapshots", rebuild)
    monkeypatch.setattr(dashboard, "get_aggregate_snapshots", aggregate_rebuild)
    commit, add_all = Mock(), Mock()
    monkeypatch.setattr(db_session, "commit", commit)
    monkeypatch.setattr(db_session, "add_all", add_all)
    if aggregate:
        result = asyncio.run(dashboard.get_household_aggregate_snapshots(request(passed), user, db_session))
    else:
        result = asyncio.run(dashboard.get_member_snapshots(member.id, request(passed), user, db_session))
    assert (aggregate_rebuild if aggregate else rebuild).await_count == (0 if passed else 1)
    if passed:
        rows = result.snapshots if aggregate else result
        assert len(rows) == 1 and rows[0].total_value == "123.45" and rows[0].invested_value == "100.00"
        assert rows[0].is_partial is True
        commit.assert_not_called()
        add_all.assert_not_called()


def test_every_allow_listed_route_exists_is_get_only_and_is_pass_safe():
    # FastAPI 0.141 keeps included routers unflattened (app.routes does not list their routes), so the real app's routes are read
    # from its OpenAPI document, which lists every path template with its methods.
    from app.main import app
    paths = app.openapi()["paths"]
    for template, entry in PASS_READ_ROUTES.items():
        assert template in paths, template
        assert entry.pass_safe
        assert set(paths[template]) <= {"get", "head"}, (template, set(paths[template]))


def test_no_listed_route_is_a_write_or_dispatch_route():
    forbidden = {"/household-members", "/analytics/{scope}/retry", "/analytics/funds/{scheme_id}/score", "/analytics/export/payload/{token}"}
    assert not forbidden.intersection(PASS_READ_ROUTES)
    assert not any(any(word in path for word in ("coverage-gaps", "distributor-comparison", "nav-history", "sips/monthly", "snapshots/{month}")) for path in PASS_READ_ROUTES)
