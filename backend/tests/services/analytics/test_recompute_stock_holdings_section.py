def test_stock_holdings_section_is_registered():
    from app.services.analytics.recompute import _SECTIONS
    from app.services.analytics.lookthrough import compute_stock_holdings
    spec = next(s for s in _SECTIONS if s.name == "stock_holdings")
    assert spec.compute is compute_stock_holdings


def test_stock_holdings_section_wraps_combined_response():
    import asyncio
    from app.services.analytics.recompute import _SECTIONS
    spec = next(s for s in _SECTIONS if s.name == "stock_holdings")
    from app.services.analytics.lookthrough import compute_stock_holdings
    # An empty real compute is still a valid serializable section.
    from unittest.mock import AsyncMock, patch
    with patch("app.services.analytics.lookthrough.compute_holdings", AsyncMock(return_value=[])):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session
        with Session(create_engine("sqlite://")) as db:
            result = asyncio.run(compute_stock_holdings(db, []))
    payload = spec.wrap_combined([], result).model_dump(mode="json")
    assert payload == {"members": [], "stock_holdings": result.model_dump(mode="json")}
