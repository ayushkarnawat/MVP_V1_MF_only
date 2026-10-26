import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models.analytics import AnalyticsSection
from app.models.enums import ImportStatus
from app.models.imports import Import
from app.models.user import HouseholdMember, User
from app.services.analytics.recompute import _upsert_section
from app.services.analytics.schemas import (
    AggregateAssetAllocationResponse,
    AggregateCapAllocationResponse,
    AggregateCategoryRankingResponse,
    AggregatePortfolioScoreResponse,
    AggregateStockHoldingsResponse,
    AssetAllocationSummary,
    AssetAllocationVariant,
    CapAllocationOther,
    CapAllocationSummary,
    CategoryRankingSummary,
    LookthroughCoverage,
    PortfolioScoreSummary,
    StockHoldingsSummary,
)
from app.services.dashboard.schemas import MemberStatus
from app.services.home.stored import load_fresh_sections, scope_key_for, unwrap_section


COMPUTED_AT = datetime(2026, 10, 23, 12, tzinfo=timezone.utc)


def _coverage():
    return LookthroughCoverage(
        covered_value_pct=Decimal("80"),
        not_published_yet=[],
        not_available_from_amc=[],
        missing_value_schemes=[],
        funds=[],
    )


def _asset_summary():
    variant = AssetAllocationVariant(classes=[], equity_outer=[], cap_allocation=_cap_summary())
    return AssetAllocationSummary(
        as_disclosed=variant,
        arbitrage_as_cash=variant,
        total_portfolio_value=Decimal("100"),
        covered_value=Decimal("80"),
        nav_as_of=date(2026, 10, 23),
        holdings_as_of=date(2026, 9, 30),
        coverage=_coverage(),
        hide_headlines=False,
        excluded_share=Decimal("20"),
        arbitrage_funds=[],
    )


def _cap_summary():
    return CapAllocationSummary(
        buckets=[],
        other=CapAllocationOther(
            non_equity_value=Decimal("0"),
            unclassified_equity_value=Decimal("0"),
            non_equity_rows=[],
            unclassified_equity_rows=[],
        ),
        total_portfolio_value=Decimal("100"),
        total_equity_value=Decimal("100"),
        nav_as_of=date(2026, 10, 23),
        holdings_as_of=date(2026, 9, 30),
        classification_as_of=None,
        coverage=_coverage(),
        hide_headlines=False,
        excluded_share=Decimal("0"),
    )


def _stock_summary():
    return StockHoldingsSummary(
        rows=[],
        nav_as_of=date(2026, 10, 23),
        holdings_as_of=date(2026, 9, 30),
        total_portfolio_value=Decimal("100"),
        coverage=_coverage(),
        truncated=False,
        total_stock_count=0,
        hide_headlines=False,
        excluded_share=Decimal("0"),
        non_equity_share=Decimal("0"),
    )


def _score_summary():
    return PortfolioScoreSummary(
        funds=[],
        weighted_score=None,
        covered_value="0",
        total_value="0",
        uncovered_schemes=[],
    )


def _ranking_summary():
    return CategoryRankingSummary(funds=[])


def _payload_shapes():
    member = MemberStatus(id=str(uuid.uuid4()), name="A", has_data=True)
    summaries = {
        "asset_allocation": _asset_summary(),
        "score": _score_summary(),
        "category_ranking": _ranking_summary(),
        "stock_holdings": _stock_summary(),
        "cap_allocation": _cap_summary(),
    }
    wrappers = {
        "asset_allocation": AggregateAssetAllocationResponse(
            members=[member], asset_allocation=summaries["asset_allocation"]
        ),
        "score": AggregatePortfolioScoreResponse(
            members=[member], score=summaries["score"]
        ),
        "category_ranking": AggregateCategoryRankingResponse(
            members=[member], ranking=summaries["category_ranking"]
        ),
        "stock_holdings": AggregateStockHoldingsResponse(
            members=[member], stock_holdings=summaries["stock_holdings"]
        ),
        "cap_allocation": AggregateCapAllocationResponse(
            members=[member], cap_allocation=summaries["cap_allocation"]
        ),
    }
    return {
        name: (summary.model_dump(mode="json"), wrappers[name].model_dump(mode="json"))
        for name, summary in summaries.items()
    }


@pytest.mark.parametrize("section", [
    "asset_allocation", "score", "category_ranking", "stock_holdings", "cap_allocation",
])
def test_unwrap_section_accepts_real_bare_and_wrapped_shapes(section):
    bare, wrapped = _payload_shapes()[section]
    assert unwrap_section(section, bare) == bare
    assert unwrap_section(section, wrapped) == bare


def test_unwrap_section_rejects_non_mapping_body_and_unknown_name():
    assert unwrap_section("score", {"score": []}) is None
    with pytest.raises(ValueError, match="Unknown stored section"):
        unwrap_section("unknown", {})


def test_scope_key_for_combined_and_member():
    member_id = uuid.uuid4()
    assert scope_key_for("aggregate", [member_id]) == "combined"
    assert scope_key_for("member", [member_id]) == str(member_id)


def _household(db, count=2):
    user = User(
        id=uuid.uuid4(),
        phone_number=f"+919{uuid.uuid4().hex[:9]}",
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()
    members = []
    for index in range(count):
        member = HouseholdMember(
            id=uuid.uuid4(),
            user_id=user.id,
            name=f"Member {index}",
            created_at=datetime.now(timezone.utc),
        )
        db.add(member)
        db.flush()
        members.append(member)
    db.commit()
    return user, members


def _write_section(db, user_id, scope_key, member_id, name, *, computed_at=COMPUTED_AT):
    bare, wrapped = _payload_shapes()[name]
    payload = wrapped if scope_key == "combined" else bare
    model_by_name = {
        "asset_allocation": _asset_summary,
        "score": _score_summary,
        "category_ranking": _ranking_summary,
        "stock_holdings": _stock_summary,
        "cap_allocation": _cap_summary,
    }
    if scope_key == "combined":
        member = MemberStatus(id=str(member_id), name="A", has_data=True)
        wrapper_by_name = {
            "asset_allocation": lambda: AggregateAssetAllocationResponse(
                members=[member], asset_allocation=_asset_summary()
            ),
            "score": lambda: AggregatePortfolioScoreResponse(
                members=[member], score=_score_summary()
            ),
            "category_ranking": lambda: AggregateCategoryRankingResponse(
                members=[member], ranking=_ranking_summary()
            ),
            "stock_holdings": lambda: AggregateStockHoldingsResponse(
                members=[member], stock_holdings=_stock_summary()
            ),
            "cap_allocation": lambda: AggregateCapAllocationResponse(
                members=[member], cap_allocation=_cap_summary()
            ),
        }
        payload_model = wrapper_by_name[name]()
        stored_member_id = None
    else:
        payload_model = model_by_name[name]()
        stored_member_id = member_id
    _upsert_section(db, user_id, scope_key, stored_member_id, name, payload_model)
    db.flush()
    row = db.get(AnalyticsSection, (user_id, scope_key, name))
    row.computed_at = computed_at
    db.commit()
    return payload


def _add_import(db, member_id, status, when):
    row = Import(
        household_member_id=member_id,
        status=status,
        uploaded_at=when,
        confirmed_at=when if status == ImportStatus.CONFIRMED else None,
    )
    db.add(row)
    db.commit()


def test_loader_returns_fresh_real_writer_payload_unwrapped(db_session):
    user, members = _household(db_session, 1)
    expected = _write_section(
        db_session, user.id, "combined", members[0].id, "score"
    )["score"]
    result = load_fresh_sections(
        db_session,
        user.id,
        scope_key="combined",
        sections=["score"],
        household_member_ids=[members[0].id],
    )
    assert result["score"].payload == expected
    assert result["score"].computed_at == COMPUTED_AT


def test_loader_returns_empty_when_row_is_absent(db_session):
    user, members = _household(db_session, 1)
    assert load_fresh_sections(
        db_session,
        user.id,
        scope_key="combined",
        sections=["score"],
        household_member_ids=[members[0].id],
    ) == {}


def test_loader_excludes_failed_section(db_session):
    user, members = _household(db_session, 1)
    _write_section(db_session, user.id, "combined", members[0].id, "score")
    row = db_session.get(AnalyticsSection, (user.id, "combined", "score"))
    row.failed_at = datetime(2026, 10, 24, tzinfo=timezone.utc)
    db_session.commit()
    assert load_fresh_sections(
        db_session, user.id, scope_key="combined", sections=["score"],
        household_member_ids=[members[0].id],
    ) == {}


def test_loader_rejects_section_older_than_latest_confirmed_import(db_session):
    user, members = _household(db_session, 1)
    _write_section(
        db_session, user.id, "combined", members[0].id, "score",
        computed_at=datetime(2026, 10, 20, tzinfo=timezone.utc),
    )
    _add_import(
        db_session, members[0].id, ImportStatus.CONFIRMED,
        datetime(2026, 10, 21, tzinfo=timezone.utc),
    )
    assert load_fresh_sections(
        db_session, user.id, scope_key="combined", sections=["score"],
        household_member_ids=[members[0].id],
    ) == {}


def test_loader_accepts_equal_timestamp_and_naive_sqlite_datetime(db_session):
    user, members = _household(db_session, 1)
    _write_section(db_session, user.id, str(members[0].id), members[0].id, "score")
    _add_import(db_session, members[0].id, ImportStatus.CONFIRMED, COMPUTED_AT)
    db_session.expire_all()
    row = db_session.get(AnalyticsSection, (user.id, str(members[0].id), "score"))
    assert row.computed_at.tzinfo is None
    result = load_fresh_sections(
        db_session, user.id, scope_key=str(members[0].id), sections=["score"],
        household_member_ids=[members[0].id],
    )
    assert result["score"].computed_at == COMPUTED_AT


def test_loader_ignores_pending_import_and_other_members_later_import(db_session):
    user, members = _household(db_session)
    scope_key = str(members[0].id)
    _write_section(db_session, user.id, scope_key, members[0].id, "score")
    _add_import(
        db_session, members[0].id, ImportStatus.PENDING,
        datetime(2026, 10, 24, tzinfo=timezone.utc),
    )
    _add_import(
        db_session, members[1].id, ImportStatus.CONFIRMED,
        datetime(2026, 10, 24, tzinfo=timezone.utc),
    )
    result = load_fresh_sections(
        db_session, user.id, scope_key=scope_key, sections=["score"],
        household_member_ids=[members[0].id],
    )
    assert set(result) == {"score"}


@pytest.mark.parametrize("stored", [True, False])
def test_loader_statement_budget(db_session, stored):
    user, members = _household(db_session, 1)
    user_id = user.id
    member_id = members[0].id
    if stored:
        _write_section(db_session, user_id, "combined", member_id, "score")
        _write_section(db_session, user_id, "combined", member_id, "category_ranking")
    db_session.expire_all()
    statements = []
    listener = lambda *args: statements.append(args[2])
    event.listen(db_session.bind, "before_cursor_execute", listener)
    result = load_fresh_sections(
        db_session,
        user_id,
        scope_key="combined",
        sections=["score", "category_ranking"],
        household_member_ids=[member_id],
    )
    event.remove(db_session.bind, "before_cursor_execute", listener)
    assert len(statements) == (2 if stored else 1)
    assert set(result) == ({"score", "category_ranking"} if stored else set())
