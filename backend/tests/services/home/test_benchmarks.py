import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models.enums import ALL_BENCHMARK_INDICES, BenchmarkIndex
from app.models.user import HouseholdMember, User
from app.services.analytics.recompute import _upsert_section
from app.services.analytics.schemas import (
    AggregateCapAllocationResponse,
    CapAllocationBucket,
    CapAllocationOther,
    CapAllocationSummary,
    LookthroughCoverage,
)
from app.services.dashboard.schemas import MemberStatus
from app.services.home.benchmarks import HOME_BENCHMARKS, load_cap_mix, recommend_benchmark


def test_home_benchmarks_are_exactly_the_five_supported_options_in_order():
    assert [(option.index, option.label) for option in HOME_BENCHMARKS] == [
        (BenchmarkIndex.NIFTY_50, "Nifty 50"),
        (BenchmarkIndex.NIFTY_500, "Nifty 500"),
        (BenchmarkIndex.NIFTY_LARGEMIDCAP_250, "Nifty LargeMidcap 250"),
        (BenchmarkIndex.NIFTY_MIDCAP_150, "Nifty Midcap 150"),
        (BenchmarkIndex.NIFTY_SMALLCAP_250, "Nifty Smallcap 250"),
    ]
    assert all(option.index in ALL_BENCHMARK_INDICES for option in HOME_BENCHMARKS)


@pytest.mark.parametrize(("cap_mix", "index", "reason"), [
    (None, BenchmarkIndex.NIFTY_500, "unavailable"),
    ({"LARGE": Decimal("0"), "MID": Decimal("0"), "SMALL": Decimal("0")},
     BenchmarkIndex.NIFTY_500, "unavailable"),
    ({"LARGE": Decimal("60"), "MID": Decimal("20"), "SMALL": Decimal("15")},
     BenchmarkIndex.NIFTY_500, "broad_mixed"),
    ({"LARGE": Decimal("80"), "MID": Decimal("10"), "SMALL": Decimal("10")},
     BenchmarkIndex.NIFTY_50, "large_cap_heavy"),
    ({"LARGE": Decimal("55"), "MID": Decimal("40"), "SMALL": Decimal("5")},
     BenchmarkIndex.NIFTY_LARGEMIDCAP_250, "large_and_mid"),
    ({"LARGE": Decimal("20"), "MID": Decimal("70"), "SMALL": Decimal("10")},
     BenchmarkIndex.NIFTY_MIDCAP_150, "mid_heavy"),
    ({"LARGE": Decimal("30"), "MID": Decimal("30"), "SMALL": Decimal("40")},
     BenchmarkIndex.NIFTY_SMALLCAP_250, "small_heavy"),
    ({"LARGE": Decimal("50"), "MID": Decimal("25"), "SMALL": Decimal("25")},
     BenchmarkIndex.NIFTY_500, "broad_mixed"),
])
def test_recommendation_examples(cap_mix, index, reason):
    result = recommend_benchmark(cap_mix)
    assert (result.index, result.reason) == (index, reason)


@pytest.mark.parametrize(("small", "expected"), [
    ("34.99", BenchmarkIndex.NIFTY_500),
    ("35.00", BenchmarkIndex.NIFTY_SMALLCAP_250),
])
def test_small_cap_threshold_boundary(small, expected):
    result = recommend_benchmark({
        "LARGE": Decimal("40"), "MID": Decimal("25") + Decimal("35") - Decimal(small),
        "SMALL": Decimal(small),
    })
    assert result.index == expected


@pytest.mark.parametrize(("mid", "expected"), [
    ("49.99", BenchmarkIndex.NIFTY_500),
    ("50.00", BenchmarkIndex.NIFTY_MIDCAP_150),
])
def test_mid_cap_threshold_boundary(mid, expected):
    result = recommend_benchmark({
        "LARGE": Decimal("20"), "MID": Decimal(mid),
        "SMALL": Decimal("80") - Decimal(mid),
    })
    assert result.index == expected


@pytest.mark.parametrize(("large", "expected"), [
    ("64.99", BenchmarkIndex.NIFTY_500),
    ("65.00", BenchmarkIndex.NIFTY_50),
])
def test_large_cap_threshold_boundary(large, expected):
    result = recommend_benchmark({
        "LARGE": Decimal(large), "MID": Decimal("10"),
        "SMALL": Decimal("90") - Decimal(large),
    })
    assert result.index == expected


@pytest.mark.parametrize(("mid", "expected"), [
    ("39.99", BenchmarkIndex.NIFTY_500),
    ("40.00", BenchmarkIndex.NIFTY_LARGEMIDCAP_250),
])
def test_large_and_mid_combined_threshold_boundary(mid, expected):
    result = recommend_benchmark({
        "LARGE": Decimal("45"), "MID": Decimal(mid),
        "SMALL": Decimal("55") - Decimal(mid),
    })
    assert result.index == expected


def test_large_and_mid_large_floor_is_shadowed_by_first_match_mid_rule():
    below = recommend_benchmark({
        "LARGE": Decimal("19.99"), "MID": Decimal("65.01"), "SMALL": Decimal("15"),
    })
    at = recommend_benchmark({
        "LARGE": Decimal("20"), "MID": Decimal("65"), "SMALL": Decimal("15"),
    })
    assert below.index == at.index == BenchmarkIndex.NIFTY_MIDCAP_150


def test_cap_mix_is_renormalised_before_thresholds():
    assert recommend_benchmark({
        "LARGE": Decimal("8"), "MID": Decimal("1"), "SMALL": Decimal("1"),
    }).index == BenchmarkIndex.NIFTY_50


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


def _coverage():
    return LookthroughCoverage(
        covered_value_pct=Decimal("80"), not_published_yet=[],
        not_available_from_amc=[], missing_value_schemes=[], funds=[],
    )


def _summary(*, keys=("LARGE", "MID", "SMALL"), hidden=False, total_factor=Decimal("1")):
    percentages = {"LARGE": "60", "MID": "25", "SMALL": "15"}
    return CapAllocationSummary(
        buckets=[
            CapAllocationBucket(
                key=key, value=Decimal(percentages[key]),
                percentage_total=Decimal(percentages[key]) * total_factor,
                percentage_equity=Decimal(percentages[key]), rows=[], row_count=0,
            )
            for key in keys
        ],
        other=CapAllocationOther(
            non_equity_value=Decimal("0"), unclassified_equity_value=Decimal("0"),
            non_equity_rows=[], unclassified_equity_rows=[],
        ),
        total_portfolio_value=Decimal("100"), total_equity_value=Decimal("100"),
        nav_as_of=date(2026, 10, 23), holdings_as_of=date(2026, 9, 30),
        classification_as_of=None, coverage=_coverage(), hide_headlines=hidden,
        excluded_share=Decimal("0"),
    )


@pytest.mark.parametrize("scope", ["aggregate", "member"])
def test_load_cap_mix_reads_real_writer_combined_and_member_shapes(db_session, scope):
    user, member = _household(db_session)
    summary = _summary()
    if scope == "aggregate":
        scope_key = "combined"
        payload = AggregateCapAllocationResponse(
            members=[MemberStatus(id=str(member.id), name=member.name, has_data=True)],
            cap_allocation=summary,
        )
        stored_member_id = None
    else:
        scope_key = str(member.id)
        payload = summary
        stored_member_id = member.id
    _upsert_section(db_session, user.id, scope_key, stored_member_id, "cap_allocation", payload)
    db_session.commit()
    assert load_cap_mix(
        db_session, user.id, scope=scope, household_member_ids=[member.id]
    ) == {
        "LARGE": Decimal("60"),
        "MID": Decimal("25"),
        "SMALL": Decimal("15"),
    }


def test_load_cap_mix_uses_the_equity_percentage_not_the_total_percentage(db_session):
    user, member = _household(db_session)
    _upsert_section(
        db_session, user.id, "combined", None, "cap_allocation",
        AggregateCapAllocationResponse(
            members=[MemberStatus(id=str(member.id), name=member.name, has_data=True)],
            cap_allocation=_summary(total_factor=Decimal("0.4")),
        ),
    )
    db_session.commit()
    assert load_cap_mix(
        db_session, user.id, scope="aggregate", household_member_ids=[member.id]
    ) == {"LARGE": Decimal("60"), "MID": Decimal("25"), "SMALL": Decimal("15")}


@pytest.mark.parametrize("case", ["missing", "hidden", "bucket_missing"])
def test_load_cap_mix_returns_none_when_unusable(db_session, case):
    user, member = _household(db_session)
    if case != "missing":
        summary = _summary(
            hidden=case == "hidden",
            keys=("LARGE", "MID") if case == "bucket_missing" else ("LARGE", "MID", "SMALL"),
        )
        _upsert_section(
            db_session, user.id, "combined", None, "cap_allocation",
            AggregateCapAllocationResponse(
                members=[MemberStatus(id=str(member.id), name=member.name, has_data=True)],
                cap_allocation=summary,
            ),
        )
        db_session.commit()
    assert load_cap_mix(
        db_session, user.id, scope="aggregate", household_member_ids=[member.id]
    ) is None


@pytest.mark.parametrize("stored", [True, False])
def test_load_cap_mix_statement_budget(db_session, stored):
    user, member = _household(db_session)
    user_id, member_id = user.id, member.id
    if stored:
        _upsert_section(
            db_session, user_id, "combined", None, "cap_allocation",
            AggregateCapAllocationResponse(
                members=[MemberStatus(id=str(member_id), name="Member", has_data=True)],
                cap_allocation=_summary(),
            ),
        )
        db_session.commit()
    db_session.expire_all()
    statements = []
    listener = lambda *args: statements.append(args[2])
    event.listen(db_session.bind, "before_cursor_execute", listener)
    load_cap_mix(
        db_session, user_id, scope="aggregate", household_member_ids=[member_id]
    )
    event.remove(db_session.bind, "before_cursor_execute", listener)
    assert len(statements) == (2 if stored else 1)
