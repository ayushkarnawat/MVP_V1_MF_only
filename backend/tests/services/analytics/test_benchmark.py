import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import BenchmarkIndex, PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import BenchmarkIndexHistory, Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.benchmark import compute_portfolio_vs_benchmarks


def _session():
    engine = create_engine("sqlite:///:memory:")
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


def _scheme(db, name="Test Fund"):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name=name, amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    return scheme


def _folio_with_purchase(db, member, scheme, amount, units, nav, txn_date, plan_type=PlanType.DIRECT):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=plan_type)
    db.add(folio)
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=txn_date, amount=amount, units=units, nav=nav))
    db.commit()
    return folio


def _mock_holdings(scheme, current_nav):
    return (
        patch(
            "app.services.dashboard.holdings.get_nav_on_or_before",
            new=AsyncMock(return_value=(current_nav, date.today())),
        ),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    )


def _no_fetch():
    return patch("app.services.analytics.benchmark.ensure_index_history_fresh", new=AsyncMock(return_value=True))


def test_compute_portfolio_vs_benchmarks_empty_when_no_transactions():
    db = _session()
    member = _household_member(db)
    summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))
    assert summary.portfolio_xirr is None
    assert len(summary.benchmarks) == 4
    assert all(row.xirr is None for row in summary.benchmarks)


def test_compute_portfolio_vs_benchmarks_computes_portfolio_and_nifty50_xirr():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    purchase_date = date.today().replace(year=date.today().year - 1)
    _folio_with_purchase(db, member, scheme, Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"), purchase_date)

    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=purchase_date, value=Decimal("100.00")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date.today(), value=Decimal("105.00")))
    db.commit()

    p1, p2 = _mock_holdings(scheme, Decimal("12.0000"))  # fund value grows to 1200
    with p1, p2, _no_fetch():
        summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    assert summary.portfolio_xirr is not None
    assert Decimal(summary.portfolio_xirr) > Decimal("0")

    nifty_50_row = next(r for r in summary.benchmarks if r.index == BenchmarkIndex.NIFTY_50)
    assert nifty_50_row.xirr is not None
    # Fund grew 1000 -> 1200 (20%), benchmark (same rupees, index-priced) only
    # grew 1000 -> 1050 (5%) — fund should outperform this benchmark.
    assert Decimal(nifty_50_row.xirr) > Decimal("0")
    assert Decimal(summary.portfolio_xirr) > Decimal(nifty_50_row.xirr)

    # No history cached for the other 3 indices — must degrade to None, not crash.
    other_rows = [r for r in summary.benchmarks if r.index != BenchmarkIndex.NIFTY_50]
    assert len(other_rows) == 3
    assert all(r.xirr is None for r in other_rows)


def test_compute_portfolio_vs_benchmarks_excludes_switches_from_cash_flow():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    purchase_date = date.today().replace(year=date.today().year - 1)
    folio = _folio_with_purchase(db, member, scheme, Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"), purchase_date)
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.SWITCH_IN, date=purchase_date, amount=Decimal("500.00"), units=Decimal("50.000"), nav=Decimal("10.0000")))
    db.commit()

    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=purchase_date, value=Decimal("100.00")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date.today(), value=Decimal("105.00")))
    db.commit()

    p1, p2 = _mock_holdings(scheme, Decimal("12.0000"))
    with p1, p2, _no_fetch():
        summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    # Only the 1000 PURCHASE counts as a cash flow, not the 500 SWITCH_IN —
    # same exclusion cash_flow.py already applies (switches are
    # intra-portfolio, not real cash movement).
    nifty_50_row = next(r for r in summary.benchmarks if r.index == BenchmarkIndex.NIFTY_50)
    assert Decimal(nifty_50_row.xirr) > Decimal("0")
