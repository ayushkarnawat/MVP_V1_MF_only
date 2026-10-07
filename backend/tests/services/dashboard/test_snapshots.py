import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.snapshot import PortfolioSnapshot
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.snapshots import get_snapshots, invalidate_member_snapshots


def _session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _household_member(db):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Self", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _folio_with_purchase(db, member, on_date, amount, units, nav):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name="Test Fund", amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=on_date, amount=amount, units=units, nav=nav))
    db.commit()
    return folio, scheme


def test_get_snapshots_backfills_from_first_transaction_month():
    db = _session()
    member = _household_member(db)
    folio, scheme = _folio_with_purchase(db, member, date(2024, 1, 15), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    seed_nav(db, folio.scheme_id, date(2024,1,31), "55")
    with patch("app.services.dashboard.snapshots.warm_nav_history", AsyncMock()):
        rows = asyncio.run(get_snapshots(db, [member.id]))

    months = sorted(r.snapshot_month for r in rows)
    assert months[0] == date(2024, 1, 31)
    assert Decimal(rows[0].total_value) == Decimal("5500.00")  # 100 * 55


def test_get_snapshots_caches_into_portfolio_snapshots_table():
    db = _session()
    member = _household_member(db)
    folio, scheme = _folio_with_purchase(db, member, date(2024, 1, 15), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    seed_nav(db, folio.scheme_id, date(2024,1,31), "55")
    with patch("app.services.dashboard.snapshots.warm_nav_history", AsyncMock()) as mock_nav:
        asyncio.run(get_snapshots(db, [member.id]))
        first_call_count = mock_nav.call_count
        asyncio.run(get_snapshots(db, [member.id]))
        second_call_count = mock_nav.call_count

    # Second call should hit the cached portfolio_snapshots rows, not
    # re-fetch NAV for months already computed.
    assert second_call_count == first_call_count

    cached = db.query(PortfolioSnapshot).filter_by(household_member_id=member.id).all()
    assert len(cached) > 0


def test_get_snapshots_processes_same_date_purchase_before_redemption():
    """A same-day purchase and redemption must process purchase-first
    regardless of id order — mirror of the holdings.py fix. Ids are fixed
    (redemption < purchase) so an id-only tiebreak would deterministically
    process the redemption first and silently no-op it."""
    db = _session()
    member = _household_member(db)
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name="Test Fund", amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    same_date = date(2024, 3, 1)
    db.add(Transaction(id=uuid.UUID(int=1), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.REDEMPTION, date=same_date, amount=Decimal("3000.00"), units=Decimal("50.000"), nav=Decimal("60.0000")))
    db.add(Transaction(id=uuid.UUID(int=2), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=same_date, amount=Decimal("5000.00"), units=Decimal("100.000"), nav=Decimal("50.0000")))
    db.commit()

    seed_nav(db, folio.scheme_id, date(2024,3,31), "55")
    with patch("app.services.dashboard.snapshots.warm_nav_history", AsyncMock()):
        rows = asyncio.run(get_snapshots(db, [member.id]))

    # Purchase (100u) before redemption (50u) -> 50u held at month-end,
    # 50 * 55 = 2750. Redemption-first would no-op, leaving 100u -> 5500.
    assert Decimal(rows[0].total_value) == Decimal("2750.00")


def test_get_snapshots_retries_partial_month_when_nav_becomes_available():
    """A transient NAV outage must not permanently poison the cache with an
    understated total_value — the month should be retryable, not silently
    wrong forever."""
    db = _session()
    member = _household_member(db)
    folio, scheme = _folio_with_purchase(db, member, date(2024, 1, 15), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    with patch("app.services.dashboard.snapshots.warm_nav_history", AsyncMock()):
        rows = asyncio.run(get_snapshots(db, [member.id]))

    assert rows and all(r.is_partial for r in rows)
    assert db.query(PortfolioSnapshot).filter_by(household_member_id=member.id).count() == len(rows)

    # Retry once NAV becomes available — the month should now compute and cache.
    seed_nav(db, folio.scheme_id, date(2024,1,31), "55")
    with patch("app.services.dashboard.snapshots.warm_nav_history", AsyncMock()):
        rows = asyncio.run(get_snapshots(db, [member.id]))

    assert len(rows) >= 1
    assert Decimal(rows[0].total_value) == Decimal("5500.00")
    assert db.query(PortfolioSnapshot).filter_by(household_member_id=member.id).count() >= 1


def test_get_snapshots_returns_empty_for_member_with_no_transactions():
    db = _session()
    member = _household_member(db)
    rows = asyncio.run(get_snapshots(db, [member.id]))
    assert rows == []


def test_invalidate_member_snapshots_deletes_only_those_members():
    db = _session()
    a, b = _household_member(db), _household_member(db)
    for m in (a, b):
        db.add(PortfolioSnapshot(household_member_id=m.id, snapshot_month=date(2024, 1, 31), total_value=Decimal("1"), computed_at=datetime.now(timezone.utc)))
    db.commit()

    assert invalidate_member_snapshots(db, [a.id]) == 1
    db.commit()
    assert [s.household_member_id for s in db.query(PortfolioSnapshot).all()] == [b.id]
    assert invalidate_member_snapshots(db, []) == 0


from app.models.reference import NavHistory
from app.models.imports import Import
from app.models.enums import ImportStatus
from sqlalchemy import event
import pytest


@pytest.fixture(autouse=True)
def no_nav_network(monkeypatch):
    monkeypatch.setattr("app.services.dashboard.snapshots.warm_nav_history", AsyncMock(), raising=False)


def seed_nav(db, scheme_id, day, nav):
    db.add(NavHistory(scheme_id=scheme_id, date=day, nav=Decimal(nav)))
    db.commit()


def test_partial_month_kept_and_flagged():
    db = _session()
    member = _household_member(db)
    ok, _ = _folio_with_purchase(db, member, date(2024,1,10), Decimal("100"), Decimal("10"), Decimal("10"))
    missing, scheme = _folio_with_purchase(db, member, date(2024,1,10), Decimal("100"), Decimal("10"), Decimal("10"))
    scheme.name = "Missing NAV Fund"
    seed_nav(db, ok.scheme_id, date(2024,1,31), "20")
    rows = asyncio.run(get_snapshots(db, [member.id]))
    jan = next(r for r in rows if r.snapshot_month == date(2024,1,31))
    assert jan.is_partial and jan.missing_scheme_names == ["Missing NAV Fund"]
    assert Decimal(jan.total_value) == Decimal("200")
    assert Decimal(jan.invested_value) == Decimal("200")


def test_snapshots_after_confirm_are_fresh():
    db = _session()
    member = _household_member(db)
    folio, _ = _folio_with_purchase(db, member, date(2024,1,10), Decimal("100"), Decimal("10"), Decimal("10"))
    seed_nav(db, folio.scheme_id, date(2024,1,31), "20")
    asyncio.run(get_snapshots(db, [member.id]))
    imp = Import(id=uuid.uuid4(), household_member_id=member.id, status=ImportStatus.CONFIRMED,
                 uploaded_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc))
    db.add(imp)
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=imp.id, type=TransactionType.PURCHASE,
                       date=date(2024,1,15), amount=Decimal("50"), units=Decimal("5"), nav=Decimal("10")))
    db.commit()
    rows = asyncio.run(get_snapshots(db, [member.id]))
    jan = next(r for r in rows if r.snapshot_month == date(2024,1,31))
    assert Decimal(jan.total_value) == Decimal("300")


def test_bulk_query_count_is_bounded(monkeypatch):
    monkeypatch.setattr("app.services.dashboard.snapshots.warm_nav_history", AsyncMock(side_effect=lambda db,schemes: db.commit()))
    db = _session()
    member = _household_member(db)
    for _ in range(10):
        folio, _ = _folio_with_purchase(db, member, date(2006,1,5), Decimal("100"), Decimal("10"), Decimal("10"))
        seed_nav(db, folio.scheme_id, date(2006,1,1), "20")
        for year in range(2006,2027):
            for month in range(1,13):
                if date(year,month,5) > date.today(): continue
                db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(),
                                   type=TransactionType.PURCHASE_SIP, date=date(year,month,5),
                                   amount=Decimal("100"), units=Decimal("10"), nav=Decimal("10")))
        db.commit()
    legacy = patch("app.services.dashboard.snapshots.get_nav_on_or_before", AsyncMock(return_value=(Decimal("20"), date(2006,1,1))), create=True)
    legacy.start()
    count = 0
    def counted(*args):
        nonlocal count
        count += 1
    event.listen(db.get_bind(), "before_cursor_execute", counted)
    try:
        rows = asyncio.run(get_snapshots(db, [member.id]))
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", counted)
        legacy.stop()
    assert len(rows) >= 240
    assert count < 200



def test_background_rebuild_uses_own_session_and_is_idempotent(monkeypatch):
    from app.services.dashboard.snapshots import rebuild_member_snapshots
    db = _session()
    member = _household_member(db)
    folio,_ = _folio_with_purchase(db,member,date(2024,1,10),Decimal("100"),Decimal("10"),Decimal("10"))
    seed_nav(db,folio.scheme_id,date(2024,1,31),"20")
    monkeypatch.setattr("app.services.dashboard.snapshots.SessionLocal",sessionmaker(bind=db.get_bind(),autoflush=False))
    first = asyncio.run(rebuild_member_snapshots(member.id))
    second = asyncio.run(rebuild_member_snapshots(member.id))
    assert first == second == db.query(PortfolioSnapshot).count()
    assert first > 0
    assert db.query(PortfolioSnapshot).order_by(PortfolioSnapshot.snapshot_month).first().total_value == Decimal("200")


def test_snapshot_money_uses_amount_half_up_rounding():
    db = _session()
    member = _household_member(db)
    folio,_ = _folio_with_purchase(db,member,date(2024,1,10),Decimal("1.01"),Decimal("1"),Decimal("1.0050"))
    seed_nav(db,folio.scheme_id,date(2024,1,31),"1.0050")
    rows = asyncio.run(get_snapshots(db,[member.id]))
    assert rows[0].total_value == rows[0].invested_value == "1.01"


def test_written_off_fund_is_worth_zero_after_its_nav_drops_to_zero():
    # Phase 6 Task 12 (kfin_pk_10yr): a segregated portfolio written off to
    # NAV 0 must stay at 0 in history, as on the dashboard, not keep its last
    # positive NAV forever.
    db = _session()
    member = _household_member(db)
    folio, _ = _folio_with_purchase(db, member, date(2024,1,10), Decimal("100"), Decimal("10"), Decimal("10"))
    seed_nav(db, folio.scheme_id, date(2024,1,31), "1.1077")
    seed_nav(db, folio.scheme_id, date(2024,2,5), "0")
    rows = {r.snapshot_month: r for r in asyncio.run(get_snapshots(db, [member.id]))}
    assert Decimal(rows[date(2024,1,31)].total_value) == Decimal("11.08")
    feb = rows[date(2024,2,29)]
    assert Decimal(feb.total_value) == Decimal("0")
    assert not feb.is_partial
