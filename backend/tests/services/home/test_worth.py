import random
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import event

from app.models.analytics import AnalyticsSection
from app.models.enums import (
    AssetType,
    DisclosureBatchStatus,
    PlanType,
    SchemePlanType,
)
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding, SchemeTer
from app.models.user import HouseholdMember, User
from app.services.analytics.recompute import _upsert_section
from app.services.analytics.schemas import (
    AggregateCategoryRankingResponse,
    AggregatePortfolioScoreResponse,
    AggregateStockHoldingsResponse,
    CategoryRankRow,
    CategoryRankingSummary,
    FundScoreRow,
    LookthroughCoverage,
    PeriodReturn,
    PortfolioScoreSummary,
    StockHoldingRow,
    StockHoldingsSummary,
)
from app.services.dashboard.schemas import HoldingRow, MemberStatus
from app.services.home.worth import (
    ConcentrationFacts,
    FundFacts,
    StockExposure,
    build_worth_cards,
    load_earlier_top5,
    load_worth_facts,
)
from app.services.home.worth_config import WorthThresholds


TODAY = date(2026, 10, 23)


def _fund(name="Fund", value="100.00", **changes):
    values = {
        "scheme_id": uuid.uuid4(),
        "name": name,
        "category": "Equity Scheme - Flexi Cap Fund",
        "plan_type": "direct",
        "value": Decimal(value),
        "tier": None,
        "final_score": None,
        "return_1y": None,
        "category_avg_1y": None,
        "ter": None,
        "category_avg_ter": None,
    }
    values.update(changes)
    return FundFacts(**values)


def _concentration(**changes):
    values = {
        "top_stocks": tuple(
            StockExposure(f"Stock {index}", f"INE{index:09d}", Decimal("4.80"))
            for index in range(5)
        ),
        "top5_pct": Decimal("24.00"),
        "holdings_as_of": date(2026, 9, 30),
        "coverage_pct": Decimal("80"),
        "hide_headlines": False,
        "earlier_top5_pct": None,
        "earlier_as_of": None,
    }
    values.update(changes)
    return ConcentrationFacts(**values)


def _hand_funds():
    return (
        _fund(
            "Alpha Equity", "50000.00", tier=1, final_score=Decimal("22.00"),
            return_1y=Decimal("0.08"), category_avg_1y=Decimal("0.15"),
            ter=Decimal("1.20"), category_avg_ter=Decimal("0.90"),
        ),
        _fund(
            "Beta Flexi", "30000.00", tier=3,
            return_1y=Decimal("0.10"), category_avg_1y=Decimal("0.12"),
            ter=Decimal("1.70"), category_avg_ter=Decimal("1.00"),
        ),
        _fund(
            "Gamma Small", "15000.00", tier=4,
            return_1y=Decimal("0.05"), category_avg_1y=Decimal("0.12"),
            ter=Decimal("0.80"), category_avg_ter=Decimal("0.85"),
        ),
        _fund("Delta Debt", "5000.00", tier=2),
    )


def test_hand_fixture_orders_deduplicates_and_limits_cards():
    funds = _hand_funds()
    cards = build_worth_cards(funds, _concentration())
    assert [(card.kind, card.scheme_name, card.rank) for card in cards] == [
        ("weak_fund", "Alpha Equity", 1),
        ("underperforming", "Gamma Small", 2),
        ("concentration", None, 3),
    ]
    assert cards[1].evidence == {
        "fund_1y_pct": "5.00",
        "category_avg_1y_pct": "12.00",
        "gap_pp": "7.00",
        "share_pct": "15.00",
        "category": "Equity Scheme - Flexi Cap Fund",
    }
    expanded = build_worth_cards(
        funds, _concentration(), WorthThresholds(max_cards=4)
    )
    assert [(card.kind, card.scheme_name, card.rank) for card in expanded] == [
        ("weak_fund", "Alpha Equity", 1),
        ("underperforming", "Gamma Small", 2),
        ("concentration", None, 3),
        ("high_expense", "Beta Flexi", 4),
    ]


@pytest.mark.parametrize(("tier", "expected"), [(1, True), (2, False)])
def test_weak_fund_tier_boundary(tier, expected):
    cards = build_worth_cards([_fund(tier=tier)], None)
    assert bool(cards) is expected


@pytest.mark.parametrize(("share", "expected"), [("1.99", False), ("2.00", True)])
def test_weak_fund_share_boundary(share, expected):
    flagged = _fund("Flagged", share, tier=1)
    neutral = _fund("Neutral", str(Decimal("100") - Decimal(share)))
    assert bool(build_worth_cards([flagged, neutral], None)) is expected


@pytest.mark.parametrize(("share", "expected"), [("2.99", False), ("3.00", True)])
@pytest.mark.parametrize("kind", ["underperforming", "high_expense"])
def test_per_fund_signal_share_boundaries(kind, share, expected):
    changes = (
        {"return_1y": Decimal("0.05"), "category_avg_1y": Decimal("0.08")}
        if kind == "underperforming"
        else {"ter": Decimal("1.51"), "category_avg_ter": Decimal("1.00")}
    )
    flagged = _fund("Flagged", share, **changes)
    neutral = _fund("Neutral", str(Decimal("100") - Decimal(share)))
    assert bool(build_worth_cards([flagged, neutral], None)) is expected


@pytest.mark.parametrize(("gap", "expected"), [("2.99", False), ("3.00", True)])
def test_underperformance_gap_boundary_uses_fraction_units(gap, expected):
    category = Decimal("0.10") + Decimal(gap) / Decimal("100")
    cards = build_worth_cards([
        _fund(return_1y=Decimal("0.10"), category_avg_1y=category)
    ], None)
    assert bool(cards) is expected


@pytest.mark.parametrize(("gap", "expected"), [("0.50", False), ("0.51", True)])
def test_expense_gap_boundary_is_strict(gap, expected):
    cards = build_worth_cards([
        _fund(ter=Decimal("1.00") + Decimal(gap), category_avg_ter=Decimal("1.00"))
    ], None)
    assert bool(cards) is expected


@pytest.mark.parametrize(("top5", "expected"), [("19.99", False), ("20.00", True)])
def test_concentration_threshold_boundary(top5, expected):
    assert bool(build_worth_cards(
        [_fund()], _concentration(top5_pct=Decimal(top5))
    )) is expected


@pytest.mark.parametrize(("coverage", "expected"), [("49.99", False), ("50.00", True)])
def test_concentration_coverage_boundary(coverage, expected):
    assert bool(build_worth_cards(
        [_fund()], _concentration(coverage_pct=Decimal(coverage))
    )) is expected


def test_concentration_hidden_or_missing_and_no_signals_return_nothing():
    assert build_worth_cards([_fund()], _concentration(hide_headlines=True)) == ()
    assert build_worth_cards([_fund()], None) == ()
    assert build_worth_cards([_fund(value="0.00", tier=1)], _concentration()) == ()


def test_one_fund_meeting_every_signal_emits_only_highest_priority():
    fund = _fund(
        tier=1,
        final_score=Decimal("10"),
        return_1y=Decimal("0.01"),
        category_avg_1y=Decimal("0.10"),
        ter=Decimal("2"),
        category_avg_ter=Decimal("1"),
    )
    cards = build_worth_cards([fund], None)
    assert len(cards) == 1
    assert cards[0].kind == "weak_fund"


def test_ties_follow_kind_specific_rules_and_name_last():
    weak = [
        _fund("Zulu", "40", tier=1, final_score=Decimal("20")),
        _fund("Alpha", "40", tier=1, final_score=Decimal("10")),
        _fund("Beta", "20", tier=1, final_score=Decimal("1")),
    ]
    assert [card.scheme_name for card in build_worth_cards(
        weak, None, WorthThresholds(max_cards=3)
    )] == ["Alpha", "Zulu", "Beta"]
    under = [
        _fund("Zulu", "50", return_1y=Decimal("0.01"), category_avg_1y=Decimal("0.05")),
        _fund("Alpha", "50", return_1y=Decimal("0.01"), category_avg_1y=Decimal("0.05")),
    ]
    assert [card.scheme_name for card in build_worth_cards(under, None)] == ["Alpha", "Zulu"]


def test_seeded_card_invariants_and_order_are_stable_under_shuffle():
    rng = random.Random(4417)
    for _ in range(300):
        funds = [
            _fund(
                f"Fund {index}", str(rng.randint(1, 10000)),
                tier=rng.randint(1, 5),
                final_score=Decimal(rng.randint(1, 100)),
                return_1y=Decimal(rng.randint(-10, 20)) / Decimal("100"),
                category_avg_1y=Decimal(rng.randint(-10, 20)) / Decimal("100"),
                ter=Decimal(rng.randint(1, 250)) / Decimal("100"),
                category_avg_ter=Decimal(rng.randint(1, 200)) / Decimal("100"),
            )
            for index in range(rng.randint(1, 12))
        ]
        expected = build_worth_cards(funds, _concentration())
        shuffled = list(funds)
        rng.shuffle(shuffled)
        actual = build_worth_cards(shuffled, _concentration())
        assert actual == expected
        assert len(actual) <= 3
        assert [card.rank for card in actual] == list(range(1, len(actual) + 1))
        ids = [card.scheme_id for card in actual if card.scheme_id is not None]
        assert len(ids) == len(set(ids))


def test_concentration_without_a_coverage_figure_gives_no_card():
    assert build_worth_cards((_fund("Alpha", "100.00"),), _concentration(coverage_pct=None)) == ()


def _household(db):
    user = User(
        id=uuid.uuid4(), phone_number=f"+919{uuid.uuid4().hex[:9]}",
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()
    member = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Member",
        created_at=datetime.now(timezone.utc),
    )
    db.add(member)
    db.commit()
    return user, member


def _scheme(db, name="Held", category="Equity Scheme - Flexi Cap Fund", plan=SchemePlanType.DIRECT):
    scheme = Scheme(
        id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:8], name=name,
        amc_name="Test AMC", sebi_category=category, plan_type=plan,
    )
    db.add(scheme)
    db.commit()
    return scheme


def _holding(member, scheme, value="100.00", *, plan=PlanType.DIRECT, unavailable=False):
    return HoldingRow(
        scheme_id=str(scheme.id), scheme_name=scheme.name, amc_name=scheme.amc_name,
        asset_class="Equity", household_member_id=str(member.id),
        household_member_name=member.name, plan_type=plan, units_held="1",
        average_nav="1", current_nav=None if unavailable else "1",
        current_nav_date=None if unavailable else TODAY, amount_invested="0",
        current_value=None if unavailable else value,
        current_profit_total=None if unavailable else value, realized_gain="0",
        unrealized_gain=None if unavailable else value, today_gain="0",
        nav_unavailable=unavailable, sebi_category=scheme.sebi_category,
    )


def _coverage():
    return LookthroughCoverage(
        covered_value_pct=Decimal("80"), not_published_yet=[],
        not_available_from_amc=[], missing_value_schemes=[], funds=[],
    )


def _score_row(scheme, tier=1, score="22.00"):
    return FundScoreRow(
        scheme_id=str(scheme.id), scheme_name=scheme.name,
        category_unavailable=False, insufficient_history=False, thin_category=False,
        risk_adjusted_tier=tier, cost_adjustment="0", final_score=score,
        return_percentile=None, risk_percentile=None, consistency_hit_rate=None,
        scheme_return=None, category_avg_return=None, downside_deviation=None,
        category_avg_downside_deviation=None, consistency_hits=None,
        consistency_total_windows=None,
    )


def _ranking_row(scheme, fund_return="0.05", category_avg="0.12"):
    return CategoryRankRow(
        scheme_id=str(scheme.id), scheme_name=scheme.name,
        sebi_category=scheme.sebi_category, category_unavailable=False,
        insufficient_history=False, scheme_return=fund_return, category_rank=1,
        category_size=10, percentile="90", category_avg_return=category_avg,
        thin_category=False,
        periods={"1y": PeriodReturn(fund_return=fund_return, category_avg=category_avg, peers=10)},
        plan_type="direct",
    )


def _stock_summary(rows=None, *, hidden=False):
    return StockHoldingsSummary(
        rows=rows or [], nav_as_of=TODAY, holdings_as_of=date(2026, 9, 30),
        total_portfolio_value=Decimal("100"), coverage=_coverage(), truncated=False,
        total_stock_count=len(rows or []), hide_headlines=hidden,
        excluded_share=Decimal("0"), non_equity_share=Decimal("0"),
    )


def _stock_rows():
    return [
        StockHoldingRow(
            isin=f"INE{index:09d}", instrument_name=f"Stock {index}", sector_raw="IT",
            asset_type=AssetType.EQUITY_DOMESTIC, exposure_pct=Decimal("4.80"),
            exposure_value=Decimal("4.80"), contributing_funds=[],
        )
        for index in range(5)
    ]


def _write_sections(db, user, member, scheme, *, scope="aggregate", omit=()):
    scope_key = "combined" if scope == "aggregate" else str(member.id)
    member_status = MemberStatus(id=str(member.id), name=member.name, has_data=True)
    summaries = {
        "score": PortfolioScoreSummary(
            funds=[_score_row(scheme)], weighted_score="22", covered_value="100",
            total_value="100", uncovered_schemes=[],
        ),
        "category_ranking": CategoryRankingSummary(funds=[_ranking_row(scheme)]),
        "stock_holdings": _stock_summary(_stock_rows()),
    }
    wrappers = {
        "score": AggregatePortfolioScoreResponse(members=[member_status], score=summaries["score"]),
        "category_ranking": AggregateCategoryRankingResponse(
            members=[member_status], ranking=summaries["category_ranking"]
        ),
        "stock_holdings": AggregateStockHoldingsResponse(
            members=[member_status], stock_holdings=summaries["stock_holdings"]
        ),
    }
    for name, summary in summaries.items():
        if name not in omit:
            _upsert_section(
                db, user.id, scope_key, None if scope == "aggregate" else member.id,
                name, wrappers[name] if scope == "aggregate" else summary,
            )
    db.commit()
    return scope_key


@pytest.mark.parametrize("scope", ["aggregate", "member"])
def test_loader_reads_real_writer_shapes_and_latest_non_null_ter_mean(db_session, scope):
    user, member = _household(db_session)
    held = _scheme(db_session)
    peers = [_scheme(db_session, f"Peer {index}") for index in range(2)]
    scope_key = _write_sections(db_session, user, member, held, scope=scope)
    db_session.add_all([
        SchemeTer(scheme_id=held.id, reference_period=date(2026, 8, 31), ter_value=Decimal("1.20")),
        SchemeTer(scheme_id=held.id, reference_period=date(2026, 9, 30), ter_value=None),
        SchemeTer(scheme_id=peers[0].id, reference_period=date(2026, 9, 30), ter_value=Decimal("0.80")),
        SchemeTer(scheme_id=peers[1].id, reference_period=date(2026, 9, 30), ter_value=Decimal("1.00")),
    ])
    db_session.commit()
    result = load_worth_facts(
        db_session, user.id, scope=scope, household_member_ids=[member.id],
        holdings=[_holding(member, held)],
    )
    assert result.unavailable == ()
    assert result.funds == (
        FundFacts(
            scheme_id=held.id, name="Held", category=held.sebi_category,
            plan_type="direct", value=Decimal("100.00"), tier=1,
            final_score=Decimal("22.00"), return_1y=Decimal("0.05"),
            category_avg_1y=Decimal("0.12"), ter=Decimal("1.20"),
            category_avg_ter=Decimal("1.00"),
        ),
    )
    assert result.concentration.top5_pct == Decimal("24.00")
    assert result.concentration.coverage_pct == Decimal("80")
    assert result.concentration.top_stocks[0].name == "Stock 0"
    assert scope_key in {"combined", str(member.id)}


def test_loader_uses_only_the_newest_non_null_ter_of_each_scheme_for_fund_and_category_mean(db_session):
    user, member = _household(db_session)
    held = _scheme(db_session)
    peer = _scheme(db_session, "Peer")
    db_session.add_all([
        SchemeTer(scheme_id=held.id, reference_period=date(2026, 6, 30), ter_value=Decimal("2.00")),
        SchemeTer(scheme_id=held.id, reference_period=date(2026, 9, 30), ter_value=Decimal("1.20")),
        SchemeTer(scheme_id=peer.id, reference_period=date(2026, 6, 30), ter_value=Decimal("0.20")),
        SchemeTer(scheme_id=peer.id, reference_period=date(2026, 9, 30), ter_value=Decimal("0.80")),
    ])
    db_session.commit()
    fund = load_worth_facts(
        db_session, user.id, scope="aggregate", household_member_ids=[member.id],
        holdings=[_holding(member, held)],
    ).funds[0]
    assert fund.ter == Decimal("1.20")
    assert fund.category_avg_ter == Decimal("1.00")


def test_loader_concentration_uses_only_the_first_five_stocks(db_session):
    user, member = _household(db_session)
    held = _scheme(db_session)
    extra = StockHoldingRow(
        isin="INE000000099", instrument_name="Stock 9", sector_raw="IT",
        asset_type=AssetType.EQUITY_DOMESTIC, exposure_pct=Decimal("3.00"),
        exposure_value=Decimal("3.00"), contributing_funds=[],
    )
    _upsert_section(
        db_session, user.id, "combined", None, "stock_holdings",
        AggregateStockHoldingsResponse(
            members=[MemberStatus(id=str(member.id), name=member.name, has_data=True)],
            stock_holdings=_stock_summary(_stock_rows() + [extra]),
        ),
    )
    db_session.commit()
    concentration = load_worth_facts(
        db_session, user.id, scope="aggregate", household_member_ids=[member.id],
        holdings=[_holding(member, held)],
    ).concentration
    assert [stock.name for stock in concentration.top_stocks] == [f"Stock {index}" for index in range(5)]
    assert concentration.top5_pct == Decimal("24.00")


def test_loader_sums_scheme_values_and_keeps_larger_rows_plan_type(db_session):
    user, member = _household(db_session)
    held = _scheme(db_session)
    result = load_worth_facts(
        db_session, user.id, scope="aggregate", household_member_ids=[member.id],
        holdings=[
            _holding(member, held, "25.005", plan=PlanType.REGULAR),
            _holding(member, held, "74.995", plan=PlanType.DIRECT),
            _holding(member, held, unavailable=True),
        ],
    )
    assert result.funds[0].value == Decimal("100.01")
    assert result.funds[0].plan_type == "direct"
    assert result.unavailable == ("score", "category_ranking", "stock_holdings")


@pytest.mark.parametrize("missing", ["score", "category_ranking", "stock_holdings"])
def test_loader_lists_each_missing_section_without_losing_other_signals(db_session, missing):
    user, member = _household(db_session)
    held = _scheme(db_session)
    _write_sections(db_session, user, member, held, omit=(missing,))
    result = load_worth_facts(
        db_session, user.id, scope="aggregate", household_member_ids=[member.id],
        holdings=[_holding(member, held)],
    )
    assert result.unavailable == (missing,)
    fund = result.funds[0]
    if missing != "score":
        assert fund.tier == 1
    if missing != "category_ranking":
        assert fund.return_1y == Decimal("0.05")
    if missing != "stock_holdings":
        assert result.concentration is not None


@pytest.mark.parametrize("unusable", ["failed", "stale"])
def test_loader_lists_failed_or_stale_stored_section(db_session, unusable):
    user, member = _household(db_session)
    held = _scheme(db_session)
    _write_sections(db_session, user, member, held)
    row = db_session.get(AnalyticsSection, (user.id, "combined", "score"))
    if unusable == "failed":
        row.failed_at = datetime.now(timezone.utc)
    else:
        from app.models.enums import ImportStatus
        from app.models.imports import Import

        row.computed_at = datetime(2026, 10, 20, tzinfo=timezone.utc)
        db_session.add(Import(
            household_member_id=member.id, status=ImportStatus.CONFIRMED,
            uploaded_at=datetime(2026, 10, 21, tzinfo=timezone.utc),
            confirmed_at=datetime(2026, 10, 21, tzinfo=timezone.utc),
        ))
    db_session.commit()
    result = load_worth_facts(
        db_session, user.id, scope="aggregate", household_member_ids=[member.id],
        holdings=[_holding(member, held)],
    )
    assert result.unavailable == ("score",)


def _batch(db, scheme, as_of, *, status=DisclosureBatchStatus.WRITTEN):
    batch = DisclosureBatch(
        scheme_id=scheme.id, as_of_date=as_of, amc_name=scheme.amc_name, status=status,
    )
    db.add(batch)
    db.flush()
    return batch


def _holding_row(db, batch, isin, pct):
    db.add(SchemeHolding(
        batch_id=batch.id, instrument_name=isin, isin=isin, sector_raw="IT",
        asset_type=AssetType.EQUITY_DOMESTIC, market_value=Decimal("1"),
        pct_to_nav=Decimal(pct),
    ))


def test_earlier_top5_uses_all_covered_schemes_and_oldest_batch_date(db_session):
    schemes = [_scheme(db_session, "A"), _scheme(db_session, "B")]
    batches = [_batch(db_session, schemes[0], date(2026, 2, 28)),
               _batch(db_session, schemes[1], date(2026, 2, 20))]
    _holding_row(db_session, batches[0], "INE000000001", "10")
    _holding_row(db_session, batches[1], "INE000000001", "20")
    db_session.commit()
    assert load_earlier_top5(
        db_session,
        scheme_values={schemes[0].id: Decimal("60"), schemes[1].id: Decimal("40")},
        total_value=Decimal("100"), isins=["INE000000001"],
        current_as_of=date(2026, 5, 31),
    ) == (Decimal("14.00"), date(2026, 2, 20))


@pytest.mark.parametrize("case", ["missing", "too_old", "young"])
def test_earlier_top5_returns_none_instead_of_undercount(db_session, case):
    schemes = [_scheme(db_session, "A"), _scheme(db_session, "B")]
    _batch(db_session, schemes[0], date(2026, 2, 28))
    if case == "missing":
        _batch(db_session, schemes[1], date(2026, 5, 1))
    elif case == "too_old":
        _batch(db_session, schemes[1], date(2026, 1, 14))
    else:
        _batch(db_session, schemes[1], date(2026, 4, 30))
    db_session.commit()
    assert load_earlier_top5(
        db_session, scheme_values={scheme.id: Decimal("50") for scheme in schemes},
        total_value=Decimal("100"), isins=["INE000000001"],
        current_as_of=date(2026, 5, 31),
    ) == (None, None)


def test_earlier_top5_never_uses_a_batch_that_was_not_written(db_session):
    schemes = [_scheme(db_session, "A"), _scheme(db_session, "B")]
    first = _batch(db_session, schemes[0], date(2026, 2, 28))
    second = _batch(db_session, schemes[1], date(2026, 2, 20))
    failed = _batch(db_session, schemes[1], date(2026, 2, 27), status=DisclosureBatchStatus.FAILED)
    _holding_row(db_session, first, "INE000000001", "10")
    _holding_row(db_session, second, "INE000000001", "20")
    _holding_row(db_session, failed, "INE000000001", "50")
    db_session.commit()
    assert load_earlier_top5(
        db_session,
        scheme_values={schemes[0].id: Decimal("60"), schemes[1].id: Decimal("40")},
        total_value=Decimal("100"), isins=["INE000000001"],
        current_as_of=date(2026, 5, 31),
    ) == (Decimal("14.00"), date(2026, 2, 20))


def test_earlier_top5_ignores_scheme_with_no_written_batch(db_session):
    schemes = [_scheme(db_session, "A"), _scheme(db_session, "B")]
    batch = _batch(db_session, schemes[0], date(2026, 2, 28))
    _batch(db_session, schemes[1], date(2026, 2, 28), status=DisclosureBatchStatus.FAILED)
    _holding_row(db_session, batch, "INE000000001", "10")
    db_session.commit()
    assert load_earlier_top5(
        db_session, scheme_values={scheme.id: Decimal("50") for scheme in schemes},
        total_value=Decimal("100"), isins=["INE000000001"],
        current_as_of=date(2026, 5, 31),
    ) == (Decimal("5.00"), date(2026, 2, 28))


def test_loader_no_holdings_returns_without_statements(db_session):
    user, member = _household(db_session)
    user_id, member_id = user.id, member.id
    statements = []
    listener = lambda *args: statements.append(args[2])
    event.listen(db_session.bind, "before_cursor_execute", listener)
    result = load_worth_facts(
        db_session, user_id, scope="aggregate", household_member_ids=[member_id], holdings=[],
    )
    event.remove(db_session.bind, "before_cursor_execute", listener)
    assert statements == []
    assert result.funds == ()
    assert result.concentration is None
    assert result.unavailable == ("score", "category_ranking", "stock_holdings")


def test_loader_statement_budget_and_no_analytics_recompute(db_session):
    user, member = _household(db_session)
    held = _scheme(db_session)
    _write_sections(db_session, user, member, held)
    db_session.add(SchemeTer(
        scheme_id=held.id, reference_period=date(2026, 9, 30), ter_value=Decimal("1"),
    ))
    batch = _batch(db_session, held, date(2026, 6, 30))
    _holding_row(db_session, batch, "INE000000000", "10")
    db_session.commit()
    user_id, member_id = user.id, member.id
    holding = _holding(member, held)
    db_session.expire_all()
    statements = []
    listener = lambda *args: statements.append(args[2])
    fail = AssertionError("Home worth loader must not recompute analytics")
    event.listen(db_session.bind, "before_cursor_execute", listener)
    with patch("app.services.analytics.scorer.compute_portfolio_score", side_effect=fail), \
         patch("app.services.analytics.category_ranking.compute_category_ranking", side_effect=fail), \
         patch("app.services.analytics.lookthrough.compute_stock_holdings", side_effect=fail):
        result = load_worth_facts(
            db_session, user_id, scope="aggregate", household_member_ids=[member_id],
            holdings=[holding],
        )
    event.remove(db_session.bind, "before_cursor_execute", listener)
    assert len(statements) <= 6
    assert result.funds[0].tier == 1


def test_loader_output_builds_the_hand_fixture_cards(db_session):
    user, member = _household(db_session)
    schemes = [
        _scheme(db_session, "Alpha Equity"), _scheme(db_session, "Beta Flexi"),
        _scheme(db_session, "Gamma Small"), _scheme(db_session, "Delta Debt"),
    ]
    member_status = MemberStatus(id=str(member.id), name=member.name, has_data=True)
    scores = PortfolioScoreSummary(
        funds=[
            _score_row(schemes[0], 1, "22.00"), _score_row(schemes[1], 3, "50"),
            _score_row(schemes[2], 4, "70"), _score_row(schemes[3], 2, "40"),
        ], weighted_score="0", covered_value="100000", total_value="100000",
        uncovered_schemes=[],
    )
    ranking = CategoryRankingSummary(funds=[
        _ranking_row(schemes[0], "0.08", "0.15"),
        _ranking_row(schemes[1], "0.10", "0.12"),
        _ranking_row(schemes[2], "0.05", "0.12"),
        _ranking_row(schemes[3], None, None),
    ])
    stock = _stock_summary(_stock_rows())
    _upsert_section(db_session, user.id, "combined", None, "score",
                    AggregatePortfolioScoreResponse(members=[member_status], score=scores))
    _upsert_section(db_session, user.id, "combined", None, "category_ranking",
                    AggregateCategoryRankingResponse(members=[member_status], ranking=ranking))
    _upsert_section(db_session, user.id, "combined", None, "stock_holdings",
                    AggregateStockHoldingsResponse(members=[member_status], stock_holdings=stock))
    ter_values = [("1.20", "0.90"), ("1.70", "1.00"), ("0.80", "0.85")]
    for scheme, (ter, peer_ter) in zip(schemes[:3], ter_values):
        peer = _scheme(db_session, f"{scheme.name} Peer", category=scheme.sebi_category)
        db_session.add_all([
            SchemeTer(scheme_id=scheme.id, reference_period=date(2026, 9, 30), ter_value=Decimal(ter)),
            SchemeTer(scheme_id=peer.id, reference_period=date(2026, 9, 30), ter_value=Decimal(peer_ter) * 2 - Decimal(ter)),
        ])
    db_session.commit()
    facts = load_worth_facts(
        db_session, user.id, scope="aggregate", household_member_ids=[member.id],
        holdings=[
            _holding(member, schemes[0], "50000.00"),
            _holding(member, schemes[1], "30000.00"),
            _holding(member, schemes[2], "15000.00"),
            _holding(member, schemes[3], "5000.00"),
        ],
    )
    cards = build_worth_cards(facts.funds, facts.concentration)
    assert [(card.kind, card.scheme_name) for card in cards] == [
        ("weak_fund", "Alpha Equity"),
        ("underperforming", "Gamma Small"),
        ("concentration", None),
    ]
