# backend/tests/services/analytics/test_recompute_investment_withdrawal.py
from app.services.analytics.recompute import _SECTIONS


def test_investment_withdrawal_is_a_registered_section():
    names = [s.name for s in _SECTIONS]
    assert "investment_withdrawal" in names


def test_investment_withdrawal_section_wraps_result_with_members():
    section = next(s for s in _SECTIONS if s.name == "investment_withdrawal")
    from app.services.analytics.schemas import InvestmentWithdrawalBucket, InvestmentWithdrawalResult, InvestmentWithdrawalSipSummary

    result = InvestmentWithdrawalResult(
        total_invested="0.00", total_withdrawn="0.00", net_invested="0.00",
        current_value="0.00", absolute_gain="0.00", monthly=[], yearly=[],
        sip_summary=InvestmentWithdrawalSipSummary(active_count=0, total_monthly_amount="0.00", missed_count=0),
    )
    wrapped = section.wrap_combined([], result)
    assert wrapped.data is result
    assert wrapped.members == []
