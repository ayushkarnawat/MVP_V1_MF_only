import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import ArnStatus, PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.distributor_comparison import compute_distributor_comparison


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _household_member(db, name="Self"):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name=name, relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _scheme(db):
    scheme = Scheme(
        id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name="HDFC Flexi Cap Fund",
        amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.commit()
    return scheme


def _folio(db, member, scheme, folio_number, arn_code):
    folio = Folio(
        id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id,
        folio_number=folio_number, arn_code=arn_code, plan_type=PlanType.REGULAR if arn_code else PlanType.DIRECT,
    )
    db.add(folio)
    db.commit()
    return folio


def _txn(db, folio, type_, on_date, amount, units, nav):
    txn = Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=type_, date=on_date, amount=amount, units=units, nav=nav)
    db.add(txn)
    db.commit()
    return txn


def _fake_resolve_arn(mapping):
    async def _resolve(db, arn_code):
        return mapping[arn_code]
    return _resolve


def test_compute_distributor_comparison_groups_by_arn_with_known_answer_fifo():
    """Known-answer test, hand-computed:
    ARN-11111: purchase 100u @ NAV 50 (cost 5000), redeem 40u @ NAV 70.
      FIFO: realized_gain = 40*(70-50) = 800. Remaining: 60u @ NAV 50 ->
      cost_basis 3000, units_held 60.
      current_nav=60 -> current_value=3600, unrealized=3600-3000=600,
      current_profit_total=800+600=1400, average_nav=3000/60=50.
    ARN-22222: purchase 50u @ NAV 40 (cost 2000), no redemption.
      units_held=50, cost_basis=2000, realized=0, current_value=3000,
      unrealized=1000, current_profit_total=1000, average_nav=40.
    Direct (arn_code=None): purchase 30u @ NAV 45 (cost 1350), no
      redemption. units_held=30, cost_basis=1350, current_value=1800,
      unrealized=450, current_profit_total=450, average_nav=45. No AMFI
      lookup for this bucket."""
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)

    folio_a = _folio(db, member, scheme, "AAA", "ARN-11111")
    _txn(db, folio_a, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    _txn(db, folio_a, TransactionType.REDEMPTION, date(2024, 6, 1), Decimal("2800.00"), Decimal("40.000"), Decimal("70.0000"))

    folio_b = _folio(db, member, scheme, "BBB", "ARN-22222")
    _txn(db, folio_b, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("2000.00"), Decimal("50.000"), Decimal("40.0000"))

    folio_c = _folio(db, member, scheme, "CCC", None)
    _txn(db, folio_c, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("1350.00"), Decimal("30.000"), Decimal("45.0000"))

    resolve_mock = AsyncMock(side_effect=_fake_resolve_arn({
        "ARN-11111": SimpleNamespace(distributor_name="Alpha Distributors", status=ArnStatus.ACTIVE),
        "ARN-22222": SimpleNamespace(distributor_name="Beta Advisors", status=ArnStatus.SUSPENDED),
    }))

    with patch(
        "app.services.dashboard.distributor_comparison.get_nav_on_or_before",
        new=AsyncMock(return_value=(Decimal("60.0000"), date(2024, 6, 1))),
    ), patch("app.services.dashboard.distributor_comparison.resolve_arn", new=resolve_mock):
        rows = asyncio.run(compute_distributor_comparison(db, member.id, scheme.id))

    assert len(rows) == 3
    assert resolve_mock.await_count == 2  # never called for the Direct (arn_code=None) bucket

    by_arn = {row.arn_code: row for row in rows}

    row_a = by_arn["ARN-11111"]
    assert row_a.distributor_name == "Alpha Distributors"
    assert row_a.arn_status == ArnStatus.ACTIVE
    assert row_a.units_held == "60.000"
    assert Decimal(row_a.amount_invested) == Decimal("3000.00")
    assert Decimal(row_a.realized_gain) == Decimal("800.00")
    assert Decimal(row_a.current_value) == Decimal("3600.00")
    assert Decimal(row_a.unrealized_gain) == Decimal("600.00")
    assert Decimal(row_a.current_profit_total) == Decimal("1400.00")
    assert Decimal(row_a.average_nav) == Decimal("50")

    row_b = by_arn["ARN-22222"]
    assert row_b.distributor_name == "Beta Advisors"
    assert row_b.arn_status == ArnStatus.SUSPENDED
    assert row_b.units_held == "50.000"
    assert Decimal(row_b.current_profit_total) == Decimal("1000.00")

    row_c = by_arn[None]
    assert row_c.distributor_name is None
    assert row_c.arn_status is None
    assert row_c.units_held == "30.000"
    assert Decimal(row_c.current_profit_total) == Decimal("450.00")


def test_compute_distributor_comparison_returns_empty_when_member_holds_nothing_of_scheme():
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)

    rows = asyncio.run(compute_distributor_comparison(db, member.id, scheme.id))
    assert rows == []


def test_compute_distributor_comparison_returns_empty_when_nav_unavailable():
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme, "AAA", "ARN-11111")
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    with patch(
        "app.services.dashboard.distributor_comparison.get_nav_on_or_before",
        new=AsyncMock(return_value=None),
    ):
        rows = asyncio.run(compute_distributor_comparison(db, member.id, scheme.id))

    assert rows == []
