def test_fund_manager_section_is_registered():
    from app.services.analytics.recompute import _SECTIONS
    assert "fund_manager" in [section.name for section in _SECTIONS]


def test_fund_manager_section_wraps_combined_response():
    from app.services.analytics.recompute import _SECTIONS
    from app.services.analytics.schemas import FundManagerAllocationSummary
    spec = next(s for s in _SECTIONS if s.name == "fund_manager")
    payload = spec.wrap_combined([], FundManagerAllocationSummary(manager_groups=[], unavailable_schemes=[]))
    assert payload.model_dump() == {"members": [], "fund_manager": {"manager_groups": [], "unavailable_schemes": []}}
