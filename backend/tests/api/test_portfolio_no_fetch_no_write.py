from datetime import date
from decimal import Decimal

from sqlalchemy import event

from app.models.enums import SchemePlanType, TransactionType
from app.services.dashboard import nav as nav_module
from app.services.dashboard.holdings import _holdings_cache
from tests.api.home_fixture import build_home_fixture
from tests.api.test_home_review_fixes import _add_scheme, _edit, _get, _transaction


def test_portfolio_routes_never_fetch_prices_or_write(monkeypatch):
    """A Portfolio GET reads stored prices only: no price download and no non-SELECT statement, in either scope,
    even when a held fund has no stored price at all (it is then named in `missing_funds`, not downloaded)."""
    runtime = build_home_fixture()
    fetched: list[str] = []

    async def fetch(code):
        fetched.append(code)
        return [(date(2026, 10, 22), Decimal("10")), (date(2026, 10, 23), Decimal("10.5"))]

    monkeypatch.setattr(nav_module, "_fetch_nav_history", fetch)
    try:
        def add_unpriced_fund(db):
            _, folio = _add_scheme(db, "nonav", amfi="999999", plan=SchemePlanType.DIRECT)
            _transaction(db, folio, "nonav-buy", TransactionType.PURCHASE, date(2026, 10, 1), "1000", "100", "10")

        _edit(runtime, add_unpriced_fund)
        writes: list[str] = []

        def listener(_conn, _cursor, statement, _params, _context, _many):
            if statement.lstrip().split()[0].upper() not in ("SELECT", "PRAGMA"):
                writes.append(statement.strip()[:80])

        event.listen(runtime.engine, "before_cursor_execute", listener)
        try:
            for root in ("/household/aggregate", f"/household-members/{runtime.household.asha_id}"):
                for suffix in (
                    "portfolio-summary", "portfolio-allocation",
                    "portfolio-value-series?days=30", "portfolio-value-series?days=365",
                ):
                    _holdings_cache.clear()
                    body = _get(runtime, f"{root}/{suffix}")
                    assert fetched == [], suffix
                    assert writes == [], (suffix, writes)
                    assert body["partial"] is True, suffix
        finally:
            event.remove(runtime.engine, "before_cursor_execute", listener)
    finally:
        runtime.close()
