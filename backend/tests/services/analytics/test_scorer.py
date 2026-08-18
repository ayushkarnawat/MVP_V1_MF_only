import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.services.analytics.scorer as scorer_module
from app.db.base import Base
from app.models.reference import FundScore, NavHistory, Scheme, SchemeAaum, SchemeTer
from app.services.analytics.scorer import (
    _category_component_scores,
    _tier_from_percentile,
    compute_fund_score,
)

_TODAY = date.today()
_START_3Y = _TODAY.replace(year=_TODAY.year - 3)


@pytest.fixture(autouse=True)
def _clear_category_score_cache():
    """Different tests reuse the same literal `sebi_category` string (the
    cache key) with fresh in-memory DBs each time -- without clearing, a
    later test's category-wide computation would spuriously cache-hit on
    an earlier test's cached scores instead of calling its own mocked
    `_category_returns`."""
    scorer_module._category_score_cache.clear()
    yield


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _scheme(db, name="Test Fund", sebi_category="Equity Scheme - Flexi Cap Fund"):
    scheme = Scheme(
        id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123",
        name=name, amc_name="HDFC AMC", sebi_category=sebi_category,
    )
    db.add(scheme)
    db.commit()
    return scheme


def _seed_monthly_nav(db, scheme, months, start_nav=Decimal("10"), monthly_growth=Decimal("0.01")):
    """Seeds one NAV row per month for `months` months ending today, simple
    compounding growth — enough for build_monthly_series to have real data
    without constructing 5 years of daily rows in a test."""
    nav = start_nav
    for i in range(months, 0, -1):
        row_date = _TODAY.replace(year=_TODAY.year - (i // 12), month=((_TODAY.month - 1 - (i % 12)) % 12) + 1)
        db.add(NavHistory(scheme_id=scheme.id, date=row_date, nav=nav))
        nav *= Decimal(1) + monthly_growth
    db.commit()


def test_tier_from_percentile_boundaries_are_inclusive_lower_bound():
    assert _tier_from_percentile(Decimal("80")) == 5
    assert _tier_from_percentile(Decimal("79.99")) == 4
    assert _tier_from_percentile(Decimal("60")) == 4
    assert _tier_from_percentile(Decimal("40")) == 3
    assert _tier_from_percentile(Decimal("20")) == 2
    assert _tier_from_percentile(Decimal("19.99")) == 1
    assert _tier_from_percentile(Decimal("0")) == 1


def test_category_component_scores_uses_cache_within_ttl():
    db = _session()
    held = _scheme(db, "Held Fund")
    _seed_monthly_nav(db, held, 24, monthly_growth=Decimal("0.02"))

    returns_calls = 0

    async def _returns(db_, universe, today):
        nonlocal returns_calls
        returns_calls += 1
        return {held.id: Decimal("0.20")}

    scorer_module._category_score_cache.clear()
    now = [1000.0]
    with (
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_returns)),
        patch.object(scorer_module, "_category_score_clock", side_effect=lambda: now[0]),
    ):
        asyncio.run(_category_component_scores(db, [held], "Equity Scheme - Flexi Cap Fund", _TODAY))
        asyncio.run(_category_component_scores(db, [held], "Equity Scheme - Flexi Cap Fund", _TODAY))

    assert returns_calls == 1


def test_category_component_scores_recomputes_once_ttl_has_expired():
    db = _session()
    held = _scheme(db, "Held Fund")
    _seed_monthly_nav(db, held, 24, monthly_growth=Decimal("0.02"))

    returns_calls = 0

    async def _returns(db_, universe, today):
        nonlocal returns_calls
        returns_calls += 1
        return {held.id: Decimal("0.20")}

    scorer_module._category_score_cache.clear()
    now = [1000.0]
    with (
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_returns)),
        patch.object(scorer_module, "_category_score_clock", side_effect=lambda: now[0]),
    ):
        asyncio.run(_category_component_scores(db, [held], "Equity Scheme - Flexi Cap Fund", _TODAY))
        now[0] += scorer_module._CATEGORY_SCORE_CACHE_TTL_SECONDS + 1
        asyncio.run(_category_component_scores(db, [held], "Equity Scheme - Flexi Cap Fund", _TODAY))

    assert returns_calls == 2


def test_category_component_scores_recomputes_on_calendar_day_rollover():
    """Even within the TTL window, a cached category score from a prior
    calendar day must not be served -- the composite score is inherently
    day-dependent (month_end_dates anchors off `today`), so a same-process
    long-lived cache entry spanning midnight would otherwise silently
    serve yesterday's month-end anchors."""
    db = _session()
    held = _scheme(db, "Held Fund")
    _seed_monthly_nav(db, held, 24, monthly_growth=Decimal("0.02"))

    returns_calls = 0

    async def _returns(db_, universe, today):
        nonlocal returns_calls
        returns_calls += 1
        return {held.id: Decimal("0.20")}

    scorer_module._category_score_cache.clear()
    now = [1000.0]
    with (
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_returns)),
        patch.object(scorer_module, "_category_score_clock", side_effect=lambda: now[0]),
    ):
        asyncio.run(_category_component_scores(db, [held], "Equity Scheme - Flexi Cap Fund", _TODAY))
        asyncio.run(
            _category_component_scores(
                db, [held], "Equity Scheme - Flexi Cap Fund", _TODAY - timedelta(days=1)
            )
        )

    assert returns_calls == 2


def test_compute_fund_score_category_unavailable_when_no_sebi_category():
    db = _session()
    scheme = _scheme(db, sebi_category="")
    row = asyncio.run(compute_fund_score(db, scheme))
    assert row.category_unavailable is True
    assert row.risk_adjusted_tier is None


def test_compute_fund_score_insufficient_history_when_no_return():
    db = _session()
    scheme = _scheme(db)

    async def _no_return(db_, universe, today):
        return {}

    with (
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_no_return)),
        patch("app.services.analytics.scorer.get_category_universe", new=AsyncMock(return_value=[scheme])),
    ):
        row = asyncio.run(compute_fund_score(db, scheme))
    assert row.insufficient_history is True
    assert row.risk_adjusted_tier is None


def test_compute_fund_score_persists_one_row_per_day():
    db = _session()
    held = _scheme(db, "Held Fund")
    peer = _scheme(db, "Peer Fund")
    _seed_monthly_nav(db, held, 24, monthly_growth=Decimal("0.02"))
    _seed_monthly_nav(db, peer, 24, monthly_growth=Decimal("0.005"))

    async def _returns(db_, universe, today):
        return {held.id: Decimal("0.30"), peer.id: Decimal("0.05")}

    with (
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_returns)),
        patch("app.services.analytics.scorer.get_category_universe", new=AsyncMock(return_value=[held, peer])),
        patch("app.services.analytics.scorer._ensure_ter_fresh", new=AsyncMock(return_value=None)),
    ):
        row1 = asyncio.run(compute_fund_score(db, held))
        row2 = asyncio.run(compute_fund_score(db, held))

    assert row1.risk_adjusted_tier is not None
    assert row2.risk_adjusted_tier == row1.risk_adjusted_tier
    stored = db.query(FundScore).filter(FundScore.scheme_id == held.id).all()
    assert len(stored) == 1  # second call didn't insert a duplicate for the same day


def test_compute_fund_score_survives_concurrent_duplicate_insert():
    """Simulates a second request's row already having landed for today
    (e.g. a concurrent request that committed first) by pre-seeding it
    directly, bypassing this call's own check. The (scheme_id, computed_at)
    primary key -- computed_at pinned to day-start -- must reject the
    duplicate with an IntegrityError that this call swallows, rather than
    raising or silently double-inserting."""
    db = _session()
    held = _scheme(db, "Held Fund")
    peer = _scheme(db, "Peer Fund")
    _seed_monthly_nav(db, held, 24, monthly_growth=Decimal("0.02"))
    _seed_monthly_nav(db, peer, 24, monthly_growth=Decimal("0.005"))

    today_start = datetime(_TODAY.year, _TODAY.month, _TODAY.day, tzinfo=timezone.utc)
    db.add(
        FundScore(
            scheme_id=held.id,
            computed_at=today_start,
            risk_adjusted_tier=1,
            cost_adjustment=Decimal("0"),
            final_score=Decimal("10.00"),
        )
    )
    db.commit()

    async def _returns(db_, universe, today):
        return {held.id: Decimal("0.30"), peer.id: Decimal("0.05")}

    with (
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_returns)),
        patch("app.services.analytics.scorer.get_category_universe", new=AsyncMock(return_value=[held, peer])),
        patch("app.services.analytics.scorer._ensure_ter_fresh", new=AsyncMock(return_value=None)),
    ):
        row = asyncio.run(compute_fund_score(db, held))

    assert row.risk_adjusted_tier is not None  # freshly computed, not the stale seeded row
    stored = db.query(FundScore).filter(FundScore.scheme_id == held.id).all()
    assert len(stored) == 1  # duplicate insert was rejected, not appended


def test_compute_fund_score_best_return_in_min_category_gets_tier_five():
    db = _session()
    held = _scheme(db, "Held Fund")
    peers = [_scheme(db, f"Peer {i}") for i in range(4)]
    all_schemes = [held, *peers]
    for s in all_schemes:
        _seed_monthly_nav(db, s, 24, monthly_growth=Decimal("0.01"))

    async def _returns(db_, universe, today):
        returns = {held.id: Decimal("0.50")}
        for i, p in enumerate(peers):
            returns[p.id] = Decimal("0.10") - Decimal(str(i)) * Decimal("0.01")
        return returns

    with (
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_returns)),
        patch("app.services.analytics.scorer.get_category_universe", new=AsyncMock(return_value=all_schemes)),
        patch("app.services.analytics.scorer._ensure_ter_fresh", new=AsyncMock(return_value=None)),
    ):
        row = asyncio.run(compute_fund_score(db, held))

    assert row.risk_adjusted_tier == 5
    assert row.return_percentile is not None
    assert row.risk_percentile is not None
    assert row.consistency_hit_rate is not None


def test_compute_fund_score_cost_adjustment_nudges_final_score():
    db = _session()
    held = _scheme(db, "Held Fund")
    peer = _scheme(db, "Peer Fund")
    _seed_monthly_nav(db, held, 24, monthly_growth=Decimal("0.01"))
    _seed_monthly_nav(db, peer, 24, monthly_growth=Decimal("0.01"))

    db.add(SchemeTer(scheme_id=held.id, reference_period=date(2026, 3, 1), ter_value=Decimal("0.50")))
    db.add(SchemeTer(scheme_id=peer.id, reference_period=date(2026, 3, 1), ter_value=Decimal("1.50")))
    db.add(SchemeAaum(scheme_id=held.id, reference_period=date(2026, 3, 31), aaum_value=Decimal("100")))
    db.add(SchemeAaum(scheme_id=peer.id, reference_period=date(2026, 3, 31), aaum_value=Decimal("100")))
    db.commit()

    async def _returns(db_, universe, today):
        return {held.id: Decimal("0.20"), peer.id: Decimal("0.20")}

    with (
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_returns)),
        patch("app.services.analytics.scorer.get_category_universe", new=AsyncMock(return_value=[held, peer])),
        patch("app.services.analytics.scorer._ensure_ter_fresh", new=AsyncMock(return_value=None)),
    ):
        row = asyncio.run(compute_fund_score(db, held))

    # held's TER (0.50) is well below the AUM-weighted category average
    # (1.00) -> +0.25 nudge.
    assert row.cost_adjustment == "0.25"


def test_compute_fund_score_cost_adjustment_is_none_not_zero_when_ter_unavailable():
    """DATA-001: no TER data for either fund means the cost adjustment
    can't be computed at all -- this must be reported as None
    ("unavailable"), not the numeric string "0", which would look
    identical to a genuinely-computed no-adjustment result (TER within the
    dead zone of the category average)."""
    db = _session()
    held = _scheme(db, "Held Fund")
    peer = _scheme(db, "Peer Fund")
    _seed_monthly_nav(db, held, 24, monthly_growth=Decimal("0.01"))
    _seed_monthly_nav(db, peer, 24, monthly_growth=Decimal("0.01"))
    # Deliberately no SchemeTer/SchemeAaum rows for either scheme.

    async def _returns(db_, universe, today):
        return {held.id: Decimal("0.20"), peer.id: Decimal("0.20")}

    with (
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_returns)),
        patch("app.services.analytics.scorer.get_category_universe", new=AsyncMock(return_value=[held, peer])),
        patch("app.services.analytics.scorer._ensure_ter_fresh", new=AsyncMock(return_value=None)),
    ):
        row = asyncio.run(compute_fund_score(db, held))

    assert row.cost_adjustment is None
    # final_score still gets computed (best-effort, no adjustment applied)
    # rather than being blocked entirely by missing TER data.
    assert row.final_score is not None


from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.scorer import compute_portfolio_score


def _household_member(db):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Self", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _folio_with_purchase(db, member, scheme, amount, units, nav, txn_date):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=txn_date, amount=amount, units=units, nav=nav))
    db.commit()
    return folio


def test_compute_portfolio_score_empty_when_no_holdings():
    db = _session()
    member = _household_member(db)
    summary = asyncio.run(compute_portfolio_score(db, [member.id]))
    assert summary.funds == []
    assert summary.weighted_score is None


def test_compute_portfolio_score_weights_by_holding_value():
    db = _session()
    member = _household_member(db)
    held = _scheme(db, "Held Fund")
    _seed_monthly_nav(db, held, 24, monthly_growth=Decimal("0.01"))
    _folio_with_purchase(db, member, held, Decimal("1000"), Decimal("100"), Decimal("10"), _START_3Y)

    async def _returns(db_, universe, today):
        return {held.id: Decimal("0.20")}

    async def _nav_lookup(db_, scheme, on_date):
        return Decimal("11"), on_date

    with (
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_returns)),
        patch("app.services.analytics.scorer.get_category_universe", new=AsyncMock(return_value=[held])),
        patch("app.services.analytics.scorer._ensure_ter_fresh", new=AsyncMock(return_value=None)),
        patch("app.services.dashboard.holdings.get_nav_on_or_before", new=AsyncMock(side_effect=_nav_lookup)),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    ):
        summary = asyncio.run(compute_portfolio_score(db, [member.id]))

    assert len(summary.funds) == 1
    assert summary.weighted_score == summary.funds[0].final_score
    assert summary.uncovered_schemes == []


def test_compute_portfolio_score_dedupes_category_work_across_holdings_in_same_category():
    """Two holdings in the same category must trigger exactly one round of
    category-wide work (universe fetch, category returns, TER refresh),
    not one per holding -- each of these does a DB query per scheme in the
    whole category, not just the held ones."""
    db = _session()
    member = _household_member(db)
    held_a = _scheme(db, "Held Fund A")
    held_b = _scheme(db, "Held Fund B")
    _seed_monthly_nav(db, held_a, 24, monthly_growth=Decimal("0.01"))
    _seed_monthly_nav(db, held_b, 24, monthly_growth=Decimal("0.015"))
    _folio_with_purchase(db, member, held_a, Decimal("1000"), Decimal("100"), Decimal("10"), _START_3Y)
    _folio_with_purchase(db, member, held_b, Decimal("1000"), Decimal("100"), Decimal("10"), _START_3Y)

    universe_calls = []
    returns_calls = []
    ter_calls = []

    async def _universe(db_, sebi_category):
        universe_calls.append(sebi_category)
        return [held_a, held_b]

    async def _returns(db_, universe, today):
        returns_calls.append(len(universe))
        return {held_a.id: Decimal("0.20"), held_b.id: Decimal("0.25")}

    async def _ter_fresh(db_, scheme_ids):
        ter_calls.append(scheme_ids)

    async def _nav_lookup(db_, scheme, on_date):
        return Decimal("11"), on_date

    with (
        patch("app.services.analytics.scorer.get_category_universe", new=AsyncMock(side_effect=_universe)),
        patch("app.services.analytics.scorer._category_returns", new=AsyncMock(side_effect=_returns)),
        patch("app.services.analytics.scorer._ensure_ter_fresh", new=AsyncMock(side_effect=_ter_fresh)),
        patch("app.services.dashboard.holdings.get_nav_on_or_before", new=AsyncMock(side_effect=_nav_lookup)),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    ):
        summary = asyncio.run(compute_portfolio_score(db, [member.id]))

    assert len(summary.funds) == 2
    assert len(universe_calls) == 1  # not once per held scheme
    assert len(returns_calls) == 1
    assert len(ter_calls) == 1
