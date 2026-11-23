from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from time import perf_counter
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.home import get_now_ist
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.enums import ImportStatus, PlanType, SchemePlanType, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme, SchemeFundManager
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_current_user
from app.services.dashboard.holdings import compute_holdings, _holdings_cache
from app.services.search.index import build_search_index

NOW = datetime(2026, 11, 23, 10, tzinfo=timezone(timedelta(hours=5, minutes=30)))


def seed_search_household(db: Session, count: int = 3):
    user = User(id=uuid4(), phone_number=f"+91{uuid4().int % 10**10:010d}", created_at=NOW)
    db.add(user)
    db.flush()
    members = [HouseholdMember(id=uuid4(), user_id=user.id, name=name,
                              created_at=NOW + timedelta(seconds=i))
               for i, name in enumerate(("Asha Example", "Dev Example"))]
    db.add_all(members)
    db.flush()
    imported = Import(id=uuid4(), household_member_id=members[0].id,
                      status=ImportStatus.CONFIRMED, uploaded_at=NOW)
    db.add(imported)
    db.flush()
    schemes = []
    for i in range(count):
        scheme = Scheme(id=uuid4(), name=f"Example Fund {i:02d}", amc_name="Example AMC",
                        sebi_category="Equity Scheme - Flexi Cap Fund",
                        plan_type=SchemePlanType.DIRECT)
        db.add(scheme)
        db.flush()
        schemes.append(scheme)
        for member in (members if i == 0 else members[:1]):
            folio = Folio(id=uuid4(), household_member_id=member.id, scheme_id=scheme.id,
                          folio_number=f"SYNTH-{uuid4().hex}", plan_type=PlanType.DIRECT)
            db.add(folio)
            db.flush()
            db.add(Transaction(id=uuid4(), folio_id=folio.id, import_id=imported.id,
                               type=TransactionType.PURCHASE_SIP if member == members[0] and i < 2 else TransactionType.PURCHASE,
                               date=date(2026, 11, 5), amount=Decimal("1000"),
                               units=Decimal("100"), nav=Decimal("10")))
            if i == 1:
                db.add(Transaction(id=uuid4(), folio_id=folio.id, import_id=imported.id,
                                   type=TransactionType.REDEMPTION, date=date(2026, 11, 10),
                                   amount=Decimal("1000"), units=Decimal("100"), nav=Decimal("10")))
    db.flush()
    return SimpleNamespace(user=user, members=members, schemes=schemes)


@pytest.fixture
def household():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    with Session(engine, autoflush=False, expire_on_commit=False) as db:
        family = seed_search_household(db)
        db.commit()
        overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: family.user
        app.dependency_overrides[get_now_ist] = lambda: NOW
        client = TestClient(app)
        try:
            yield SimpleNamespace(**vars(family), db=db, engine=engine, client=client)
        finally:
            client.close()
            app.dependency_overrides.clear()
            app.dependency_overrides.update(overrides)
            _holdings_cache.clear()
    engine.dispose()


def response(household):
    result = household.client.get("/household/search-index")
    assert result.status_code == 200, result.text
    return result.json()


def assert_family_shape(body, family):
    assert set(body) == {"generated_at", "funds"}
    assert datetime.fromisoformat(body["generated_at"]).utcoffset() == timedelta(hours=5, minutes=30)
    funds = body["funds"]
    assert [f["name"] for f in funds] == [s.name for s in family.schemes]
    assert [h["member_id"] for h in funds[0]["holders"]] == [str(m.id) for m in family.members]
    assert [h["member_name"] for h in funds[0]["holders"]] == [m.name for m in family.members]
    assert funds[0]["holders"][0] == dict(member_id=str(family.members[0].id), member_name="Asha Example",
                                         state="open", sip={"status": "active", "next_due_date": "2026-12-05"})
    assert funds[0]["holders"][1]["sip"] is None
    assert funds[1]["holders"][0]["state"] == "sold"
    assert funds[1]["holders"][0]["sip"] == {"status": "stopped", "next_due_date": None}
    assert funds[2]["main_manager"] is None


def test_requires_sign_in_401_403_pending_deletion_and_reconsent(household, monkeypatch):
    app.dependency_overrides.pop(get_current_user)
    assert household.client.get("/household/search-index").status_code == 401
    app.dependency_overrides[get_current_user] = lambda: household.user
    household.user.pending_deletion = True
    assert household.client.get("/household/search-index").status_code == 403
    household.user.pending_deletion = False
    from app.services.auth import head_change_consent
    monkeypatch.setattr(head_change_consent, "consent_outdated_reason", lambda *_: "head_change")
    result = household.client.get("/household/search-index")
    assert result.status_code == 403
    assert result.json()["detail"]["code"] == "reconsent_required"


def test_household_only_second_user_never_appears(household):
    other = seed_search_household(household.db)
    household.db.commit()
    body = response(household)
    assert {f["scheme_id"] for f in body["funds"]} == {str(s.id) for s in household.schemes}
    assert not {str(m.id) for m in other.members} & {h["member_id"] for f in body["funds"] for h in f["holders"]}


def test_shape_family_of_two_three_funds_holders_states_sip_next_due(household):
    assert_family_shape(response(household), household)


def test_sold_fund_including_sold_at_same_price(household):
    assert response(household)["funds"][1]["holders"][0]["state"] == "sold"


def test_matches_compute_holdings_open_funds(household):
    rows = asyncio.run(compute_holdings(household.db, [m.id for m in household.members], stored_only=True))
    expected = {(r.scheme_id, r.household_member_id) for r in rows if Decimal(r.units_held) > 0}
    actual = {(f["scheme_id"], h["member_id"]) for f in response(household)["funds"]
              for h in f["holders"] if h["state"] == "open"}
    assert actual == expected


def test_no_pricing_and_read_only(household, monkeypatch):
    from app.services.dashboard import nav
    def forbidden(*args, **kwargs):
        pytest.fail("NAV fetch called")
    monkeypatch.setattr(nav, "_fetch_nav_history", forbidden)
    statements = []
    def listener(conn, cursor, statement, *args):
        statements.append(statement)
    event.listen(household.engine, "before_cursor_execute", listener)
    try:
        response(household)
    finally:
        event.remove(household.engine, "before_cursor_execute", listener)
    assert statements
    assert all(s.lstrip().upper().startswith("SELECT") for s in statements)
    assert all("nav_history" not in s.lower() for s in statements)


def test_query_count_fixed_for_3_and_40_funds(household, capsys):
    large = seed_search_household(household.db, 40)
    household.db.commit()
    counts = []
    for family in (household, large):
        app.dependency_overrides[get_current_user] = lambda: family.user
        statements = []
        def listener(conn, cursor, statement, *args):
            statements.append(statement)
        event.listen(household.engine, "before_cursor_execute", listener)
        start = perf_counter()
        try:
            body = response(household)
        finally:
            event.remove(household.engine, "before_cursor_execute", listener)
        elapsed = (perf_counter() - start) * 1000
        assert len(body["funds"]) == len(family.schemes)
        counts.append(len(statements))
        with capsys.disabled():
            print(f"search-index: funds={len(body['funds'])}, queries={len(statements)}, elapsed_ms={elapsed:.3f}")
    assert counts[0] == counts[1]
    assert counts[0] <= 12


def test_main_manager_parity_with_allocation_page_and_old_period_ignored_and_none_is_null(household, monkeypatch):
    from app.services.analytics import fund_manager_allocation as allocation
    from app.services.dashboard.allocation_labels import asset_class_bucket
    scheme = household.schemes[0]
    rows = [SchemeFundManager(scheme_id=scheme.id, manager_name=name, role=role,
                             sequence_order=order, reference_period=period, match_method="MANUAL")
            for name, role, order, period in (
                ("Arun Example", "Debt Fund Manager", 1, date(2026, 11, 1)),
                ("Bela Example", "Equity Fund Manager", 2, date(2026, 11, 1)),
                ("Old Example", "Lead Fund Manager", 0, date(2026, 10, 1)))]
    household.db.add_all(rows)
    household.db.add(SchemeFundManager(scheme_id=household.schemes[1].id, manager_name="Stale Example",
                                     sequence_order=0, reference_period=date(2026, 8, 1), match_method="MANUAL"))
    household.db.commit()
    async def holdings(*args):
        return [SimpleNamespace(scheme_id=str(scheme.id), scheme_name=scheme.name, amc_name=scheme.amc_name,
                                sebi_category=scheme.sebi_category, asset_class=asset_class_bucket(scheme.sebi_category),
                                current_value="1000")]
    class FixedDate(date):
        @classmethod
        def today(cls):
            return NOW.date()
    monkeypatch.setattr(allocation, "date", FixedDate)
    monkeypatch.setattr(allocation, "compute_holdings", holdings)
    expected = asyncio.run(allocation.compute_fund_manager_allocation(household.db, [m.id for m in household.members]))
    assert expected.manager_groups[0].manager_name == "Bela Example"
    funds = response(household)["funds"]
    assert funds[0]["main_manager"] == expected.manager_groups[0].manager_name
    assert funds[1]["main_manager"] is None
    assert funds[2]["main_manager"] is None


def test_response_has_no_amounts_units_prices_folios(household):
    for fund in response(household)["funds"]:
        assert set(fund) == {"scheme_id", "name", "amc_name", "sebi_category", "plan_type", "main_manager", "holders"}
        assert fund["plan_type"] == "direct"
        for holder in fund["holders"]:
            assert set(holder) == {"member_id", "member_name", "state", "sip"}
            if holder["sip"]:
                assert set(holder["sip"]) == {"status", "next_due_date"}


def test_empty_household_and_unknown_scheme_plan(household):
    household.schemes[2].plan_type = None
    folio = household.db.query(Folio).filter_by(scheme_id=household.schemes[2].id).one()
    folio.plan_type = PlanType.UNCLASSIFIED
    household.db.commit()
    assert response(household)["funds"][2]["plan_type"] == "unclassified"
    other = User(id=uuid4(), phone_number="+919000000009", created_at=NOW)
    household.db.add(other)
    household.db.commit()
    assert build_search_index(household.db, other.id, NOW.date()).funds == []


def test_service_contract_without_http(household, monkeypatch, capsys):
    from app.services.dashboard import nav
    def forbidden(*args, **kwargs):
        pytest.fail("NAV fetch called")
    monkeypatch.setattr(nav, "_fetch_nav_history", forbidden)
    other = seed_search_household(household.db, 40)
    household.db.commit()
    measurements = []
    for family in (household, other):
        statements = []
        def listener(conn, cursor, statement, *args):
            statements.append(statement)
        event.listen(household.engine, "before_cursor_execute", listener)
        start = perf_counter()
        try:
            body = build_search_index(household.db, family.user.id, NOW.date()).model_dump(mode="json")
        finally:
            event.remove(household.engine, "before_cursor_execute", listener)
        elapsed = (perf_counter() - start) * 1000
        assert len(body["funds"]) == len(family.schemes)
        assert {f["scheme_id"] for f in body["funds"]} == {str(s.id) for s in family.schemes}
        assert all(s.lstrip().upper().startswith("SELECT") and "nav_history" not in s.lower() for s in statements)
        measurements.append(len(statements))
        with capsys.disabled():
            print(f"search service: funds={len(body['funds'])}, queries={len(statements)}, elapsed_ms={elapsed:.3f}")
        if family is household:
            assert_family_shape(body, household)
            with capsys.disabled():
                print("Actual service payload: " + json.dumps(body))
    assert measurements[0] == measurements[1]
    assert measurements[0] <= 11


def test_service_manager_orientation_freshness_and_unknown_plan(household):
    household.db.add_all([
        SchemeFundManager(scheme_id=household.schemes[i].id, manager_name=name, role=role,
                          sequence_order=order, reference_period=period, match_method="MANUAL",
                          managing_since=since)
        for i, name, role, order, period, since in (
            (0, "Arun Example", "Debt Fund Manager", 1, date(2026, 11, 1), None),
            (0, "Bela Example", "Equity Fund Manager", 2, date(2026, 11, 1), None),
            (0, "Old Example", "Lead Fund Manager", 0, date(2026, 10, 1), None),
            (0, "Future Example", "Lead Fund Manager", 0, date(2026, 11, 1), date(2099, 1, 1)),
            (1, "Stale Example", None, 0, date(2026, 8, 1), None),
            (2, "Boundary Example", None, 0, date(2026, 9, 1), None),
        )
    ])
    household.schemes[2].plan_type = None
    household.db.commit()
    funds = build_search_index(household.db, household.user.id, NOW.date()).funds
    assert [f.main_manager for f in funds] == ["Bela Example", None, "Boundary Example"]
    assert funds[2].plan_type == "unclassified"
