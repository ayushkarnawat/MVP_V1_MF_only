"""CA-3 checks against synthetic spreadsheet rows and local scheme pools."""

import asyncio
import uuid
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

import pytest

from app.models.enums import SchemePlanType
from app.models.reference import NavHistory, Scheme, SchemeAaum
from app.services.analytics import category_ranking, scheme_universe
from app.services.analytics.category_ranking import (
    CategoryAverage,
    CategoryPool,
    _blend_returns,
    category_blended_weighted_average,
    category_period_weighted_averages,
    category_rank_row,
    load_category_pool,
)
from app.services.analytics.performance_ranking import load_ranking_pools
from app.services.analytics.risk_metrics import years_ago
from app.services.analytics.scheme_universe import (
    CategoryPeers,
    SchemeUniverseClient,
    UniverseRow,
    get_category_peers,
)
from app.services.dashboard import nav

FOUR_PLACES = Decimal("0.0001")
PERIODS = ("1y", "3y", "5y")


def _invented_category(first_id, rows):
    detailed = {}
    sizes = {}
    for number, (size, one, three, five) in enumerate(rows, start=first_id):
        scheme_id = uuid.UUID(int=number)
        r1, r3, r5 = Decimal(one), Decimal(three), Decimal(five)
        detailed[scheme_id] = (r1, r3, r5, Decimal("0.4") * r3 + Decimal("0.6") * r5)
        if size is not None:
            sizes[scheme_id] = Decimal(size)
    return detailed, sizes


LARGE = _invented_category(1, (
    ("90", "-0.14", "0.03", "0.09"),
    ("140", "0.04", "0.12", "0.08"),
    ("210", "0.17", "0.05", "0.10"),
    ("330", "0.29", "0.13", "0.16"),
    ("470", "-0.06", "0.07", "0.11"),
    ("620", "0.08", "-0.02", "0.04"),
    ("850", "0.11", "0.18", "0.15"),
    ("1100", "0.03", "0.00", "0.02"),
    ("1350", "-0.02", "0.09", "0.12"),
    ("1700", "0.22", "0.14", "0.17"),
    ("2250", "0.06", "0.08", "0.05"),
    ("2900", "0.19", "0.11", "0.13"),
))
THIN = _invented_category(101, (
    ("40", "-0.12", "0.03", "0.06"),
    ("75", "0.05", "0.14", "0.08"),
    ("130", "0.20", "0.09", "0.11"),
    ("255", "0.09", "-0.02", "0.13"),
))
MISSING_SIZES = _invented_category(201, (
    ("55", "-0.07", "0.04", "0.09"),
    ("105", "0.16", "0.11", "0.13"),
    ("175", "0.09", "0.08", "0.12"),
    ("265", "0.03", "0.06", "0.10"),
    ("400", "0.14", "0.12", "0.07"),
    (None, "0.52", "0.34", "0.25"),
    ("0", "-0.38", "-0.15", "-0.05"),
    ("NaN", "0.63", "0.27", "0.30"),
))


def test_weighted_average_matches_spreadsheet_for_three_categories():
    def spreadsheet_averages(category, counted):
        detailed, sizes = category
        total_size = sum((sizes[scheme_id] for scheme_id in counted), Decimal("0"))
        return tuple(
            sum(
                (sizes[scheme_id] / total_size * detailed[scheme_id][column] for scheme_id in counted),
                Decimal("0"),
            ).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)
            for column in range(4)
        )

    # Large sheet: SUMPRODUCT(size / SUM(size), return) over all 12 rows for each column.
    large_expected = spreadsheet_averages(LARGE, tuple(LARGE[0]))
    # Thin sheet: SUMPRODUCT(size / SUM(size), return) over all four rows for each column.
    thin_expected = spreadsheet_averages(THIN, tuple(THIN[0]))
    # Missing-sizes sheet: SUMPRODUCT(size / SUM(size), return) over rows 1–5 only.
    missing_sizes_expected = spreadsheet_averages(
        MISSING_SIZES, tuple(uuid.UUID(int=number) for number in range(201, 206)),
    )

    expected = {"large": large_expected, "thin": thin_expected, "missing-sizes": missing_sizes_expected}
    actual = {}
    for name, (detailed, sizes) in zip(expected, (LARGE, THIN, MISSING_SIZES)):
        periods = category_period_weighted_averages(detailed, sizes)
        legacy = category_blended_weighted_average(detailed, sizes)
        values = [periods[period].value for period in PERIODS] + [legacy.value]
        actual[name] = tuple(
            value.quantize(FOUR_PLACES, rounding=ROUND_HALF_UP) if value is not None else None
            for value in values
        )
    assert actual == expected


def test_three_year_floor_excludes_short_history_from_all_periods():
    detailed, sizes = THIN
    short_history = uuid.UUID(int=105)
    averages = category_period_weighted_averages(
        {**detailed, short_history: (Decimal("0.90"), None, None, None)},
        {**sizes, short_history: Decimal("9000")},
    )

    # SUMPRODUCT(size / SUM(size), return) over the four rows with a 3Y return.
    assert {period: (average.value, average.peers) for period, average in averages.items()} == {
        "1y": (Decimal("0.0958"), 4),
        "3y": (Decimal("0.0366"), 4),
        "5y": (Decimal("0.1117"), 4),
    }


def test_missing_sizes_counted_but_unweighted_and_plain_fallback_flagged():
    detailed, sizes = MISSING_SIZES
    weighted = category_period_weighted_averages(detailed, sizes)
    weighted["legacy"] = category_blended_weighted_average(detailed, sizes)

    # SUMPRODUCT(size / 1000, return) over the five sized rows; eight rows count.
    assert weighted == {
        "1y": CategoryAverage(Decimal("92.65") / Decimal("1000"), 8, "fund_size", 3),
        "3y": CategoryAverage(Decimal("91.65") / Decimal("1000"), 8, "fund_size", 3),
        "5y": CategoryAverage(Decimal("0.0941"), 8, "fund_size", 3),
        "legacy": CategoryAverage(Decimal("93.12") / Decimal("1000"), 8, "fund_size", 3),
    }

    unusable_sizes = {uuid.UUID(int=number): sizes[uuid.UUID(int=number)] for number in (207, 208)}
    equal = category_period_weighted_averages(detailed, unusable_sizes)
    equal["legacy"] = category_blended_weighted_average(detailed, unusable_sizes)

    # AVERAGE over all eight rows for each return column when usable size is absent.
    assert equal == {
        "1y": CategoryAverage(Decimal("0.14000"), 8, "equal", 8),
        "3y": CategoryAverage(Decimal("0.10875"), 8, "equal", 8),
        "5y": CategoryAverage(Decimal("0.12625"), 8, "equal", 8),
        "legacy": CategoryAverage(Decimal("0.11925"), 8, "equal", 8),
    }


def test_thin_category_flag_under_five():
    detailed, sizes = THIN
    fifth_returns, fifth_size = _invented_category(105, (("175", "0.11", "0.06", "0.07"),))

    actual = []
    for returns, aaum in ((detailed, sizes), ({**detailed, **fifth_returns}, {**sizes, **fifth_size})):
        schemes = [
            Scheme(
                id=scheme_id,
                name=f"Paper Moon Fund {scheme_id.int} - Direct Growth",
                amc_name="Paper Moon Asset House",
                sebi_category="CA3 Thin Category",
                plan_type=SchemePlanType.DIRECT,
            )
            for scheme_id in returns
        ]
        pool = CategoryPool(
            peers=CategoryPeers(schemes, len(schemes), {scheme.id: scheme.id for scheme in schemes}),
            detailed=returns,
            averages=category_period_weighted_averages(returns, aaum),
            legacy_average=category_blended_weighted_average(returns, aaum),
        )
        row = category_rank_row(schemes[0], pool)
        actual.append((row.periods["3y"].peers, row.thin_category))

    assert actual == [(4, True), (5, False)]


def test_legacy_blend_is_40_30_60_50_consistent():
    old, newer = uuid.UUID(int=301), uuid.UUID(int=302)
    sizes = {old: Decimal("100"), newer: Decimal("300")}
    old_3y, old_5y = Decimal("0.10"), Decimal("0.20")
    newer_3y, newer_5y = Decimal("0.30"), Decimal("0.40")

    # Summary sheet: weights are 100/400 and 300/400 when both returns are present.
    # With no newer 5Y return, its 5Y weight is zero and the older fund carries 100%.
    sheet_3y = Decimal("0.25") * old_3y + Decimal("0.75") * newer_3y
    sheet_5y = {
        "same period pools": Decimal("0.25") * old_5y + Decimal("0.75") * newer_5y,
        "one 3Y-only fund": old_5y,
    }
    # Legacy sheet: =40%*Summary_3Y + 60%*Summary_5Y.
    expected = {
        label: (Decimal("0.4") * sheet_3y + Decimal("0.6") * five_year).quantize(FOUR_PLACES)
        for label, five_year in sheet_5y.items()
    }

    actual = {}
    for label, available_5y in (("same period pools", newer_5y), ("one 3Y-only fund", None)):
        # The return loader blends each fund at 40% 3Y and 60% 5Y, falling back to 100% 3Y.
        detailed = {
            old: (None, old_3y, old_5y, _blend_returns(old_3y, old_5y)),
            newer: (None, newer_3y, available_5y, _blend_returns(newer_3y, available_5y)),
        }
        periods = category_period_weighted_averages(detailed, sizes)
        assert (periods["3y"].value, periods["5y"].value) == (sheet_3y, sheet_5y[label])
        legacy = category_blended_weighted_average(detailed, sizes)
        assert legacy.value is not None
        actual[label] = legacy.value.quantize(FOUR_PLACES)

    assert actual == expected


@pytest.fixture
def seed_pool(db_session, monkeypatch):
    client = SchemeUniverseClient()
    monkeypatch.setattr(scheme_universe, "scheme_universe_client", client)
    monkeypatch.setattr(category_ranking, "_category_returns_cache", {})
    monkeypatch.setattr(category_ranking, "_category_short_history_cache", {})

    async def unexpected_fetch(*args, **kwargs):
        pytest.fail("The pool check attempted to fetch data outside the synthetic fixture")

    monkeypatch.setattr(client, "_fetch_nav_all_text", unexpected_fetch)
    monkeypatch.setattr(nav, "_fetch_nav_history", unexpected_fetch)

    def seed(category, today, rows):
        listings = []
        schemes = []
        for number, (base, option, annual_return) in enumerate(rows, start=1):
            code = str(990000 + number)
            name = f"{base} - Direct Plan - {option}"
            listings.append(UniverseRow(
                amfi_code=code, isin=None, name=name, base_name=base,
                amc_name="Paper Moon Asset House", sebi_category=category, nav_date=today,
            ))
            scheme = Scheme(
                id=uuid.UUID(int=400 + number), amfi_code=code, name=name, base_name=base,
                amc_name="Paper Moon Asset House", sebi_category=category, plan_type=SchemePlanType.DIRECT,
            )
            db_session.add(scheme)
            db_session.flush()
            schemes.append(scheme)
            growth_factor = Decimal("1") + Decimal(annual_return)
            for years in (5, 3, 1, 0):
                db_session.add(NavHistory(
                    scheme_id=scheme.id, date=years_ago(today, years),
                    nav=Decimal("100") * growth_factor ** (5 - years),
                ))
            db_session.add(SchemeAaum(scheme_id=scheme.id, reference_period=today, aaum_value=Decimal("100")))

        db_session.commit()
        monkeypatch.setattr(client, "_rows", listings)
        return schemes

    return seed


def test_rank_pool_and_average_pool_hold_the_same_funds(db_session, seed_pool):  # was ...except_index_rule; FX-10b, owner-approved 19 Nov
    today = date.today()
    category = "CA3 Rank Comparison Category"
    held, active_peer, index_fund, etf = seed_pool(category, today, (
        ("Paper Moon Comet Fund", "Growth", "0.10"),
        ("Paper Moon Cloud Fund", "Growth", "0.20"),
        ("Paper Moon Trail Index Fund", "Growth", "0.30"),
        ("Paper Moon Lantern ETF", "Growth", "0.50"),
    ))

    async def load_pools():
        peers = await get_category_peers(db_session, category, SchemePlanType.DIRECT)
        averages = await load_category_pool(db_session, held, today)
        ranks = await load_ranking_pools(db_session, held, today)
        return peers, averages, ranks

    peers, averages, ranks = asyncio.run(load_pools())
    shared_peers = {held.id, active_peer.id, index_fund.id, etf.id}
    assert {peer.id for peer in peers.schemes} == shared_peers
    assert {peer.id for peer in averages.peers.schemes} == shared_peers
    assert {peer.id for peer in ranks.peers.schemes} == shared_peers

    # FX-10b: the average counts the funds the rank counts. The index fund and the ETF are in neither.
    for column, period in enumerate(PERIODS):
        average_members = {scheme_id for scheme_id, values in averages.detailed.items() if values[column] is not None}
        rank_members = set(ranks.pools[period.upper()])
        average = averages.averages[period]
        assert average_members == rank_members == {held.id, active_peer.id}
        assert average.peers == 2
        assert average.value is not None
        assert average.value.quantize(FOUR_PLACES) == Decimal("0.1500")


def test_no_idcw_in_any_average_pool(db_session, seed_pool):
    today = date.today()
    growth, *_ = seed_pool("CA3 Option Comparison Category", today, (
        ("Paper Moon Grove Fund", "Growth", "0.10"),
        ("Paper Moon Grove Fund", "IDCW", "0.20"),
        ("Paper Moon Thicket Fund", "IDCW", "0.30"),
        ("Paper Moon Nook Fund", "Dividend Payout", "0.50"),
    ))

    pool = asyncio.run(load_category_pool(db_session, growth, today))

    assert growth.id in pool.detailed
    disallowed_names = {
        scheme.name for scheme in pool.peers.schemes
        if "idcw" in scheme.name.lower() or "dividend" in scheme.name.lower()
    }
    averages = {**pool.averages, "legacy": pool.legacy_average}
    actual = {
        period: (average.peers, average.value.quantize(FOUR_PLACES) if average.value is not None else None)
        for period, average in averages.items()
    }

    # Growth is the sole eligible row, so its 10% annual return has 100% of the weight.
    assert (disallowed_names, actual) == (
        set(), {period: (1, Decimal("0.1000")) for period in (*PERIODS, "legacy")},
    )


def test_average_pool_equals_ranked_pool_when_an_index_series_is_in_the_category(db_session, seed_pool):
    today = date.today()
    held, peer, index, etf = seed_pool("CA3 Mixed Category", today, (
        ("Paper Moon Comet Fund", "Growth", "0.10"),
        ("Paper Moon Cloud Fund", "Growth", "0.20"),
        ("Paper Moon Trail Index Fund", "Growth", "0.30"),
        ("Paper Moon Lantern ETF", "Growth", "0.50"),
    ))

    async def load_pools():
        return (
            await load_category_pool(db_session, held, today),
            await load_ranking_pools(db_session, held, today),
        )

    average, rank = asyncio.run(load_pools())
    assert {scheme.id for scheme in average.peers.schemes} == {held.id, peer.id, index.id, etf.id}
    assert average.peers.fund_count == 4
    assert set(average.detailed) == {held.id, peer.id}
    for period in PERIODS:
        assert set(rank.pools[period.upper()]) == {held.id, peer.id}
        assert average.averages[period].peers == 2
        assert average.averages[period].value.quantize(FOUR_PLACES) == Decimal("0.1500")
    assert average.legacy_average.peers == 2
    assert average.legacy_average.value.quantize(FOUR_PLACES) == Decimal("0.1500")


def test_index_category_average_keeps_its_own_funds(db_session, seed_pool):
    today = date.today()
    held, peer = seed_pool("Other Scheme - Index Funds", today, (
        ("Paper Moon Trail Index Fund", "Growth", "0.20"),
        ("Paper Moon Horizon Fund", "Growth", "0.40"),
    ))

    pool = asyncio.run(load_category_pool(db_session, held, today))

    assert set(pool.detailed) == {held.id, peer.id}
    for average in (*pool.averages.values(), pool.legacy_average):
        assert average.peers == 2
        assert average.value.quantize(FOUR_PLACES) == Decimal("0.3000")


def test_inactive_series_is_in_neither_pool(db_session, seed_pool):
    today = date.today()
    held, inactive = seed_pool("CA3 Inactive Peer Category", today, (
        ("Paper Moon Comet Fund", "Growth", "0.10"),
        ("Paper Moon Cloud Fund", "Growth", "0.50"),
    ))
    inactive.is_active = False
    db_session.commit()

    async def load_pools():
        return (
            await load_category_pool(db_session, held, today),
            await load_ranking_pools(db_session, held, today),
        )

    average, rank = asyncio.run(load_pools())
    assert {scheme.id for scheme in average.peers.schemes} == {held.id, inactive.id}
    assert set(average.detailed) == {held.id}
    assert all(set(members) == {held.id} for members in rank.pools.values())
    assert all(result.peers == 1 for result in (*average.averages.values(), average.legacy_average))


@pytest.mark.parametrize("rank_first", [True, False], ids=["rank-first", "average-first"])
def test_pool_cache_is_not_poisoned_by_the_average_filter(db_session, seed_pool, monkeypatch, rank_first):
    today = date.today()
    held, index = seed_pool("CA3 Shared Return Cache Category", today, (
        ("Paper Moon Comet Fund", "Growth", "0.10"),
        ("Paper Moon Trail Index Fund", "Growth", "0.30"),
    ))
    original_compute = category_ranking._compute_category_returns_detailed
    computed_for = []

    async def record_compute(db, schemes, today, *, include_short_history):
        computed_for.append({scheme.id for scheme in schemes})
        return await original_compute(db, schemes, today, include_short_history=include_short_history)

    monkeypatch.setattr(category_ranking, "_compute_category_returns_detailed", record_compute)

    async def load_pools():
        if rank_first:
            rank = await load_ranking_pools(db_session, held, today)
            average = await load_category_pool(db_session, held, today)
        else:
            average = await load_category_pool(db_session, held, today)
            rank = await load_ranking_pools(db_session, held, today)
        index_average = await load_category_pool(db_session, index, today)
        return average, rank, index_average

    average, rank, index_average = asyncio.run(load_pools())

    assert computed_for == [{held.id, index.id}]
    assert all(set(members) == {held.id} for members in rank.pools.values())
    assert set(average.detailed) == {held.id}
    assert set(index_average.detailed) == {index.id}


def test_held_fund_with_an_unknown_plan_still_has_its_own_return_and_an_average(db_session, seed_pool):
    # Review finding 4 (20 Nov): get_category_peers(None) accepts any plan, but the average filter kept only
    # peers whose stored plan was also None, dropping the fund's own representative and emptying the average.
    today = date.today()
    held, *_ = seed_pool("CA3 Unknown Plan Category", today, (
        ("Paper Moon Alder Fund", "Growth", "0.10"),
        ("Paper Moon Birch Fund", "Growth", "0.20"),
        ("Paper Moon Cedar Fund", "Growth", "0.30"),
    ))
    held.plan_type = None
    db_session.commit()

    pool = asyncio.run(load_category_pool(db_session, held, today))

    assert held.id in pool.detailed
    assert pool.averages["3y"].peers == 3
