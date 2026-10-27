"""T5 (D5/D6): select_items is pure -- no DB. R-numbers refer to the
handoff's section 9 scenario list."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from app.services.news.normalise import EntityTag
from app.services.news.score import select_items
from tests.services.news.factories import entity, row, watch

NOW = datetime(2026, 10, 23, 13, 0, 0)


def test_r1_ladder_fills_slots_by_tier_in_order():
    # given: a stock, a fund category, a fund house, a gold and a general item, all young
    stock_tag = EntityTag(kind="stock", key="INE000A01001", label="Alpha Ltd", tier=1)
    category_tag = EntityTag(kind="fund_category", key="large_cap", label="Large Cap Fund", tier=2)
    house_tag = EntityTag(kind="fund_house", key="home_test", label="Home Test", tier=3)
    gold_tag = EntityTag(kind="asset_class", key="gold_silver", label="Gold and Silver", tier=4)
    general_tag = EntityTag(kind="general", key="sensex", label=None, tier=7)

    rows = [
        row(id="stock", tags=(stock_tag,), published_at=NOW - timedelta(hours=2)),
        row(id="category", tags=(category_tag,), published_at=NOW - timedelta(hours=1)),
        row(id="house", tags=(house_tag,), published_at=NOW - timedelta(minutes=30)),
        row(id="gold", tags=(gold_tag,), published_at=NOW - timedelta(minutes=10)),
        row(id="general", tags=(general_tag,), published_at=NOW - timedelta(minutes=5)),
    ]
    the_watch = watch(entities=(
        entity("stock", "INE000A01001"),
        entity("fund_category", "large_cap", chip="holdings"),
        entity("fund_house", "home_test", chip="holdings"),
        entity("asset_class", "gold_silver", chip="holdings"),
    ))

    # when
    selected = select_items(rows, the_watch, NOW, slots=3)

    # then
    assert [s.row.id for s in selected] == ["stock", "category", "house"]
    assert all(s.specific for s in selected)


def test_r2_empty_top_tiers_falls_to_whatever_the_watch_actually_has():
    gold_tag = EntityTag(kind="asset_class", key="gold_silver", label="Gold and Silver", tier=4)
    sector_tag = EntityTag(kind="sector", key="it_tech", label="IT", tier=5)
    general_tag = EntityTag(kind="general", key="sensex", label=None, tier=7)
    rows = [
        row(id="gold", tags=(gold_tag,), published_at=NOW - timedelta(hours=1)),
        row(id="sector", tags=(sector_tag,), published_at=NOW - timedelta(hours=2)),
        row(id="general", tags=(general_tag,), published_at=NOW - timedelta(hours=3)),
    ]
    the_watch = watch(entities=(
        entity("asset_class", "gold_silver", chip="holdings"),
        entity("sector", "it_tech", chip="lookthrough"),
    ))

    selected = select_items(rows, the_watch, NOW, slots=3)

    assert [s.row.id for s in selected] == ["gold", "sector", "general"]


def test_r3_newest_first_inside_a_tier():
    tag = EntityTag(kind="fund_category", key="large_cap", label="Large Cap Fund", tier=2)
    rows = [
        row(id="older", tags=(tag,), published_at=NOW - timedelta(hours=5)),
        row(id="newer", tags=(tag,), published_at=NOW - timedelta(hours=1)),
    ]
    the_watch = watch(entities=(entity("fund_category", "large_cap", chip="holdings"),))

    selected = select_items(rows, the_watch, NOW, slots=1)

    assert [s.row.id for s in selected] == ["newer"]


def test_r4_two_items_same_entity_only_the_newer_the_next_slot_goes_down_a_tier():
    stock_tag = EntityTag(kind="stock", key="INE000A01001", label="Alpha Ltd", tier=1)
    category_tag = EntityTag(kind="fund_category", key="large_cap", label="Large Cap Fund", tier=2)
    rows = [
        row(id="hdfc-old", tags=(stock_tag,), published_at=NOW - timedelta(hours=5)),
        row(id="hdfc-new", tags=(stock_tag,), published_at=NOW - timedelta(hours=1)),
        row(id="category", tags=(category_tag,), published_at=NOW - timedelta(hours=2)),
    ]
    the_watch = watch(entities=(
        entity("stock", "INE000A01001"),
        entity("fund_category", "large_cap", chip="holdings"),
    ))

    selected = select_items(rows, the_watch, NOW, slots=3)

    assert selected[0].row.id == "hdfc-new"
    assert selected[1].row.id == "category"


def test_r5_24h_boundary_specific_vs_general_fallback():
    tag = EntityTag(kind="stock", key="INE000A01001", label="Alpha Ltd", tier=1)
    just_inside = row(id="23h59", tags=(tag,), published_at=NOW - timedelta(hours=23, minutes=59))
    just_outside = row(id="24h01", tags=(tag,), published_at=NOW - timedelta(hours=24, minutes=1))
    general_71h = row(id="general-71h", tags=(EntityTag("general", "sensex", None, 7),), published_at=NOW - timedelta(hours=71))
    general_73h = row(id="general-73h", tags=(EntityTag("general", "sensex", None, 7),), published_at=NOW - timedelta(hours=73))
    the_watch = watch(entities=(entity("stock", "INE000A01001"),))

    inside_selected = select_items([just_inside], the_watch, NOW, slots=3)
    assert [s.row.id for s in inside_selected] == ["23h59"]
    assert inside_selected[0].specific is True

    outside_selected = select_items([just_outside], the_watch, NOW, slots=3)
    assert outside_selected[0].specific is False
    assert outside_selected[0].entity is None

    assert select_items([general_71h], the_watch, NOW, slots=3) != []
    assert select_items([general_73h], the_watch, NOW, slots=3) == []


def test_r7_majority_override_gold_above_50_wins_slot_1():
    gold_entity = entity("asset_class", "gold_silver", chip="holdings")
    stock_entity = entity("stock", "INE000A01001")
    gold_tag = EntityTag(kind="asset_class", key="gold_silver", label="Gold and Silver", tier=4)
    stock_tag = EntityTag(kind="stock", key="INE000A01001", label="Alpha Ltd", tier=1)
    rows = [
        row(id="gold-older", tags=(gold_tag,), published_at=NOW - timedelta(hours=5)),
        row(id="gold-newer", tags=(gold_tag,), published_at=NOW - timedelta(hours=1)),
        row(id="stock-newest", tags=(stock_tag,), published_at=NOW - timedelta(minutes=10)),
    ]
    majority_watch = watch(entities=(gold_entity, stock_entity), majority_class="gold")

    selected = select_items(rows, majority_watch, NOW, slots=3)

    assert selected[0].row.id == "gold-newer"


def test_r7_gold_exactly_50_does_not_set_majority_class():
    # build_watchlist's job, but score.py must not override on its own if majority_class is None
    gold_entity = entity("asset_class", "gold_silver", chip="holdings")
    stock_entity = entity("stock", "INE000A01001")
    gold_tag = EntityTag(kind="asset_class", key="gold_silver", label="Gold and Silver", tier=4)
    stock_tag = EntityTag(kind="stock", key="INE000A01001", label="Alpha Ltd", tier=1)
    rows = [
        row(id="gold", tags=(gold_tag,), published_at=NOW - timedelta(hours=1)),
        row(id="stock-newer", tags=(stock_tag,), published_at=NOW - timedelta(minutes=10)),
    ]
    no_majority_watch = watch(entities=(gold_entity, stock_entity), majority_class=None)

    selected = select_items(rows, no_majority_watch, NOW, slots=3)

    assert selected[0].row.id == "stock-newer"


def test_r7_debt_majority_with_no_debt_item_falls_to_the_ladder():
    rates_entity = entity("rates_macro", "rates", chip="holdings")
    category_tag = EntityTag(kind="fund_category", key="short_duration", label="Short Duration Fund", tier=2)
    rows = [row(id="category", tags=(category_tag,), published_at=NOW - timedelta(hours=1))]
    debt_majority_watch = watch(
        entities=(rates_entity, entity("fund_category", "short_duration", chip="holdings")),
        majority_class="debt",
    )

    selected = select_items(rows, debt_majority_watch, NOW, slots=3)

    assert [s.row.id for s in selected] == ["category"]


def test_r8_debt_only_user_rates_then_general():
    rates_tag = EntityTag(kind="rates_macro", key="rates", label="Interest rates", tier=6)
    general_tag = EntityTag(kind="general", key="sensex", label=None, tier=7)
    rows = [
        row(id="rates", tags=(rates_tag,), published_at=NOW - timedelta(hours=1)),
        row(id="general", tags=(general_tag,), published_at=NOW - timedelta(hours=2)),
    ]
    the_watch = watch(entities=(
        entity("rates_macro", "rates", chip="holdings"),
        entity("fund_category", "short_duration", chip="holdings"),
        entity("fund_house", "x", chip="holdings"),
    ))

    selected = select_items(rows, the_watch, NOW, slots=3)

    assert [s.row.id for s in selected] == ["rates", "general"]


def test_r9_empty_watch_gives_general_items_only():
    general_tag = EntityTag(kind="general", key="sensex", label=None, tier=7)
    rows = [row(id="general", tags=(general_tag,), published_at=NOW - timedelta(hours=1))]
    empty_watch = watch(entities=())

    selected = select_items(rows, empty_watch, NOW, slots=3)

    assert [s.row.id for s in selected] == ["general"]
    assert selected[0].specific is False
    assert selected[0].entity is None


def test_r10_foreign_stock_only_appears_when_watch_holds_that_key():
    apple_tag = EntityTag(kind="stock", key="apple inc", label="Apple Inc", tier=1, foreign=True)
    rows = [row(id="apple", tags=(apple_tag,), published_at=NOW - timedelta(hours=1))]

    # without the key in the watch it can only ever be a general fallback, never a specific match
    not_holding = select_items(rows, watch(entities=()), NOW, slots=3)
    assert not_holding[0].specific is False
    assert not_holding[0].entity is None

    holding_apple = watch(entities=(entity("stock", "apple inc", label="Apple Inc"),))
    selected = select_items(rows, holding_apple, NOW, slots=3)
    assert selected[0].row.id == "apple"
    assert selected[0].specific is True
    assert selected[0].entity.key == "apple inc"


def test_r12_ties_by_published_at_order_by_id_and_are_deterministic():
    tag_a = EntityTag(kind="fund_category", key="large_cap", label="Large Cap Fund", tier=2)
    rows = [
        row(id="b", tags=(tag_a,), published_at=NOW - timedelta(hours=1)),
        row(id="a", tags=(tag_a,), published_at=NOW - timedelta(hours=1)),
    ]
    the_watch = watch(entities=(entity("fund_category", "large_cap", chip="holdings"),))

    first = select_items(rows, the_watch, NOW, slots=3)
    second = select_items(rows, the_watch, NOW, slots=3)

    assert [s.row.id for s in first] == [s.row.id for s in second]
    # only one slot usable (same entity) -- the tie-break picks the lower id first
    assert first[0].row.id == "a"
