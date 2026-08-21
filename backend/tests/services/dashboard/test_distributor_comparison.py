import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import ArnStatus, PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.distributor_comparison import (
    _distributor_cache,
    compute_distributor_comparison,
    invalidate_holdings_cache,
)


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


def _scheme(db, name="HDFC Flexi Cap Fund", amfi_code=None):
    scheme = Scheme(
        id=uuid.uuid4(), amfi_code=amfi_code or uuid.uuid4().hex[:6], isin=uuid.uuid4().hex[:12], name=name,
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


def _mock_nav_batch(results_by_scheme_id):
    async def lookup(_db, scheme_date_pairs):
        return {scheme.id: results_by_scheme_id[scheme.id] for scheme, _ in scheme_date_pairs}
    return AsyncMock(side_effect=lookup)


def test_compute_distributor_comparison_rolls_up_scheme_breakdowns_by_arn_with_known_answer_fifo():
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
      lookup for this bucket.
    Each ARN's DistributorPortfolioRow totals must equal the sum of its
    (single, here) DistributorSchemeBreakdown, since each ARN only has one
    scheme group in this fixture."""
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

    with (
        patch(
            "app.services.dashboard.distributor_comparison.get_navs_on_or_before",
            new=_mock_nav_batch({scheme.id: (Decimal("60.0000"), date(2024, 6, 1))}),
        ),
        patch("app.services.dashboard.distributor_comparison.resolve_arn", new=resolve_mock),
    ):
        rows = asyncio.run(compute_distributor_comparison(db, [member.id]))

    assert len(rows) == 3
    assert resolve_mock.await_count == 2  # never called for the Direct (arn_code=None) bucket

    by_arn = {row.arn_code: row for row in rows}

    row_a = by_arn["ARN-11111"]
    assert row_a.distributor_name == "Alpha Distributors"
    assert row_a.arn_status == ArnStatus.ACTIVE
    assert len(row_a.schemes) == 1
    assert row_a.schemes[0].units_held == "60.000"
    assert Decimal(row_a.amount_invested) == Decimal("3000.00")
    assert Decimal(row_a.realized_gain) == Decimal("800.00")
    assert Decimal(row_a.current_value) == Decimal("3600.00")
    assert Decimal(row_a.unrealized_gain) == Decimal("600.00")
    assert Decimal(row_a.current_profit_total) == Decimal("1400.00")
    assert Decimal(row_a.schemes[0].average_nav) == Decimal("50")

    row_b = by_arn["ARN-22222"]
    assert row_b.distributor_name == "Beta Advisors"
    assert row_b.arn_status == ArnStatus.SUSPENDED
    assert Decimal(row_b.current_profit_total) == Decimal("1000.00")

    row_c = by_arn[None]
    assert row_c.distributor_name is None
    assert row_c.arn_status is None
    assert Decimal(row_c.current_profit_total) == Decimal("450.00")


def test_compute_distributor_comparison_never_merges_across_members():
    """Two members holding the SAME scheme via the SAME ARN must stay as two
    separate DistributorSchemeBreakdown rows under that one
    DistributorPortfolioRow, mirroring compute_holdings' existing (member,
    scheme, plan_type) convention — grouping never silently combines
    different members' holdings into one breakdown row."""
    import asyncio

    db = _session()
    member_a = _household_member(db, name="Mom")
    member_b = _household_member(db, name="Dad")
    scheme = _scheme(db)

    folio_a = _folio(db, member_a, scheme, "AAA", "ARN-99999")
    _txn(db, folio_a, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    folio_b = _folio(db, member_b, scheme, "BBB", "ARN-99999")
    _txn(db, folio_b, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("3000.00"), Decimal("60.000"), Decimal("50.0000"))

    resolve_mock = AsyncMock(side_effect=_fake_resolve_arn({
        "ARN-99999": SimpleNamespace(distributor_name="Shared Distributor", status=ArnStatus.ACTIVE),
    }))

    with (
        patch(
            "app.services.dashboard.distributor_comparison.get_navs_on_or_before",
            new=_mock_nav_batch({scheme.id: (Decimal("50.0000"), date(2024, 1, 1))}),
        ),
        patch("app.services.dashboard.distributor_comparison.resolve_arn", new=resolve_mock),
    ):
        rows = asyncio.run(compute_distributor_comparison(db, [member_a.id, member_b.id]))

    assert len(rows) == 1
    row = rows[0]
    assert len(row.schemes) == 2
    names = {b.household_member_name for b in row.schemes}
    assert names == {"Mom", "Dad"}
    assert Decimal(row.amount_invested) == Decimal("8000.00")  # 5000 + 3000


def test_compute_distributor_comparison_excludes_only_the_scheme_with_missing_nav():
    """A member holds two schemes, one via an ARN whose NAV cannot be
    resolved and one that resolves fine. Only the unresolvable scheme's
    breakdown row is dropped — the distributor row and the other scheme's
    breakdown still render, unlike the old fund-scoped version's
    all-or-nothing empty-list behavior."""
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme_ok = _scheme(db, name="Resolvable Fund", amfi_code="AAA111")
    scheme_missing = _scheme(db, name="Unresolvable Fund", amfi_code="BBB222")

    folio_ok = _folio(db, member, scheme_ok, "AAA", "ARN-55555")
    _txn(db, folio_ok, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    folio_missing = _folio(db, member, scheme_missing, "BBB", "ARN-55555")
    _txn(db, folio_missing, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("2000.00"), Decimal("40.000"), Decimal("50.0000"))

    resolve_mock = AsyncMock(side_effect=_fake_resolve_arn({
        "ARN-55555": SimpleNamespace(distributor_name="Gamma Wealth", status=ArnStatus.ACTIVE),
    }))

    async def lookup(_db, scheme_date_pairs):
        results = {}
        for scheme, _on_date in scheme_date_pairs:
            results[scheme.id] = (Decimal("60.0000"), date(2024, 6, 1)) if scheme.id == scheme_ok.id else None
        return results

    with (
        patch("app.services.dashboard.distributor_comparison.get_navs_on_or_before", new=AsyncMock(side_effect=lookup)),
        patch("app.services.dashboard.distributor_comparison.resolve_arn", new=resolve_mock),
    ):
        rows = asyncio.run(compute_distributor_comparison(db, [member.id]))

    assert len(rows) == 1
    row = rows[0]
    assert row.distributor_name == "Gamma Wealth"
    assert len(row.schemes) == 1
    assert row.schemes[0].scheme_name == "Resolvable Fund"


def test_compute_distributor_comparison_keeps_distributor_row_when_every_scheme_nav_missing():
    """A distributor whose every scheme is NAV-unavailable still renders,
    with an empty schemes list and zero totals — not dropped entirely, per
    the design spec's Error Handling section."""
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme, "AAA", "ARN-77777")
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    resolve_mock = AsyncMock(side_effect=_fake_resolve_arn({
        "ARN-77777": SimpleNamespace(distributor_name="Delta Partners", status=ArnStatus.ACTIVE),
    }))

    with (
        patch(
            "app.services.dashboard.distributor_comparison.get_navs_on_or_before",
            new=_mock_nav_batch({scheme.id: None}),
        ),
        patch("app.services.dashboard.distributor_comparison.resolve_arn", new=resolve_mock),
    ):
        rows = asyncio.run(compute_distributor_comparison(db, [member.id]))

    assert len(rows) == 1
    row = rows[0]
    assert row.distributor_name == "Delta Partners"
    assert row.schemes == []
    assert Decimal(row.amount_invested) == Decimal("0")
    assert Decimal(row.current_value) == Decimal("0")


def test_compute_distributor_comparison_includes_fully_redeemed_distributor_group():
    """Deliberate divergence from holdings.py: a scheme group with zero
    units held (fully redeemed through that ARN) still appears here, since
    this view compares historical performance across distributors, not just
    what's currently held. holdings.py.compute_holdings would drop this row
    entirely (units_held == 0); this function must not."""
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)

    folio = _folio(db, member, scheme, "AAA", "ARN-11111")
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    _txn(db, folio, TransactionType.REDEMPTION, date(2024, 3, 1), Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))

    resolve_mock = AsyncMock(side_effect=_fake_resolve_arn({
        "ARN-11111": SimpleNamespace(distributor_name="Alpha Distributors", status=ArnStatus.ACTIVE),
    }))

    with (
        patch(
            "app.services.dashboard.distributor_comparison.get_navs_on_or_before",
            new=_mock_nav_batch({scheme.id: (Decimal("70.0000"), date(2024, 6, 1))}),
        ),
        patch("app.services.dashboard.distributor_comparison.resolve_arn", new=resolve_mock),
    ):
        rows = asyncio.run(compute_distributor_comparison(db, [member.id]))

    assert len(rows) == 1
    row = rows[0]
    assert len(row.schemes) == 1
    assert row.schemes[0].units_held == "0"
    assert row.schemes[0].average_nav is None
    assert Decimal(row.realized_gain) == Decimal("1000.00")  # 100*(60-50)
    assert Decimal(row.current_profit_total) == Decimal("1000.00")


def test_compute_distributor_comparison_returns_empty_for_member_with_no_folios():
    import asyncio

    db = _session()
    member = _household_member(db)

    rows = asyncio.run(compute_distributor_comparison(db, [member.id]))
    assert rows == []


def test_compute_distributor_comparison_returns_empty_for_no_member_ids():
    import asyncio

    db = _session()
    rows = asyncio.run(compute_distributor_comparison(db, []))
    assert rows == []


def test_compute_distributor_comparison_batches_transaction_fetch_regardless_of_folio_count():
    """Guards against reintroducing the per-folio Transaction N+1 this
    rewrite is specifically designed to avoid — asserts exactly one SELECT
    against the transactions table regardless of folio count, not one per
    folio."""
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)

    for i in range(5):
        folio = _folio(db, member, scheme, f"FOLIO-{i}", "ARN-11111")
        _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("1000.00"), Decimal("10.000"), Decimal("100.0000"))

    statements: list[str] = []
    engine = db.get_bind()

    def _capture(conn, cursor, statement, parameters, context, executemany):
        if "transactions" in statement.lower() and statement.strip().lower().startswith("select"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        with patch(
            "app.services.dashboard.distributor_comparison.get_navs_on_or_before",
            new=_mock_nav_batch({scheme.id: (Decimal("100.0000"), date(2024, 6, 1))}),
        ):
            asyncio.run(compute_distributor_comparison(db, [member.id]))
    finally:
        event.remove(engine, "before_cursor_execute", _capture)

    assert len(statements) == 1


def test_compute_distributor_comparison_reuses_entry_inside_ttl_window():
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme, "AAA", "ARN-11111")
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    now = [1000.0]
    nav_lookup = _mock_nav_batch({scheme.id: (Decimal("60.0000"), date.today())})

    with (
        patch("app.services.dashboard.distributor_comparison._distributor_cache_clock", side_effect=lambda: now[0]),
        patch("app.services.dashboard.distributor_comparison.get_navs_on_or_before", new=nav_lookup),
        patch(
            "app.services.dashboard.distributor_comparison.resolve_arn",
            new=AsyncMock(side_effect=_fake_resolve_arn({"ARN-11111": SimpleNamespace(distributor_name="Alpha", status=ArnStatus.ACTIVE)})),
        ),
    ):
        first = asyncio.run(compute_distributor_comparison(db, [member.id]))
        now[0] += 899.0
        second = asyncio.run(compute_distributor_comparison(db, [member.id]))

    assert second == first
    nav_lookup.assert_awaited_once()


def test_compute_distributor_comparison_recomputes_after_ttl_expiry():
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme, "AAA", "ARN-11111")
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    now = [1000.0]
    nav_lookup = _mock_nav_batch({scheme.id: (Decimal("60.0000"), date.today())})

    with (
        patch("app.services.dashboard.distributor_comparison._distributor_cache_clock", side_effect=lambda: now[0]),
        patch("app.services.dashboard.distributor_comparison.get_navs_on_or_before", new=nav_lookup),
        patch(
            "app.services.dashboard.distributor_comparison.resolve_arn",
            new=AsyncMock(side_effect=_fake_resolve_arn({"ARN-11111": SimpleNamespace(distributor_name="Alpha", status=ArnStatus.ACTIVE)})),
        ),
    ):
        asyncio.run(compute_distributor_comparison(db, [member.id]))
        now[0] += 901.0
        asyncio.run(compute_distributor_comparison(db, [member.id]))

    assert nav_lookup.await_count == 2


def test_compute_distributor_comparison_invalidated_by_holdings_cache_generation_bump():
    """The distributor cache is invalidated by the SAME signal
    (invalidate_holdings_cache) that already invalidates compute_holdings'
    own cache — no new invalidation call site is wired anywhere."""
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme, "AAA", "ARN-11111")
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    resolve = AsyncMock(side_effect=_fake_resolve_arn({"ARN-11111": SimpleNamespace(distributor_name="Alpha", status=ArnStatus.ACTIVE)}))

    with (
        patch("app.services.dashboard.distributor_comparison.get_navs_on_or_before", new=_mock_nav_batch({scheme.id: (Decimal("60.0000"), date.today())})),
        patch("app.services.dashboard.distributor_comparison.resolve_arn", new=resolve),
    ):
        first = asyncio.run(compute_distributor_comparison(db, [member.id]))

    # invalidate_holdings_cache only physically purges holdings.py's own
    # _holdings_cache — the entry here isn't deleted by this call, it's
    # rejected on the next read below because its captured generation no
    # longer matches (see compute_distributor_comparison's cache-hit check).
    invalidate_holdings_cache(member.id)
    cache_key = ((member.id,), date.today())
    assert cache_key in _distributor_cache

    with (
        patch("app.services.dashboard.distributor_comparison.get_navs_on_or_before", new=_mock_nav_batch({scheme.id: (Decimal("70.0000"), date.today())})),
        patch("app.services.dashboard.distributor_comparison.resolve_arn", new=resolve),
    ):
        second = asyncio.run(compute_distributor_comparison(db, [member.id]))

    assert Decimal(second[0].current_value) != Decimal(first[0].current_value)
