import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import ImportStatus, PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.import_.reconciliation import cas_closings, reconcile_members


def _db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False)()


def _raw(folio, scheme, isin, close, nav="10.0000", nav_date="2026-10-05"):
    return {"folios": [{"folio": folio, "amc": "AMC", "PAN": None, "schemes": [
        {"scheme": scheme, "isin": isin, "amfi": "100001", "open": "0", "close": close,
         "valuation": {"date": nav_date, "nav": nav, "value": "0", "cost": "0"}, "transactions": []}]}]}


def _setup(db, folio_number="4400918/3"):
    user = User(id=uuid.uuid4(), phone_number="+919999999999", created_at=datetime.now(timezone.utc))
    db.add(user)
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Me", relationship=Relationship.SELF,
                             created_at=datetime.now(timezone.utc))
    scheme = Scheme(id=uuid.uuid4(), amfi_code="100001", isin="INF000A01", name="Nippon Small Cap - Regular - Growth",
                    amc_name="Nippon", sebi_category="Equity Scheme - Small Cap Fund")
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id,
                  folio_number=folio_number, plan_type=PlanType.REGULAR)
    db.add_all([member, scheme, folio])
    db.flush()
    return member, scheme, folio


def _import(db, member, raw, statement_to, confirmed_at=None):
    imp = Import(id=uuid.uuid4(), household_member_id=member.id, status=ImportStatus.CONFIRMED,
                 raw_parser_output=raw, uploaded_at=datetime.now(timezone.utc),
                 confirmed_at=confirmed_at or datetime.now(timezone.utc), statement_to_date=statement_to)
    db.add(imp)
    db.flush()
    return imp


def _buy(db, folio, imp, units, on=date(2020, 1, 1)):
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=imp.id, type=TransactionType.PURCHASE,
                       date=on, amount=Decimal("1000.00"), units=Decimal(units), nav=Decimal("10.0000")))
    db.flush()


def test_cas_closings_reads_close_and_valuation():
    rows = cas_closings(_raw("1/2", "X Fund", "INF1", "12.345", nav="20.5000"))
    assert rows == [{"folio": "1/2", "scheme": "X Fund", "isin": "INF1", "amfi": "100001",
                     "close": Decimal("12.345"), "nav": Decimal("20.5000"), "nav_date": date(2026, 10, 5)}]


def test_match_when_units_equal_cas_close():
    db = _db()
    member, scheme, folio = _setup(db)
    imp = _import(db, member, _raw("4400918/3", scheme.name, scheme.isin, "100.000"), date(2026, 10, 5))
    _buy(db, folio, imp, "100.000")
    [row] = reconcile_members(db, [member.id])
    assert row.status == "match" and row.diff_units == Decimal("0")


def test_units_differ_reports_signed_difference():
    db = _db()
    member, scheme, folio = _setup(db)
    imp = _import(db, member, _raw("4400918/3", scheme.name, scheme.isin, "289301.004"), date(2026, 10, 5))
    _buy(db, folio, imp, "299034.210")
    [row] = reconcile_members(db, [member.id])
    assert row.status == "units_differ"
    assert row.diff_units == Decimal("9733.206")


def test_folio_key_spacing_matches():
    db = _db()
    member, scheme, folio = _setup(db, folio_number="4400918 / 3")
    imp = _import(db, member, _raw("4400918/3", scheme.name, scheme.isin, "5.000"), date(2026, 10, 5))
    _buy(db, folio, imp, "5.000")
    [row] = reconcile_members(db, [member.id])
    assert row.status == "match"


def test_uses_newest_import_containing_the_folio():
    db = _db()
    member, scheme, folio = _setup(db)
    old = _import(db, member, _raw("4400918/3", scheme.name, scheme.isin, "7.000"), date(2025, 3, 31))
    _import(db, member, {"folios": []}, date(2026, 10, 5))  # newer import without this folio
    _buy(db, folio, old, "7.000")
    [row] = reconcile_members(db, [member.id])
    assert row.cas_close_units == Decimal("7.000") and row.cas_statement_to == date(2025, 3, 31)


def test_no_cas_data_when_no_import_lists_the_folio():
    db = _db()
    member, scheme, folio = _setup(db)
    imp = _import(db, member, {"folios": []}, date(2026, 10, 5))
    _buy(db, folio, imp, "1.000")
    [row] = reconcile_members(db, [member.id])
    assert row.status == "no_cas_data"


def test_reconcile_is_read_only():
    db = _db()
    member, scheme, folio = _setup(db)
    imp = _import(db, member, _raw("4400918/3", scheme.name, scheme.isin, "1.000"), date(2026, 10, 5))
    _buy(db, folio, imp, "1.000")
    db.commit()
    reconcile_members(db, [member.id])
    assert not db.new and not db.dirty


def test_cached_units_compare_group_sum_across_folios(monkeypatch):
    from types import SimpleNamespace
    db = _db()
    member, scheme, first = _setup(db)
    second = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id,
                   folio_number="second", plan_type=PlanType.REGULAR)
    db.add(second)
    raw = _raw(first.folio_number, scheme.name, scheme.isin, "4.000")
    raw["folios"] += _raw("second", scheme.name, scheme.isin, "6.000")["folios"]
    imp = _import(db, member, raw, date(2026, 10, 5))
    _buy(db, first, imp, "4.000")
    _buy(db, second, imp, "6.000")
    cached = SimpleNamespace(household_member_id=str(member.id), scheme_id=str(scheme.id),
                             plan_type=PlanType.REGULAR, units_held="10.000")
    monkeypatch.setattr("app.services.import_.reconciliation.peek_cached_holdings", lambda ids: [cached])
    assert [row.status for row in reconcile_members(db, [member.id])] == ["match", "match"]
    cached.units_held = "11.000"
    assert [row.status for row in reconcile_members(db, [member.id])] == ["cache_stale", "cache_stale"]


def test_nav_uses_exact_cas_date_and_scheme_without_fetching():
    from app.models.reference import NavHistory
    db = _db()
    member, scheme, folio = _setup(db)
    imp = _import(db, member, _raw(folio.folio_number, scheme.name, scheme.isin, "1.000"), date(2026, 10, 5))
    _buy(db, folio, imp, "1.000")
    db.add(NavHistory(scheme_id=scheme.id, date=date(2026, 10, 4), nav=Decimal("99.0000")))
    db.flush()
    assert reconcile_members(db, [member.id])[0].our_nav is None
    db.add(NavHistory(scheme_id=scheme.id, date=date(2026, 10, 5), nav=Decimal("10.0000")))
    db.flush()
    assert reconcile_members(db, [member.id])[0].our_nav == Decimal("10.0000")


def test_reinvestment_isin_reconciles_without_falling_back_to_code():
    db = _db()
    member, scheme, folio = _setup(db)
    scheme.isin_reinvest = "INF000REINVEST"
    imp = _import(db, member, _raw(folio.folio_number, scheme.name, scheme.isin_reinvest, "100.000"), date(2026, 10, 5))
    _buy(db, folio, imp, "100.000")
    assert reconcile_members(db, [member.id])[0].status == "match"
    imp.raw_parser_output = _raw(folio.folio_number, scheme.name, "INF_WRONG", "100.000")
    assert reconcile_members(db, [member.id])[0].status == "no_cas_data"
