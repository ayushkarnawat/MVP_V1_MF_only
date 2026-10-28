from __future__ import annotations

from datetime import date

import pytest

from app.models.enums import SchemePlanType
from app.services.fund_page.schemas import Unavailable
from tests.services.fund_page.factories import (
    TODAY,
    add_manager,
    add_scheme,
    make_session,
)


@pytest.fixture
def db():
    session = make_session()
    try:
        yield session
    finally:
        session.close()


def _scheme(db):
    return add_scheme(
        db, "manager", "Equity Scheme - Flexi Cap Fund",
        SchemePlanType.DIRECT, "MANAGER",
    )


def test_manager_ordering_role_verbatim_and_tenure(db):
    from app.services.fund_page.manager import build_manager

    scheme = _scheme(db)
    period = date(2026, 9, 1)
    add_manager(
        db, scheme, "Second Manager", period,
        role="Assistant Fund Manager", sequence_order=1,
    )
    add_manager(
        db, scheme, "Lead Manager", period,
        role="Fund Manager - Equity", sequence_order=0,
        managing_since=date(2019, 3, 1),
    )

    result = build_manager(db, scheme, TODAY)

    assert result.reference_period == period
    assert result.details_available is False
    assert [manager.name for manager in result.managers] == ["Lead Manager", "Second Manager"]
    assert result.managers[0].role == "Fund Manager - Equity"
    assert result.managers[0].tenure_years == "7.6"


def test_manager_none_is_unavailable(db):
    from app.services.fund_page.manager import build_manager

    assert build_manager(db, _scheme(db), TODAY) == Unavailable(reason="no_manager_data")


def test_latest_reference_period_only(db):
    from app.services.fund_page.manager import build_manager

    scheme = _scheme(db)
    add_manager(db, scheme, "Old Manager", date(2026, 8, 1))
    add_manager(db, scheme, "Current Manager", date(2026, 9, 1))

    result = build_manager(db, scheme, TODAY)

    assert result.reference_period == date(2026, 9, 1)
    assert [manager.name for manager in result.managers] == ["Current Manager"]


def test_manager_without_since_has_null_tenure(db):
    from app.services.fund_page.manager import build_manager

    scheme = _scheme(db)
    add_manager(db, scheme, "No Since Date", date(2026, 9, 1))

    manager = build_manager(db, scheme, TODAY).managers[0]

    assert manager.managing_since is None
    assert manager.tenure_years is None


def test_future_managing_since_clamps_tenure_to_zero(db):
    from app.services.fund_page.manager import build_manager
    from datetime import timedelta

    scheme = _scheme(db)
    add_manager(
        db, scheme, "Future Manager", date(2026, 9, 1),
        role="Fund Manager", sequence_order=0,
        managing_since=TODAY + timedelta(days=30),
    )

    result = build_manager(db, scheme, TODAY)

    assert result.managers[0].tenure_years == "0.0"
