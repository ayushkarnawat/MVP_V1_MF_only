import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
from app.models.enums import (
    ALL_BENCHMARK_INDICES,
    BenchmarkIndex,
    BenchmarkReturnType,
    PlanType,
    Relationship,
    TransactionType,
)
from app.models.folio import Folio
from app.models.reference import BenchmarkIndexHistory, Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.benchmark import compute_fund_vs_benchmark, compute_portfolio_vs_benchmarks
from app.services.analytics.benchmark_windows import WINDOWS, WindowContext, window_start
from app.services.analytics.recompute import (
    _SECTIONS,
    _upsert_section,
    recompute_household_analytics,
    release_recompute_claim,
    should_dispatch_recompute,
    try_claim_recompute,
)
from app.services.analytics.schemas import (
    AggregateFundVsBenchmarkResponse,
    AggregatePortfolioBenchmarkResponse,
    ValuationSummary,
    ValuationMetric,
    OverlapSummary,
    OverlapBands,
    AssetAllocationSummary,
    AssetAllocationVariant,
    CapAllocationSummary,
    CapAllocationOther,
    LookthroughCoverage,
    StockHoldingsSummary,
    FundManagerAllocationSummary,
    AnalyticsAllocationSummary,
    CategoryRankingSummary,
    FundRankingSummary,
    DirectRegularTerComparison,
    FundVsBenchmarkSummary,
    InvestmentWithdrawalResult,
    InvestmentWithdrawalSipSummary,
    PortfolioBenchmarkSummary,
    PortfolioScoreSummary,
    WeightedTerSummary,
)
from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.schemas import HoldingRow


def _session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _user_with_members(db, n_members=2) -> tuple[User, list[HouseholdMember]]:
    user = User(id=uuid.uuid4(), phone_number=f"+9199{uuid.uuid4().hex[:8]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    members = []
    for i in range(n_members):
        member = HouseholdMember(
            id=uuid.uuid4(), user_id=user.id, name=f"Member {i}", relationship=Relationship.SELF,
            created_at=datetime.now(timezone.utc),
        )
        db.add(member)
        members.append(member)
    db.commit()
    return user, members


_MOCK_RESULTS = {
    "cap_allocation": CapAllocationSummary(
        buckets=[], other=CapAllocationOther(non_equity_value=Decimal("0"), unclassified_equity_value=Decimal("0"), non_equity_rows=[], unclassified_equity_rows=[]),
        total_portfolio_value=Decimal("0"), total_equity_value=Decimal("0"), nav_as_of=None,
        holdings_as_of=None, classification_as_of=None,
        coverage=LookthroughCoverage(covered_value_pct=Decimal("0"), not_published_yet=[], not_available_from_amc=[], missing_value_schemes=[], funds=[]),
        hide_headlines=True, excluded_share=Decimal("0"),
    ),
    "stock_holdings": StockHoldingsSummary(
        rows=[], nav_as_of=None, holdings_as_of=None, total_portfolio_value=Decimal("0"),
        coverage=LookthroughCoverage(covered_value_pct=Decimal("0"), not_published_yet=[],
                                     not_available_from_amc=[], missing_value_schemes=[], funds=[]),
        truncated=False, total_stock_count=0, hide_headlines=True,
        excluded_share=Decimal("0"), non_equity_share=Decimal("0"),
    ),
    "fund_manager": FundManagerAllocationSummary(manager_groups=[], unavailable_schemes=[]),
    "ranking": FundRankingSummary(funds=[]),
    "investment_withdrawal": InvestmentWithdrawalResult(
        total_invested="0.00", total_withdrawn="0.00", net_invested="0.00",
        current_value="0.00", absolute_gain="0.00", monthly=[], yearly=[],
        sip_summary=InvestmentWithdrawalSipSummary(
            active_count=0, total_monthly_amount="0.00", missed_count=0,
        ),
    ),
    "allocation": AnalyticsAllocationSummary(by_category=[], by_amc=[], total_value="0"),
    "ter": WeightedTerSummary(weighted_ter=None, covered_value="0", total_value="0", reference_period=None, uncovered_schemes=[]),
    "ter_direct_regular": DirectRegularTerComparison(
        direct=WeightedTerSummary(weighted_ter=None, covered_value="0", total_value="0", reference_period=None, uncovered_schemes=[]),
        regular=WeightedTerSummary(weighted_ter=None, covered_value="0", total_value="0", reference_period=None, uncovered_schemes=[]),
    ),
    "benchmark": PortfolioBenchmarkSummary(portfolio_xirr=None, benchmarks=[]),
    "benchmark_funds": FundVsBenchmarkSummary(funds=[], overall_portfolio_xirr=None, overall_broad_market_xirr=None),
    "category_ranking": CategoryRankingSummary(funds=[]),
    "score": PortfolioScoreSummary(funds=[], weighted_score=None, covered_value="0", total_value="0", uncovered_schemes=[]),
}


_asset_variant = AssetAllocationVariant(classes=[], equity_outer=[], cap_allocation=_MOCK_RESULTS["cap_allocation"])
_MOCK_RESULTS["asset_allocation"] = AssetAllocationSummary(
    as_disclosed=_asset_variant, arbitrage_as_cash=_asset_variant, total_portfolio_value=Decimal(0),
    covered_value=Decimal(0), nav_as_of=None, holdings_as_of=None,
    coverage=_MOCK_RESULTS["cap_allocation"].coverage, hide_headlines=True,
    excluded_share=Decimal(0), arbitrage_funds=[],
)

_MOCK_RESULTS["overlap"] = OverlapSummary(
    matrix_funds=[], matrix=[], pairs_above_low=[], matrix_truncated=False,
    total_fund_count=0, common_stock_limit=20, bands=OverlapBands(low=Decimal(20), high=Decimal(40)),
    concentration=[], total_stock_count=0, nav_as_of=None, holdings_as_of=None,
    total_portfolio_value=Decimal(0), coverage=_MOCK_RESULTS["cap_allocation"].coverage,
    hide_headlines=True, excluded_share=Decimal(0),
)

_metric = ValuationMetric(ratio=None, coverage_pct=Decimal(0), enough_data=False, as_of_date=None, missing=[])
_MOCK_RESULTS["valuation"] = ValuationSummary(
    pe=_metric, pb=_metric, indices=[], total_equity_value=Decimal(0), total_portfolio_value=Decimal(0),
    nav_as_of=None, holdings_as_of=None, coverage=_MOCK_RESULTS["cap_allocation"].coverage,
    hide_headlines=True, excluded_share=Decimal(0), footnotes=[],
)


def _patched_computes():
    return [
        patch(f"app.services.analytics.recompute._SECTIONS", _SECTIONS)  # placeholder, replaced below
    ]


def test_recompute_writes_one_row_per_scope_per_section():
    db = _session()
    user, members = _user_with_members(db, n_members=2)

    mocks = {
        section.name: AsyncMock(return_value=_MOCK_RESULTS[section.name]) for section in _SECTIONS
    }
    patches = [patch.object(section, "compute", mocks[section.name]) for section in _SECTIONS]
    for p in patches:
        p.start()
    try:
        import asyncio
        asyncio.run(recompute_household_analytics(db, user.id))
    finally:
        for p in patches:
            p.stop()

    rows = db.query(AnalyticsSection).filter(AnalyticsSection.user_id == user.id).all()
    # 3 scopes (combined + 2 members), including the new ranking section.
    assert len(rows) == 3 * len(_SECTIONS)
    scope_keys = {row.scope_key for row in rows}
    assert scope_keys == {"combined", str(members[0].id), str(members[1].id)}
    combined_allocation = db.get(AnalyticsSection, (user.id, "combined", "allocation"))
    assert combined_allocation.payload["members"][0]["id"] in {str(members[0].id), str(members[1].id)}
    member_allocation = db.get(AnalyticsSection, (user.id, str(members[0].id), "allocation"))
    assert "members" not in member_allocation.payload
    combined_stocks = db.get(AnalyticsSection, (user.id, "combined", "stock_holdings"))
    member_stocks = db.get(AnalyticsSection, (user.id, str(members[0].id), "stock_holdings"))
    assert combined_stocks.payload["stock_holdings"] == _MOCK_RESULTS["stock_holdings"].model_dump(mode="json")
    assert member_stocks.payload == _MOCK_RESULTS["stock_holdings"].model_dump(mode="json")
    combined_assets = db.get(AnalyticsSection, (user.id, "combined", "asset_allocation"))
    member_assets = db.get(AnalyticsSection, (user.id, str(members[0].id), "asset_allocation"))
    assert combined_assets.payload["asset_allocation"] == _MOCK_RESULTS["asset_allocation"].model_dump(mode="json")
    assert member_assets.payload == _MOCK_RESULTS["asset_allocation"].model_dump(mode="json")
    combined_overlap = db.get(AnalyticsSection, (user.id, "combined", "overlap"))
    member_overlap = db.get(AnalyticsSection, (user.id, str(members[0].id), "overlap"))
    assert combined_overlap.payload["overlap"] == _MOCK_RESULTS["overlap"].model_dump(mode="json")
    assert member_overlap.payload == _MOCK_RESULTS["overlap"].model_dump(mode="json")
    combined_valuation = db.get(AnalyticsSection, (user.id, "combined", "valuation"))
    member_valuation = db.get(AnalyticsSection, (user.id, str(members[0].id), "valuation"))
    assert combined_valuation.payload["valuation"] == _MOCK_RESULTS["valuation"].model_dump(mode="json")
    assert member_valuation.payload == _MOCK_RESULTS["valuation"].model_dump(mode="json")


def test_recompute_clears_started_at_when_done():
    db = _session()
    user, _members = _user_with_members(db, n_members=1)

    mocks_active = [patch.object(section, "compute", AsyncMock(return_value=_MOCK_RESULTS[section.name])) for section in _SECTIONS]
    for p in mocks_active:
        p.start()
    try:
        import asyncio
        asyncio.run(recompute_household_analytics(db, user.id))
    finally:
        for p in mocks_active:
            p.stop()

    status = db.get(AnalyticsRecomputeStatus, user.id)
    assert status.started_at is None


def test_generation_bump_mid_run_stops_stale_writes_and_allows_fresh_dispatch():
    """A transaction mutation must invalidate a recompute already in flight."""
    import asyncio

    from app.api.analytics import get_analytics_scope

    db = _session()
    user, _members = _user_with_members(db, n_members=1)
    assert try_claim_recompute(db, user.id) is True

    async def bump_generation_during_first_compute(*_args, **_kwargs):
        status = db.get(AnalyticsRecomputeStatus, user.id)
        assert status.started_at is not None  # the run really holds the claim
        status.generation += 1
        db.commit()
        return _MOCK_RESULTS["allocation"]

    patches = []
    for section in _SECTIONS:
        compute = (
            AsyncMock(side_effect=bump_generation_during_first_compute)
            if section.name == "allocation"
            else AsyncMock(return_value=_MOCK_RESULTS[section.name])
        )
        patches.append(patch.object(section, "compute", compute))
    for active_patch in patches:
        active_patch.start()
    try:
        asyncio.run(recompute_household_analytics(db, user.id))
    finally:
        for active_patch in patches:
            active_patch.stop()

    assert db.query(AnalyticsSection).filter_by(user_id=user.id).count() == 0
    status = db.get(AnalyticsRecomputeStatus, user.id)
    assert status.generation == 1
    assert status.started_at is None

    with patch("app.api.analytics.dispatcher.dispatch", return_value=True) as dispatch:
        response = get_analytics_scope("combined", user=user, db=db)

    assert response.recomputing is True
    assert response.sections == {}
    dispatch.assert_called_once_with(user.id)


def test_recompute_leaves_existing_row_and_sets_failed_at_when_a_section_raises():
    db = _session()
    user, _members = _user_with_members(db, n_members=1)

    # Seed a prior successful "score" row for combined scope.
    db.add(AnalyticsSection(
        user_id=user.id, scope_key="combined", section="score", household_member_id=None,
        payload={"funds": [], "weighted_score": "50", "covered_value": "0", "total_value": "0", "uncovered_schemes": []},
        computed_at=datetime.now(timezone.utc), failed_at=None,
    ))
    db.commit()

    def failing_score(*args, **kwargs):
        raise RuntimeError("boom")

    patches = []
    for section in _SECTIONS:
        if section.name == "score":
            patches.append(patch.object(section, "compute", AsyncMock(side_effect=failing_score)))
        else:
            patches.append(patch.object(section, "compute", AsyncMock(return_value=_MOCK_RESULTS[section.name])))
    for p in patches:
        p.start()
    try:
        import asyncio
        asyncio.run(recompute_household_analytics(db, user.id))
    finally:
        for p in patches:
            p.stop()

    combined_score = db.get(AnalyticsSection, (user.id, "combined", "score"))
    assert combined_score.payload["weighted_score"] == "50"  # unchanged
    assert combined_score.failed_at is not None

    status = db.get(AnalyticsRecomputeStatus, user.id)
    assert status.started_at is None  # still cleared despite the mid-loop failure


def test_recompute_clears_a_stale_failed_at_on_next_success():
    db = _session()
    user, _members = _user_with_members(db, n_members=1)

    db.add(AnalyticsSection(
        user_id=user.id, scope_key="combined", section="allocation", household_member_id=None,
        payload={"by_category": [], "by_amc": [], "total_value": "0"},
        computed_at=datetime.now(timezone.utc), failed_at=datetime.now(timezone.utc),
    ))
    db.commit()

    patches = [patch.object(section, "compute", AsyncMock(return_value=_MOCK_RESULTS[section.name])) for section in _SECTIONS]
    for p in patches:
        p.start()
    try:
        import asyncio
        asyncio.run(recompute_household_analytics(db, user.id))
    finally:
        for p in patches:
            p.stop()

    combined_allocation = db.get(AnalyticsSection, (user.id, "combined", "allocation"))
    assert combined_allocation.failed_at is None


def test_should_dispatch_recompute_true_when_no_status_row():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    assert should_dispatch_recompute(db, user.id) is True


def test_recompute_status_generation_starts_at_zero():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    status = AnalyticsRecomputeStatus(user_id=user.id, started_at=None)
    db.add(status)
    db.commit()

    assert status.generation == 0


def test_should_dispatch_recompute_false_while_recently_started():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    db.add(AnalyticsRecomputeStatus(user_id=user.id, started_at=datetime.now(timezone.utc)))
    db.commit()
    assert should_dispatch_recompute(db, user.id) is False


def test_should_dispatch_recompute_true_once_started_at_is_stale():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    stale = datetime.now(timezone.utc) - timedelta(hours=3)
    db.add(AnalyticsRecomputeStatus(user_id=user.id, started_at=stale))
    db.commit()
    assert should_dispatch_recompute(db, user.id) is True


def test_try_claim_recompute_succeeds_when_no_status_row():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    assert try_claim_recompute(db, user.id) is True
    status = db.get(AnalyticsRecomputeStatus, user.id)
    assert status.started_at is not None


def test_try_claim_recompute_fails_while_a_fresh_claim_is_held():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    assert try_claim_recompute(db, user.id) is True
    # A second, concurrent caller must not also win the claim while the
    # first is still fresh -- this is the exact race should_dispatch_recompute
    # alone left open (Finding #1).
    assert try_claim_recompute(db, user.id) is False


def test_try_claim_recompute_succeeds_over_a_stale_claim():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    stale = datetime.now(timezone.utc) - timedelta(hours=3)
    db.add(AnalyticsRecomputeStatus(user_id=user.id, started_at=stale))
    db.commit()

    assert try_claim_recompute(db, user.id) is True
    status = db.get(AnalyticsRecomputeStatus, user.id)
    # SQLite doesn't round-trip tzinfo on read -- see should_dispatch_recompute's
    # own docstring note; every write path here is UTC regardless.
    refreshed = status.started_at.replace(tzinfo=timezone.utc)
    assert refreshed > stale


def test_release_recompute_claim_clears_started_at():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    assert try_claim_recompute(db, user.id) is True

    release_recompute_claim(db, user.id)

    status = db.get(AnalyticsRecomputeStatus, user.id)
    assert status.started_at is None
    # A cleared claim is immediately re-claimable.
    assert try_claim_recompute(db, user.id) is True


def test_release_recompute_claim_is_a_noop_when_no_row_exists():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    release_recompute_claim(db, user.id)  # must not raise
    assert db.get(AnalyticsRecomputeStatus, user.id) is None


def test_recompute_does_not_refetch_nav_over_network_for_a_category_shared_across_scopes():
    """Regression test for the spec's Testing Strategy: `warm_nav_history`
    must be effectively invoked at most once, network-fetch-wise, for the
    union of schemes/categories touched across the whole recompute run --
    not once per scope -- even though this module (deliberately, see this
    plan's flagged refinement (a)) has no explicit union/warm step of its
    own. Uses the real, unmocked `compute_category_ranking` so the
    assertion exercises category_ranking.py's actual process-local
    `_category_returns_cache` plus Task 2's DB-backed NAV freshness check --
    together, these are what deliver the spec's cost guarantee here."""
    import asyncio

    import app.services.analytics.category_ranking as category_ranking_module
    from app.models.enums import PlanType, TransactionType
    from app.models.folio import Folio
    from app.models.reference import Scheme
    from app.services.analytics.scheme_universe import CategoryPeers
    from app.models.transaction import Transaction

    category_ranking_module._category_returns_cache.clear()

    db = _session()
    user, members = _user_with_members(db, n_members=2)

    scheme = Scheme(
        id=uuid.uuid4(), amfi_code="SHARED1", isin="INF999", name="Shared Fund",
        amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.flush()
    # Both members hold the SAME scheme, so its category is touched by
    # every scope in this run (combined, member 0, member 1) -- exactly the
    # cross-scope overlap the spec's "not once per scope" claim is about.
    for member in members:
        folio = Folio(
            id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id,
            folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT,
        )
        db.add(folio)
        db.flush()
        db.add(Transaction(
            id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE,
            date=date(2020, 1, 1), amount=Decimal("1000"), units=Decimal("100"), nav=Decimal("10"),
        ))
    db.commit()

    other_section_patches = [
        patch.object(section, "compute", AsyncMock(return_value=_MOCK_RESULTS[section.name]))
        for section in _SECTIONS if section.name != "category_ranking"
    ]
    for p in other_section_patches:
        p.start()

    fetch = AsyncMock(return_value=[(date.today(), Decimal("11.0000"))])
    # Spy on warm_nav_history itself (the category peer-universe warm),
    # not on the lower-level _fetch_nav_history: compute_holdings (called
    # at the top of compute_category_ranking, unmodified by this plan)
    # does its own separate, pre-existing per-scheme NAV valuation lookup
    # via get_nav_on_or_before, which also touches _fetch_nav_history once
    # for this scheme -- unrelated to the category-returns caching layer
    # this test is actually about. Asserting on warm_nav_history's own
    # call count is what the spec's literal claim ("warm_nav_history
    # called exactly once... not once per scope") is scoped to.
    warm_spy = AsyncMock(wraps=category_ranking_module.warm_nav_history)
    try:
        with patch("app.services.dashboard.nav._fetch_nav_history", new=fetch), \
             patch("app.services.analytics.category_ranking.get_category_peers", new=AsyncMock(return_value=CategoryPeers(schemes=[scheme], fund_count=1, representative_of={scheme.id: scheme.id}))), \
             patch("app.services.analytics.category_ranking.warm_nav_history", new=warm_spy):
            asyncio.run(recompute_household_analytics(db, user.id))
    finally:
        for p in other_section_patches:
            p.stop()

    assert warm_spy.await_count == 1


def test_a_run_started_16_minutes_ago_counts_as_stuck():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    db.add(AnalyticsRecomputeStatus(user_id=user.id, started_at=datetime.now(timezone.utc) - timedelta(minutes=16)))
    db.commit()
    assert should_dispatch_recompute(db, user.id) is True


def test_a_run_started_5_minutes_ago_still_blocks_a_new_one():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    db.add(AnalyticsRecomputeStatus(user_id=user.id, started_at=datetime.now(timezone.utc) - timedelta(minutes=5)))
    db.commit()
    assert should_dispatch_recompute(db, user.id) is False


def test_started_at_is_refreshed_after_each_section_so_a_long_run_is_not_taken_for_stuck():
    """Review finding 7: a cold run can pass the 15-minute ceiling; refreshing
    started_at after every committed section keeps the claim alive."""
    import asyncio
    db = _session()
    user, _members = _user_with_members(db, n_members=1)
    seen = []

    def _recording(name):
        async def compute(db_, ids):
            status = db.get(AnalyticsRecomputeStatus, user.id)
            db.refresh(status)
            seen.append(status.started_at)
            return _MOCK_RESULTS[name]
        return compute

    patches = [patch.object(section, "compute", _recording(section.name)) for section in _SECTIONS]
    for p in patches:
        p.start()
    try:
        asyncio.run(recompute_household_analytics(db, user.id))
    finally:
        for p in patches:
            p.stop()
    assert len(set(seen)) > 1          # moved forward during the run
    assert seen == sorted(seen)


def test_windows_survive_json_round_trip_through_analytics_sections():
    import asyncio

    db = _session()
    user, members = _user_with_members(db, n_members=1)
    member = members[0]
    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code=uuid.uuid4().hex[:6],
        isin="INFROUNDTRIP",
        name="Round Trip Fund",
        amc_name="Test AMC",
        sebi_category="Equity Scheme - Large Cap Fund",
    )
    folio = Folio(
        id=uuid.uuid4(),
        household_member_id=member.id,
        scheme_id=scheme.id,
        folio_number=uuid.uuid4().hex[:6],
        plan_type=PlanType.DIRECT,
    )
    purchase_date = date.today().replace(year=date.today().year - 6)
    db.add_all([scheme, folio])
    db.flush()
    db.add(
        Transaction(
            id=uuid.uuid4(),
            folio_id=folio.id,
            import_id=uuid.uuid4(),
            type=TransactionType.PURCHASE,
            date=purchase_date,
            amount=Decimal("1000"),
            units=Decimal("100"),
            nav=Decimal("10"),
        )
    )
    starts = {window: window_start(window, date.today()) for window in WINDOWS}
    ctx = WindowContext(
        today=date.today(),
        starts=starts,
        portfolio_start_values={
            "1Y": Decimal("1000"),
            "3Y": Decimal("1000"),
            "5Y": Decimal("1000"),
            "SI": None,
        },
        fund_start_values={
            window: ({scheme.id: Decimal("1000")} if window != "SI" else {})
            for window in WINDOWS
        },
    )
    history_dates = {
        purchase_date,
        date.today(),
        *(start for start in starts.values() if start is not None),
    }
    for index in ALL_BENCHMARK_INDICES:
        for n, history_date in enumerate(sorted(history_dates)):
            db.add(
                BenchmarkIndexHistory(
                    index_name=index,
                    return_type=BenchmarkReturnType.TRI,
                    date=history_date,
                    value=Decimal("100") + Decimal(n),
                )
            )
    db.commit()

    holding = HoldingRow(
        scheme_id=str(scheme.id),
        scheme_name=scheme.name,
        amc_name=scheme.amc_name,
        household_member_id=str(member.id),
        household_member_name=member.name,
        plan_type=PlanType.DIRECT,
        units_held="100",
        average_nav="10",
        current_nav="12",
        current_nav_date=date.today(),
        amount_invested="1000",
        current_value="1200",
        current_profit_total="200",
        realized_gain="0",
        unrealized_gain="200",
        today_gain="0",
    )
    with (
        patch(
            "app.services.analytics.benchmark.compute_holdings",
            new=AsyncMock(return_value=[holding]),
        ),
        patch(
            "app.services.analytics.benchmark.ensure_index_history_fresh",
            new=AsyncMock(return_value=False),
        ),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(return_value=ctx),
            create=True,
        ),
    ):
        portfolio = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))
        funds = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    statuses = get_member_statuses(db, user.id)
    _upsert_section(
        db,
        user.id,
        "combined",
        None,
        "benchmark",
        AggregatePortfolioBenchmarkResponse(members=statuses, benchmark=portfolio),
    )
    _upsert_section(db, user.id, str(member.id), member.id, "benchmark", portfolio)
    _upsert_section(
        db,
        user.id,
        "combined",
        None,
        "benchmark_funds",
        AggregateFundVsBenchmarkResponse(members=statuses, comparison=funds),
    )
    _upsert_section(db, user.id, str(member.id), member.id, "benchmark_funds", funds)
    db.commit()

    combined_portfolio_row = db.get(AnalyticsSection, (user.id, "combined", "benchmark"))
    member_portfolio_row = db.get(AnalyticsSection, (user.id, str(member.id), "benchmark"))
    combined_fund_row = db.get(AnalyticsSection, (user.id, "combined", "benchmark_funds"))
    member_fund_row = db.get(AnalyticsSection, (user.id, str(member.id), "benchmark_funds"))

    combined_portfolio = AggregatePortfolioBenchmarkResponse.model_validate(
        combined_portfolio_row.payload
    ).benchmark
    member_portfolio = PortfolioBenchmarkSummary.model_validate(member_portfolio_row.payload)
    combined_funds = AggregateFundVsBenchmarkResponse.model_validate(
        combined_fund_row.payload
    ).comparison
    member_funds = FundVsBenchmarkSummary.model_validate(member_fund_row.payload)

    assert combined_portfolio.windows == portfolio.windows
    assert member_portfolio.windows == portfolio.windows
    assert combined_funds.funds[0].windows == funds.funds[0].windows
    assert member_funds.funds[0].windows == funds.funds[0].windows
    assert isinstance(combined_portfolio_row.payload["benchmark"]["windows"][0]["start_date"], str)
    assert isinstance(combined_portfolio_row.payload["benchmark"]["windows"][0]["portfolio_xirr"], str)
    assert isinstance(
        combined_fund_row.payload["comparison"]["funds"][0]["windows"][0]["fund_xirr"],
        str,
    )
