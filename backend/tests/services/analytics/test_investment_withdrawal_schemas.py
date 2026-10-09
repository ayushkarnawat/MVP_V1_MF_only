# backend/tests/services/analytics/test_investment_withdrawal_schemas.py
from datetime import date

from app.models.enums import TransactionType
from app.services.analytics.schemas import (
    InvestmentWithdrawalBucket,
    InvestmentWithdrawalEntry,
    InvestmentWithdrawalResult,
    InvestmentWithdrawalSipSummary,
)


def test_entry_has_transaction_id_unlike_the_existing_cash_flow_entry():
    entry = InvestmentWithdrawalEntry(
        transaction_id="abc-123", date=date(2026, 1, 1), type=TransactionType.PURCHASE,
        amount="1000.00", direction="invested", scheme_name="Test Fund",
        household_member_id="m1", household_member_name="Priya",
    )
    assert entry.transaction_id == "abc-123"


def test_result_shape_matches_frontend_contract():
    result = InvestmentWithdrawalResult(
        total_invested="0.00", total_withdrawn="0.00", net_invested="0.00",
        current_value="0.00", absolute_gain="0.00",
        monthly=[InvestmentWithdrawalBucket(period="2026-01", invested="0.00", withdrawn="0.00", entries=[])],
        yearly=[],
        sip_summary=InvestmentWithdrawalSipSummary(active_count=0, total_monthly_amount="0.00", missed_count=0),
    )
    assert result.monthly[0].period == "2026-01"
    assert result.sip_summary.missed_count == 0
