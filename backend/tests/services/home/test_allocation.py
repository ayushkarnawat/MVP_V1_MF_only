import random
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import event

import app.api.analytics  # noqa: F401  (imported before any patch: `from ... import try_claim_recompute` there would otherwise bind the mock for the whole session)
from app.models.analytics import AnalyticsSection
from app.models.enums import ImportStatus, PlanType, Relationship
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.user import HouseholdMember, User
from app.services.analytics.recompute import _upsert_section
from app.services.analytics.schemas import (
    AggregateAssetAllocationResponse,
    AssetAllocationClass,
    AssetAllocationSummary,
    AssetAllocationVariant,
    CapAllocationOther,
    CapAllocationSummary,
    LookthroughCoverage,
)
from app.services.dashboard.schemas import HoldingRow, MemberStatus
from app.services.home.allocation import (
    ALLOCATION_CLASSES,
    MemberValue,
    StoredMix,
    bucket_class,
    bucket_values,
    build_allocation,
    load_allocation,
    parse_stored_allocation,
)


COMPUTED_AT = datetime(2026, 10, 23, 12, tzinfo=timezone.utc)


def _coverage():
    return LookthroughCoverage(
        covered_value_pct=Decimal("90"),
        not_published_yet=[],
        not_available_from_amc=[],
        missing_value_schemes=[],
        funds=[],
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
        total_portfolio_value=Decimal("90000"),
        total_equity_value=Decimal("54000"),
        nav_as_of=date(2026, 10, 23),
        holdings_as_of=date(2026, 9, 30),
        classification_as_of=None,
        coverage=_coverage(),
        hide_headlines=False,
        excluded_share=Decimal("10"),
    )


def _variant(values=None):
    values = values or {
        "equity": Decimal("54000"),
        "debt": Decimal("18000"),
        "gold": Decimal("4500"),
        "cash_like": Decimal("4500"),
    }
    return AssetAllocationVariant(
        classes=[
            AssetAllocationClass(key=key, value=value, percentage=Decimal("0"))
            for key, value in values.items()
        ],
        equity_outer=[],
        cap_allocation=_cap_summary(),
    )


def _summary(*, hide_headlines=False, arbitrage_values=None):
    return AssetAllocationSummary(
        as_disclosed=_variant(),
        arbitrage_as_cash=_variant(arbitrage_values),
        total_portfolio_value=Decimal("90000"),
        covered_value=Decimal("81000"),
        nav_as_of=date(2026, 10, 23),
        holdings_as_of=date(2026, 9, 30),
        coverage=_coverage(),
        hide_headlines=hide_headlines,
        excluded_share=Decimal("10"),
        arbitrage_funds=[],
    )


def _member_payload():
    return _summary().model_dump(mode="json")


def _combined_payload():
    return AggregateAssetAllocationResponse(
        members=[MemberStatus(id=str(uuid.uuid4()), name="A", has_data=True)],
        asset_allocation=_summary(),
    ).model_dump(mode="json")


def _mix(**changes):
    values = {
        "equity": Decimal("54000"),
        "debt": Decimal("18000"),
        "gold": Decimal("4500"),
        "real_estate": Decimal("0"),
        "others": Decimal("13500"),
        "total_value": Decimal("90000"),
        "covered_value": Decimal("81000"),
        "nav_as_of": date(2026, 10, 23),
        "computed_at": COMPUTED_AT,
    }
    values.update(changes)
    return StoredMix(**values)


def _live_rows(result):
    return {row.key: row for row in result.classes if row.status == "live"}


def test_allocation_classes_are_complete_and_ordered():
    assert ALLOCATION_CLASSES == (
        ("equity", "Equity", "live"),
        ("debt", "Debt", "live"),
        ("gold", "Gold", "live"),
        ("real_estate", "Real Estate (REITs and InvITs)", "live"),
        ("others", "Others", "live"),
        ("direct_stocks", "Direct stocks", "coming_soon"),
        ("fds_bonds", "FDs and bonds", "coming_soon"),
        ("us_stocks", "US stocks", "coming_soon"),
    )


@pytest.mark.parametrize("payload", [_member_payload(), _combined_payload()])
def test_parse_stored_allocation_accepts_real_member_and_combined_shapes(payload):
    assert parse_stored_allocation(payload, COMPUTED_AT) == _mix()


def test_parse_stored_allocation_rejects_missing_as_disclosed():
    payload = _member_payload()
    del payload["as_disclosed"]
    assert parse_stored_allocation(payload, COMPUTED_AT) is None


def test_parse_stored_allocation_rejects_non_numeric_value():
    payload = _member_payload()
    payload["as_disclosed"]["classes"][0]["value"] = "not-a-number"
    assert parse_stored_allocation(payload, COMPUTED_AT) is None


def test_parse_stored_allocation_rejects_hidden_headlines():
    payload = _summary(hide_headlines=True).model_dump(mode="json")
    assert parse_stored_allocation(payload, COMPUTED_AT) is None


@pytest.mark.parametrize("key", ["total_portfolio_value", "covered_value"])
def test_parse_stored_allocation_rejects_non_positive_totals(key):
    payload = _member_payload()
    payload[key] = "0"
    assert parse_stored_allocation(payload, COMPUTED_AT) is None


def test_parse_stored_allocation_rejects_negative_class_value():
    payload = _member_payload()
    payload["as_disclosed"]["classes"][0]["value"] = "-1"
    assert parse_stored_allocation(payload, COMPUTED_AT) is None


def test_parse_stored_allocation_uses_as_disclosed_not_arbitrage_variant():
    payload = _summary(arbitrage_values={
        "equity": Decimal("1"), "debt": Decimal("2"),
        "gold": Decimal("3"), "cash_like": Decimal("4"),
    }).model_dump(mode="json")
    assert parse_stored_allocation(payload, COMPUTED_AT) == _mix()


def test_parse_stored_allocation_clamps_others_when_classes_exceed_total():
    payload = _member_payload()
    payload["as_disclosed"]["classes"][0]["value"] = "100000"
    parsed = parse_stored_allocation(payload, COMPUTED_AT)
    assert parsed is not None
    assert parsed.others == Decimal("0")


def test_parse_stored_allocation_treats_naive_computed_at_as_utc():
    parsed = parse_stored_allocation(_member_payload(), datetime(2026, 10, 23, 12))
    assert parsed is not None
    assert parsed.computed_at == COMPUTED_AT


@pytest.mark.parametrize(
    ("category", "expected"),
    [
        ("Equity Scheme - Flexi Cap Fund", "equity"),
        ("Debt Scheme - Short Duration Fund", "debt"),
        ("Hybrid Scheme - Aggressive Hybrid Fund", "others"),
        ("Other Scheme - Gold ETF", "gold"),
        ("Other Scheme - Silver ETF", "gold"),
        ("Other Scheme - Index Funds", "others"),
        ("", "others"),
    ],
)
def test_bucket_class_matches_home_fallback_rules(category, expected):
    assert bucket_class(category) == expected


def test_bucket_values_returns_all_keys_and_hand_fixture_totals():
    assert bucket_values([
        (Decimal("60000.00"), "Equity Scheme - Flexi Cap Fund"),
        (Decimal("20000.00"), "Debt Scheme - Short Duration Fund"),
        (Decimal("12000.00"), "Hybrid Scheme - Aggressive Hybrid Fund"),
        (Decimal("5000.00"), "Other Scheme - Gold ETF"),
        (Decimal("3000.00"), "Other Scheme - Index Funds"),
    ]) == {
        "equity": Decimal("60000.00"),
        "debt": Decimal("20000.00"),
        "gold": Decimal("5000.00"),
        "real_estate": Decimal("0"),
        "others": Decimal("15000.00"),
    }
    assert bucket_values([]) == {
        "equity": Decimal("0"), "debt": Decimal("0"),
        "gold": Decimal("0"), "real_estate": Decimal("0"), "others": Decimal("0"),
    }


def test_build_allocation_rescales_stored_mix_to_live_total():
    result = build_allocation(
        total_value=Decimal("100000.00"), mix=_mix(), buckets=None, members=None
    )
    rows = _live_rows(result)
    assert result.source == "analytics"
    assert result.approximate is False
    assert result.total_value == Decimal("100000.00")
    assert {key: (row.value, row.percentage) for key, row in rows.items()} == {
        "equity": (Decimal("60000.00"), Decimal("60.00")),
        "debt": (Decimal("20000.00"), Decimal("20.00")),
        "gold": (Decimal("5000.00"), Decimal("5.00")),
        "real_estate": (Decimal("0.00"), Decimal("0.00")),
        "others": (Decimal("15000.00"), Decimal("15.00")),
    }
    assert result.covered_pct == Decimal("90.00")
    assert result.mix_as_of == date(2026, 10, 23)
    assert result.mix_computed_at == COMPUTED_AT


def test_build_allocation_awards_extra_cent_by_largest_remainder():
    result = build_allocation(
        total_value=Decimal("100000.01"), mix=_mix(), buckets=None, members=None
    )
    assert {key: row.value for key, row in _live_rows(result).items()} == {
        "equity": Decimal("60000.01"),
        "debt": Decimal("20000.00"),
        "gold": Decimal("5000.00"),
        "real_estate": Decimal("0"),
        "others": Decimal("15000.00"),
    }


def test_build_allocation_non_round_total_reconciles_and_zero_weight_stays_zero():
    result = build_allocation(
        total_value=Decimal("33333.33"), mix=_mix(gold=Decimal("0")),
        buckets=None, members=None,
    )
    values = [row.value for row in _live_rows(result).values()]
    assert sum(values, Decimal("0")) == Decimal("33333.33")
    assert all(value >= 0 for value in values)
    assert _live_rows(result)["gold"].value == Decimal("0.00")


def test_build_allocation_fallback_uses_exact_bucket_values():
    buckets = {
        "equity": Decimal("60000.00"), "debt": Decimal("20000.00"),
        "gold": Decimal("5000.00"), "real_estate": Decimal("0.00"), "others": Decimal("15000.00"),
    }
    result = build_allocation(
        total_value=Decimal("100000.00"), mix=None, buckets=buckets, members=None
    )
    assert result.source == "dashboard_buckets"
    assert result.approximate is True
    assert result.covered_pct is result.mix_as_of is result.mix_computed_at is None
    assert {key: row.value for key, row in _live_rows(result).items()} == buckets


def test_build_allocation_missing_fallback_class_is_quantized_to_cents():
    result = build_allocation(
        total_value=Decimal("10.00"), mix=None,
        buckets={"equity": Decimal("10.00")}, members=None,
    )
    assert str(_live_rows(result)["debt"].value) == "0.00"


def test_build_allocation_requires_consistent_fallback_buckets():
    with pytest.raises(ValueError, match="buckets"):
        build_allocation(total_value=Decimal("1.00"), mix=None, buckets=None, members=None)
    with pytest.raises(ValueError, match="total_value"):
        build_allocation(
            total_value=Decimal("1.00"), mix=None,
            buckets={"equity": Decimal("0.99")}, members=None,
        )


def test_build_allocation_percentages_round_half_up():
    # 2000.10 of 6000.00 is exactly 33.335 percent: half-up gives 33.34, truncation would give 33.33.
    result = build_allocation(
        total_value=Decimal("6000.00"), mix=None,
        buckets={"equity": Decimal("2000.10"), "others": Decimal("3999.90")}, members=None,
    )
    rows = _live_rows(result)
    assert rows["equity"].percentage == Decimal("33.34")
    assert rows["others"].percentage == Decimal("66.67")  # 66.665 exactly


def test_build_allocation_all_zero_stored_weights_fall_back_to_buckets():
    zero = _mix(equity=Decimal("0"), debt=Decimal("0"), gold=Decimal("0"), others=Decimal("0"))
    result = build_allocation(
        total_value=Decimal("100.00"), mix=zero, buckets={"debt": Decimal("100.00")}, members=None,
    )
    assert (result.source, result.approximate) == ("dashboard_buckets", True)
    assert _live_rows(result)["debt"].value == Decimal("100.00")
    with pytest.raises(ValueError, match="buckets"):
        build_allocation(total_value=Decimal("100.00"), mix=zero, buckets=None, members=None)


def test_build_allocation_zero_total_has_zero_live_rows_and_no_approximation():
    result = build_allocation(
        total_value=Decimal("0.00"), mix=_mix(), buckets=None, members=None
    )
    assert result.source == "dashboard_buckets"
    assert result.approximate is False
    assert result.covered_pct is None
    assert all(
        (row.value, row.percentage) == (Decimal("0.00"), Decimal("0.00"))
        for row in _live_rows(result).values()
    )


def test_build_allocation_coming_soon_rows_are_excluded_from_total():
    result = build_allocation(
        total_value=Decimal("100000.00"), mix=_mix(), buckets=None, members=None
    )
    coming = [row for row in result.classes if row.status == "coming_soon"]
    assert len(coming) == 3
    assert all(row.value is None and row.percentage is None for row in coming)
    assert sum((row.value for row in _live_rows(result).values()), Decimal("0")) == result.total_value


def test_build_allocation_family_shares_keep_zero_member_and_input_order():
    first, second, third = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    result = build_allocation(
        total_value=Decimal("100000.00"), mix=_mix(), buckets=None,
        members=[
            MemberValue(first, "A", Decimal("70000.00")),
            MemberValue(second, "B", Decimal("30000.00")),
            MemberValue(third, "C", Decimal("0.00")),
        ],
    )
    assert [(row.member_id, row.name, row.value, row.percentage) for row in result.members] == [
        (first, "A", Decimal("70000.00"), Decimal("70.00")),
        (second, "B", Decimal("30000.00"), Decimal("30.00")),
        (third, "C", Decimal("0.00"), Decimal("0.00")),
    ]
    assert build_allocation(
        total_value=Decimal("100000.00"), mix=_mix(), buckets=None, members=None
    ).members is None


def test_seeded_allocation_sources_reconcile_without_negative_zero():
    rng = random.Random(3321)
    for _ in range(300):
        total = Decimal(rng.randint(0, 1_000_000)) / Decimal("100")
        weights = [Decimal(rng.randint(0, 10_000)) for _ in range(4)]
        if total > 0 and not any(weights):
            weights[0] = Decimal("1")
        mix = _mix(
            equity=weights[0], debt=weights[1], gold=weights[2], others=weights[3]
        )
        analytics = build_allocation(total_value=total, mix=mix, buckets=None, members=None)
        exact_buckets = {key: row.value for key, row in _live_rows(analytics).items()}
        fallback = build_allocation(
            total_value=total, mix=None, buckets=exact_buckets if total else None, members=None
        )
        for result in (analytics, fallback):
            values = [row.value for row in _live_rows(result).values()]
            assert sum(values, Decimal("0")) == total
            assert all(value >= 0 for value in values)
            assert all(not (value.is_zero() and value.is_signed()) for value in values)


def _household(db, count=2):
    user = User(
        id=uuid.uuid4(),
        phone_number=f"+919{uuid.uuid4().hex[:9]}",
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()
    members = []
    relationships = (Relationship.SELF, Relationship.SPOUSE, Relationship.PARENT)
    for index in range(count):
        member = HouseholdMember(
            id=uuid.uuid4(), user_id=user.id, name=f"Member {index}",
            relationship=relationships[index], created_at=datetime.now(timezone.utc),
        )
        db.add(member)
        db.flush()
        members.append(member)
    db.commit()
    return user, members


def _scheme(db, category, name="Fund"):
    row = Scheme(
        id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:8], name=name,
        amc_name="Test AMC", sebi_category=category,
    )
    db.add(row)
    db.commit()
    return row


def _holding(member, scheme, value, *, nav_unavailable=False):
    current = None if nav_unavailable else str(value)
    return HoldingRow(
        scheme_id=str(scheme.id), scheme_name=scheme.name, amc_name=scheme.amc_name,
        asset_class="Other", household_member_id=str(member.id), household_member_name=member.name,
        plan_type=PlanType.DIRECT, units_held="1", average_nav="1",
        current_nav=None if nav_unavailable else "1", current_nav_date=None if nav_unavailable else NAV_DAY,
        amount_invested="0", current_value=current, current_profit_total=current,
        realized_gain="0", unrealized_gain=current, today_gain="0", nav_unavailable=nav_unavailable,
    )


NAV_DAY = date(2026, 10, 23)


def _section(
    db, user_id, scope_key, payload, computed_at=COMPUTED_AT, *, failed_at=None,
    household_member_id=None,
):
    row = AnalyticsSection(
        user_id=user_id, scope_key=scope_key, section="asset_allocation",
        household_member_id=household_member_id, payload=payload,
        computed_at=computed_at, failed_at=failed_at,
    )
    db.add(row)
    db.commit()
    return row


@pytest.mark.parametrize("scope", ["aggregate", "member"])
def test_loader_uses_real_writer_payload_for_both_scopes_and_sqlite_datetime(db_session, scope):
    user, members = _household(db_session)
    scheme = _scheme(db_session, "Equity Scheme - Flexi Cap Fund")
    if scope == "aggregate":
        scope_key = "combined"
        member_id = None
        payload = AggregateAssetAllocationResponse(
            members=[MemberStatus(id=str(member.id), name=member.name, has_data=True) for member in members],
            asset_allocation=_summary(),
        )
        selected_ids = [member.id for member in members]
    else:
        scope_key = str(members[0].id)
        member_id = members[0].id
        payload = _summary()
        selected_ids = [members[0].id]
    _upsert_section(db_session, user.id, scope_key, member_id, "asset_allocation", payload)
    db_session.commit()
    db_session.expire_all()
    stored = db_session.get(AnalyticsSection, (user.id, scope_key, "asset_allocation"))
    assert stored.computed_at.tzinfo is None
    rows = [_holding(members[0], scheme, Decimal("100000.00"))]

    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(return_value=rows)):
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope=scope, household_member_ids=selected_ids,
            members=[(member.id, member.name) for member in members],
        ))

    assert result.source == "analytics"
    assert result.total_value == Decimal("100000.00")
    assert result.mix_computed_at.tzinfo == timezone.utc


def test_loader_absent_section_uses_bucket_fallback_and_stored_prices(db_session):
    user, members = _household(db_session, 1)
    equity = _scheme(db_session, "Equity Scheme - Flexi Cap Fund")
    rows = [_holding(members[0], equity, Decimal("100000.004"))]
    lookup = AsyncMock(return_value=rows)

    with patch("app.services.home.allocation.compute_holdings", new=lookup):
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope="aggregate", household_member_ids=[members[0].id],
            members=[(members[0].id, members[0].name)],
        ))

    lookup.assert_awaited_once_with(
        db_session, [members[0].id], allow_stale_today=True, stored_only=True
    )
    assert result.source == "dashboard_buckets"
    assert result.approximate is True
    assert result.total_value == Decimal("100000.00")
    assert _live_rows(result)["equity"].value == Decimal("100000.00")


@pytest.mark.parametrize("bad_kind", ["failed", "hidden", "malformed"])
def test_loader_unusable_section_falls_back_without_raising(db_session, bad_kind):
    user, members = _household(db_session, 1)
    scheme = _scheme(db_session, "Debt Scheme - Short Duration Fund")
    payload = _member_payload()
    failed_at = None
    if bad_kind == "failed":
        failed_at = datetime(2026, 10, 24, tzinfo=timezone.utc)
    elif bad_kind == "hidden":
        payload["hide_headlines"] = True
    else:
        payload["covered_value"] = "broken"
    _section(db_session, user.id, "combined", payload, failed_at=failed_at)

    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(
        return_value=[_holding(members[0], scheme, Decimal("50.00"))]
    )):
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope="aggregate", household_member_ids=[members[0].id],
            members=[(members[0].id, members[0].name)],
        ))
    assert result.source == "dashboard_buckets"
    assert _live_rows(result)["debt"].value == Decimal("50.00")


@pytest.mark.parametrize("timestamp_field", ["confirmed_at", "uploaded_at"])
def test_loader_rejects_section_older_than_latest_confirmed_import(db_session, timestamp_field):
    user, members = _household(db_session, 1)
    scheme = _scheme(db_session, "Equity Scheme - Flexi Cap Fund")
    _section(db_session, user.id, str(members[0].id), _member_payload(),
             computed_at=datetime(2026, 10, 20, tzinfo=timezone.utc),
             household_member_id=members[0].id)
    values = {
        "household_member_id": members[0].id,
        "status": ImportStatus.CONFIRMED,
        "uploaded_at": datetime(2026, 10, 21, tzinfo=timezone.utc),
    }
    if timestamp_field == "confirmed_at":
        values["confirmed_at"] = datetime(2026, 10, 22, tzinfo=timezone.utc)
    db_session.add(Import(**values))
    db_session.commit()

    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(
        return_value=[_holding(members[0], scheme, Decimal("50.00"))]
    )):
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope="member", household_member_ids=[members[0].id], members=[],
        ))
    assert result.source == "dashboard_buckets"


def test_loader_accepts_section_at_import_time_and_ignores_pending_or_other_member(db_session):
    user, members = _household(db_session)
    scheme = _scheme(db_session, "Equity Scheme - Flexi Cap Fund")
    computed = datetime(2026, 10, 22, tzinfo=timezone.utc)
    _section(db_session, user.id, str(members[0].id), _member_payload(),
             computed_at=computed, household_member_id=members[0].id)
    db_session.add_all([
        Import(household_member_id=members[0].id, status=ImportStatus.CONFIRMED,
               uploaded_at=datetime(2026, 10, 21, tzinfo=timezone.utc), confirmed_at=computed),
        Import(household_member_id=members[0].id, status=ImportStatus.PENDING,
               uploaded_at=datetime(2026, 10, 24, tzinfo=timezone.utc)),
        Import(household_member_id=members[1].id, status=ImportStatus.CONFIRMED,
               uploaded_at=datetime(2026, 10, 24, tzinfo=timezone.utc),
               confirmed_at=datetime(2026, 10, 24, tzinfo=timezone.utc)),
    ])
    db_session.commit()

    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(
        return_value=[_holding(members[0], scheme, Decimal("50.00"))]
    )):
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope="member", household_member_ids=[members[0].id], members=[],
        ))
    assert result.source == "analytics"


def test_member_scope_never_reads_combined_section(db_session):
    user, members = _household(db_session, 1)
    scheme = _scheme(db_session, "Debt Scheme - Short Duration Fund")
    _section(db_session, user.id, "combined", _combined_payload())
    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(
        return_value=[_holding(members[0], scheme, Decimal("50.00"))]
    )):
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope="member", household_member_ids=[members[0].id], members=[],
        ))
    assert result.source == "dashboard_buckets"


def test_loader_excludes_unavailable_rows_from_total_family_and_buckets(db_session):
    user, members = _household(db_session)
    equity = _scheme(db_session, "Equity Scheme - Flexi Cap Fund", "Equity")
    debt = _scheme(db_session, "Debt Scheme - Short Duration Fund", "Debt")
    rows = [
        _holding(members[0], equity, Decimal("700.00")),
        _holding(members[1], debt, Decimal("300.00"), nav_unavailable=True),
    ]
    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(return_value=rows)):
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope="aggregate", household_member_ids=[m.id for m in members],
            members=[(m.id, m.name) for m in members],
        ))
    assert result.total_value == Decimal("700.00")
    assert _live_rows(result)["equity"].value == Decimal("700.00")
    assert _live_rows(result)["debt"].value == Decimal("0")
    assert [(row.value, row.percentage) for row in result.members] == [
        (Decimal("700.00"), Decimal("100.00")),
        (Decimal("0.00"), Decimal("0.00")),
    ]
    assert sum((row.value for row in result.members), Decimal("0")) == result.total_value


@pytest.mark.parametrize(
    ("scope", "member_count"), [("member", 2), ("aggregate", 1)]
)
def test_loader_hides_family_list_outside_multi_member_aggregate(db_session, scope, member_count):
    user, members = _household(db_session, member_count)
    scheme = _scheme(db_session, "Equity Scheme - Flexi Cap Fund")
    selected = [members[0].id] if scope == "member" else [m.id for m in members]
    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(
        return_value=[_holding(members[0], scheme, Decimal("10.00"))]
    )):
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope=scope, household_member_ids=selected,
            members=[(m.id, m.name) for m in members],
        ))
    assert result.members is None


def test_loader_zero_holdings_runs_no_statement(db_session):
    user, members = _household(db_session, 1)
    user_id, member_id, member_name = user.id, members[0].id, members[0].name
    statements = []
    listener = lambda *args: statements.append(args[2])
    event.listen(db_session.bind, "before_cursor_execute", listener)
    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(return_value=[])):
        result = __import__("asyncio").run(load_allocation(
            db_session, user_id, scope="aggregate", household_member_ids=[member_id],
            members=[(member_id, member_name)],
        ))
    event.remove(db_session.bind, "before_cursor_execute", listener)
    assert statements == []
    assert result.total_value == Decimal("0.00")
    assert all(row.value == Decimal("0.00") for row in _live_rows(result).values())


def test_loader_statement_budgets_for_analytics_and_fallback(db_session):
    user, members = _household(db_session, 1)
    scheme = _scheme(db_session, "Equity Scheme - Flexi Cap Fund")
    _section(db_session, user.id, "combined", _combined_payload())
    user_id, member_id, member_name = user.id, members[0].id, members[0].name
    db_session.expire_all()
    rows = [_holding(members[0], scheme, Decimal("10.00"))]

    counts = []
    for scope, ids in (("aggregate", [member_id]), ("member", [member_id])):
        statements = []
        listener = lambda *args: statements.append(args[2])
        event.listen(db_session.bind, "before_cursor_execute", listener)
        with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(return_value=rows)):
            __import__("asyncio").run(load_allocation(
                db_session, user_id, scope=scope, household_member_ids=ids,
                members=[(member_id, member_name)],
            ))
        event.remove(db_session.bind, "before_cursor_execute", listener)
        counts.append(len(statements))
        db_session.expire_all()
    # The shared reader skips the freshness query when no row is stored, so the fallback costs 2 (was 3).
    assert counts == [2, 2]


def test_loader_does_not_mutate_section_or_call_recompute_or_dispatch(db_session):
    user, members = _household(db_session, 1)
    scheme = _scheme(db_session, "Equity Scheme - Flexi Cap Fund")
    section = _section(db_session, user.id, "combined", _combined_payload())
    before = (section.payload, section.computed_at, section.failed_at)
    fail = AssertionError("Home allocation must remain read-only")
    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(
        return_value=[_holding(members[0], scheme, Decimal("10.00"))]
    )), patch("app.services.analytics.recompute.recompute_household_analytics", side_effect=fail), \
         patch("app.services.analytics.recompute.try_claim_recompute", side_effect=fail), \
         patch("app.api.analytics.dispatcher.dispatch", side_effect=fail):
        __import__("asyncio").run(load_allocation(
            db_session, user.id, scope="aggregate", household_member_ids=[members[0].id],
            members=[(members[0].id, members[0].name)],
        ))
    db_session.expire_all()
    after_row = db_session.get(AnalyticsSection, (user.id, "combined", "asset_allocation"))
    assert (after_row.payload, after_row.computed_at, after_row.failed_at) == before


def test_home_allocation_reads_the_five_classes():
    payload = _member_payload()
    payload["total_portfolio_value"] = "1000"
    payload["covered_value"] = "1000"
    payload["as_disclosed"]["classes"] = [dict(key=key, value=value, percentage="0") for key, value in [("equity", "600"), ("debt", "200"), ("gold", "50"), ("real_estate", "100"), ("others", "50")]]
    mix = parse_stored_allocation(payload, COMPUTED_AT)
    assert mix is not None
    result = build_allocation(total_value=Decimal("1000"), mix=mix, buckets=None, members=None)
    rows = _live_rows(result)
    assert set(rows) == {"equity", "debt", "gold", "real_estate", "others"}
    assert {key: row.value for key, row in rows.items()} == {"equity": Decimal("600"), "debt": Decimal("200"), "gold": Decimal("50"), "real_estate": Decimal("100"), "others": Decimal("50")}
    assert sum(row.percentage for row in rows.values()) == Decimal("100.00")
    assert result.source == "analytics"


def _fund_payload():
    payload = _member_payload()
    payload["total_portfolio_value"] = "120.00"
    payload["covered_value"] = "120.00"
    payload["as_disclosed"]["classes"] = [
        {"key": key, "value": value, "percentage": "0", "funds": funds}
        for key, value, funds in [
            ("equity", "90.00", [
                {"scheme_id": str(uuid.UUID(int=1)), "scheme_name": "Small Equity", "value": "30.00", "percentage": "33.333"},
                {"scheme_id": str(uuid.UUID(int=2)), "scheme_name": "Large Equity", "value": "60.00", "percentage": "66.667"},
            ]),
            ("debt", "10.00", [
                {"scheme_id": str(uuid.UUID(int=3)), "scheme_name": "Debt", "value": "10.00", "percentage": "100"},
            ]),
            ("gold", "10.00", [
                {"scheme_id": str(uuid.UUID(int=4)), "scheme_name": "Gold", "value": "10.00", "percentage": "100"},
            ]),
            ("real_estate", "5.00", [
                {"scheme_id": str(uuid.UUID(int=5)), "scheme_name": "REIT", "value": "5.00", "percentage": "100"},
            ]),
            ("others", "5.00", [
                {"scheme_id": str(uuid.UUID(int=6)), "scheme_name": "Other", "value": "5.00", "percentage": "100"},
            ]),
        ]
    ]
    return payload


def _allocation_from_payload(payload, total="120.00"):
    mix = parse_stored_allocation(payload, COMPUTED_AT)
    assert mix is not None
    return build_allocation(total_value=Decimal(total), mix=mix, buckets=None, members=None)


def test_each_live_class_carries_its_funds_sorted_by_value():
    rows = _live_rows(_allocation_from_payload(_fund_payload()))
    for row in rows.values():
        assert row.funds
        assert [fund.value for fund in row.funds] == sorted(
            (fund.value for fund in row.funds), reverse=True,
        )
        assert sum((fund.value for fund in row.funds), Decimal("0")) == row.value
    assert [fund.name for fund in rows["equity"].funds] == ["Large Equity", "Small Equity"]


def test_fund_shares_of_a_class_sum_to_100():
    payload = _fund_payload()
    payload["as_disclosed"]["classes"][0]["funds"] = [
        {"scheme_id": str(uuid.UUID(int=i)), "scheme_name": f"Fund {i}", "value": "30.00", "percentage": "0"}
        for i in range(1, 4)
    ]
    result = _allocation_from_payload(payload)
    funds = _live_rows(result)["equity"].funds
    assert [fund.share_of_class for fund in funds] == [
        Decimal("33.33"), Decimal("33.33"), Decimal("33.34"),
    ]
    assert sum((fund.share_of_class for fund in funds), Decimal("0")) == Decimal("100.00")


def test_class_with_no_funds_has_an_empty_list():
    result = build_allocation(total_value=Decimal("0.00"), mix=None, buckets=None, members=None)
    assert all(row.funds == () for row in result.classes)


@pytest.mark.parametrize("combined", [False, True])
def test_analytics_source_reads_funds_from_the_stored_section(db_session, combined):
    user, members = _household(db_session, 1)
    scheme = _scheme(db_session, "Debt Scheme - Short Duration Fund", "Holding category must not win")
    payload = _fund_payload()
    if combined:
        payload = {"asset_allocation": payload}
    scope = "aggregate" if combined else "member"
    scope_key = "combined" if combined else str(members[0].id)
    _section(db_session, user.id, scope_key, payload,
             household_member_id=None if combined else members[0].id)
    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(
        return_value=[_holding(members[0], scheme, Decimal("120.00"))]
    )):
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope=scope, household_member_ids=[members[0].id], members=[],
        ))
    assert result.source == "analytics"
    assert [fund.name for fund in _live_rows(result)["equity"].funds] == ["Large Equity", "Small Equity"]


def test_dashboard_buckets_source_derives_funds_from_holdings(db_session):
    user, members = _household(db_session)
    equity = _scheme(db_session, "Equity Scheme - Flexi Cap Fund", "Shared Equity")
    debt = _scheme(db_session, "Debt Scheme - Short Duration Fund", "Debt")
    rows = [
        _holding(members[0], equity, Decimal("30.005")),
        _holding(members[1], equity, Decimal("69.995")),
        _holding(members[1], debt, Decimal("50.00")),
        _holding(members[0], debt, Decimal("20.00"), nav_unavailable=True),
    ]
    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(return_value=rows)):
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope="aggregate", household_member_ids=[m.id for m in members],
            members=[(m.id, m.name) for m in members],
        ))
    equity_row = _live_rows(result)["equity"]
    assert result.source == "dashboard_buckets"
    assert len(equity_row.funds) == 1
    assert (equity_row.funds[0].scheme_id, equity_row.funds[0].name,
            equity_row.funds[0].value, equity_row.funds[0].share_of_class) == (
        str(equity.id), "Shared Equity", Decimal("100.01"), Decimal("100.00"),
    )
    assert _live_rows(result)["debt"].funds[0].value == Decimal("50.00")
    assert _live_rows(result)["gold"].funds == ()


def test_member_scope_lists_only_that_members_funds(db_session):
    user, members = _household(db_session)
    equity = _scheme(db_session, "Equity Scheme - Flexi Cap Fund", "Member Equity")
    other = _scheme(db_session, "Debt Scheme - Short Duration Fund", "Other Member Debt")

    async def scoped_holdings(db, member_ids, **kwargs):
        return [
            row for row in [_holding(members[0], equity, Decimal("70.00")),
                            _holding(members[1], other, Decimal("30.00"))]
            if uuid.UUID(row.household_member_id) in member_ids
        ]

    with patch("app.services.home.allocation.compute_holdings", new=AsyncMock(side_effect=scoped_holdings)) as lookup:
        result = __import__("asyncio").run(load_allocation(
            db_session, user.id, scope="member", household_member_ids=[members[0].id], members=[],
        ))
    lookup.assert_awaited_once_with(db_session, [members[0].id], allow_stale_today=True, stored_only=True)
    assert [fund.name for row in result.classes for fund in row.funds] == ["Member Equity"]


@pytest.mark.parametrize("funds_value", ["missing", None, []])
def test_stored_section_without_funds_gives_empty_lists(funds_value):
    payload = _member_payload()
    for row in payload["as_disclosed"]["classes"]:
        if funds_value == "missing":
            row.pop("funds", None)
        else:
            row["funds"] = funds_value
    result = _allocation_from_payload(payload, total="90000.00")
    assert result.source == "analytics"
    assert all(row.funds == () for row in result.classes)


def test_old_clients_ignore_the_new_field():
    from app.services.home.schemas import ClassRowOut

    old = {"key": "equity", "label": "Equity", "status": "live", "value": "10.00", "percentage": "100.00"}
    row = ClassRowOut.model_validate(old)
    assert row.funds == []
    assert row.model_dump(mode="json", exclude={"funds"}) == old


@pytest.mark.parametrize("current_total, expected_fund_value", [("1000.00", "10.00"), ("2000.00", "20.00")])
def test_partial_analytics_coverage_leaves_uncovered_others_unattributed(current_total, expected_fund_value):
    payload = _fund_payload()
    payload["total_portfolio_value"] = "1000.00"
    payload["covered_value"] = "510.00"
    for row in payload["as_disclosed"]["classes"]:
        if row["key"] == "equity":
            row["value"] = "500.00"
            row["funds"] = [dict(scheme_id=str(uuid.UUID(int=1)), scheme_name="Covered Equity",
                                 value="500.00", percentage="100")]
        elif row["key"] == "others":
            row["value"] = "10.00"
            row["funds"] = [dict(scheme_id=str(uuid.UUID(int=2)), scheme_name="Covered Other",
                                 value="10.00", percentage="100")]
        else:
            row["value"] = "0.00"
            row["funds"] = []
    result = _allocation_from_payload(payload, total=current_total)
    others = _live_rows(result)["others"]
    assert others.value == Decimal(current_total) / 2
    fund, = others.funds
    assert fund.name == "Covered Other"
    assert fund.value == Decimal(expected_fund_value)
    assert fund.share_of_class == Decimal("2.00")
    assert sum((item.value for item in others.funds), Decimal("0")) < others.value


def test_partial_class_shares_do_not_absorb_the_uncovered_remainder():
    payload = _fund_payload()
    payload["total_portfolio_value"] = "4.00"
    payload["covered_value"] = "3.00"
    payload["as_disclosed"]["classes"] = [
        dict(key="equity", value="0.00", percentage="0", funds=[]),
        dict(key="others", value="3.00", percentage="100", funds=[
            dict(scheme_id=str(uuid.UUID(int=i)), scheme_name=f"Fund {i}",
                 value="1.00", percentage="33.333") for i in range(1, 4)
        ]),
    ]
    funds = _live_rows(_allocation_from_payload(payload, total="4.00"))["others"].funds
    assert [fund.value for fund in funds] == [Decimal("1.00")] * 3
    assert [fund.share_of_class for fund in funds] == [Decimal("25.00")] * 3
    assert sum((fund.share_of_class for fund in funds), Decimal("0")) == Decimal("75.00")


def test_full_coverage_class_still_absorbs_last_fund_rounding():
    payload = _fund_payload()
    payload["as_disclosed"]["classes"][0]["funds"] = [
        dict(scheme_id=str(uuid.UUID(int=i)), scheme_name=f"Fund {i}",
             value="30.00", percentage="33.333") for i in range(1, 4)
    ]
    rows = _live_rows(_allocation_from_payload(payload))
    assert [fund.share_of_class for fund in rows["equity"].funds] == [
        Decimal("33.33"), Decimal("33.33"), Decimal("33.34"),
    ]
    assert all(sum((fund.share_of_class for fund in row.funds), Decimal("0")) == Decimal("100.00")
               for row in rows.values())


def test_dashboard_buckets_funds_keep_full_class_values_and_shares():
    mix = parse_stored_allocation(_fund_payload(), COMPUTED_AT)
    result = build_allocation(
        total_value=Decimal("120.00"), mix=None,
        buckets={"equity": Decimal("90.00"), "debt": Decimal("10.00"), "gold": Decimal("10.00"),
                 "real_estate": Decimal("5.00"), "others": Decimal("5.00")},
        members=None, funds=mix.funds,
    )
    assert result.source == "dashboard_buckets"
    for row in _live_rows(result).values():
        assert sum((fund.value for fund in row.funds), Decimal("0")) == row.value
        assert sum((fund.share_of_class for fund in row.funds), Decimal("0")) == Decimal("100.00")


def test_partial_shares_use_largest_remainders_without_exceeding_disclosed_percent():
    from app.services.home.allocation import ClassFund, _class_funds
    funds = tuple(ClassFund(str(uuid.UUID(int=i)), f"Fund {i}", Decimal("1000.00"), Decimal("0"))
                  for i in range(1, 8))
    result = _class_funds(funds, Decimal("7000.01"), covered_value=Decimal("7000.00"))
    assert [fund.value for fund in result] == [Decimal("1000.00")] * 7
    assert [fund.share_of_class for fund in result] == [
        Decimal("14.29"), Decimal("14.29"), Decimal("14.29"),
        Decimal("14.28"), Decimal("14.28"), Decimal("14.28"), Decimal("14.28"),
    ]
    assert sum((fund.share_of_class for fund in result), Decimal("0")) == Decimal("99.99")


def test_partial_share_apportionment_properties_over_varied_splits():
    from app.services.home.allocation import ClassFund, _class_funds
    rng = random.Random(43173)
    for _ in range(120):
        parts = [rng.randint(1, 200000) for _ in range(rng.randint(2, 15))]
        covered_cents = sum(parts)
        class_cents = covered_cents + rng.randint(1, 20000)
        ids = [str(uuid.UUID(int=i + 1)) for i in range(len(parts))]
        funds = tuple(
            ClassFund(sid, f"Fund {index}", Decimal(value) / 100, Decimal("0"))
            for index, (sid, value) in enumerate(zip(ids, parts))
        )
        result = _class_funds(
            funds, Decimal(class_cents) / 100, covered_value=Decimal(covered_cents) / 100,
        )
        by_id = {fund.scheme_id: fund for fund in result}
        assert {sid: fund.value for sid, fund in by_id.items()} == {
            sid: Decimal(value) / 100 for sid, value in zip(ids, parts)
        }
        units = {sid: int(fund.share_of_class * 100) for sid, fund in by_id.items()}
        cap = covered_cents * 10000 // class_cents
        assert sum(units.values()) == cap
        assert sum(units.values()) <= 10000
        floors = {sid: value * 10000 // class_cents for sid, value in zip(ids, parts)}
        ranks = {sid: (-(value * 10000 % class_cents), sid) for sid, value in zip(ids, parts)}
        awarded = [sid for sid in ids if units[sid] == floors[sid] + 1]
        not_awarded = [sid for sid in ids if units[sid] == floors[sid]]
        assert len(awarded) + len(not_awarded) == len(ids)
        assert all(ranks[winner] <= ranks[loser] for winner in awarded for loser in not_awarded)
        assert [fund.value for fund in result] == sorted(
            (Decimal(value) / 100 for value in parts), reverse=True,
        )


def test_full_coverage_keeps_existing_last_fund_rounding():
    from app.services.home.allocation import ClassFund, _class_funds
    funds = tuple(ClassFund(str(uuid.UUID(int=i)), f"Fund {i}", Decimal("1000.00"), Decimal("0"))
                  for i in range(1, 8))
    result = _class_funds(funds, Decimal("7000.00"))
    assert [fund.value for fund in result] == [Decimal("1000.00")] * 7
    assert [fund.share_of_class for fund in result] == [Decimal("14.29")] * 6 + [Decimal("14.26")]
    assert sum((fund.share_of_class for fund in result), Decimal("0")) == Decimal("100.00")
