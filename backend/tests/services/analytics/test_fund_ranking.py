# backend/tests/services/analytics/test_fund_ranking.py
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import pytest

from app.models.reference import RankingWeight, Scheme, SchemeRanking
import app.services.analytics.category_ranking as category_ranking_module


@pytest.fixture(autouse=True)
def _fresh_return_caches():
    # Fund Ranking now reads category_ranking's shared per-day returns cache, so a mocked result
    # left there by one test must never reach the next.
    category_ranking_module._category_returns_cache.clear()
    yield
    category_ranking_module._category_returns_cache.clear()


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_scheme_ranking_round_trips():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="T1", name="Test Fund", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    db.add(SchemeRanking(
        scheme_id=scheme.id, computed_at=datetime.now(timezone.utc), composite_score=Decimal("81.40"),
        category_rank=8, category_size=62, percentile=Decimal("87.10"),
    ))
    db.commit()
    row = db.query(SchemeRanking).filter_by(scheme_id=scheme.id).one()
    assert row.category_rank == 8


def test_ranking_weights_singleton_defaults():
    db = _session()
    db.add(RankingWeight(id=True))
    db.commit()
    row = db.query(RankingWeight).one()
    assert row.weight_return_3y == Decimal("0.250")
    assert row.weight_return_5y == Decimal("0.250")
    assert row.weight_category_relative == Decimal("0.200")
    assert row.weight_low_volatility == Decimal("0.150")
    assert row.weight_low_ter == Decimal("0.150")


# append to backend/tests/services/analytics/test_fund_ranking.py
import asyncio
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest

from app.services.analytics.fund_ranking import (
    _DEFAULT_WEIGHTS,
    _get_ranking_weights,
    _renormalized_composite,
)


def test_renormalized_composite_full_components():
    percentiles = {"return_3y": Decimal("90"), "return_5y": Decimal("80"), "category_relative": Decimal("70"), "low_volatility": Decimal("60"), "low_ter": Decimal("50")}
    result = _renormalized_composite(percentiles, _DEFAULT_WEIGHTS)
    expected = Decimal("0.25") * 90 + Decimal("0.25") * 80 + Decimal("0.20") * 70 + Decimal("0.15") * 60 + Decimal("0.15") * 50
    assert result == expected


def test_renormalized_composite_missing_5y_and_ter_renormalizes_remaining_three():
    percentiles = {"return_3y": Decimal("90"), "return_5y": None, "category_relative": Decimal("70"), "low_volatility": Decimal("60"), "low_ter": None}
    result = _renormalized_composite(percentiles, _DEFAULT_WEIGHTS)
    weight_sum = Decimal("0.25") + Decimal("0.20") + Decimal("0.15")  # 0.60
    expected = (Decimal("0.25") / weight_sum * 90) + (Decimal("0.20") / weight_sum * 70) + (Decimal("0.15") / weight_sum * 60)
    assert result == expected


def test_renormalized_composite_all_missing_returns_none():
    percentiles = {"return_3y": None, "return_5y": None, "category_relative": None, "low_volatility": None, "low_ter": None}
    assert _renormalized_composite(percentiles, _DEFAULT_WEIGHTS) is None


def test_get_ranking_weights_falls_back_to_defaults_when_table_empty():
    db = _session()
    assert _get_ranking_weights(db) == _DEFAULT_WEIGHTS


def test_get_ranking_weights_reads_singleton_row_when_present():
    db = _session()
    db.add(RankingWeight(id=True, weight_return_3y=Decimal("0.30"), weight_return_5y=Decimal("0.30"), weight_category_relative=Decimal("0.15"), weight_low_volatility=Decimal("0.15"), weight_low_ter=Decimal("0.10")))
    db.commit()
    weights = _get_ranking_weights(db)
    assert weights["return_3y"] == Decimal("0.30")
    assert weights["low_ter"] == Decimal("0.10")


from app.services.analytics.fund_ranking import compute_fund_ranking, compute_portfolio_ranking


def _horizon_fixture(n=4, *, missing_5y=False):
    import app.services.analytics.fund_ranking as module
    from app.models.enums import SchemePlanType

    module._category_ranking_cache.clear()
    db = _session()
    schemes = [Scheme(id=uuid.uuid4(), name=f"Horizon Fund {i}", amc_name=f"AMC {i}", sebi_category="Equity Scheme - Contra Fund", plan_type=SchemePlanType.DIRECT) for i in range(n)]
    db.add_all(schemes)
    db.commit()
    detailed = {scheme.id: (Decimal("0.10"), Decimal("0.12"), None if missing_5y else Decimal("0.14"), Decimal("0.132")) if index == 0
                else (Decimal("0.20"), Decimal("0.22"), Decimal("0.24"), Decimal("0.232")) for index, scheme in enumerate(schemes)}
    patches = (
        patch.object(module, "get_category_peers", new=AsyncMock(return_value=_peers(schemes))),
        patch.object(category_ranking_module, "_compute_category_returns_detailed", new=AsyncMock(return_value=detailed)),
        patch.object(module, "_latest_aaum_by_scheme", return_value={s.id: Decimal("300") if i == 0 else Decimal("100") for i, s in enumerate(schemes)}),
        patch.object(module, "_latest_ter_for_scheme", return_value=None),
        patch.object(module, "build_monthly_series_bulk", return_value={s.id: [] for s in schemes}),
    )
    return db, schemes, patches


def _horizon_row(n=4, *, missing_5y=False):
    db, schemes, patches = _horizon_fixture(n, missing_5y=missing_5y)
    with ExitStack() as stack:
        for context in patches:
            stack.enter_context(context)
        row = asyncio.run(compute_fund_ranking(db, schemes[0]))
    db.close()
    return row


def test_ranking_row_carries_horizons_with_the_shared_category_averages():
    row = _horizon_row()
    assert row.plan_type == "direct"
    assert row.horizons["1y"].model_dump() == {"fund_return": "0.10", "category_avg": "0.15", "peers": 4}
    assert row.horizons["3y"].model_dump() == {"fund_return": "0.12", "category_avg": "0.17", "peers": 4}
    assert row.horizons["5y"].model_dump() == {"fund_return": "0.14", "category_avg": "0.19", "peers": 4}


def test_too_few_peers_row_has_own_returns_but_no_category_average():
    row = _horizon_row(2)
    assert row.too_few_peers is True
    assert row.plan_type == "direct"
    assert row.horizons["3y"].fund_return == "0.12"
    assert all(h.category_avg is None and h.peers == 2 for h in row.horizons.values())
    assert row.category_rank is None


def test_five_year_missing_gives_no_fund_return_but_a_category_average():
    row = _horizon_row(missing_5y=True)
    assert row.horizons["5y"].model_dump() == {"fund_return": None, "category_avg": "0.24", "peers": 3}


@pytest.mark.parametrize("unavailable", [True, False])
def test_horizons_are_empty_for_unavailable_and_insufficient_history_rows(unavailable):
    import app.services.analytics.fund_ranking as module
    from app.models.enums import SchemePlanType

    module._category_ranking_cache.clear()
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), name="New Fund", amc_name="AMC", sebi_category="" if unavailable else "Equity Scheme - Contra Fund", plan_type=SchemePlanType.REGULAR)
    db.add(scheme)
    db.commit()
    with patch.object(module, "get_category_peers", new=AsyncMock(return_value=_peers([scheme]))), \
         patch.object(category_ranking_module, "_compute_category_returns_detailed", new=AsyncMock(return_value={})):
        row = asyncio.run(compute_fund_ranking(db, scheme))
    assert row.horizons == {}
    assert row.plan_type == "regular"
    assert row.category_unavailable is unavailable
    assert row.insufficient_history is (not unavailable)
    db.close()


def test_the_stored_ranking_row_is_unchanged():
    db, schemes, patches = _horizon_fixture()
    columns = list(SchemeRanking.__table__.columns.keys())
    assert set(columns) == {"scheme_id", "computed_at", "composite_score", "category_rank", "category_size", "percentile", "return_1y", "return_3y", "return_5y", "category_relative", "downside_deviation", "ter_value", "return_3y_percentile", "return_5y_percentile", "category_relative_percentile", "volatility_percentile", "ter_percentile"}
    with ExitStack() as stack:
        for context in patches:
            stack.enter_context(context)
        first = asyncio.run(compute_fund_ranking(db, schemes[0]))
        stored = db.query(SchemeRanking).one()
        before = {name: getattr(stored, name) for name in columns}
        second = asyncio.run(compute_fund_ranking(db, schemes[0]))
    after = {name: getattr(db.query(SchemeRanking).one(), name) for name in columns}
    assert before == after
    assert before["return_1y"] == Decimal("0.10")
    assert before["return_3y"] == Decimal("0.12")
    assert before["return_5y"] == Decimal("0.14")
    assert before["category_relative"] == Decimal("-0.05")
    assert before["composite_score"] == Decimal("0.00")
    assert first.model_dump() == second.model_dump()
    db.close()


def test_old_fund_ranking_payload_defaults():
    from app.services.analytics.schemas import FundRankingRow

    original = _horizon_row().model_dump(exclude={"horizons", "plan_type"})
    restored = FundRankingRow.model_validate(original)
    assert restored.horizons == {} and restored.plan_type is None

# append to backend/tests/services/analytics/test_fund_ranking.py
def _peers(schemes, fund_count=None):
    from app.services.analytics.scheme_universe import CategoryPeers
    return CategoryPeers(schemes=schemes, fund_count=fund_count or len(schemes),
                         representative_of={s.id: s.id for s in schemes})


def _seed_monthly_nav(db, scheme, months, start_nav=Decimal("10"), monthly_growth=Decimal("0.01")):
    from app.models.reference import NavHistory
    nav = start_nav
    today = date.today()
    for i in range(months, 0, -1):
        year = today.year - (i // 12)
        month = ((today.month - 1 - (i % 12)) % 12) + 1
        day = min(today.day, 28)
        row_date = today.replace(year=year, month=month, day=day)
        db.add(NavHistory(scheme_id=scheme.id, date=row_date, nav=nav))
        nav *= Decimal(1) + monthly_growth
    db.commit()


def test_compute_fund_ranking_ranks_against_category_and_fills_neighbors():
    import app.services.analytics.fund_ranking as fund_ranking_module
    fund_ranking_module._category_ranking_cache.clear()

    db = _session()
    schemes = [Scheme(id=uuid.uuid4(), amfi_code=f"R{i}", name=f"Fund {i}", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund") for i in range(10)]
    db.add_all(schemes)
    db.commit()
    for s in schemes:
        _seed_monthly_nav(db, s, 36)

    detailed = {
        s.id: (Decimal("0.10"), Decimal(f"0.{90 - i * 5:02d}"), Decimal(f"0.{80 - i * 5:02d}"), Decimal(f"0.{85 - i * 5:02d}"))
        for i, s in enumerate(schemes)
    }  # highest blended return = schemes[0], descending

    with (
        patch("app.services.analytics.fund_ranking.get_category_peers", new=AsyncMock(return_value=_peers(schemes))),
        patch("app.services.analytics.category_ranking._compute_category_returns_detailed", new=AsyncMock(return_value=detailed)),
        patch("app.services.analytics.fund_ranking._latest_aaum_by_scheme", return_value={}),
        patch("app.services.analytics.fund_ranking._latest_ter_for_scheme", return_value=None),
        patch("app.services.analytics.fund_ranking.build_monthly_series_bulk", return_value={s.id: [] for s in schemes}),
    ):
        row = asyncio.run(compute_fund_ranking(db, schemes[2]))  # 3rd-best -> category_rank 3

    assert row.insufficient_history is False
    assert row.category_rank == 3
    assert row.category_size == 10
    assert len(row.neighbors) == 4  # 2 above (#1,#2), 2 below (#4,#5)
    neighbor_ranks = sorted(n.category_rank for n in row.neighbors)
    assert neighbor_ranks == [1, 2, 4, 5]


def test_compute_fund_ranking_top_rank_has_no_above_neighbors():
    import app.services.analytics.fund_ranking as fund_ranking_module
    fund_ranking_module._category_ranking_cache.clear()

    db = _session()
    schemes = [Scheme(id=uuid.uuid4(), amfi_code=f"T{i}", name=f"Fund {i}", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund") for i in range(5)]
    db.add_all(schemes)
    db.commit()
    detailed = {s.id: (Decimal("0.10"), Decimal(f"0.{90 - i * 5:02d}"), Decimal(f"0.{80 - i * 5:02d}"), Decimal(f"0.{85 - i * 5:02d}")) for i, s in enumerate(schemes)}

    with (
        patch("app.services.analytics.fund_ranking.get_category_peers", new=AsyncMock(return_value=_peers(schemes))),
        patch("app.services.analytics.category_ranking._compute_category_returns_detailed", new=AsyncMock(return_value=detailed)),
        patch("app.services.analytics.fund_ranking._latest_aaum_by_scheme", return_value={}),
        patch("app.services.analytics.fund_ranking._latest_ter_for_scheme", return_value=None),
        patch("app.services.analytics.fund_ranking.build_monthly_series_bulk", return_value={s.id: [] for s in schemes}),
    ):
        row = asyncio.run(compute_fund_ranking(db, schemes[0]))  # best fund -> rank 1

    assert row.category_rank == 1
    assert len(row.neighbors) == 2  # 0 above, 2 below
    assert all(n.category_rank in (2, 3) for n in row.neighbors)


def test_compute_fund_ranking_missing_sebi_category_is_unavailable():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="U1", name="Unavailable Fund", amc_name="Test AMC", sebi_category="")
    db.add(scheme)
    db.commit()
    row = asyncio.run(compute_fund_ranking(db, scheme))
    assert row.category_unavailable is True
    assert row.insufficient_history is False
    assert row.composite_score is None


def test_compute_fund_ranking_scheme_without_3y_history_is_insufficient():
    import app.services.analytics.fund_ranking as fund_ranking_module
    fund_ranking_module._category_ranking_cache.clear()
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="N1", name="New Fund", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()

    with (
        patch("app.services.analytics.fund_ranking.get_category_peers", new=AsyncMock(return_value=_peers([scheme]))),
        patch("app.services.analytics.category_ranking._compute_category_returns_detailed", new=AsyncMock(return_value={})),  # no scheme has 3y history
    ):
        row = asyncio.run(compute_fund_ranking(db, scheme))

    assert row.insufficient_history is True
    assert row.composite_score is None


def _ranked_fixture(n, universe_size=None):
    """n funds with descending composites; patches everything but the ranking itself."""
    import app.services.analytics.fund_ranking as fund_ranking_module
    fund_ranking_module._category_ranking_cache.clear()
    db = _session()
    schemes = [Scheme(id=uuid.uuid4(), amfi_code=f"K{i}", name=f"Fund {i}", amc_name=f"AMC {i}", sebi_category="Equity Scheme - Contra Fund") for i in range(n)]
    db.add_all(schemes)
    db.commit()
    detailed = {s.id: (None, Decimal(f"0.{90 - i * 5:02d}"), None, Decimal(f"0.{90 - i * 5:02d}")) for i, s in enumerate(schemes)}
    patches = (
        patch("app.services.analytics.fund_ranking.get_category_peers", new=AsyncMock(return_value=_peers(schemes, universe_size))),
        patch("app.services.analytics.category_ranking._compute_category_returns_detailed", new=AsyncMock(return_value=detailed)),
        patch("app.services.analytics.fund_ranking._latest_aaum_by_scheme", return_value={}),
        patch("app.services.analytics.fund_ranking._latest_ter_for_scheme", return_value=None),
        patch("app.services.analytics.fund_ranking.build_monthly_series_bulk", return_value={s.id: [] for s in schemes}),
    )
    return db, schemes, patches


def test_composite_score_is_the_composite_not_the_percentile():
    """Fix 1: TER runs opposite to returns, so each fund's composite differs from its
    category percentile; the row and the stored history carry the composite."""
    from app.models.reference import SchemeRanking
    db, schemes, patches = _ranked_fixture(4)
    ter = {s.id: (Decimal("0.5") + Decimal("0.1") * (3 - i), date.today()) for i, s in enumerate(schemes)}
    with patches[0], patches[1], patches[2], patch("app.services.analytics.fund_ranking._latest_ter_for_scheme", side_effect=lambda _db, sid: ter[sid]), patches[4]:
        row = asyncio.run(compute_fund_ranking(db, schemes[2]))
    assert row.composite_score != row.percentile
    stored = db.query(SchemeRanking).one()
    assert str(stored.composite_score) == row.composite_score
    assert str(stored.percentile) == row.percentile


def test_thin_flag_uses_ranked_count_and_reports_universe():
    """Fix 3 (A + C): 8 funds in the category, 3 ranked -> thin, size 3, universe 8."""
    db, schemes, patches = _ranked_fixture(3, universe_size=8)
    with patches[0], patches[1], patches[2], patches[3], patches[4]:
        row = asyncio.run(compute_fund_ranking(db, schemes[1]))
    assert row.thin_category is True and row.too_few_peers is False
    assert (row.category_rank, row.category_size, row.category_universe_size) == (2, 3, 8)


def test_fewer_than_three_ranked_funds_are_not_ranked():
    """D2: "#1 of 2" says nothing -- no rank, no percentiles, own numbers kept, no row stored."""
    from app.models.reference import SchemeRanking
    db, schemes, patches = _ranked_fixture(2, universe_size=5)
    with patches[0], patches[1], patches[2], patches[3], patches[4]:
        row = asyncio.run(compute_fund_ranking(db, schemes[0]))
    assert row.too_few_peers is True
    assert row.category_rank is None and row.percentile is None and row.composite_score is None
    assert row.components.return_3y.raw is not None and row.components.return_3y.percentile is None
    assert db.query(SchemeRanking).count() == 0


def test_same_fund_twice_in_one_session_keeps_one_row():
    """Fix 4: recompute runs combined + per member, so a same-day repeat write is routine."""
    from app.models.reference import SchemeRanking
    db, schemes, patches = _ranked_fixture(5)
    with patches[0], patches[1], patches[2], patches[3], patches[4]:
        first = asyncio.run(compute_fund_ranking(db, schemes[1]))
        second = asyncio.run(compute_fund_ranking(db, schemes[1]))
    assert (first.composite_score, first.category_rank) == (second.composite_score, second.category_rank)
    assert db.query(SchemeRanking).count() == 1
    assert db.query(Scheme).count() == 5  # the session still works after the rollback


def test_held_idcw_plan_is_ranked_on_its_growth_series():
    from app.services.analytics.scheme_universe import CategoryPeers
    db, schemes, patches = _ranked_fixture(5)
    idcw = Scheme(id=uuid.uuid4(), amfi_code="K1-IDCW", name="Fund 1 - IDCW", amc_name="AMC 1", sebi_category="Equity Scheme - Contra Fund")
    db.add(idcw)
    db.commit()
    peers = CategoryPeers(schemes=schemes, fund_count=5,
                          representative_of={**{s.id: s.id for s in schemes}, idcw.id: schemes[1].id})
    with patch("app.services.analytics.fund_ranking.get_category_peers", new=AsyncMock(return_value=peers)), patches[1], patches[2], patches[3], patches[4]:
        row = asyncio.run(compute_fund_ranking(db, idcw))
    assert row.category_rank == 2
    assert row.ranked_as == "Fund 1"
    assert row.scheme_id == str(idcw.id)


def test_one_member_portfolio_repeated_combined_and_member_results_complete():
    from app.models.user import User, HouseholdMember
    from app.models.folio import Folio
    from app.models.transaction import Transaction
    from app.models.enums import Relationship, PlanType, TransactionType
    db, schemes, patches = _ranked_fixture(5)
    user = User(id=uuid.uuid4(), phone_number="+919876543210", created_at=datetime.now(timezone.utc))
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Self", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add_all([user, member])
    db.commit()
    for i, scheme in enumerate(schemes[:2]):
        folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=f"F{i}", plan_type=PlanType.DIRECT)
        db.add(folio)
        db.flush()
        db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=date.today(), amount=Decimal("1000"), units=Decimal("100"), nav=Decimal("10")))
    db.commit()
    with patches[0], patches[1], patches[2], patches[3], patches[4], \
         patch("app.services.dashboard.holdings.get_nav_on_or_before", new=AsyncMock(return_value=(Decimal("11"), date.today()))), \
         patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None):
        combined = asyncio.run(compute_portfolio_ranking(db, [member.id]))
        per_member = asyncio.run(compute_portfolio_ranking(db, [member.id]))
    assert len(combined.funds) == len(per_member.funds) == 2
    assert {r.scheme_id: r.model_dump() for r in combined.funds} == {r.scheme_id: r.model_dump() for r in per_member.funds}
    assert all(r.category_rank is not None for r in per_member.funds)
    assert db.query(SchemeRanking).count() == 2


def test_compute_fund_ranking_last_rank_has_only_above_neighbors():
    db, schemes, patches = _ranked_fixture(5)
    with patches[0], patches[1], patches[2], patches[3], patches[4]:
        row = asyncio.run(compute_fund_ranking(db, schemes[-1]))
    assert row.category_rank == 5
    assert [n.category_rank for n in row.neighbors] == [3, 4]


def test_compute_fund_ranking_missing_5y_renormalizes_four_components():
    p = {"return_3y": Decimal("90"), "return_5y": None, "category_relative": Decimal("70"), "low_volatility": Decimal("60"), "low_ter": Decimal("50")}
    assert _renormalized_composite(p, _DEFAULT_WEIGHTS) == Decimal("53") / Decimal("0.75")


def test_compute_fund_ranking_missing_ter_renormalizes_four_components():
    p = {"return_3y": Decimal("90"), "return_5y": Decimal("80"), "category_relative": Decimal("70"), "low_volatility": Decimal("60"), "low_ter": None}
    assert abs(_renormalized_composite(p, _DEFAULT_WEIGHTS) - Decimal("65.5") / Decimal("0.85")) < Decimal("1e-25")


def test_category_ranking_cache_separates_direct_and_regular():
    import app.services.analytics.fund_ranking as module
    from app.models.enums import SchemePlanType
    db, schemes, _ = _ranked_fixture(3)
    direct = {schemes[0].id: {"composite": Decimal("50")}}
    regular = {schemes[1].id: {"composite": Decimal("25")}}
    category = "Equity Scheme - Contra Fund"
    with patch.object(module, "_compute_category_ranking_scores", new=AsyncMock(side_effect=[direct, regular])):
        first = asyncio.run(module._category_ranking_scores(db, _peers(schemes[:1]), (category, SchemePlanType.DIRECT), date.today()))
        second = asyncio.run(module._category_ranking_scores(db, _peers(schemes[1:2]), (category, SchemePlanType.REGULAR), date.today()))
        repeated = asyncio.run(module._category_ranking_scores(db, _peers(schemes[:1]), (category, SchemePlanType.DIRECT), date.today()))
    assert first == repeated == direct
    assert second == regular


def test_one_ranked_fund_has_no_percentiles_or_history_row():
    db, schemes, patches = _ranked_fixture(1)
    with patches[0], patches[1], patches[2], patches[3], patches[4]:
        row = asyncio.run(compute_fund_ranking(db, schemes[0]))
    assert row.too_few_peers is True
    assert row.category_rank is None and row.percentile is None
    assert all(c["percentile"] is None for c in row.components.model_dump().values())
    assert db.query(SchemeRanking).count() == 0


def test_empty_peer_set_is_not_cached():
    """An AMFI outage yields empty peers; caching that for 15 minutes would keep every
    fund unranked after AMFI comes back."""
    import app.services.analytics.fund_ranking as fund_ranking_module
    from app.services.analytics.scheme_universe import CategoryPeers
    fund_ranking_module._category_ranking_cache.clear()
    empty = CategoryPeers(schemes=[], fund_count=0, representative_of={})
    asyncio.run(fund_ranking_module._category_ranking_scores(_session(), empty, ("Equity Scheme - Contra Fund", None), date.today()))
    assert fund_ranking_module._category_ranking_cache == {}
