# backend/tests/services/analytics/test_recompute_fund_ranking_section.py
def test_ranking_section_is_registered():
    from app.services.analytics.recompute import _SECTIONS
    names = [s.name for s in _SECTIONS]
    assert "ranking" in names


def test_ranking_section_wraps_combined_result():
    from app.services.analytics.recompute import _SECTIONS
    from app.services.analytics.schemas import FundRankingSummary
    section = next(s for s in _SECTIONS if s.name == "ranking")
    assert section.wrap_combined([], FundRankingSummary(funds=[])).model_dump() == {"members": [], "ranking": {"funds": []}}
