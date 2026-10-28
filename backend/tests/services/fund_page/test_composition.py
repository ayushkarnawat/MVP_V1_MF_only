from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models.enums import (
    AssetType,
    DisclosureBatchStatus,
    MarketCapBucket,
    SchemePlanType,
)
from app.models.reference import NavHistory, SchemeHolding
from app.services.analytics.lookthrough import LookthroughTable
from app.services.analytics.overlap import _stock_weights
from app.services.analytics.schemas import LookthroughCoverage
from app.services.fund_page.schemas import Unavailable
from tests.services.fund_page.factories import (
    TODAY,
    add_disclosure_batch,
    add_market_cap,
    add_scheme,
    add_stock_master,
    make_session,
)


EQUITY_WEIGHTS = [
    Decimal("9"), Decimal("8"), Decimal("7"), Decimal("6"),
    Decimal("5"), Decimal("4"), Decimal("3"), Decimal("2.5"),
    Decimal("2"), Decimal("1.5"), Decimal("1"), Decimal("0.5"),
]


@pytest.fixture
def db():
    session = make_session()
    try:
        yield session
    finally:
        session.close()


def _scheme(db, key: str = "composition"):
    return add_scheme(
        db, key, "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT,
        key.upper(), name=f"{key.title()} Fund",
    )


def _rows():
    equity = [
        (f"Stock {index:02d}", f"INE{index:09d}", weight,
         AssetType.EQUITY_DOMESTIC, f"Raw Sector {index % 8}")
        for index, weight in enumerate(EQUITY_WEIGHTS, start=1)
    ]
    return equity + [
        ("Bond", "BOND00000001", Decimal("3"), AssetType.DEBT, "AAA"),
        ("Cash", None, Decimal("2"), AssetType.CASH_EQUIVALENT, "Cash"),
        ("Future", "FUTURE000001", Decimal("1"), AssetType.DERIVATIVE, "Derivative"),
    ]


def _seed_complete(db, *, as_of: date = date(2026, 9, 30)):
    scheme = _scheme(db)
    batch = add_disclosure_batch(db, scheme, as_of, _rows())
    db.add(NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("100")))
    for index in range(1, 12):
        bucket = (
            MarketCapBucket.LARGE if index <= 8
            else MarketCapBucket.MID if index <= 10
            else MarketCapBucket.SMALL
        )
        add_market_cap(db, f"INE{index:09d}", bucket, date(2026, 9, 1))
    add_stock_master(
        db, "INE000000001", name="Stock 01 Master", sector="Master Sector", as_of=as_of,
    )
    db.flush()
    return scheme, batch


def test_top10_equity_only_ordered_by_weight(db):
    from app.services.fund_page.composition import build_composition

    scheme, _batch = _seed_complete(db)
    result = build_composition(db, scheme, TODAY)

    assert [row.isin for row in result.top10] == [f"INE{i:09d}" for i in range(1, 11)]
    assert [row.weight for row in result.top10] == [
        "9.0000", "8.0000", "7.0000", "6.0000", "5.0000",
        "4.0000", "3.0000", "2.5000", "2.0000", "1.5000",
    ]


def test_stock_count_is_equity_rows(db):
    from app.services.fund_page.composition import build_composition

    scheme, _batch = _seed_complete(db)
    assert build_composition(db, scheme, TODAY).stock_count == 12


def test_market_cap_shares_sum_to_100_of_classified_equity_and_unclassified_returned(db):
    from app.services.fund_page.composition import build_composition

    scheme, _batch = _seed_complete(db)
    result = build_composition(db, scheme, TODAY)
    caps = {row.label: Decimal(row.pct) for row in result.allocation.market_cap}

    assert sum(caps.values(), Decimal("0")) == Decimal("100.0000")
    assert caps == {
        "Large": Decimal("90.8163"),
        "Mid": Decimal("7.1429"),
        "Small": Decimal("2.0408"),
    }
    assert result.unclassified_pct == "6.5000"


def test_sector_prefers_stock_master_then_sector_raw_for_equity_only(db):
    from app.services.fund_page.composition import build_composition

    scheme, _batch = _seed_complete(db)
    sectors = {row.label: row.pct for row in build_composition(db, scheme, TODAY).allocation.sector}

    assert sectors["Master Sector"] == "9.0000"
    assert "AAA" not in sectors
    assert len(sectors) == 7
    assert "Others" in sectors


def test_asset_type_groups(db):
    from app.services.fund_page.composition import build_composition

    scheme, _batch = _seed_complete(db)
    groups = {row.key: (row.label, row.pct) for row in build_composition(db, scheme, TODAY).allocation.asset_type}

    assert groups == {
        "equity": ("Equity", "49.5000"),
        "debt": ("Debt", "3.0000"),
        "cash_equivalent": ("Cash and equivalents", "2.0000"),
        "derivative": ("Derivative", "1.0000"),
    }


def test_no_written_batch_returns_no_disclosure(db):
    from app.services.fund_page.composition import build_composition

    scheme = _scheme(db, "none")
    result = build_composition(db, scheme, TODAY)
    assert result == Unavailable(reason="no_disclosure")


def test_pending_and_future_batches_are_ignored(db):
    from app.services.fund_page.composition import build_composition

    scheme = _scheme(db, "selection")
    add_disclosure_batch(db, scheme, TODAY - timedelta(days=30), [
        ("Chosen", "CHOSEN000001", Decimal("10"), AssetType.EQUITY_DOMESTIC, "Chosen"),
    ])
    add_disclosure_batch(db, scheme, TODAY - timedelta(days=1), [
        ("Pending", "PENDING00001", Decimal("99"), AssetType.EQUITY_DOMESTIC, "Pending"),
    ], status=DisclosureBatchStatus.PENDING)
    add_disclosure_batch(db, scheme, TODAY + timedelta(days=1), [
        ("Future", "FUTURE000001", Decimal("99"), AssetType.EQUITY_DOMESTIC, "Future"),
    ])
    db.add(NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("100")))
    db.flush()

    result = build_composition(db, scheme, TODAY)
    assert result.holdings_as_of == TODAY - timedelta(days=30)
    assert [row.name for row in result.top10] == ["Chosen"]


@pytest.mark.parametrize("age, expected", [(60, None), (61, "older_than_60_days")])
def test_age_tag_when_batch_older_than_60_days(db, age, expected):
    from app.services.fund_page.composition import build_composition

    scheme = _scheme(db, f"age-{age}")
    add_disclosure_batch(db, scheme, TODAY - timedelta(days=age), [
        ("Stock", f"AGE{age:09d}", Decimal("10"), AssetType.EQUITY_DOMESTIC, "IT"),
    ])
    db.add(NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("100")))
    db.flush()

    assert build_composition(db, scheme, TODAY).age_tag == expected


def test_all_holdings_returns_every_row_sorted(db):
    from app.services.fund_page.composition import all_holdings

    scheme, _batch = _seed_complete(db)
    result = all_holdings(db, scheme, TODAY)

    assert result.count == 15
    assert [Decimal(row.weight) for row in result.rows] == sorted(
        [Decimal(row.weight) for row in result.rows], reverse=True,
    )
    assert result.rows[-1].weight == "0.5000"


def test_classify_isins_matches_cap_allocation_buckets(db):
    from app.services.analytics.cap_allocation import build_cap_allocation, classify_isins

    scheme, batch = _seed_complete(db)
    classifications = classify_isins(
        db, {f"INE{i:09d}" for i in range(1, 13)}, batch.as_of_date,
    )
    # Build the shared analytics table from the same holding rows and compare
    # each classified ISIN with the bucket selected by the extracted helper.
    holding_rows = db.query(SchemeHolding).filter_by(batch_id=batch.id).all()
    table_rows = [SimpleNamespace(
        isin=row.isin, instrument_name=row.instrument_name, sector_raw=row.sector_raw,
        asset_type=row.asset_type, exposure_pct=row.pct_to_nav,
        exposure_value=row.pct_to_nav, contributing_funds=[],
    ) for row in holding_rows]
    coverage = LookthroughCoverage(
        covered_value_pct=Decimal("100"), funds=[], not_published_yet=[],
        not_available_from_amc=[], missing_value_schemes=[],
    )
    table = LookthroughTable(
        household_member_ids=[], rows=table_rows, nav_as_of=TODAY,
        holdings_as_of=batch.as_of_date, total_portfolio_value=Decimal("100"),
        coverage=coverage, truncated=False, total_stock_count=12,
        hide_headlines=False, excluded_share=Decimal("0"), non_equity_share=Decimal("6"),
    )
    summary = build_cap_allocation(db, table)
    analytics_counts = {bucket.key: bucket.row_count for bucket in summary.buckets}

    assert {bucket.value: list(classifications.values()).count(bucket) for bucket in MarketCapBucket} == {
        "LARGE": analytics_counts["LARGE"],
        "MID": analytics_counts["MID"],
        "SMALL": analytics_counts["SMALL"],
    }


def test_composition_weights_equal_the_overlap_inputs(db):
    from app.models.reference import SchemeHolding
    from app.services.fund_page.composition import build_composition

    scheme, batch = _seed_complete(db)
    raw_rows = db.query(SchemeHolding).filter_by(batch_id=batch.id).all()
    overlap = _stock_weights(raw_rows)
    composition = build_composition(db, scheme, TODAY)
    composition_weights = {
        row.isin: Decimal(row.weight)
        for row in composition.top10
    }

    assert composition_weights == {
        isin: weight for isin, (_name, weight) in overlap.items()
        if weight >= Decimal("1.5")
    }
