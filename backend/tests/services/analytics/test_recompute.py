import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
from app.models.enums import Relationship
from app.models.user import HouseholdMember, User
from app.services.analytics.recompute import (
    _SECTIONS,
    recompute_household_analytics,
    should_dispatch_recompute,
)
from app.services.analytics.schemas import (
    AnalyticsAllocationSummary,
    CategoryRankingSummary,
    DirectRegularTerComparison,
    FundVsBenchmarkSummary,
    PortfolioBenchmarkSummary,
    PortfolioScoreSummary,
    WeightedTerSummary,
)


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
    # 3 scopes (combined + 2 members) x 7 sections
    assert len(rows) == 21
    scope_keys = {row.scope_key for row in rows}
    assert scope_keys == {"combined", str(members[0].id), str(members[1].id)}
    combined_allocation = db.get(AnalyticsSection, (user.id, "combined", "allocation"))
    assert combined_allocation.payload["members"][0]["id"] in {str(members[0].id), str(members[1].id)}
    member_allocation = db.get(AnalyticsSection, (user.id, str(members[0].id), "allocation"))
    assert "members" not in member_allocation.payload


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
             patch("app.services.analytics.category_ranking.get_category_universe", return_value=[scheme]), \
             patch("app.services.analytics.category_ranking.warm_nav_history", new=warm_spy):
            asyncio.run(recompute_household_analytics(db, user.id))
    finally:
        for p in other_section_patches:
            p.stop()

    assert warm_spy.await_count == 1
