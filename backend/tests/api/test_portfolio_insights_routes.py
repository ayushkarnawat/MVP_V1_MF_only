import re
import uuid
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import pytest
from sqlalchemy import event

from app.db.session import get_db
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.transaction_import import TransactionImport
from app.services.dashboard.holdings import _holdings_cache
from tests.api.home_fixture import build_home_fixture, uid

APP_ROOT = Path(__file__).resolve().parents[2]


def seed_insight_sips(runtime) -> None:
    """Deterministic SIP data on the home fixture.

    ASHA: one 5,000.00 SIP on the Large Cap fund (15th of Aug, Sep, Oct).
    Dev: two parallel 2,000.00 twins on the Debt fund (5th and 6th of Sep and Oct, so each month has two).
    Expected: 3 active SIPs, 9,000.00 a month (the twins count twice).

    Every transaction also gets a `transaction_imports` row pointing at the member's confirmed import
    (statement end 2026-10-23): `compute_active_sips` measures recency against that, and falls back to the real
    `date.today()` without it, which would make these tests rot as the calendar moves.
    """
    db = next(runtime.client.app.dependency_overrides[get_db]())
    plan = [
        ("asha", "large", "ASHA RAO", "5000.00", [date(2026, 8, 15), date(2026, 9, 15), date(2026, 10, 15)]),
        ("dev", "debt", "Dev Rao", "2000.00",
         [date(2026, 9, 5), date(2026, 9, 6), date(2026, 10, 5), date(2026, 10, 6)]),
    ]
    for tag, fund, member_name, amount, days in plan:
        folio_id = uid(f"folio-{fund}")
        import_id = uid(f"import-{member_name}")
        for day in days:
            txn_id = uid(f"sip-{tag}-{fund}-{day.isoformat()}")
            db.add(Transaction(
                id=txn_id, folio_id=folio_id, import_id=import_id, type=TransactionType.PURCHASE_SIP,
                date=day, amount=Decimal(amount), units=Decimal("1.000"), nav=Decimal(amount),
            ))
            db.flush()
            db.add(TransactionImport(transaction_id=txn_id, transaction_date=day, import_id=import_id))
    db.commit()
    db.close()
    _holdings_cache.clear()


@pytest.fixture()
def seeded():
    runtime = build_home_fixture()
    seed_insight_sips(runtime)
    yield runtime
    runtime.close()


def _paths(household):
    return {
        "aggregate": "/household/aggregate/portfolio-insights",
        "asha": f"/household-members/{household.asha_id}/portfolio-insights",
        "dev": f"/household-members/{household.dev_id}/portfolio-insights",
    }


def test_aggregate_shape_and_values(seeded):
    body = seeded.client.get(_paths(seeded.household)["aggregate"]).json()
    assert list(body)[:6] == ["scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at"]
    assert body["scope"] == "aggregate" and body["member_id"] is None
    assert [m["name"] for m in body["members"]] == ["ASHA RAO", "Dev Rao"]
    assert body["empty"] is False and body["empty_reason"] is None
    ins = body["insights"]
    assert ins["spread"] == {"fund_count": 4, "amc_count": 1}
    assert ins["sips"] == {"active_count": 3, "monthly_total": "9000.00"}
    assert ins["largest_amc"]["amc_name"] == "Home Test AMC" and ins["largest_amc"]["fund_count"] == 4
    assert ins["largest_amc"]["value"] == body["total_value"]
    assert ins["largest_amc"]["pct_of_portfolio"] == "100.0000"
    split = ins["plan_split"]
    assert Decimal(split["direct"]["value"]) + Decimal(split["regular"]["value"]) + Decimal(
        split["unclassified"]["value"]) == Decimal(body["total_value"])
    assert ins["largest_holding"]["fund_name"]


def test_member_scope_values(seeded):
    paths = _paths(seeded.household)
    asha = seeded.client.get(paths["asha"]).json()
    dev = seeded.client.get(paths["dev"]).json()
    for body in (asha, dev):
        assert body["scope"] == "member" and body["members"] is None
    assert asha["insights"]["spread"]["fund_count"] == 2
    assert asha["insights"]["sips"] == {"active_count": 1, "monthly_total": "5000.00"}
    assert dev["insights"]["spread"]["fund_count"] == 2
    assert dev["insights"]["sips"] == {"active_count": 2, "monthly_total": "4000.00"}
    aggregate = seeded.client.get(paths["aggregate"]).json()
    assert Decimal(asha["total_value"]) + Decimal(dev["total_value"]) == Decimal(aggregate["total_value"])


@pytest.mark.parametrize("variant", ["base", "partial", "redemption", "all_down"])
def test_parity_with_summary_holdings_and_sips(variant, monkeypatch):
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
    runtime = build_home_fixture(variant=variant)
    seed_insight_sips(runtime)
    try:
        client, household = runtime.client, runtime.household
        for root in ("/household/aggregate", f"/household-members/{household.asha_id}",
                     f"/household-members/{household.dev_id}"):
            body = client.get(f"{root}/portfolio-insights").json()
            summary = client.get(f"{root}/portfolio-summary").json()
            assert body["total_value"] == summary["total_value"], root
            assert body["partial"] == summary["partial"]
            assert body["missing_funds"] == summary["missing_funds"]

            holdings = client.get(f"{root}/holdings").json()["holdings"]
            per_scheme = {}
            for row in holdings:
                if row["nav_unavailable"] or row["current_value"] is None or Decimal(row["units_held"]) <= 0:
                    continue
                per_scheme[row["scheme_id"]] = per_scheme.get(row["scheme_id"], Decimal("0.00")) + Decimal(
                    row["current_value"]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if per_scheme:
                assert body["insights"]["largest_holding"]["value"] == str(max(per_scheme.values()))
                assert body["insights"]["spread"]["fund_count"] == len(per_scheme)
            else:
                assert body["empty"] is True

            sips = client.get(f"{root}/sips").json()
            sips = sips["sips"] if isinstance(sips, dict) else sips
            assert body["insights"]["sips"]["active_count"] == sum(row["series_count"] for row in sips)
            assert Decimal(body["insights"]["sips"]["monthly_total"]) == sum(
                (Decimal(row["sip_amount"]) * row["series_count"] for row in sips), Decimal("0.00"))
    finally:
        runtime.close()


@pytest.mark.parametrize("suffix_root", ["/household/aggregate"])
def test_requires_authentication(client, suffix_root):
    assert client.get(f"{suffix_root}/portfolio-insights").status_code == 401


def test_foreign_member_is_404_with_the_same_body_as_portfolio_summary(seeded):
    for foreign in (uuid.uuid4(), uid("not-my-member")):
        insights = seeded.client.get(f"/household-members/{foreign}/portfolio-insights")
        summary = seeded.client.get(f"/household-members/{foreign}/portfolio-summary")
        assert insights.status_code == 404 == summary.status_code
        assert insights.json() == summary.json() == {"detail": "Household member not found."}


def test_empty_household_is_200_with_no_holdings():
    runtime = build_home_fixture(variant="empty")
    try:
        body = runtime.client.get("/household/aggregate/portfolio-insights").json()
        assert body["empty"] is True and body["empty_reason"] == "no_holdings"
        assert body["total_value"] == "0.00"
        assert body["insights"]["largest_holding"] is None
        assert body["insights"]["plan_split"] is None and body["insights"]["largest_amc"] is None
        assert body["insights"]["spread"] == {"fund_count": 0, "amc_count": 0}
        assert body["insights"]["sips"] == {"active_count": 0, "monthly_total": "0.00"}
        assert len(body["members"]) == 2 and all(m["has_data"] is False for m in body["members"])
    finally:
        runtime.close()


def test_member_with_no_data_is_empty_and_flagged_in_aggregate():
    runtime = build_home_fixture(fund_count=2)  # both funds belong to ASHA, so Dev has nothing
    try:
        household = runtime.household
        dev = runtime.client.get(f"/household-members/{household.dev_id}/portfolio-insights")
        assert dev.status_code == 200
        assert dev.json()["empty"] is True and dev.json()["empty_reason"] == "no_holdings"
        assert dev.json()["insights"]["sips"] == {"active_count": 0, "monthly_total": "0.00"}
        aggregate = runtime.client.get("/household/aggregate/portfolio-insights").json()
        # `has_data` is the shared members rule (a member with a confirmed import), not "has priced holdings":
        # Dev has an import but no funds, so it is True here yet his scope is empty. It matches the other routes.
        summary = runtime.client.get("/household/aggregate/portfolio-summary").json()
        assert aggregate["members"] == summary["members"]
        assert aggregate["empty"] is False
    finally:
        runtime.close()


def test_partial_no_nav_fund_is_named_and_excluded():
    runtime = build_home_fixture(variant="partial")
    try:
        body = runtime.client.get("/household/aggregate/portfolio-insights").json()
        assert body["partial"] is True
        assert [fund["name"] for fund in body["missing_funds"]] == ["Dev Gold Fund"]
        assert body["insights"]["spread"]["fund_count"] == 3
        assert body["total_value"] == runtime.client.get("/household/aggregate/portfolio-summary").json()["total_value"]
    finally:
        runtime.close()


def test_route_never_writes_and_never_recomputes(monkeypatch):
    import app.services.analytics.recompute as recompute
    import app.services.dashboard.snapshots as snapshots
    from app.services.analytics.dispatch import dispatcher

    def forbidden(*_args, **_kwargs):
        raise AssertionError("Portfolio insights GET attempted recompute or snapshot rebuild")

    for name in vars(recompute):
        if name.startswith("compute_"):
            monkeypatch.setattr(recompute, name, forbidden)
    monkeypatch.setattr(snapshots, "rebuild_member_snapshots", forbidden)
    monkeypatch.setattr(dispatcher, "dispatch", forbidden)
    runtime = build_home_fixture()
    seed_insight_sips(runtime)
    statements = []
    listener = lambda _conn, _cursor, statement, _params, _ctx, _many: statements.append(statement)
    event.listen(runtime.engine, "before_cursor_execute", listener)
    try:
        for path in _paths(runtime.household).values():
            response = runtime.client.get(path)
            assert response.status_code == 200, (path, response.text)
        assert statements
        assert {statement.lstrip().split(None, 1)[0].upper() for statement in statements} == {"SELECT"}
    finally:
        event.remove(runtime.engine, "before_cursor_execute", listener)
        runtime.close()


def test_statement_counts_do_not_grow_with_fund_count():
    counts = []
    for fund_count in (3, 9):
        runtime = build_home_fixture(fund_count=fund_count)
        try:
            seed_insight_sips(runtime)
            # Warm the shared holdings cache first, as the Portfolio test does.
            for root in ("/household/aggregate", f"/household-members/{runtime.household.asha_id}",
                         f"/household-members/{runtime.household.dev_id}"):
                runtime.client.get(f"{root}/portfolio-summary")
            route_counts = []
            for path in _paths(runtime.household).values():
                statements = []
                listener = lambda _conn, _cursor, statement, _params, _ctx, _many: statements.append(statement)
                event.listen(runtime.engine, "before_cursor_execute", listener)
                try:
                    response = runtime.client.get(path)
                    assert response.status_code == 200, (path, response.text)
                finally:
                    event.remove(runtime.engine, "before_cursor_execute", listener)
                route_counts.append(sum(s.lstrip().upper().startswith("SELECT") for s in statements))
            counts.append(route_counts)
        finally:
            runtime.close()
    assert counts[0] == counts[1]


def test_openapi_registers_both_paths_and_money_fields_are_strings(client):
    spec = client.get("/openapi.json").json()
    paths = spec["paths"]
    for path in ("/household/aggregate/portfolio-insights", "/household-members/{member_id}/portfolio-insights"):
        assert paths[path]["get"]["tags"] == ["portfolio"]
        # No query parameters (the auth header and the path id are the only ones).
        assert all(p["in"] in {"path", "header"} for p in paths[path]["get"].get("parameters", []))
    money = {"total_value", "value", "pct", "pct_of_portfolio", "monthly_total"}
    checked = 0
    for name, schema in spec["components"]["schemas"].items():
        if name in {"PortfolioInsightsResponse", "LargestHoldingOut", "PlanSplitEntryOut", "LargestAmcOut",
                    "SipInsightOut"}:
            for field, definition in schema["properties"].items():
                if field in money:
                    assert "number" not in str(definition), (name, field, definition)
                    checked += 1
    assert checked == 8


def test_no_float_in_the_new_modules():
    for relative in ("app/api/portfolio_insights.py", "app/services/dashboard/portfolio_insights.py",
                     "app/services/dashboard/portfolio_insights_schemas.py"):
        source = (APP_ROOT / relative).read_text(encoding="utf-8")
        assert not re.search(r"\bfloat\b", source), relative
