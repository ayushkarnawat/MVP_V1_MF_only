"""Tests for the read-only CA export (scripts/export_ca_fund_metrics.py).

Every figure the script prints is compared with what the product's own function returns for the
same data: the fund page's composition, the analytics valuation, category comparison and
performance ranking. The script has no formula of its own, so these tests are parity checks.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import text

from app.models.enums import (
    AssetType, DisclosureBatchStatus, MarketCapBucket, SchemePlanType,
)
from app.models.reference import NavHistory, Scheme, SchemeReportedValuation, StockMaster
from app.services.analytics import category_ranking as category
from app.services.analytics import lookthrough
from app.services.analytics import performance_ranking as ranking
from app.services.analytics.risk_metrics import years_ago
from app.services.analytics.scheme_universe import CategoryPeers
from app.services.fund_page.composition import build_composition
from tests.services.fund_page.factories import (
    add_aaum, add_disclosure_batch, add_folio, add_market_cap, add_purchase, add_scheme,
    add_user_household,
)

CAT = "Equity Scheme - Large Cap Fund"
AS_OF = date(2026, 9, 30)
LATER = date(2026, 10, 31)
TODAY = date.today()
EQ = AssetType.EQUITY_DOMESTIC
WEIGHTS = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1.5", "1", "0.5"]


def _isin(i: int) -> str:
    return f"INE{i:03d}Z01010"


@pytest.fixture(autouse=True)
def _clear_caches():
    category._category_returns_cache.clear()
    category._category_short_history_cache.clear()
    yield
    category._category_returns_cache.clear()
    category._category_short_history_cache.clear()


def _nav(db, scheme, end):
    db.add(NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal(end)))
    for years in (1, 3, 5):
        db.add(NavHistory(scheme_id=scheme.id, date=years_ago(TODAY, years), nav=Decimal("100")))
    db.flush()


def _stock(db, i, pe, pb, sector):
    db.add(StockMaster(
        isin=_isin(i), name=f"Stock {i}", sector=sector, pe_ratio=pe, pb_ratio=pb,
        as_of_date=date(2026, 10, 12), source="fixture",
    ))


@pytest.fixture()
def world(db_session):
    db = db_session
    a = add_scheme(db, "alpha", CAT, SchemePlanType.DIRECT, "AAA", name="Alpha Large Cap Fund - Direct Plan", amc_name="Alpha AMC")
    b = add_scheme(db, "beta", CAT, SchemePlanType.DIRECT, "BBB", name="Beta Large Cap Fund - Direct Plan", amc_name="Beta AMC")
    c = add_scheme(db, "gamma", CAT, SchemePlanType.DIRECT, "CCC", name="Gamma Nifty 50 Index Fund - Direct Plan", amc_name="Gamma AMC")
    reg = add_scheme(db, "delta", CAT, SchemePlanType.REGULAR, "DDD", name="Delta Large Cap Fund - Regular Plan", amc_name="Delta AMC")
    for scheme, end in ((a, "150"), (b, "130"), (c, "120"), (reg, "500")):
        _nav(db, scheme, end)
    add_aaum(db, a, Decimal("3000"))
    add_aaum(db, b, Decimal("1000"))

    # Fund A: 12 shares (more than a top 10), one debt line, one cash line.
    rows = [(f"Stock {i + 1}", _isin(i + 1), Decimal(w), EQ, f"Raw sector {i + 1}") for i, w in enumerate(WEIGHTS)]
    rows += [("Govt Bond", "INE999Z01010", Decimal("5"), AssetType.DEBT, None),
             ("Cash", None, Decimal("2"), AssetType.CASH_EQUIVALENT, None)]
    batch_a = add_disclosure_batch(db, a, AS_OF, rows)
    # A newer batch that must NOT be used when the export is asked for 30 Sep.
    add_disclosure_batch(db, a, LATER, [("Stock 1", _isin(1), Decimal("99"), EQ, None)])
    # Stock master: 1..11 have a row; 12 has none. Stock 5 is loss-making (no P/E).
    buckets = [MarketCapBucket.LARGE, MarketCapBucket.MID, MarketCapBucket.SMALL]
    for i in range(1, 12):
        _stock(db, i, None if i == 5 else Decimal(10 + i), Decimal("1.5") + Decimal(i) / 10, f"Master sector {i % 4}")
    for i in range(1, 11):  # 11 and 12 stay unclassified
        add_market_cap(db, _isin(i), buckets[i % 3], date(2026, 7, 1))
    # Fund B has only an August batch: nothing for 30 Sep.
    add_disclosure_batch(db, b, date(2026, 8, 31), [("Stock 1", _isin(1), Decimal("50"), EQ, None)])
    add_disclosure_batch(db, c, AS_OF, [("Stock 2", _isin(2), Decimal("60"), EQ, None),
                                        ("Stock 3", _isin(3), Decimal("40"), EQ, None)])
    # The regular plan's batch exists for the date but is not written.
    add_disclosure_batch(db, reg, AS_OF, [], status=DisclosureBatchStatus.AWAITING_MANUAL_UPLOAD)
    db.commit()
    return SimpleNamespace(a=a, b=b, c=c, reg=reg, all=[a, b, c, reg], batch_a=batch_a)


@pytest.fixture()
def peers(monkeypatch, world):
    async def fake(db, sebi_category, plan_type):
        pool = [s for s in world.all if s.plan_type == plan_type]
        return CategoryPeers(schemes=pool, fund_count=len(pool), representative_of={s.id: s.id for s in pool})

    monkeypatch.setattr(category, "get_category_peers", fake)
    monkeypatch.setattr(ranking, "get_category_peers", fake)
    monkeypatch.setattr(category, "warm_nav_history", AsyncMock())


def _export(db, schemes, holdings_as_of=AS_OF):
    from scripts.export_ca_fund_metrics import build_export
    return asyncio.run(build_export(db, schemes, holdings_as_of, TODAY))


def _fund(out, scheme):
    return next(f for f in out["funds"] if f["identity"]["scheme_id"] == str(scheme.id))


def _d(value):
    return Decimal(value)


# --- identity ---------------------------------------------------------------------------------

def test_identity_block(db_session, world, peers):
    out = _export(db_session, [world.a, world.c, world.reg])
    assert out["export_date"] == TODAY.isoformat()
    assert [f["identity"]["name"] for f in out["funds"]] == [
        "Alpha Large Cap Fund - Direct Plan", "Gamma Nifty 50 Index Fund - Direct Plan",
        "Delta Large Cap Fund - Regular Plan",
    ]
    assert _fund(out, world.a)["identity"] == {
        "scheme_id": str(world.a.id), "name": "Alpha Large Cap Fund - Direct Plan", "amc": "Alpha AMC",
        "sebi_category": CAT, "plan_type": "Direct", "is_index_fund": False,
    }
    assert _fund(out, world.c)["identity"]["is_index_fund"] is True
    assert _fund(out, world.reg)["identity"]["plan_type"] == "Regular"


# --- holdings batch ---------------------------------------------------------------------------

def test_batch_is_chosen_by_the_requested_date_not_the_latest(db_session, world, peers):
    fund = _fund(_export(db_session, [world.a]), world.a)
    assert fund["holdings_batch"] == {
        "requested_as_of": "2026-09-30", "found": True, "batch_as_of": "2026-09-30",
        "status": "written", "reason": None,
    }
    # The 31 Oct batch has a single 99% line; it must not leak into the 30 Sep figures.
    assert _d(fund["top_10_holdings"]["equity_total_pct"]) == _d("57")


def test_a_missing_batch_is_reported_and_nothing_else_is_substituted(db_session, world, peers):
    fund = _fund(_export(db_session, [world.b]), world.b)
    assert fund["holdings_batch"]["found"] is False
    assert fund["holdings_batch"]["batch_as_of"] is None
    assert fund["holdings_batch"]["status"] is None
    assert fund["holdings_batch"]["reason"] == "no_disclosure_batch_for_this_date"
    assert fund["market_cap_allocation"] is None
    assert fund["top_10_holdings"] is None
    assert fund["valuation"]["pe"]["value"] is None
    assert fund["valuation"]["pe"]["unavailable_reason"] == "no_disclosure_batch_for_this_date"
    # The August batch (50% Stock 1) is not used in its place.
    assert "50" not in json.dumps(fund["top_10_holdings"])
    # The return-based figures do not depend on holdings and are still given.
    assert fund["category_comparison"]["periods"]["3y"]["fund_return"] is not None
    assert fund["performance_ranking"]["periods"]["3Y"]["rank"] is not None


def test_a_batch_that_is_not_written_is_reported_with_its_status(db_session, world, peers):
    fund = _fund(_export(db_session, [world.reg]), world.reg)
    assert fund["holdings_batch"]["found"] is False
    assert fund["holdings_batch"]["status"] == "awaiting_manual_upload"
    assert fund["holdings_batch"]["batch_as_of"] == "2026-09-30"
    assert fund["holdings_batch"]["reason"] == "batch_not_written"
    assert fund["top_10_holdings"] is None and fund["market_cap_allocation"] is None


# --- market cap allocation (same function as the fund page) ----------------------------------

def test_market_cap_allocation_equals_the_fund_page(db_session, world, peers):
    screen = build_composition(db_session, world.a, date(2026, 10, 15))  # picks the 30 Sep batch
    assert screen.holdings_as_of == AS_OF
    fund = _fund(_export(db_session, [world.a]), world.a)
    block = fund["market_cap_allocation"]
    assert block["buckets"] == [b.model_dump() for b in screen.allocation.market_cap]
    assert block["unclassified_pct"] == screen.unclassified_pct
    by_label = {b.label: b.pct for b in screen.allocation.market_cap}
    assert block["large_pct"] == by_label["Large"]
    assert block["mid_pct"] == by_label["Mid"]
    assert block["small_pct"] == by_label["Small"]
    assert block["amfi_list_effective_date"] == "2026-07-01"
    # Percentages over classified stocks add to 100; the unclassified share is separate.
    # (each is rounded to 4 places by the screen's own function, so the sum can be off by 0.0001)
    total = _d(block["large_pct"]) + _d(block["mid_pct"]) + _d(block["small_pct"])
    assert abs(total - _d("100")) <= _d("0.0002")
    # Debt 5 + cash 2 + stock 11 (1.0) + stock 12 (0.5) not classified.
    assert _d(block["unclassified_pct"]) == _d("8.5")


def test_a_bucket_with_nothing_in_it_is_shown_as_zero(db_session, world, peers):
    fund = _fund(_export(db_session, [world.c]), world.c)  # stocks 2 (SMALL, 60) and 3 (LARGE, 40)
    block = fund["market_cap_allocation"]
    assert block["mid_pct"] == "0.0000"
    assert (block["large_pct"], block["small_pct"]) == ("40.0000", "60.0000")
    assert {b["label"] for b in block["buckets"]} == {"Large", "Small"}


# --- top 10 -----------------------------------------------------------------------------------

def test_top_10_equals_the_fund_page_and_carries_natural_weights(db_session, world, peers):
    screen = build_composition(db_session, world.a, date(2026, 10, 15))
    top = _fund(_export(db_session, [world.a]), world.a)["top_10_holdings"]
    assert [(r["name"], r["isin"], r["sector"]) for r in top["rows"]] == [
        (r.name, r.isin, r.sector) for r in screen.top10]
    assert [_d(r["pct_to_nav"]) for r in top["rows"]] == [_d(w) for w in WEIGHTS[:10]]
    assert [r["rank"] for r in top["rows"]] == list(range(1, 11))
    assert top["rows"][0]["sector"] == "Master sector 1"  # master sector wins over the raw one
    assert len(top["rows"]) == 10
    assert _d(top["top10_total_pct"]) == sum((_d(w) for w in WEIGHTS[:10]), Decimal(0))
    assert _d(top["equity_total_pct"]) == sum((_d(w) for w in WEIGHTS), Decimal(0))
    assert top["equity_holdings_count"] == 12 == screen.stock_count
    # Stock 12 has no master row, so its sector falls back to the disclosed one (not in the top 10 here).
    assert all(r["sector"] for r in top["rows"])


# --- valuation (same per-fund core as the analytics screen) -----------------------------------

def _screen_valuation(db, monkeypatch, schemes_and_values):
    from app.services.analytics.valuation import compute_valuation
    nav_date = date(2026, 10, 13)
    holdings = [SimpleNamespace(scheme_id=str(s.id), current_value=v, current_nav_date=nav_date)
                for s, v in schemes_and_values]
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=holdings))
    return asyncio.run(compute_valuation(db, [uuid.uuid4()]))


def test_pe_and_pb_equal_the_analytics_screen(db_session, world, peers, monkeypatch):
    screen = _screen_valuation(db_session, monkeypatch, [(world.a, Decimal("1000"))])
    row = screen.funds[0]
    fund = _fund(_export(db_session, [world.a]), world.a)
    for metric in ("pe", "pb"):
        shown = getattr(row, metric)
        mine = fund["valuation"][metric]
        assert _d(mine["value"]) == _d(shown.value)
        assert _d(mine["coverage_pct"]) == _d(shown.coverage_pct)
        assert mine["unavailable_reason"] == shown.unavailable_reason
        assert mine["method"] == shown.method == "harmonic"
        assert mine["basis"] == shown.basis
        assert mine["as_of"] == shown.as_of.isoformat()
        assert mine["screen_source"] == shown.source == "computed"
    # Stock 5 (loss-making) and stock 12 (no master row) are not behind the P/E.
    assert _d(fund["valuation"]["pe"]["coverage_pct"]) == (_d("57") - _d("6") - _d("0.5")) / _d("57") * 100
    excluded = {e["name"] for e in fund["valuation"]["pe"]["excluded"]}
    assert excluded == {"Stock 5", "Stock 12"}
    assert fund["valuation"]["min_coverage_pct"] == "60"


def test_a_withheld_ratio_gives_the_screens_plain_reason(db_session, world, peers, monkeypatch):
    # Remove every P/E but one small stock so coverage falls below 60%.
    for row in db_session.query(StockMaster).all():
        if row.isin != _isin(12):
            row.pe_ratio = None
    db_session.commit()
    screen = _screen_valuation(db_session, monkeypatch, [(world.a, Decimal("1000"))]).funds[0]
    mine = _fund(_export(db_session, [world.a]), world.a)["valuation"]["pe"]
    assert screen.pe.value is None and mine["value"] is None
    assert mine["unavailable_reason"] == screen.pe.unavailable_reason
    assert "need at least 60%" in mine["unavailable_reason"]


def test_a_fresh_factsheet_figure_is_shown_as_the_screen_does(db_session, world, peers, monkeypatch):
    db_session.add(SchemeReportedValuation(
        scheme_id=world.a.id, reference_period=date(2026, 9, 30), metric="pe", value=Decimal("21.5"),
        basis="trailing", method="harmonic", source_file="x.pdf", page=1,
    ))
    db_session.commit()
    screen = _screen_valuation(db_session, monkeypatch, [(world.a, Decimal("1000"))]).funds[0]
    mine = _fund(_export(db_session, [world.a]), world.a)["valuation"]["pe"]
    assert screen.pe.source == "factsheet" and mine["screen_source"] == "factsheet"
    assert _d(mine["screen_value"]) == _d(screen.pe.value)
    # The fund's own stock-by-stock figure is still printed beside it.
    assert mine["method"] == "harmonic" and mine["value"] is not None


# --- category comparison (same pool and averages as the screen) -------------------------------

def test_category_comparison_equals_the_screen(db_session, world, peers, monkeypatch):
    monkeypatch.setattr(category, "compute_holdings", AsyncMock(
        return_value=[SimpleNamespace(scheme_id=str(s.id)) for s in (world.a, world.b, world.c, world.reg)]))
    screen = asyncio.run(category.compute_category_ranking(db_session, [uuid.uuid4()]))
    rows = {r.scheme_id: r for r in screen.funds}
    out = _export(db_session, [world.a, world.b, world.c, world.reg])
    for scheme in world.all:
        row = rows[str(scheme.id)]
        mine = _fund(out, scheme)["category_comparison"]
        assert mine["category"] == row.sebi_category == CAT
        assert mine["plan_type"] == ("Direct" if row.plan_type == "direct" else "Regular")
        assert mine["insufficient_history"] is row.insufficient_history
        assert mine["category_unavailable"] is row.category_unavailable
        assert mine["thin_category"] is row.thin_category
        assert set(mine["periods"]) == set(row.periods) == {"1y", "3y", "5y"}
        for period, shown in row.periods.items():
            got = mine["periods"][period]
            assert got["fund_return"] == shown.fund_return
            assert got["category_avg"] == shown.category_avg
            assert got["funds_in_average"] == shown.peers
            assert got["weighting"] == shown.weighting
            assert got["funds_without_size"] == shown.funds_without_size
    direct = _fund(out, world.a)["category_comparison"]["periods"]["3y"]
    assert direct["funds_in_average"] == 3 and direct["weighting"] == "fund_size"
    assert direct["funds_without_size"] == 1  # the index fund has no size on record
    regular = _fund(out, world.reg)["category_comparison"]["periods"]["3y"]
    assert regular["funds_in_average"] == 1 and regular["weighting"] == "equal"


def test_a_fund_under_three_years_old_is_below_the_floor(db_session, world, peers, monkeypatch):
    young = add_scheme(db_session, "young", CAT, SchemePlanType.DIRECT, "YYY", name="Young Large Cap Fund - Direct Plan")
    db_session.add(NavHistory(scheme_id=young.id, date=TODAY, nav=Decimal("110")))
    db_session.add(NavHistory(scheme_id=young.id, date=years_ago(TODAY, 1), nav=Decimal("100")))
    db_session.commit()
    world.all.append(young)
    mine = _fund(_export(db_session, [young]), young)["category_comparison"]
    assert mine["insufficient_history"] is True
    assert mine["periods"] == {}
    assert mine["three_year_floor"]["applies"] is True
    assert mine["three_year_floor"]["fund_meets_floor"] is False


# --- performance ranking ----------------------------------------------------------------------

def test_ranking_equals_the_screen_including_ties_and_the_index_disclaimer(db_session, world, peers, monkeypatch):
    tie = add_scheme(db_session, "tie", CAT, SchemePlanType.DIRECT, "TTT", name="Tie Large Cap Fund - Direct Plan")
    _nav(db_session, tie, "130")  # same end NAV as Beta: ranks 2, 2
    db_session.commit()
    world.all.append(tie)
    monkeypatch.setattr(ranking, "compute_holdings", AsyncMock(
        return_value=[SimpleNamespace(scheme_id=str(s.id)) for s in world.all]))
    screen = asyncio.run(ranking.compute_performance_ranking(db_session, [uuid.uuid4()]))
    rows = {r.scheme_id: r for r in screen.funds}
    out = _export(db_session, world.all)
    for scheme in world.all:
        row, mine = rows[str(scheme.id)], _fund(out, scheme)["performance_ranking"]
        assert mine["disclaimer_key"] == row.disclaimer_key
        assert mine["ranked_as"] == row.ranked_as
        assert {p: (v["rank"], v["total"], v["status"]) for p, v in mine["periods"].items()} == {
            p: (v.rank, v.total, v.status) for p, v in row.periods.items()}
    assert [_fund(out, s)["performance_ranking"]["periods"]["3Y"]["rank"] for s in (world.a, world.b, tie)] == [1, 2, 2]
    index = _fund(out, world.c)["performance_ranking"]
    assert index["disclaimer_key"] == "index_fund_not_ranked"
    assert index["periods"]["3Y"]["rank"] is None and index["periods"]["3Y"]["status"] == "not_ranked_index_fund"
    assert index["disclaimer"].startswith("Index funds are not ranked here.")
    assert _fund(out, world.a)["performance_ranking"]["disclaimer"] is None


# --- no user data, no floats ------------------------------------------------------------------

def _walk(node, path=()):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from _walk(value, path + (key,))
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value, path)
    yield path, node


def test_output_has_no_user_household_folio_or_member_data_and_no_floats(db_session, world, peers):
    household = add_user_household(db_session)
    folio = add_folio(db_session, world.a, household.asha_id, "4400918/3")
    add_purchase(db_session, folio, date(2025, 1, 1), Decimal("100"), Decimal("10.00"))
    db_session.commit()
    out = _export(db_session, world.all)
    dumped = json.dumps(out)
    for needle in ("ASHA", "Dev Rao", "+919000000", "4400918", str(household.user_id),
                   str(household.asha_id), str(household.dev_id), str(folio.id)):
        assert needle not in dumped
    keys = {k.lower() for path, _ in _walk(out) for k in path if isinstance(k, str)}
    assert not {k for k in keys if any(w in k for w in ("user", "household", "folio", "member", "account", "phone", "pan"))}
    json.loads(dumped, parse_float=lambda s: pytest.fail(f"float in output: {s}"))
    assert all(not isinstance(v, float) for _, v in _walk(out))
    # Decimal figures are strings.
    fund = _fund(out, world.a)
    assert isinstance(fund["valuation"]["pe"]["value"], str)
    assert isinstance(fund["category_comparison"]["periods"]["3y"]["fund_return"], str)


# --- read-only guard --------------------------------------------------------------------------

def test_guard_allows_reads_and_aborts_every_kind_of_write(db_session, world):
    from scripts.export_ca_fund_metrics import WriteAttempted, install_read_only_guard
    install_read_only_guard(db_session)
    assert db_session.query(Scheme).count() == 4  # alpha, beta, gamma, delta
    db_session.add(Scheme(id=uuid.uuid4(), name="Intruder", amc_name="X", sebi_category=CAT))
    with pytest.raises(WriteAttempted):
        db_session.flush()
    db_session.rollback()
    with pytest.raises(WriteAttempted):
        db_session.execute(text("DELETE FROM nav_history"))
    with pytest.raises(WriteAttempted):
        db_session.execute(text("UPDATE schemes SET name = 'x'"))
    with pytest.raises(WriteAttempted):
        db_session.execute(text("INSERT INTO schemes (id) VALUES ('x')"))
    with pytest.raises(WriteAttempted):
        db_session.execute(text("WITH d AS (DELETE FROM nav_history RETURNING 1) SELECT * FROM d"))
    with pytest.raises(WriteAttempted):
        db_session.execute(text("DROP TABLE nav_history"))
    db_session.rollback()
    assert db_session.query(NavHistory).count() > 0
    assert db_session.query(Scheme).filter(Scheme.name == "Intruder").count() == 0


def test_live_nav_warming_is_switched_off_for_the_export(monkeypatch):
    from scripts import export_ca_fund_metrics as script
    called = []

    async def live(db, schemes):
        called.append(1)

    monkeypatch.setattr(category, "warm_nav_history", live)
    script.disable_live_nav_warming()
    asyncio.run(category.warm_nav_history(None, []))
    assert called == []


# --- command line ------------------------------------------------------------------------------

def _run_main(monkeypatch, capsys, db, argv):
    from scripts import export_ca_fund_metrics as script
    monkeypatch.setattr(script, "SessionLocal", lambda: db)
    code = script.main(argv)
    captured = capsys.readouterr()
    return code, captured.out, captured.err


def test_main_prints_one_json_object_for_ids_and_names(db_session, world, peers, monkeypatch, capsys):
    code, out, err = _run_main(monkeypatch, capsys, db_session, [
        "--scheme-id", str(world.a.id), "--name", "Beta Large Cap Fund - Direct Plan",
        "--scheme-id", str(world.a.id),  # a duplicate is printed once
        "--holdings-as-of", "2026-09-30", "--export-date", TODAY.isoformat(),
    ])
    assert code == 0, err
    data = json.loads(out)
    assert set(data) >= {"export_date", "holdings_as_of_requested", "funds"}
    assert data["holdings_as_of_requested"] == "2026-09-30"
    assert [f["identity"]["name"] for f in data["funds"]] == [
        "Alpha Large Cap Fund - Direct Plan", "Beta Large Cap Fund - Direct Plan"]


def test_main_refuses_an_unknown_or_ambiguous_name_and_a_missing_selection(db_session, world, peers, monkeypatch, capsys):
    db_session.add(Scheme(id=uuid.uuid4(), name="Alpha Large Cap Fund - Direct Plan", amc_name="Other", sebi_category=CAT))
    db_session.commit()  # before main() installs the guard on this session
    code, out, err = _run_main(monkeypatch, capsys, db_session, ["--name", "No Such Fund"])
    assert code == 2 and out == "" and "No Such Fund" in err
    code, out, err = _run_main(monkeypatch, capsys, db_session, ["--name", "Alpha Large Cap Fund - Direct Plan"])
    assert code == 2 and out == "" and "more than one" in err.lower()
    code, out, err = _run_main(monkeypatch, capsys, db_session, [])
    assert code == 2 and out == ""


def test_main_aborts_with_a_clear_message_if_anything_tries_to_write(db_session, world, peers, monkeypatch, capsys):
    from scripts import export_ca_fund_metrics as script

    async def writes(db, schemes, holdings_as_of, export_date):
        db.add(Scheme(id=uuid.uuid4(), name="Intruder", amc_name="X", sebi_category=CAT))
        db.flush()

    monkeypatch.setattr(script, "build_export", writes)
    code, out, err = _run_main(monkeypatch, capsys, db_session, ["--scheme-id", str(world.a.id)])
    assert code == 2 and out == ""
    assert "read-only guard" in err
    assert db_session.query(Scheme).filter(Scheme.name == "Intruder").count() == 0
