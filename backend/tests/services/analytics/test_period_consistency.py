"""Performance ranks reuse the unchanged category-return cache."""
import asyncio
import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.enums import SchemePlanType
from app.models.reference import NavHistory, Scheme
from app.services.analytics import category_ranking, performance_ranking
from app.services.analytics.risk_metrics import years_ago
from app.services.analytics.scheme_universe import CategoryPeers


def test_rank_total_equals_average_peers_for_every_period_with_short_history_peer(db_session):
    db, today = db_session, date.today()
    old, young = schemes = [Scheme(id=uuid.uuid4(), name=f"Paper Moon Fund {i}", amc_name="Paper Moon AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund", plan_type=SchemePlanType.DIRECT) for i in range(2)]
    db.add_all(schemes)
    db.flush()
    for scheme, windows in ((old, (5, 3, 1, 0)), (young, (1, 0))):
        for years in windows:
            db.add(NavHistory(scheme_id=scheme.id, date=years_ago(today, years),
                              nav=Decimal("100" if years else "130")))
    db.commit()
    peers = CategoryPeers(schemes, 2, {s.id: s.id for s in schemes})
    holdings = [SimpleNamespace(scheme_id=str(old.id))]
    category_ranking._category_returns_cache.clear()
    try:
        with patch.object(category_ranking, "compute_holdings", new=AsyncMock(return_value=holdings)), \
             patch.object(performance_ranking, "compute_holdings", new=AsyncMock(return_value=holdings)), \
             patch.object(category_ranking, "get_category_peers", new=AsyncMock(return_value=peers)), \
             patch.object(performance_ranking, "get_category_peers", new=AsyncMock(return_value=peers)), \
             patch.object(category_ranking, "warm_nav_history", new=AsyncMock()):
            average = asyncio.run(category_ranking.compute_category_ranking(db, [uuid.uuid4()])).funds[0]
            ranking = asyncio.run(performance_ranking.compute_performance_ranking(db, [uuid.uuid4()])).funds[0]
        for period, count in (("1Y", 2), ("3Y", 1), ("5Y", 1)):
            assert average.periods[period.lower()].peers == ranking.periods[period].total == count
    finally:
        category_ranking._category_returns_cache.clear()


@pytest.mark.parametrize("refresh_navs", [False, True])
def test_performance_ranking_uses_the_same_period_returns_as_category_ranking(db_session, refresh_navs):
    db, today = db_session, date.today()
    schemes = [Scheme(id=uuid.uuid4(), name=f"Fund {i}", amc_name=f"AMC {i}",
        sebi_category="Equity Scheme - Flexi Cap Fund", plan_type=SchemePlanType.DIRECT) for i in range(4)]
    db.add_all(schemes); db.flush()
    for index, scheme in enumerate(schemes):
        for years, nav in [(5, "8"), (3, "10"), (1, "11"), (0, str(13 + index))]:
            db.add(NavHistory(scheme_id=scheme.id, date=years_ago(today, years), nav=Decimal(nav)))
    db.commit()
    peers = CategoryPeers(schemes=schemes, fund_count=4, representative_of={s.id: s.id for s in schemes})
    holdings = [SimpleNamespace(scheme_id=str(schemes[0].id))]
    category_ranking._category_returns_cache.clear()
    try:
        with patch.object(category_ranking, "compute_holdings", new=AsyncMock(return_value=holdings)), \
             patch.object(performance_ranking, "compute_holdings", new=AsyncMock(return_value=holdings)), \
             patch.object(category_ranking, "get_category_peers", new=AsyncMock(return_value=peers)), \
             patch.object(performance_ranking, "get_category_peers", new=AsyncMock(return_value=peers)), \
             patch.object(category_ranking, "warm_nav_history", new=AsyncMock()) as warm:
            category = asyncio.run(category_ranking.compute_category_ranking(db, [uuid.uuid4()])).funds[0]
            if refresh_navs:
                # A fresh lookup would now put the held fund first, not last.
                db.get(NavHistory, (schemes[0].id, today)).nav *= 3
                db.commit()
            ranking = asyncio.run(performance_ranking.compute_performance_ranking(db, [uuid.uuid4()])).funds[0]
        for period in ("1Y", "3Y", "5Y"):
            assert category.periods[period.lower()].peers == ranking.periods[period].total == 4
            # The held fund has the lowest return in the cached snapshot, even
            # if all current NAVs changed between the two section calls.
            assert ranking.periods[period].rank == 4
            assert category.periods[period.lower()].fund_return is not None
        warm.assert_awaited_once()
    finally:
        category_ranking._category_returns_cache.clear()
