import asyncio
import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.enums import SchemePlanType
from app.models.reference import NavHistory, Scheme, SchemeAaum
from app.services.analytics import category_ranking, fund_ranking
from app.services.analytics.risk_metrics import years_ago
from app.services.analytics.scheme_universe import CategoryPeers


@pytest.mark.parametrize("missing_5y", [False, True])
def test_both_sections_show_the_same_category_average_for_the_same_fund(db_session, missing_5y):
    db = db_session
    today = date.today()
    schemes = [Scheme(id=uuid.uuid4(), name=f"Fund {i}", amc_name=f"AMC {i}", sebi_category="Equity Scheme - Flexi Cap Fund", plan_type=SchemePlanType.DIRECT) for i in range(4)]
    db.add_all(schemes)
    db.flush()
    for index, scheme in enumerate(schemes):
        for years, nav in [(5, "8"), (3, "10"), (1, "11"), (0, str(13 + index))]:
            if years == 5 and index == 0 and missing_5y:
                continue
            db.add(NavHistory(scheme_id=scheme.id, date=years_ago(today, years), nav=Decimal(nav)))
        db.add(SchemeAaum(scheme_id=scheme.id, reference_period=today, aaum_value=Decimal("300") if index == 0 else Decimal("100")))
    db.commit()
    peers = CategoryPeers(schemes=schemes, fund_count=4, representative_of={s.id: s.id for s in schemes})
    holdings = [SimpleNamespace(scheme_id=str(schemes[0].id))]
    category_ranking._category_returns_cache.clear()
    fund_ranking._category_ranking_cache.clear()
    try:
        with patch.object(category_ranking, "compute_holdings", new=AsyncMock(return_value=holdings)), \
             patch.object(fund_ranking, "compute_holdings", new=AsyncMock(return_value=holdings)), \
             patch.object(category_ranking, "get_category_peers", new=AsyncMock(return_value=peers)), \
             patch.object(fund_ranking, "get_category_peers", new=AsyncMock(return_value=peers)), \
             patch.object(category_ranking, "warm_nav_history", new=AsyncMock()):
            category = asyncio.run(category_ranking.compute_category_ranking(db, [uuid.uuid4()])).funds[0]
            ranking = asyncio.run(fund_ranking.compute_portfolio_ranking(db, [uuid.uuid4()])).funds[0]
        for period in ("1y", "3y", "5y"):
            left, right = category.periods[period], ranking.horizons[period]
            assert left.category_avg is not None
            assert left.category_avg == right.category_avg
            assert left.peers == right.peers == (3 if period == "5y" and missing_5y else 4)
            assert left.fund_return == right.fund_return
        assert category.periods["5y"].fund_return is None if missing_5y else category.periods["5y"].fund_return is not None
    finally:
        category_ranking._category_returns_cache.clear()
        fund_ranking._category_ranking_cache.clear()
