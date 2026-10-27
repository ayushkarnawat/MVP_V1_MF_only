import json
import uuid
from datetime import timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import event

from app.api.home import get_now_ist
from app.config import settings
from app.db.session import get_db
from app.services.auth.session import get_active_user
from app.services.news.schemas import NewsItemOut
from tests.api.home_fixture import FIXED_NOW, seed_home_household
from tests.api.news_fixture import build_news_fixture, seed_news_items, set_coverage, set_news_job_run
from scripts.write_news_fixtures import BUILDERS, write_fixture_set

NOW_UTC = FIXED_NOW.astimezone(timezone.utc)
NEWS_SUFFIXES = ("news",)


@pytest.fixture(autouse=True)
def _news_enabled(monkeypatch):
    monkeypatch.setattr(settings, "news_enabled", True)
    monkeypatch.setattr(settings, "news_disabled_sources", "")


def _db(runtime):
    return next(runtime.client.app.dependency_overrides[get_db]())


def _listen(runtime):
    statements = []
    listener = lambda _conn, _cursor, statement, _params, _ctx, _many: statements.append(statement)
    event.listen(runtime.engine, "before_cursor_execute", listener)
    return statements, listener


@pytest.fixture()
def news_client(client):
    household = seed_home_household(client)
    yield client, household
    client.app.dependency_overrides.pop(get_active_user, None)
    client.app.dependency_overrides.pop(get_now_ist, None)


@pytest.mark.parametrize("suffix", NEWS_SUFFIXES)
def test_news_routes_require_authentication(client, suffix):
    assert client.get(f"/household/aggregate/home/{suffix}").status_code == 401
    member_id = uuid.uuid4()
    assert client.get(f"/household-members/{member_id}/home/{suffix}").status_code == 401


def test_foreign_member_returns_404(news_client):
    client, _household = news_client
    foreign = uuid.uuid4()
    assert client.get(f"/household-members/{foreign}/home/news").status_code == 404


def test_kill_switch_disabled_skips_news_read_entirely(monkeypatch):
    runtime = build_news_fixture()
    try:
        monkeypatch.setattr(settings, "news_enabled", False)
        seed_news_items(_db(runtime), [
            {"source": "Mint", "title": "HDFC Bank shares rally after strong quarterly results",
             "published_at": NOW_UTC - timedelta(hours=2)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        statements, listener = _listen(runtime)
        try:
            response = runtime.client.get("/household/aggregate/home/news")
        finally:
            event.remove(runtime.engine, "before_cursor_execute", listener)
        assert response.status_code == 200
        body = response.json()
        assert body["enabled"] is False
        assert body["state"] == "disabled"
        assert body["items"] == []
        assert not any("news_items" in statement for statement in statements)
    finally:
        runtime.close()


def test_empty_state_when_no_news_rows_exist():
    runtime = build_news_fixture()
    try:
        body = runtime.client.get("/household/aggregate/home/news").json()
        assert body["enabled"] is True
        assert body["state"] == "empty"
        assert body["feed_as_of"] is None
        assert body["items"] == []
    finally:
        runtime.close()


_ARTICLE = {"source": "Mint", "title": "Sensex ends higher on strong earnings"}


def test_feed_as_of_is_last_successful_job_run_not_newest_item():
    runtime = build_news_fixture()
    try:
        seed_news_items(_db(runtime), [
            {**_ARTICLE, "published_at": NOW_UTC - timedelta(hours=60)},
        ], ingested_at=NOW_UTC - timedelta(hours=60), job_run_at=NOW_UTC - timedelta(hours=1))
        body = runtime.client.get("/household/aggregate/home/news").json()
        assert body["state"] == "items"
        assert body["stale"] is False
        assert body["hidden"] is False
        assert body["feed_as_of"].startswith((NOW_UTC - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S"))
    finally:
        runtime.close()


def test_old_job_run_makes_feed_stale_and_hidden_even_with_fresh_items():
    for delta, stale, hidden in (
        (timedelta(hours=36), False, False), (timedelta(hours=37), True, False),
        (timedelta(hours=72), True, False), (timedelta(hours=73), True, True),
    ):
        runtime = build_news_fixture()
        try:
            seed_news_items(_db(runtime), [
                {**_ARTICLE, "published_at": NOW_UTC - timedelta(hours=1)},
            ], ingested_at=NOW_UTC - timedelta(minutes=5), job_run_at=NOW_UTC - delta)
            body = runtime.client.get("/household/aggregate/home/news").json()
            assert (body["stale"], body["hidden"]) == (stale, hidden), delta
        finally:
            runtime.close()


def test_items_but_no_job_run_row_is_the_empty_state():
    runtime = build_news_fixture()
    try:
        seed_news_items(_db(runtime), [
            {**_ARTICLE, "published_at": NOW_UTC - timedelta(hours=1)},
        ], ingested_at=NOW_UTC - timedelta(hours=1), job_run_at=None)
        body = runtime.client.get("/household/aggregate/home/news").json()
        assert body["state"] == "empty"
        assert body["feed_as_of"] is None
        assert body["items"] == []
    finally:
        runtime.close()


def test_job_run_with_zero_items_is_fresh_not_empty():
    runtime = build_news_fixture()
    try:
        set_news_job_run(_db(runtime), NOW_UTC - timedelta(hours=2))
        body = runtime.client.get("/household/aggregate/home/news").json()
        assert body["state"] == "items"
        assert body["stale"] is False
        assert body["items"] == []
    finally:
        runtime.close()


def test_stale_flag_true_just_past_36h_false_at_exactly_36h():
    for delta, expected_stale in ((timedelta(hours=36), False), (timedelta(hours=36, minutes=1), True)):
        runtime = build_news_fixture()
        try:
            ingested = NOW_UTC - delta
            seed_news_items(_db(runtime), [
                {"source": "Mint", "title": "Sensex ends higher on strong earnings", "published_at": ingested},
            ], ingested_at=ingested)
            body = runtime.client.get("/household/aggregate/home/news").json()
            assert body["state"] == "items"
            assert body["hidden"] is False
            assert body["stale"] is expected_stale
        finally:
            runtime.close()


def test_hidden_true_just_past_72h_items_at_exactly_72h():
    for delta, expected_hidden in ((timedelta(hours=72), False), (timedelta(hours=72, minutes=1), True)):
        runtime = build_news_fixture()
        try:
            ingested = NOW_UTC - delta
            seed_news_items(_db(runtime), [
                {"source": "Mint", "title": "Sensex ends higher on strong earnings", "published_at": ingested},
            ], ingested_at=ingested)
            body = runtime.client.get("/household/aggregate/home/news").json()
            assert body["hidden"] is expected_hidden
            if expected_hidden:
                assert body["state"] == "hidden"
                assert body["items"] == []
            else:
                assert body["state"] == "items"
        finally:
            runtime.close()


def test_aggregate_scope_produces_three_specific_items_by_tier():
    runtime = build_news_fixture()
    try:
        seed_news_items(_db(runtime), [
            {"source": "Moneycontrol", "title": "HDFC Bank shares rally after strong quarterly results",
             "published_at": NOW_UTC - timedelta(hours=2)},
            {"source": "Mint", "title": "HDFC Mutual Fund AUM crosses record high as fund house expands",
             "published_at": NOW_UTC - timedelta(hours=4)},
            {"source": "The Economic Times", "title": "Gold prices hit a new all-time high amid global uncertainty",
             "published_at": NOW_UTC - timedelta(hours=6)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        body = runtime.client.get("/household/aggregate/home/news").json()
        assert body["state"] == "items"
        kinds = [item["kind"] for item in body["items"]]
        assert kinds == ["stock", "fund_house", "asset_class"]
        assert all(item["specific"] for item in body["items"])
    finally:
        runtime.close()


def test_member_scope_uses_its_own_sections_and_majority_override():
    runtime = build_news_fixture()
    try:
        seed_news_items(_db(runtime), [
            {"source": "Mint", "title": "RBI holds repo rate steady amid inflation concerns",
             "published_at": NOW_UTC - timedelta(hours=5)},
            {"source": "Moneycontrol", "title": "Gold prices rally to fresh highs on safe-haven demand",
             "published_at": NOW_UTC - timedelta(hours=1)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        body = runtime.client.get(f"/household-members/{runtime.household.dev_id}/home/news").json()
        assert body["scope"] == "member"
        assert body["state"] == "items"
        assert body["items"][0]["kind"] == "rates_macro"
        assert body["items"][0]["specific"] is True
    finally:
        runtime.close()


def test_general_only_scope_has_no_watch_entities_to_match():
    runtime = build_news_fixture(variant="empty")
    try:
        seed_news_items(_db(runtime), [
            {"source": "Mint", "title": "Sensex ends flat amid mixed global cues",
             "published_at": NOW_UTC - timedelta(hours=1)},
            {"source": "Moneycontrol", "title": "Nifty closes marginally lower in a volatile session",
             "published_at": NOW_UTC - timedelta(hours=3)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        body = runtime.client.get("/household/aggregate/home/news").json()
        assert body["state"] == "items"
        assert body["items"]
        assert all(item["kind"] == "general" and not item["specific"] for item in body["items"])
    finally:
        runtime.close()


def test_low_coverage_nulls_the_lookthrough_exposure_chip():
    runtime = build_news_fixture()
    try:
        set_coverage(_db(runtime), "40.00")
        seed_news_items(_db(runtime), [
            {"source": "Moneycontrol", "title": "HDFC Bank shares rally after strong quarterly results",
             "published_at": NOW_UTC - timedelta(hours=2)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        body = runtime.client.get("/household/aggregate/home/news").json()
        stock_item = next(item for item in body["items"] if item["kind"] == "stock")
        assert stock_item["exposure_pct"] is None
        assert stock_item["exposure_text"] is None
    finally:
        runtime.close()


def test_disabled_source_excluded_at_request_time(monkeypatch):
    runtime = build_news_fixture()
    try:
        from app.services.news.config import SOURCE_DISPLAY_NAMES

        domain, display = next(iter(SOURCE_DISPLAY_NAMES.items()))
        seed_news_items(_db(runtime), [
            {"source": display, "title": "HDFC Bank shares rally after strong quarterly results",
             "published_at": NOW_UTC - timedelta(hours=2)},
            {"source": "Some Other Source", "title": "Gold prices hit a new all-time high amid global uncertainty",
             "published_at": NOW_UTC - timedelta(hours=3)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        monkeypatch.setattr(settings, "news_disabled_sources", domain)
        body = runtime.client.get("/household/aggregate/home/news").json()
        sources = {item["source"] for item in body["items"]}
        assert display not in sources
        assert "Some Other Source" in sources
    finally:
        runtime.close()


def test_disabled_source_config_case_insensitive_at_request_time(monkeypatch):
    runtime = build_news_fixture()
    try:
        seed_news_items(_db(runtime), [
            {"source": "Moneycontrol", "title": "HDFC Bank shares rally after strong quarterly results",
             "published_at": NOW_UTC - timedelta(hours=2)},
            {"source": "Some Other Source", "title": "Gold prices hit a new all-time high amid global uncertainty",
             "published_at": NOW_UTC - timedelta(hours=3)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        monkeypatch.setattr(settings, "news_disabled_sources", " MoneyControl.COM ")
        body = runtime.client.get("/household/aggregate/home/news").json()
        sources = {item["source"] for item in body["items"]}
        assert "Moneycontrol" not in sources
        assert "Some Other Source" in sources
    finally:
        runtime.close()


def test_news_routes_are_select_only(monkeypatch):
    import app.services.analytics.recompute as recompute
    import app.services.dashboard.snapshots as snapshots
    from app.services.analytics.dispatch import dispatcher

    def forbidden(*_args, **_kwargs):
        raise AssertionError("news GET attempted recompute or snapshot rebuild")

    for name in vars(recompute):
        if name.startswith("compute_"):
            monkeypatch.setattr(recompute, name, forbidden)
    monkeypatch.setattr(snapshots, "rebuild_member_snapshots", forbidden)
    monkeypatch.setattr(dispatcher, "dispatch", forbidden)

    runtime = build_news_fixture()
    try:
        seed_news_items(_db(runtime), [
            {"source": "Mint", "title": "HDFC Bank shares rally after strong quarterly results",
             "published_at": NOW_UTC - timedelta(hours=2)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        statements, listener = _listen(runtime)
        try:
            for path in (
                "/household/aggregate/home/news",
                f"/household-members/{runtime.household.dev_id}/home/news",
            ):
                response = runtime.client.get(path)
                assert response.status_code == 200, (path, response.text)
        finally:
            event.remove(runtime.engine, "before_cursor_execute", listener)
        assert statements
        assert {statement.lstrip().split(None, 1)[0].upper() for statement in statements} == {"SELECT"}
    finally:
        runtime.close()


def test_news_statement_counts_do_not_grow_with_fund_count():
    counts = []
    for fund_count in (3, 9):
        runtime = build_news_fixture(fund_count=fund_count)
        try:
            seed_news_items(_db(runtime), [
                {"source": "Mint", "title": "HDFC Bank shares rally after strong quarterly results",
                 "published_at": NOW_UTC - timedelta(hours=2)},
            ], ingested_at=NOW_UTC - timedelta(hours=1))
            runtime.client.get("/household/aggregate/home/news")
            statements, listener = _listen(runtime)
            try:
                response = runtime.client.get("/household/aggregate/home/news")
                assert response.status_code == 200
            finally:
                event.remove(runtime.engine, "before_cursor_execute", listener)
            counts.append(sum(statement.lstrip().upper().startswith("SELECT") for statement in statements))
        finally:
            runtime.close()
    assert counts[0] == counts[1]


def test_openapi_news_paths_present_tagged_home_and_exposure_pct_is_string(client):
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    for path in ("/household/aggregate/home/news", "/household-members/{member_id}/home/news"):
        assert paths[path]["get"]["tags"] == ["home"]
    item_schema = schema["components"]["schemas"]["NewsItemOut"]
    exposure_schema = item_schema["properties"]["exposure_pct"]
    assert "number" not in str(exposure_schema)


def test_item_key_set_matches_schema():
    runtime = build_news_fixture()
    try:
        seed_news_items(_db(runtime), [
            {"source": "Mint", "title": "HDFC Bank shares rally after strong quarterly results",
             "published_at": NOW_UTC - timedelta(hours=2)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        body = runtime.client.get("/household/aggregate/home/news").json()
        assert body["items"]
        assert set(body["items"][0]) == set(NewsItemOut.model_fields)
    finally:
        runtime.close()


def test_generated_news_golden_fixtures_equal_live_routes():
    destination = Path(__file__).resolve().parents[1] / "fixtures" / "news"
    # Read-only on purpose: writing first and then comparing the file with the same output can never fail.
    generated = write_fixture_set(destination, write=False)
    assert set(generated) == set(BUILDERS)
    for filename, payload in generated.items():
        assert json.loads((destination / filename).read_text(encoding="utf-8")) == payload


def test_fund_weight_pct_is_the_funds_share_of_the_scope_portfolio():
    runtime = build_news_fixture()
    try:
        seed_news_items(_db(runtime), [
            {"source": "Mint", "title": "HDFC Mutual Fund AUM crosses record high as fund house expands",
             "published_at": NOW_UTC - timedelta(hours=4)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        body = runtime.client.get("/household/aggregate/home/news").json()
        funds = {fund["name"]: fund for fund in body["items"][0]["funds"]}
        # Stored values: Large Cap 1210, Flexi Cap 990, Gold 1010, Short Duration Debt 2002; total 5212.
        assert funds["Dev Short Duration Debt"]["weight_pct"] == "38.41"  # 2002 / 5212 = 38.4114...
        assert funds["Asha Large Cap"]["weight_pct"] == "23.22"  # 1210 / 5212 = 23.2157...
        assert set(funds["Asha Large Cap"]) == {"scheme_id", "name", "weight_pct"}
    finally:
        runtime.close()


def test_fund_weight_pct_is_null_when_the_value_or_total_is_unknown():
    from decimal import Decimal
    from app.api.home_news import _weight_pct

    assert _weight_pct("a", {"a": Decimal("1")}, Decimal("0")) is None
    assert _weight_pct("missing", {"a": Decimal("1")}, Decimal("1")) is None
    assert _weight_pct("a", {"a": Decimal("1")}, Decimal("3")) == Decimal("33.33")


def _holding(scheme_id, value, *, unavailable=False):
    from types import SimpleNamespace
    return SimpleNamespace(scheme_id=scheme_id, current_value=value, nav_unavailable=unavailable)


def test_news_holding_values_match_homes_quantized_total():
    from decimal import Decimal
    from app.api.home import _total_value
    from app.api.home_news import _holding_values

    rows = [_holding("a", "10.005"), _holding("b", "20.004"), _holding("c", None), _holding("d", "5", unavailable=True)]
    values = _holding_values(rows)
    assert values == {"a": Decimal("10.01"), "b": Decimal("20.00")}
    assert sum(values.values(), Decimal("0.00")) == _total_value(type("I", (), {"holdings": rows})())


def test_news_holding_values_sum_rows_repeating_a_scheme():
    from decimal import Decimal
    from app.api.home_news import _holding_values

    values = _holding_values([_holding("a", "100.00"), _holding("a", "50.00"), _holding("b", "10.00")])
    assert values == {"a": Decimal("150.00"), "b": Decimal("10.00")}


def _seed_shared_scheme(runtime):
    """Dev also holds Asha's Large Cap scheme in his own folio (one holding row per member)."""
    from datetime import date
    from decimal import Decimal
    from app.models.enums import PlanType, TransactionType
    from app.models.folio import Folio
    from app.models.imports import Import
    from app.models.transaction import Transaction
    from tests.api.home_fixture import uid
    from app.services.dashboard.holdings import _holdings_cache

    db = _db(runtime)
    folio = Folio(
        id=uid("folio-shared-dev"), household_member_id=uid("dev"), scheme_id=uid("scheme-large"),
        folio_number="SHARED-DEV", plan_type=PlanType.DIRECT,
    )
    db.add(folio)
    db.flush()
    db.add(Transaction(
        id=uid("transaction-shared-dev"), folio_id=folio.id, import_id=uid("import-Dev Rao"),
        type=TransactionType.PURCHASE, date=date(2026, 8, 25), amount=Decimal("1000"),
        units=Decimal("100"), nav=Decimal("10"),
    ))
    db.commit()
    _holdings_cache.clear()


def test_fund_weight_pct_counts_every_members_row_for_a_shared_scheme():
    runtime = build_news_fixture()
    try:
        _seed_shared_scheme(runtime)
        seed_news_items(_db(runtime), [
            {"source": "Mint", "title": "HDFC Mutual Fund AUM crosses record high as fund house expands",
             "published_at": NOW_UTC - timedelta(hours=4)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        body = runtime.client.get("/household/aggregate/home/news").json()
        funds = {fund["name"]: fund for fund in body["items"][0]["funds"]}
        # Large Cap is now 1210 (Asha) + 100 units * 12.10 (Dev) = 2420; total 5212 + 1210 = 6422.
        assert funds["Asha Large Cap"]["weight_pct"] == "37.68"  # 2420 / 6422
        assert funds["Dev Short Duration Debt"]["weight_pct"] == "31.17"  # 2002 / 6422
    finally:
        runtime.close()


def test_fund_weight_pct_is_member_scoped_for_a_member_request():
    runtime = build_news_fixture()
    try:
        seed_news_items(_db(runtime), [
            {"source": "Mint", "title": "HDFC Mutual Fund AUM crosses record high as fund house expands",
             "published_at": NOW_UTC - timedelta(hours=4)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        from tests.api.home_fixture import uid
        body = runtime.client.get(f"/household-members/{uid('asha')}/home/news").json()
        funds = {fund["name"]: fund for fund in body["items"][0]["funds"]}
        # Asha only: Large Cap 1210, Flexi Cap 990; total 2200.
        assert funds["Asha Large Cap"]["weight_pct"] == "55.00"
        assert funds["Asha Flexi Cap"]["weight_pct"] == "45.00"
        assert "Dev Short Duration Debt" not in funds
    finally:
        runtime.close()


def test_fund_weight_pct_null_for_unavailable_nav_fund_and_excluded_from_total():
    runtime = build_news_fixture()
    try:
        from app.models.reference import NavHistory, Scheme
        from tests.api.home_fixture import uid
        from app.services.dashboard.holdings import _holdings_cache
        db = _db(runtime)
        db.query(NavHistory).filter(NavHistory.scheme_id == uid("scheme-gold")).delete()
        db.get(Scheme, uid("scheme-gold")).amfi_code = None
        db.commit()
        _holdings_cache.clear()
        seed_news_items(_db(runtime), [
            {"source": "Mint", "title": "HDFC Mutual Fund AUM crosses record high as fund house expands",
             "published_at": NOW_UTC - timedelta(hours=4)},
        ], ingested_at=NOW_UTC - timedelta(hours=1))
        body = runtime.client.get("/household/aggregate/home/news").json()
        assert body["partial"] is True
        funds = {fund["name"]: fund for fund in body["items"][0]["funds"]}
        assert "Dev Gold Fund" not in funds  # unavailable-NAV funds never reach a watch entity
        # Total excludes Gold (1010): 5212 - 1010 = 4202.
        assert funds["Dev Short Duration Debt"]["weight_pct"] == "47.64"  # 2002 / 4202
    finally:
        runtime.close()


def test_funds_out_gives_null_weight_to_an_unavailable_fund_and_excludes_it_from_total():
    from decimal import Decimal
    from app.api.home_news import _funds_out, _holding_values
    from app.services.news.match import WatchEntity

    values = _holding_values([_holding("a", "300.00"), _holding("b", "100.00"), _holding("g", "999", unavailable=True)])
    entity = WatchEntity("fund_house", "k", "Label", None, "holdings", (("a", "A"), ("b", "B"), ("g", "Gold")))
    out = {fund.scheme_id: fund.weight_pct for fund in _funds_out(entity, values, None)}
    assert out == {"a": Decimal("75.00"), "b": Decimal("25.00"), "g": None}
