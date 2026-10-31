from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy import event

from app.api.home import _total_value, get_now_ist
from app.core.decimal_utils import quantize_amount
from app.db.session import get_db
from app.models.enums import BenchmarkIndex, BenchmarkReturnType, Relationship
from app.models.reference import BenchmarkIndexHistory, NavHistory
from app.models.user import HouseholdMember
from app.services.auth.session import get_active_user
from app.services.dashboard.holdings import _holdings_cache
from app.services.home.schemas import MissingFund, SummaryResponse
from tests.api.home_fixture import FIXED_NOW, build_home_fixture, seed_home_household, uid
from scripts.write_home_fixtures import REQUESTS, write_fixture_set


HOME_SUFFIXES = (
    "summary", "wealth-series", "allocation", "movers", "worth-a-look", "benchmarks"
)


def _all_home_paths(household):
    paths = [f"/household/aggregate/home/{suffix}" for suffix in HOME_SUFFIXES]
    paths += [
        f"/household-members/{household.dev_id}/home/{suffix}"
        for suffix in HOME_SUFFIXES
    ]
    return paths


def _mover_sum(body):
    return sum(
        (Decimal(row["change"]) for row in body["gains"] + body["losses"]),
        Decimal("0"),
    ) + Decimal(body["others_change"])


def _envelope():
    return {
        "scope": "aggregate",
        "member_id": None,
        "nav_as_of": date(2026, 10, 23),
        "partial": False,
        "missing_funds": [],
        "computed_at": datetime(2026, 10, 23, 13, tzinfo=timezone.utc),
    }


def test_summary_response_has_exact_contract_and_plain_decimal_json():
    response = SummaryResponse(
        **_envelope(),
        display_name="Asha",
        greeting="evening",
        scope_label="Your family portfolio",
        change_amount=Decimal("1E+3"),
        change_pct=Decimal("1.2500"),
        direction="up",
        status_phrase="up",
        since_label="today",
        since_date=date(2026, 10, 22),
        top_contributor="Large Cap",
        top_contributor_scheme_id="54b8755e-6b2b-5f4f-a8fe-b41125031af6",
        members_connected=2,
        members_total=2,
        data_line="Data from 2 of 2 family members",
        has_holdings=True,
        total_value=Decimal("1234.50"),
        members=[],
    )
    assert list(response.model_fields) == [
        "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at",
        "display_name", "greeting", "scope_label", "change_amount", "change_pct",
        "direction", "status_phrase", "since_label", "since_date", "top_contributor",
        "top_contributor_scheme_id",
        "members_connected", "members_total", "data_line", "has_holdings",
        "total_value", "members",
    ]
    assert response.model_dump(mode="json") == {
        "scope": "aggregate",
        "member_id": None,
        "nav_as_of": "2026-10-23",
        "partial": False,
        "missing_funds": [],
        "computed_at": "2026-10-23T13:00:00Z",
        "display_name": "Asha",
        "greeting": "evening",
        "scope_label": "Your family portfolio",
        "change_amount": "1000",
        "change_pct": "1.2500",
        "direction": "up",
        "status_phrase": "up",
        "since_label": "today",
        "since_date": "2026-10-22",
        "top_contributor": "Large Cap",
        "top_contributor_scheme_id": "54b8755e-6b2b-5f4f-a8fe-b41125031af6",
        "members_connected": 2,
        "members_total": 2,
        "data_line": "Data from 2 of 2 family members",
        "has_holdings": True,
        "total_value": "1234.50",
        "members": [],
    }


def test_summary_route_top_contributor_id_matches_the_named_nonzero_mover(home_client):
    client, household = home_client
    names = {"Asha Large Cap": "large", "Dev Gold Fund": "gold"}
    for path, expected_name in (
        ("/household/aggregate/home/summary", "Asha Large Cap"),
        (f"/household-members/{household.dev_id}/home/summary", "Dev Gold Fund"),
    ):
        body = client.get(path).json()
        assert body["top_contributor"] == expected_name
        assert Decimal(body["change_amount"]) != 0
        assert body["top_contributor_scheme_id"] == str(uid(f"scheme-{names[expected_name]}"))


def test_home_models_forbid_extra_fields():
    with pytest.raises(ValidationError, match="extra_forbidden"):
        MissingFund(scheme_id="scheme", name="Fund", unexpected=True)


def test_openapi_registers_exactly_the_home_paths(client):
    paths = client.get("/openapi.json").json()["paths"]
    expected = {
        f"/household/aggregate/home/{suffix}" for suffix in HOME_SUFFIXES
    } | {
        f"/household-members/{{member_id}}/home/{suffix}" for suffix in HOME_SUFFIXES
    } | {"/household/aggregate/home/news", "/household-members/{member_id}/home/news"}
    assert {path for path in paths if "/home/" in path} == expected
    for path in expected:
        assert paths[path]["get"]["tags"] == ["home"]


@pytest.mark.parametrize("suffix", HOME_SUFFIXES)
def test_aggregate_home_routes_require_authentication(client, suffix):
    assert client.get(f"/household/aggregate/home/{suffix}").status_code == 401


def test_wealth_query_rejects_benchmark_outside_home_five(client):
    response = client.get(
        "/household/aggregate/home/wealth-series?benchmark=nifty_next_50"
    )
    assert response.status_code == 401


@pytest.fixture()
def home_client(client):
    household = seed_home_household(client)
    yield client, household
    client.app.dependency_overrides.pop(get_active_user, None)
    client.app.dependency_overrides.pop(get_now_ist, None)


def test_all_twelve_routes_return_exact_envelopes(home_client):
    client, household = home_client
    paths = [f"/household/aggregate/home/{suffix}" for suffix in HOME_SUFFIXES]
    paths += [
        f"/household-members/{household.asha_id}/home/{suffix}"
        for suffix in HOME_SUFFIXES
    ]
    for path in paths:
        response = client.get(path)
        assert response.status_code == 200, (path, response.text)
        body = response.json()
        assert list(body)[:6] == [
            "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at"
        ]


def test_home_identity_chain_and_allocation_reconcile(home_client):
    client, _household = home_client
    summary = client.get("/household/aggregate/home/summary").json()
    movers = client.get("/household/aggregate/home/movers?by=fund").json()
    wealth = client.get("/household/aggregate/home/wealth-series?period=1D").json()
    allocation = client.get("/household/aggregate/home/allocation").json()
    assert summary["change_amount"] == movers["net_change"] == wealth["change_amount"] == "12.00"
    shown = sum(
        (Decimal(row["change"]) for row in movers["gains"] + movers["losses"]),
        Decimal("0"),
    ) + Decimal(movers["others_change"])
    assert shown == Decimal(movers["net_change"])
    assert wealth["points"][-1]["value"] == wealth["end_value"]
    assert wealth["end_value"] == summary["total_value"] == allocation["total_value"] == "5212.00"


def test_home_total_value_rounds_each_valued_holding_before_sum():
    inputs = SimpleNamespace(holdings=(
        SimpleNamespace(scheme_id="a", current_value="1.005", nav_unavailable=False),
        SimpleNamespace(scheme_id="b", current_value="1.005", nav_unavailable=False),
        SimpleNamespace(scheme_id="c", current_value=None, nav_unavailable=True),
    ))
    assert _total_value(inputs) == Decimal("2.02")


def test_custom_validation_and_foreign_member(home_client):
    client, _household = home_client
    assert client.get("/household/aggregate/home/wealth-series?period=custom").status_code == 422
    response = client.get(
        "/household/aggregate/home/wealth-series?period=custom&from=2026-10-20&to=2026-10-01"
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "start must not be after end"
    foreign = uuid.uuid4()
    for suffix in HOME_SUFFIXES:
        assert client.get(f"/household-members/{foreign}/home/{suffix}").status_code == 404


def test_home_openapi_money_fields_are_strings(home_client):
    client, _household = home_client
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    money_names = {
        "change_amount", "change_pct", "total_value", "value", "pct",
        "start_value", "end_value", "net_contributions", "percentage",
        "covered_pct", "coverage_pct", "net_change", "net_pct",
        "previous_value", "change", "others_change",
    }
    for schema_name, schema in schemas.items():
        if schema_name.endswith(("Response", "Out")):
            for field, definition in schema.get("properties", {}).items():
                if field in money_names:
                    encoded = str(definition)
                    assert "number" not in encoded, (schema_name, field, definition)


def test_generated_golden_fixtures_equal_live_routes():
    destination = Path(__file__).resolve().parents[1] / "fixtures" / "home"
    # Read-only on purpose: writing first and then comparing the file with the same output can never fail.
    generated = write_fixture_set(destination, write=False)
    assert set(generated) == set(REQUESTS)
    for filename, payload in generated.items():
        assert json.loads((destination / filename).read_text(encoding="utf-8")) == payload


def test_home_fixture_semantics():
    root = Path(__file__).resolve().parents[1] / "fixtures" / "home"
    load = lambda name: json.loads((root / name).read_text(encoding="utf-8"))

    family = load("summary_family.json")
    assert family["scope"] == "aggregate"
    assert len(family["members"]) == 2
    assert (family["members_connected"], family["members_total"]) == (2, 2)
    assert family["data_line"] == "Data from 2 of 2 family members"
    assert family["has_holdings"] is True
    assert (family["total_value"], family["change_amount"]) == ("5212.00", "12.00")
    member = load("summary_member.json")
    assert member["scope"] == "member" and member["data_line"] is None
    assert member["scope_label"].endswith("'s portfolio")
    empty = load("summary_empty.json")
    assert (empty["has_holdings"], empty["total_value"], empty["change_amount"]) == (
        False, "0.00", "0.00"
    )
    assert empty["direction"] == "flat" and empty["nav_as_of"] is None
    assert empty["members_connected"] == 0
    partial = load("summary_partial.json")
    assert partial["partial"] is True and len(partial["missing_funds"]) == 1
    assert partial["total_value"] == "4202.00"
    weekend = load("summary_weekend.json")
    assert (weekend["greeting"], weekend["nav_as_of"]) == ("morning", "2026-10-23")
    assert weekend["since_label"] == "since Thursday's close"

    one_day = load("wealth_1d_family.json")
    assert (one_day["change_method"], one_day["change_amount"]) == ("price_only", "12.00")
    assert [point["date"] for point in one_day["points"]] == ["2026-10-22", "2026-10-23"]
    assert one_day["benchmark"] is None
    month = load("wealth_1m_family_benchmark.json")
    assert month["benchmark"]["available"] is True and month["benchmark"]["clipped"] is False
    benchmark_dates = [point["date"] for point in month["benchmark"]["points"]]
    assert benchmark_dates == [
        point["date"] for point in month["points"]
        if point["date"] >= month["benchmark"]["effective_start"]
    ]
    clipped = load("wealth_1y_member_clipped.json")
    assert clipped["benchmark"]["clipped"] is True
    assert clipped["benchmark"]["effective_start"] == "2026-09-01"
    assert clipped["points"][0]["date"] == "2026-08-25"
    empty_range = load("wealth_custom_empty_range.json")
    assert empty_range["empty"] is True and empty_range["points"] == []
    assert (empty_range["start_value"], empty_range["end_value"]) == ("0.00", "0.00")
    wealth_partial = load("wealth_partial.json")
    assert wealth_partial["partial"] is True and len(wealth_partial["missing_funds"]) == 1

    allocation = load("allocation_family.json")
    assert (allocation["source"], allocation["approximate"]) == ("analytics", False)
    assert len(allocation["members"]) == 2
    assert sum((Decimal(row["value"]) for row in allocation["members"]), Decimal("0")) == Decimal(allocation["total_value"])
    assert [row["status"] for row in allocation["classes"]].count("live") == 5
    assert [row["status"] for row in allocation["classes"]].count("coming_soon") == 3
    assert load("allocation_member.json")["members"] is None
    fallback = load("allocation_fallback.json")
    assert (fallback["source"], fallback["approximate"]) == ("dashboard_buckets", True)
    allocation_empty = load("allocation_empty.json")
    assert allocation_empty["total_value"] == "0.00"
    for row in allocation_empty["classes"]:
        if row["status"] == "live":
            assert (row["value"], row["percentage"]) == ("0.00", "0.00")
        else:
            assert row["value"] is None and row["percentage"] is None

    sector = load("movers_sector.json")
    assert (sector["view"], sector["estimated"], sector["fell_back"]) == ("sector", True, False)
    assert Decimal(sector["coverage_pct"]) >= Decimal("50.00")
    category = load("movers_category_fallback.json")
    assert (category["requested_view"], category["view"], category["fell_back"]) == (
        "sector", "category", True
    )
    fund = load("movers_fund.json")
    assert (len(fund["gains"]), len(fund["losses"]), fund["others_count"]) == (2, 1, 1)
    assert all(item["change"] is not None for bar in fund["gains"] + fund["losses"] for item in bar["funds"])
    all_down = load("movers_all_down.json")
    assert all_down["gains"] == [] and all_down["losses"]
    assert Decimal(all_down["net_change"]) < 0
    movers_empty = load("movers_empty.json")
    assert movers_empty["gains"] == movers_empty["losses"] == []
    assert (movers_empty["others_count"], movers_empty["net_change"]) == (0, "0.00")

    cards = load("worth_three_cards.json")
    assert cards["state"] == "cards"
    assert [card["kind"] for card in cards["cards"]] == [
        "weak_fund", "underperforming", "concentration"
    ]
    none = load("worth_none.json")
    assert none["state"] == "nothing_flagged" and none["cards"] == [] and none["unavailable"] == []
    unavailable = load("worth_unavailable.json")
    assert unavailable["state"] == "unavailable"
    assert unavailable["unavailable"] == ["score", "category_ranking", "stock_holdings"]
    earlier = load("worth_concentration_with_earlier.json")
    concentration = next(card for card in earlier["cards"] if card["kind"] == "concentration")
    assert concentration["evidence"]["earlier_top5_pct"] is not None
    assert concentration["evidence"]["earlier_as_of"] is not None

    benchmarks = load("benchmarks_family.json")
    assert [option["index"] for option in benchmarks["options"]] == [
        "nifty_50", "nifty_500", "nifty_largemidcap_250", "nifty_midcap_150",
        "nifty_smallcap_250",
    ]
    assert sum(option["recommended"] for option in benchmarks["options"]) == 1
    assert benchmarks["reason"] == "large_and_mid"
    no_mix = load("benchmarks_no_mix.json")
    assert (no_mix["reason"], no_mix["recommended_index"]) == ("unavailable", "nifty_500")

    # The cases the independent review found wrong (register C101): each fixture pins the corrected value.
    sold = load("wealth_1m_fund_sold_in_period.json")
    assert (sold["start_value"], sold["net_contributions"], sold["change_amount"]) == (
        "115095.60", "-110000.00", "116.40"
    )
    assert sold["partial"] is False
    past = load("wealth_custom_past_range.json")
    assert past["end"] == "2026-10-01" and past["end_value"] == past["points"][-1]["value"] != "5212.00"
    assert past["clamped"] is False
    statement = load("wealth_1m_statement_priced_fund.json")
    assert (statement["start_value"], statement["end_value"], statement["change_amount"]) == (
        "15595.60", "15812.00", "216.40"
    )
    assert statement["partial"] is False and statement["missing_funds"] == []
    summary = load("summary_statement_priced_fund.json")
    assert (summary["total_value"], summary["change_amount"], summary["partial"]) == ("15812.00", "12.00", False)


@pytest.mark.parametrize(
    "variant",
    ["base", "empty", "partial", "no_sections", "no_disclosures",
     "nothing_flagged", "earlier", "all_down"],
)
def test_every_home_variant_reconciles(variant):
    runtime = build_home_fixture(variant=variant)
    try:
        client = runtime.client
        summary = client.get("/household/aggregate/home/summary").json()
        wealth = client.get("/household/aggregate/home/wealth-series?period=1D").json()
        allocation = client.get("/household/aggregate/home/allocation").json()
        for view in ("fund", "category", "sector"):
            movers = client.get(f"/household/aggregate/home/movers?by={view}").json()
            assert Decimal(movers["net_change"]) == _mover_sum(movers)
            assert movers["net_change"] == summary["change_amount"] == wealth["change_amount"]
        assert wealth["end_value"] == summary["total_value"] == allocation["total_value"]
        if wealth["points"]:
            assert wealth["points"][-1]["value"] == wealth["end_value"]
        if allocation["members"]:
            assert sum(
                (Decimal(row["value"]) for row in allocation["members"]), Decimal("0")
            ) == Decimal(allocation["total_value"])
            expected_pct = (
                Decimal("100.00") if Decimal(allocation["total_value"]) else Decimal("0.00")
            )
            assert sum(
                (Decimal(row["percentage"]) for row in allocation["members"]), Decimal("0")
            ) == expected_pct
        assert summary["partial"] == wealth["partial"]
        assert summary["missing_funds"] == wealth["missing_funds"]
        if variant == "no_disclosures":
            fallback = client.get("/household/aggregate/home/movers?by=sector").json()
            assert (fallback["view"], fallback["fell_back"]) == ("category", True)
    finally:
        runtime.close()


def test_home_totals_match_dashboard_rounded_rows_for_aggregate_and_member(monkeypatch):
    import app.services.dashboard.holdings as holdings_module
    from app.models.reference import NavHistory

    async def cached_nav(db, scheme, on_date, **_kwargs):
        row = (
            db.query(NavHistory)
            .filter(NavHistory.scheme_id == scheme.id, NavHistory.date <= on_date)
            .order_by(NavHistory.date.desc())
            .first()
        )
        return None if row is None else (row.nav, row.date)

    monkeypatch.setattr(holdings_module, "get_nav_on_or_before", cached_nav)
    runtime = build_home_fixture()
    try:
        pairs = (
            ("/household/aggregate/home/summary", "/household/aggregate/holdings"),
            (f"/household-members/{runtime.household.dev_id}/home/summary",
             f"/household-members/{runtime.household.dev_id}/holdings"),
        )
        for summary_path, holdings_path in pairs:
            summary = runtime.client.get(summary_path).json()
            rows = runtime.client.get(holdings_path).json()["holdings"]
            # Home shows row-rounded values, so parity follows what a person can add on screen.
            dashboard_total = sum(
                (quantize_amount(Decimal(row["current_value"])) for row in rows
                 if not row["nav_unavailable"] and row["current_value"] is not None),
                Decimal("0.00"),
            )
            assert Decimal(summary["total_value"]) == dashboard_total
    finally:
        runtime.close()


def test_all_home_routes_are_select_only_and_never_recompute(monkeypatch):
    import app.services.analytics.recompute as recompute
    import app.services.dashboard.snapshots as snapshots
    from app.services.analytics.dispatch import dispatcher

    def forbidden(*_args, **_kwargs):
        raise AssertionError("Home GET attempted recompute or snapshot rebuild")

    for name in vars(recompute):
        if name.startswith("compute_"):
            monkeypatch.setattr(recompute, name, forbidden)
    monkeypatch.setattr(snapshots, "rebuild_member_snapshots", forbidden)
    monkeypatch.setattr(dispatcher, "dispatch", forbidden)
    runtime = build_home_fixture()
    statements = []
    listener = lambda _conn, _cursor, statement, _params, _ctx, _many: statements.append(statement)
    event.listen(runtime.engine, "before_cursor_execute", listener)
    try:
        for path in _all_home_paths(runtime.household):
            response = runtime.client.get(path)
            assert response.status_code == 200, (path, response.text)
        assert statements
        assert {statement.lstrip().split(None, 1)[0].upper() for statement in statements} == {"SELECT"}
    finally:
        event.remove(runtime.engine, "before_cursor_execute", listener)
        runtime.close()


def test_home_statement_counts_do_not_grow_with_fund_count():
    counts = []
    for fund_count in (3, 9):
        runtime = build_home_fixture(fund_count=fund_count)
        try:
            # Measure route composition after the shared holdings cache is warm; the
            # Dashboard loader itself is outside HB5 and has its own cold-load tests.
            runtime.client.get("/household/aggregate/home/summary")
            runtime.client.get(
                f"/household-members/{runtime.household.dev_id}/home/summary"
            )
            route_counts = []
            for path in _all_home_paths(runtime.household):
                statements = []
                listener = lambda _conn, _cursor, statement, _params, _ctx, _many: statements.append(statement)
                event.listen(runtime.engine, "before_cursor_execute", listener)
                try:
                    response = runtime.client.get(path)
                    assert response.status_code == 200, (path, response.text)
                finally:
                    event.remove(runtime.engine, "before_cursor_execute", listener)
                route_counts.append(sum(statement.lstrip().upper().startswith("SELECT") for statement in statements))
            counts.append(route_counts)
        finally:
            runtime.close()
    assert counts[0] == counts[1]


def test_home_query_validation_and_future_clamp(home_client):
    client, _household = home_client
    assert client.get("/household/aggregate/home/wealth-series?period=custom").status_code == 422
    assert client.get(
        "/household/aggregate/home/wealth-series?period=custom&from=2026-10-20&to=2026-10-01"
    ).status_code == 422
    assert client.get(
        "/household/aggregate/home/wealth-series?benchmark=nifty_next_50"
    ).status_code == 422
    clamped = client.get(
        "/household/aggregate/home/wealth-series?period=custom&from=2026-10-01&to=2027-01-01"
    ).json()
    assert clamped["clamped"] is True
    assert clamped["end"] == clamped["nav_as_of"] == "2026-10-23"


def test_display_name_rules_and_greeting_boundaries():
    runtime = build_home_fixture()
    try:
        assert runtime.client.get("/household/aggregate/home/summary").json()["display_name"] == "Asha"
        generator = runtime.client.app.dependency_overrides[get_db]()
        db = next(generator)
        try:
            self_member = db.query(HouseholdMember).filter(
                HouseholdMember.id == runtime.household.asha_id
            ).one()
            self_member.relationship = Relationship.PARENT
            db.commit()
        finally:
            generator.close()
        assert runtime.client.get("/household/aggregate/home/summary").json()["display_name"] == "Asha"

        expected = ((11, 59, "morning"), (12, 0, "afternoon"),
                    (16, 59, "afternoon"), (17, 0, "evening"))
        for hour, minute, greeting in expected:
            now = FIXED_NOW.replace(hour=hour, minute=minute)
            runtime.client.app.dependency_overrides[get_now_ist] = lambda now=now: now
            assert runtime.client.get("/household/aggregate/home/summary").json()["greeting"] == greeting
    finally:
        runtime.close()

    empty_runtime = build_home_fixture(variant="empty")
    try:
        generator = empty_runtime.client.app.dependency_overrides[get_db]()
        db = next(generator)
        try:
            db.query(HouseholdMember).delete()
            db.commit()
        finally:
            generator.close()
        assert empty_runtime.client.get("/household/aggregate/home/summary").json()["display_name"] == ""
    finally:
        empty_runtime.close()


def _edit_db(runtime, work):
    generator = runtime.client.app.dependency_overrides[get_db]()
    db = next(generator)
    try:
        work(db)
        db.commit()
    finally:
        generator.close()
    _holdings_cache.clear()


def test_wealth_period_ends_on_the_nav_date_not_the_calendar_date():
    monday = FIXED_NOW.replace(day=26, hour=10, minute=0)
    runtime = build_home_fixture(now=monday)
    try:
        body = runtime.client.get("/household/aggregate/home/wealth-series?period=1D").json()
        assert body["end"] == body["nav_as_of"] == "2026-10-23"
        assert body["points"][-1]["date"] == "2026-10-23"
    finally:
        runtime.close()


def test_display_name_prefers_the_self_member_over_the_oldest_member():
    runtime = build_home_fixture()
    try:
        def swap(db):
            members = {member.id: member for member in db.query(HouseholdMember).all()}
            members[runtime.household.asha_id].relationship = Relationship.PARENT
            members[runtime.household.dev_id].relationship = Relationship.SELF

        _edit_db(runtime, swap)
        assert runtime.client.get("/household/aggregate/home/summary").json()["display_name"] == "Dev"
    finally:
        runtime.close()


def test_computed_at_is_the_clock_instant_in_utc():
    runtime = build_home_fixture()
    try:
        value = runtime.client.get("/household/aggregate/home/summary").json()["computed_at"]
        assert value.endswith("Z")
        assert datetime.fromisoformat(value.replace("Z", "+00:00")) == FIXED_NOW
        assert value == "2026-10-23T13:00:00Z"
    finally:
        runtime.close()


def test_members_are_listed_in_the_order_they_were_created_not_by_id():
    runtime = build_home_fixture()
    try:
        first_by_id = sorted([runtime.household.asha_id, runtime.household.dev_id], key=str)[0]

        def reorder(db):
            for member in db.query(HouseholdMember).all():
                # the member with the smaller id is created last, so id order and creation order differ
                member.created_at = datetime(2026, 1, 9 if member.id == first_by_id else 2, tzinfo=timezone.utc)

        _edit_db(runtime, reorder)
        names = [member["name"] for member in runtime.client.get(
            "/household/aggregate/home/summary"
        ).json()["members"]]
        expected_first = "Dev Rao" if first_by_id == runtime.household.asha_id else "ASHA RAO"
        assert names[0] == expected_first
        assert len(names) == 2
    finally:
        runtime.close()


def test_a_fund_priced_earlier_than_the_rest_is_named_as_missing_on_every_route():
    runtime = build_home_fixture()
    try:
        def age_gold(db):
            db.query(NavHistory).filter(
                NavHistory.scheme_id == uid("scheme-gold"), NavHistory.date > date(2026, 10, 19)
            ).delete()

        _edit_db(runtime, age_gold)
        for path in ("summary", "wealth-series?period=1M", "movers?by=fund"):
            body = runtime.client.get(f"/household/aggregate/home/{path}").json()
            assert body["partial"] is True, path
            assert [fund["name"] for fund in body["missing_funds"]] == ["Dev Gold Fund"], path
    finally:
        runtime.close()


def test_benchmark_line_uses_total_return_levels_not_price_levels():
    runtime = build_home_fixture()
    try:
        def add_price_levels(db):
            # Price levels on days the total-return series has no row (weekends) with absurd values:
            # if the query ignored the return type they would show up as extra, wrong points.
            day = date(2025, 10, 1)
            while day <= date(2026, 10, 23):
                if day.weekday() >= 5:
                    db.add(BenchmarkIndexHistory(
                        index_name=BenchmarkIndex.NIFTY_50, date=day,
                        return_type=BenchmarkReturnType.PRICE, value=Decimal("1.00"),
                    ))
                day += timedelta(days=1)

        _edit_db(runtime, add_price_levels)
        body = runtime.client.get(
            "/household/aggregate/home/wealth-series?period=1M&benchmark=nifty_50"
        ).json()
        assert body["benchmark"]["pct"] == "0.2145"
        by_date = {point["date"]: point["pct"] for point in body["benchmark"]["points"]}
        assert by_date["2026-10-17"] == by_date["2026-10-16"]
        assert by_date["2026-10-18"] == by_date["2026-10-16"]
    finally:
        runtime.close()


def test_benchmark_start_on_a_weekend_uses_the_last_level_before_it_and_is_not_clipped():
    runtime = build_home_fixture()
    try:
        body = runtime.client.get(
            "/household/aggregate/home/wealth-series?period=custom&from=2026-09-19&to=2026-10-23&benchmark=nifty_50"
        ).json()
        assert body["benchmark"]["clipped"] is False
        assert body["benchmark"]["effective_start"] == "2026-09-19"
    finally:
        runtime.close()


def test_sector_bars_carry_no_per_fund_change_and_fund_bars_do():
    runtime = build_home_fixture()
    try:
        sector = runtime.client.get("/household/aggregate/home/movers?by=sector").json()
        bars = sector["gains"] + sector["losses"]
        assert bars and all(fund["change"] is None for bar in bars for fund in bar["funds"])
        fund_view = runtime.client.get("/household/aggregate/home/movers?by=fund").json()
        bars = fund_view["gains"] + fund_view["losses"]
        assert bars and all(fund["change"] is not None for bar in bars for fund in bar["funds"])
    finally:
        runtime.close()


def test_one_point_first_purchase_redemption_and_missing_nav_series():
    one_point = build_home_fixture(variant="one_nav")
    try:
        body = one_point.client.get("/household/aggregate/home/wealth-series?period=1D").json()
        assert len(body["points"]) == 1
    finally:
        one_point.close()

    base = build_home_fixture()
    try:
        body = base.client.get(
            f"/household-members/{base.household.dev_id}/home/wealth-series?period=1Y"
        ).json()
        assert body["start_value"] == "0.00"
        assert body["net_contributions"] == "3000.00"
        assert body["change_amount"] == "12.00"
    finally:
        base.close()

    redemption = build_home_fixture(variant="redemption")
    try:
        body = redemption.client.get(
            "/household/aggregate/home/wealth-series?period=1M"
        ).json()
        assert body["net_contributions"] == "-115.00"
        assert body["change_amount"] == "110.40"
    finally:
        redemption.close()

    partial = build_home_fixture(variant="partial")
    try:
        body = partial.client.get("/household/aggregate/home/wealth-series?period=1M").json()
        assert body["partial"] is True
        assert [fund["name"] for fund in body["missing_funds"]] == ["Dev Gold Fund"]
    finally:
        partial.close()


def test_synthetic_gate_collects_every_scenario_after_a_failure(monkeypatch, tmp_path):
    import scripts.home_synthetic_gate as gate

    calls = []

    def fake_run(_source, _directory, scenario):
        calls.append(scenario)
        return gate.ScenarioResult(
            scenario=scenario,
            lines=(f"{scenario} identity: {'FAIL' if scenario == 'bad' else 'PASS'}",),
            checks={"identity": scenario != "bad"},
        )

    monkeypatch.setattr(gate, "_run_scenario", fake_run)
    results = gate._run_all_scenarios(tmp_path / "source.db", tmp_path, ("bad", "good"))
    assert calls == ["bad", "good"]
    assert [result.passed for result in results] == [False, True]
