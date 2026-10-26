import asyncio
from datetime import timedelta

from sqlalchemy.orm import sessionmaker

from app.services.dashboard.value_series import build_portfolio_value_series
from app.services.home.context import load_home_inputs, resolve_scope
from tests.api.home_fixture import FIXED_NOW, build_home_fixture


def _load(runtime, *, member_id=None, days=30, variant_user=None):
    Session = sessionmaker(bind=runtime.engine)
    db = Session()
    user = variant_user or type("U", (), {"id": runtime.household.user_id})()
    ctx = resolve_scope(db, user, member_id)
    today = FIXED_NOW.date()
    inputs = asyncio.run(load_home_inputs(
        db, ctx, today, nav_start=today - timedelta(days=days + 15), view="fund",
    ))
    series = build_portfolio_value_series(db, ctx, inputs, today=today, days=days)
    db.close()
    return series, inputs


def test_series_ends_at_nav_as_of_with_last_point_equal_to_headline_total():
    runtime = build_home_fixture()
    try:
        series, inputs = _load(runtime, days=30)
        assert series.days == 30
        assert series.end == inputs.nav_as_of
        assert series.start == series.end - timedelta(days=29)
        assert series.empty is False
        assert series.points[-1].date == series.end
        from decimal import Decimal
        assert series.points[-1].value == Decimal("5212.00")
    finally:
        runtime.close()


def test_empty_household_gives_empty_true_and_no_points():
    runtime = build_home_fixture(variant="empty")
    try:
        series, _inputs = _load(runtime, days=30)
        assert series.empty is True
        assert series.points == ()
    finally:
        runtime.close()


def test_days_boundaries_and_no_balance_units_read():
    import app.services.dashboard.value_series as value_series_module
    from pathlib import Path

    source = Path(value_series_module.__file__).read_text(encoding="utf-8")
    assert "balance_units" not in source

    runtime = build_home_fixture()
    try:
        short_series, _ = _load(runtime, days=2)
        long_series, _ = _load(runtime, days=366)
        assert short_series.days == 2
        assert long_series.days == 366
    finally:
        runtime.close()
