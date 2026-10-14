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


def test_combined_stock_payload_preserves_fund_names(db_session, monkeypatch):
    import asyncio
    from app.services.analytics.recompute import _SECTIONS
    from tests.services.analytics.test_lookthrough import _scheme, _batch, _holding
    from app.models.enums import AssetType
    from app.services.analytics import lookthrough
    from unittest.mock import AsyncMock
    covered = _scheme(db_session)
    missing = _scheme(db_session)
    _batch(db_session, covered, [("Reliance", "INE002A01018", "8", AssetType.EQUITY_DOMESTIC)])
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=[_holding(covered, "1000"), _holding(missing, "1000")]))
    result = asyncio.run(lookthrough.compute_stock_holdings(db_session, []))
    spec = next(s for s in _SECTIONS if s.name == "stock_holdings")
    payload = spec.wrap_combined([], result).model_dump(mode="json")["stock_holdings"]
    assert payload["rows"][0]["contributing_funds"][0]["scheme_name"] == covered.name
    assert payload["coverage"]["funds"][0]["scheme_name"] == covered.name
    assert payload["coverage"]["not_published_yet"] == [{"scheme_id": str(missing.id), "scheme_name": missing.name}]
