from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest

from app.models.enums import ImportStatus, PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.schemas import HoldingRow
from app.services.dashboard.xirr import calculate_dashboard_xirr


def _holding(scheme_id: uuid.UUID, member_id: uuid.UUID) -> HoldingRow:
    return HoldingRow(
        scheme_id=str(scheme_id), scheme_name="Current Fund", amc_name="AMC",
        household_member_id=str(member_id), household_member_name="Investor",
        plan_type=PlanType.DIRECT, units_held="10.000", average_nav="10.0000",
        current_nav="20.0000", current_nav_date=date.today(), amount_invested="100.00",
        current_value="200.00", current_profit_total="100.00", realized_gain="0.00",
        unrealized_gain="100.00", today_gain="0.00",
    )


def test_dashboard_xirr_includes_redeemed_schemes_only_in_lifetime(db_session):
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919500000001", created_at=now)
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(user_id=user.id, name="Investor", relationship=Relationship.SELF, created_at=now)
    current_scheme = Scheme(amfi_code="XIRR-CURRENT", name="Current Fund", amc_name="AMC", sebi_category="Equity")
    redeemed_scheme = Scheme(amfi_code="XIRR-REDEEMED", name="Redeemed Fund", amc_name="AMC", sebi_category="Equity")
    db_session.add_all([member, current_scheme, redeemed_scheme])
    db_session.flush()
    current_folio = Folio(household_member_id=member.id, scheme_id=current_scheme.id, folio_number="C", plan_type=PlanType.DIRECT)
    redeemed_folio = Folio(household_member_id=member.id, scheme_id=redeemed_scheme.id, folio_number="R", plan_type=PlanType.DIRECT)
    db_session.add_all([current_folio, redeemed_folio])
    db_session.flush()
    imported = Import(household_member_id=member.id, status=ImportStatus.CONFIRMED, uploaded_at=now)
    db_session.add(imported)
    db_session.flush()
    one_year_ago = date.today() - timedelta(days=365)
    db_session.add_all([
        Transaction(folio_id=current_folio.id, import_id=imported.id, type=TransactionType.PURCHASE, date=one_year_ago, amount=Decimal("100.00"), units=Decimal("10.000"), nav=Decimal("10.0000")),
        Transaction(folio_id=redeemed_folio.id, import_id=imported.id, type=TransactionType.PURCHASE, date=one_year_ago, amount=Decimal("100.00"), units=Decimal("10.000"), nav=Decimal("10.0000")),
        Transaction(folio_id=redeemed_folio.id, import_id=imported.id, type=TransactionType.REDEMPTION, date=date.today() - timedelta(days=180), amount=Decimal("120.00"), units=Decimal("10.000"), nav=Decimal("12.0000")),
    ])
    db_session.commit()

    result = calculate_dashboard_xirr(db_session, [member.id], [_holding(current_scheme.id, member.id)])

    assert result.lifetime_xirr is not None
    assert result.current_holdings_xirr is not None
    assert Decimal(result.current_holdings_xirr) == pytest.approx(Decimal("1"), abs=Decimal("0.000001"))
    assert Decimal(result.lifetime_xirr) < Decimal(result.current_holdings_xirr)


def test_dashboard_xirr_returns_nulls_without_investment_transactions(db_session):
    result = calculate_dashboard_xirr(db_session, [], [])
    assert result.lifetime_xirr is None
    assert result.current_holdings_xirr is None
