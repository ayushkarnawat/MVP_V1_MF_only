import ast
import asyncio
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.enums import SchemePlanType
from app.models.reference import NavHistory, Scheme
from app.services.analytics import category_ranking as category
from app.services.analytics.risk_metrics import years_ago
from app.services.analytics.scheme_universe import CategoryPeers

CATEGORY = "Equity Scheme - Flexi Cap Fund"


@pytest.fixture(autouse=True)
def clear_returns_cache():
    category._category_returns_cache.clear()
    yield
    category._category_returns_cache.clear()


def _seed(db, index, age=5, end=None, plan=SchemePlanType.DIRECT, active=True, name=None):
    scheme = Scheme(id=uuid.uuid4(), name=name or f"Synthetic Fund {index}", amc_name=f"AMC {index}",
                    sebi_category=CATEGORY, plan_type=plan, is_active=active)
    db.add(scheme); db.flush()
    db.add(NavHistory(scheme_id=scheme.id, date=date.today(), nav=Decimal(end if end is not None else str(100 + index * 10))))
    for years in (1, 3, 5):
        if years <= age:
            db.add(NavHistory(scheme_id=scheme.id, date=years_ago(date.today(), years), nav=Decimal("100")))
    db.commit()
    return scheme


def _compute(db, monkeypatch, schemes, held=None):
    from app.services.analytics import performance_ranking as ranking
    peers = CategoryPeers(schemes=schemes, fund_count=len(schemes), representative_of={s.id: s.id for s in schemes})
    monkeypatch.setattr(ranking, "get_category_peers", AsyncMock(return_value=peers))
    monkeypatch.setattr(ranking, "compute_holdings", AsyncMock(return_value=[SimpleNamespace(scheme_id=str(s.id)) for s in (held or schemes)]))
    monkeypatch.setattr(category, "warm_nav_history", AsyncMock())
    return asyncio.run(ranking.compute_performance_ranking(db, [uuid.uuid4()]))


def test_rank_and_total_per_period_on_a_five_fund_category(db_session, monkeypatch):
    schemes = [_seed(db_session, i, age=age) for i, age in enumerate((5, 5, 3, 1, 1))]
    result = _compute(db_session, monkeypatch, schemes)
    first = next(row for row in result.funds if row.scheme_id == str(schemes[0].id))
    assert {key: (value.rank, value.total, value.status) for key, value in first.periods.items()} == {
        "1Y": (5, 5, "ranked"), "3Y": (3, 3, "ranked"), "5Y": (2, 2, "ranked"),
    }


def test_fund_with_only_one_year_gets_1y_rank_and_dashes_for_3y_5y(db_session, monkeypatch):
    old, young = _seed(db_session, 0), _seed(db_session, 1, age=1)
    row, = _compute(db_session, monkeypatch, [old, young], [young]).funds
    assert row.periods["1Y"].rank == 1 and row.periods["1Y"].total == 2
    assert [(row.periods[key].rank, row.periods[key].total, row.periods[key].status) for key in ("3Y", "5Y")] == [
        (None, 1, "not_enough_history"), (None, 1, "not_enough_history"),
    ]


def test_ties_share_the_same_rank(db_session, monkeypatch):
    schemes = [_seed(db_session, i, end=value) for i, value in enumerate(("130", "120", "120", "100"))]
    result = _compute(db_session, monkeypatch, schemes)
    rows = {row.scheme_id: row for row in result.funds}
    for period in ("1Y", "3Y", "5Y"):
        assert [rows[str(s.id)].periods[period].rank for s in schemes] == [1, 2, 2, 4]


@pytest.mark.parametrize("zero_nav", [True, False])
def test_wound_up_fund_is_excluded_from_the_pool(db_session, monkeypatch, zero_nav):
    held = _seed(db_session, 0)
    closed = _seed(db_session, 1, end="0" if zero_nav else "1000", active=zero_nav)
    row, = _compute(db_session, monkeypatch, [held, closed], [held]).funds
    assert all(value.rank == 1 and value.total == 1 for value in row.periods.values())


def test_direct_fund_is_never_ranked_against_regular_peers(db_session, monkeypatch):
    direct = _seed(db_session, 0, end="110")
    regular = _seed(db_session, 1, end="500", plan=SchemePlanType.REGULAR)
    row, = _compute(db_session, monkeypatch, [direct, regular], [direct]).funds
    assert all(value.rank == 1 and value.total == 1 for value in row.periods.values())


def test_index_fund_is_not_ranked_and_carries_the_disclaimer_key(db_session, monkeypatch):
    index = _seed(db_session, 0, name="Synthetic Nifty 50 Index Fund")
    row, = _compute(db_session, monkeypatch, [index]).funds
    assert row.disclaimer_key == "index_fund_not_ranked"
    assert all(value.rank is None and value.status == "not_ranked_index_fund" for value in row.periods.values())


def test_ranking_section_key_is_unchanged_in_recompute():
    from app.services.analytics.recompute import _SECTIONS
    spec, = [entry for entry in _SECTIONS if entry.name == "ranking"]
    assert spec.compute.__name__ == "compute_performance_ranking"
    from app.services.analytics.schemas import PerformanceRankingResult
    assert spec.wrap_combined([], PerformanceRankingResult(funds=[])).model_dump(mode="json") == {
        "members": [], "ranking": {"funds": []},
    }


def test_no_module_imports_fund_ranking_or_the_dropped_models():
    root = Path(__file__).resolve().parents[3] / "app"
    assert not (root / "services/analytics/fund_ranking.py").exists()
    offenders = []
    for path in root.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom):
                if (node.module or "").endswith("fund_ranking") or any(
                    alias.name in {"SchemeRanking", "RankingWeight", "FundRankingSummary", "AggregateFundRankingResponse"}
                    for alias in node.names
                ):
                    offenders.append(str(path.relative_to(root)))
    assert offenders == []
    import app.models.reference as reference
    assert not hasattr(reference, "SchemeRanking") and not hasattr(reference, "RankingWeight")


@pytest.mark.parametrize("short_first", [False, True])
def test_short_history_mode_keeps_default_output_and_cache_key_unchanged_without_second_nav_pass(db_session, monkeypatch, short_first):
    old, young = _seed(db_session, 0, end="200"), _seed(db_session, 1, age=1)
    today = date.today()
    key = ("peers", CATEGORY, SchemePlanType.DIRECT)
    # Frozen original output for NAV 100 -> 200 over each window. Pin the
    # decimal strings too: the 1Y-only fund remains absent on the default path.
    expected_strings = ["1", "0.259921049894873164767210607", "0.148698354997035006798626947", "0.1931874329561702699860604110"]
    expected = {old.id: tuple(map(Decimal, expected_strings))}
    warm = AsyncMock()
    monkeypatch.setattr(category, "warm_nav_history", warm)
    with patch.object(category, "_bulk_nav_on_or_before", wraps=category._bulk_nav_on_or_before) as lookup:
        async def run():
            if short_first:
                short = await category._category_returns_detailed(db_session, [old, young], today, cache_key=key, include_short_history=True)
            legacy = await category._category_returns_detailed(db_session, [old, young], today, cache_key=key)
            if not short_first:
                short = await category._category_returns_detailed(db_session, [old, young], today, cache_key=key, include_short_history=True)
            again = await category._category_returns_detailed(db_session, [old, young], today, cache_key=key)
            return legacy, short, again
        legacy, short, again = asyncio.run(run())
    assert legacy == again == expected
    assert {str(sid): list(map(str, values)) for sid, values in legacy.items()} == {
        str(old.id): expected_strings,
    }
    assert set(category._category_returns_cache) == {key}
    assert category._category_returns_cache[key][2] == expected
    assert set(short) == {old.id, young.id} and short[young.id][1:] == (None, None, None)
    warm.assert_awaited_once()
    assert lookup.call_count == 1
