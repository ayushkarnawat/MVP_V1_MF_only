import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme, SchemeTer
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.ter import compute_direct_regular_ter_comparison, compute_weighted_ter


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


def _folio_with_purchase(db, member, scheme, amount, units, nav, plan_type=PlanType.DIRECT):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=plan_type)
    db.add(folio)
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=date(2024, 1, 1), amount=amount, units=units, nav=nav))
    db.commit()
    return folio


def _current_month_start():
    return date.today().replace(day=1)


def test_compute_weighted_ter_empty_when_no_holdings():
    db = _session()
    member = _household_member(db)
    summary = asyncio.run(compute_weighted_ter(db, [member.id]))
    assert summary.weighted_ter is None
    assert Decimal(summary.total_value) == Decimal("0")
    assert summary.uncovered_schemes == []


def _mock_holdings(scheme_a, scheme_b):
    return (
        patch(
            "app.services.dashboard.holdings.get_nav_on_or_before",
            new=AsyncMock(side_effect=lambda db_, scheme, on_date: (Decimal("60.0000"), date(2024, 6, 1)) if scheme.id == scheme_a.id else (Decimal("40.0000"), date(2024, 6, 1))),
        ),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    )


def test_compute_weighted_ter_computes_holding_value_weighted_average():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    scheme_b = _scheme(db, "Fund B")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    _folio_with_purchase(db, member, scheme_b, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"))
    db.add(SchemeTer(scheme_id=scheme_a.id, reference_period=_current_month_start(), ter_value=Decimal("1.00")))
    db.add(SchemeTer(scheme_id=scheme_b.id, reference_period=_current_month_start(), ter_value=Decimal("2.00")))
    db.commit()

    p1, p2 = _mock_holdings(scheme_a, scheme_b)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(side_effect=AssertionError("should not refresh"))):
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    # current_value: scheme_a 100*60=6000, scheme_b 100*40=4000, total 10000.
    # weighted TER = (6000*1.00 + 4000*2.00) / 10000 = (6000+8000)/10000 = 1.40
    assert Decimal(summary.weighted_ter) == Decimal("1.40")
    assert Decimal(summary.total_value) == Decimal("10000.00")
    assert Decimal(summary.covered_value) == Decimal("10000.00")
    assert summary.reference_period == _current_month_start()
    assert summary.uncovered_schemes == []


def test_compute_weighted_ter_triggers_refresh_when_current_month_ter_missing():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    scheme_b = _scheme(db, "Fund B")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    _folio_with_purchase(db, member, scheme_b, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"))
    # No scheme_ter rows exist yet at all.

    async def _fake_refresh(db_):
        db_.add(SchemeTer(scheme_id=scheme_a.id, reference_period=_current_month_start(), ter_value=Decimal("1.00")))
        db_.add(SchemeTer(scheme_id=scheme_b.id, reference_period=_current_month_start(), ter_value=Decimal("2.00")))
        db_.commit()
        return True

    p1, p2 = _mock_holdings(scheme_a, scheme_b)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(side_effect=_fake_refresh)) as mock_refresh:
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    mock_refresh.assert_awaited_once()
    assert Decimal(summary.weighted_ter) == Decimal("1.40")


def test_compute_weighted_ter_flags_uncovered_scheme_without_crashing():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    scheme_b = _scheme(db, "Fund B (no TER ever resolved)")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    _folio_with_purchase(db, member, scheme_b, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"))
    db.add(SchemeTer(scheme_id=scheme_a.id, reference_period=_current_month_start(), ter_value=Decimal("1.00")))
    db.commit()

    async def _fake_refresh(db_):
        return False  # scheme_b's fuzzy match never resolves — same as a live failure.

    p1, p2 = _mock_holdings(scheme_a, scheme_b)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(side_effect=_fake_refresh)):
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    assert Decimal(summary.weighted_ter) == Decimal("1.00")
    assert Decimal(summary.covered_value) == Decimal("6000.00")
    assert Decimal(summary.total_value) == Decimal("10000.00")
    assert summary.uncovered_schemes == ["Fund B (no TER ever resolved)"]


def test_compute_weighted_ter_returns_none_weighted_ter_when_nothing_covered():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))

    p1, p2 = _mock_holdings(scheme_a, scheme_a)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(return_value=False)):
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    assert summary.weighted_ter is None
    assert Decimal(summary.covered_value) == Decimal("0")
    assert summary.uncovered_schemes == ["Fund A"]


def test_compute_direct_regular_ter_comparison_splits_by_plan_type():
    db = _session()
    member = _household_member(db)
    direct_scheme = _scheme(db, "Direct Fund")
    regular_scheme = _scheme(db, "Regular Fund")
    _folio_with_purchase(db, member, direct_scheme, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"), plan_type=PlanType.DIRECT)
    _folio_with_purchase(db, member, regular_scheme, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"), plan_type=PlanType.REGULAR)
    db.add(SchemeTer(scheme_id=direct_scheme.id, reference_period=_current_month_start(), ter_value=Decimal("0.50")))
    db.add(SchemeTer(scheme_id=regular_scheme.id, reference_period=_current_month_start(), ter_value=Decimal("1.75")))
    db.commit()

    p1, p2 = _mock_holdings(direct_scheme, regular_scheme)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(side_effect=AssertionError("should not refresh"))):
        comparison = asyncio.run(compute_direct_regular_ter_comparison(db, [member.id]))

    assert Decimal(comparison.direct.weighted_ter) == Decimal("0.50")
    assert Decimal(comparison.direct.total_value) == Decimal("6000.00")
    assert Decimal(comparison.regular.weighted_ter) == Decimal("1.75")
    assert Decimal(comparison.regular.total_value) == Decimal("4000.00")


def test_compute_direct_regular_ter_comparison_empty_bucket_when_no_regular_holdings():
    db = _session()
    member = _household_member(db)
    direct_scheme = _scheme(db, "Direct Fund")
    _folio_with_purchase(db, member, direct_scheme, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"), plan_type=PlanType.DIRECT)
    db.add(SchemeTer(scheme_id=direct_scheme.id, reference_period=_current_month_start(), ter_value=Decimal("0.50")))
    db.commit()

    p1, p2 = _mock_holdings(direct_scheme, direct_scheme)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(side_effect=AssertionError("should not refresh"))):
        comparison = asyncio.run(compute_direct_regular_ter_comparison(db, [member.id]))

    assert comparison.regular.weighted_ter is None
    assert Decimal(comparison.regular.total_value) == Decimal("0")
