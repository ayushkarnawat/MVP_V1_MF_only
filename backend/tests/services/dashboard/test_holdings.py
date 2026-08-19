import uuid
import threading
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.holdings import _process_folio_lots, compute_holdings, invalidate_holdings_cache


def _txn(type_, on_date, amount, units, nav) -> Transaction:
    return Transaction(
        id=uuid.uuid4(), folio_id=uuid.uuid4(), import_id=uuid.uuid4(),
        type=type_, date=on_date, amount=amount, units=units, nav=nav,
    )


def test_process_folio_lots_simple_purchase_no_redemption():
    transactions = [
        _txn(TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000")),
    ]
    units_held, cost_basis, realized_gain = _process_folio_lots(transactions)
    assert units_held == Decimal("100.000")
    assert cost_basis == Decimal("5000.00")
    assert realized_gain == Decimal("0")


def test_process_folio_lots_fifo_partial_redemption_across_two_lots():
    """Known-answer test, hand-computed: lot A (100u @ NAV 50), lot B
    (200u @ NAV 60). Redeem 150u @ NAV 80 — FIFO consumes all of A (100u)
    then 50u from B.
    Expected realized_gain = 100*(80-50) + 50*(80-60) = 3000 + 1000 = 4000.
    Expected remaining: lot B has 150u left @ NAV 60 -> cost_basis = 9000,
    units_held = 150."""
    transactions = [
        _txn(TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000")),
        _txn(TransactionType.PURCHASE, date(2024, 6, 1), Decimal("12000.00"), Decimal("200.000"), Decimal("60.0000")),
        _txn(TransactionType.REDEMPTION, date(2024, 9, 1), Decimal("12000.00"), Decimal("150.000"), Decimal("80.0000")),
    ]
    units_held, cost_basis, realized_gain = _process_folio_lots(transactions)
    assert units_held == Decimal("150.000")
    assert cost_basis == Decimal("9000.00")
    assert realized_gain == Decimal("4000.00")


def test_process_folio_lots_full_redemption_leaves_zero_units():
    transactions = [
        _txn(TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000")),
        _txn(TransactionType.REDEMPTION, date(2024, 3, 1), Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000")),
    ]
    units_held, cost_basis, realized_gain = _process_folio_lots(transactions)
    assert units_held == Decimal("0")
    assert cost_basis == Decimal("0")
    assert realized_gain == Decimal("1000.00")


def test_process_folio_lots_dividend_payout_has_no_effect_on_units():
    transactions = [
        _txn(TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000")),
        _txn(TransactionType.DIVIDEND_PAYOUT, date(2024, 4, 1), Decimal("200.00"), Decimal("0.000"), Decimal("52.0000")),
    ]
    units_held, cost_basis, realized_gain = _process_folio_lots(transactions)
    assert units_held == Decimal("100.000")
    assert cost_basis == Decimal("5000.00")
    assert realized_gain == Decimal("0")


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
        id=uuid.uuid4(), amfi_code=amfi_code or uuid.uuid4().hex[:6], isin="INF123", name=name,
        amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.commit()
    return scheme


def _folio(db, member, scheme, folio_number="123/45", plan_type=PlanType.DIRECT):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=folio_number, plan_type=plan_type)
    db.add(folio)
    db.commit()
    return folio


def _persisted_txn(db, folio, type_, on_date, amount, units, nav):
    txn = Transaction(
        id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(),
        type=type_, date=on_date, amount=amount, units=units, nav=nav,
    )
    db.add(txn)
    db.commit()
    return txn


def _mock_nav_batch(result):
    async def lookup(_db, scheme_date_pairs):
        return {scheme.id: result for scheme, _ in scheme_date_pairs}

    return AsyncMock(side_effect=lookup)


def test_compute_holdings_returns_current_value_and_gains_from_nav():
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _persisted_txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    with patch(
        "app.services.dashboard.holdings.get_navs_on_or_before",
        new=_mock_nav_batch((Decimal("60.0000"), date(2024, 6, 1))),
    ), patch(
        "app.services.dashboard.holdings.get_previous_nav_from_cache",
        return_value=(Decimal("59.0000"), date(2024, 5, 31)),
    ):
        rows = asyncio.run(compute_holdings(db, [member.id]))

    assert len(rows) == 1
    row = rows[0]
    assert row.units_held == "100.000"
    assert Decimal(row.amount_invested) == Decimal("5000.00")
    assert Decimal(row.current_value) == Decimal("6000.00")  # 100 * 60
    assert Decimal(row.unrealized_gain) == Decimal("1000.00")  # 6000 - 5000
    assert Decimal(row.today_gain) == Decimal("100.00")  # (60-59) * 100
    assert row.plan_type == PlanType.DIRECT


def test_compute_holdings_merges_two_folios_of_the_same_scheme():
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio_a = _folio(db, member, scheme, folio_number="AAA")
    folio_b = _folio(db, member, scheme, folio_number="BBB")
    _persisted_txn(db, folio_a, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    _persisted_txn(db, folio_b, TransactionType.PURCHASE, date(2024, 2, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    with patch(
        "app.services.dashboard.holdings.get_navs_on_or_before",
        new=_mock_nav_batch((Decimal("60.0000"), date(2024, 6, 1))),
    ), patch(
        "app.services.dashboard.holdings.get_previous_nav_from_cache",
        return_value=None,
    ):
        rows = asyncio.run(compute_holdings(db, [member.id]))

    assert len(rows) == 1
    assert rows[0].units_held == "200.000"
    assert Decimal(rows[0].amount_invested) == Decimal("10000.00")


def test_compute_holdings_separates_direct_and_regular_folios_of_same_scheme():
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    direct = _folio(db, member, scheme, folio_number="DIRECT", plan_type=PlanType.DIRECT)
    regular = _folio(db, member, scheme, folio_number="REGULAR", plan_type=PlanType.REGULAR)
    _persisted_txn(db, direct, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    _persisted_txn(db, regular, TransactionType.PURCHASE, date(2024, 2, 1), Decimal("3000.00"), Decimal("50.000"), Decimal("60.0000"))

    with patch(
        "app.services.dashboard.holdings.get_navs_on_or_before",
        new=_mock_nav_batch((Decimal("70.0000"), date(2024, 6, 1))),
    ), patch(
        "app.services.dashboard.holdings.get_previous_nav_from_cache",
        return_value=None,
    ):
        rows = asyncio.run(compute_holdings(db, [member.id]))

    assert len(rows) == 2
    by_plan = {row.plan_type: row for row in rows}
    assert by_plan[PlanType.DIRECT].units_held == "100.000"
    assert Decimal(by_plan[PlanType.DIRECT].amount_invested) == Decimal("5000.00")
    assert by_plan[PlanType.REGULAR].units_held == "50.000"
    assert Decimal(by_plan[PlanType.REGULAR].amount_invested) == Decimal("3000.00")


def test_compute_holdings_drops_fully_redeemed_scheme():
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _persisted_txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    _persisted_txn(db, folio, TransactionType.REDEMPTION, date(2024, 3, 1), Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))

    rows = asyncio.run(compute_holdings(db, [member.id]))
    assert rows == []


def test_compute_holdings_across_multiple_members_tags_each_row():
    import asyncio

    db = _session()
    member_a = _household_member(db, name="Mom")
    member_b = _household_member(db, name="Dad")
    scheme = _scheme(db)
    folio_a = _folio(db, member_a, scheme)
    folio_b = _folio(db, member_b, scheme)
    _persisted_txn(db, folio_a, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    _persisted_txn(db, folio_b, TransactionType.PURCHASE, date(2024, 1, 1), Decimal("3000.00"), Decimal("60.000"), Decimal("50.0000"))

    with patch(
        "app.services.dashboard.holdings.get_navs_on_or_before",
        new=_mock_nav_batch((Decimal("50.0000"), date(2024, 1, 1))),
    ), patch(
        "app.services.dashboard.holdings.get_previous_nav_from_cache",
        return_value=None,
    ):
        rows = asyncio.run(compute_holdings(db, [member_a.id, member_b.id]))

    assert len(rows) == 2
    names = {row.household_member_name for row in rows}
    assert names == {"Mom", "Dad"}


def test_compute_holdings_processes_same_date_purchase_before_redemption():
    """A same-day purchase and redemption must process purchase-first
    regardless of insertion/id order, since a redemption can't legitimately
    consume units that arrive the same day but are inserted after it."""
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    same_date = date(2024, 3, 1)
    # Insert the REDEMPTION row first (before the PURCHASE it depends on) —
    # this is deliberately the "bad" insertion order the old id-only sort
    # would sometimes produce, to prove the fix doesn't depend on luck.
    _persisted_txn(db, folio, TransactionType.REDEMPTION, same_date, Decimal("3000.00"), Decimal("50.000"), Decimal("60.0000"))
    _persisted_txn(db, folio, TransactionType.PURCHASE, same_date, Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    with patch(
        "app.services.dashboard.holdings.get_navs_on_or_before",
        new=_mock_nav_batch((Decimal("60.0000"), date(2024, 6, 1))),
    ), patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None):
        rows = asyncio.run(compute_holdings(db, [member.id]))

    assert len(rows) == 1
    # Purchase (100u) processed before redemption (50u) -> 50u remain, fully
    # from the purchase lot, cost basis 50*50=2500. If the redemption had
    # processed first (no lots yet), it would silently no-op, leaving
    # units_held=100 and cost_basis=5000 instead — this assertion would
    # catch that regression directly.
    assert rows[0].units_held == "50.000"
    assert Decimal(rows[0].amount_invested) == Decimal("2500.00")


def test_compute_holdings_reuses_same_day_cache_for_sorted_member_set():
    import asyncio

    db = _session()
    member_a = _household_member(db, name="Mom")
    member_b = _household_member(db, name="Dad")
    scheme = _scheme(db)
    folio = _folio(db, member_a, scheme)
    _persisted_txn(
        db, folio, TransactionType.PURCHASE, date(2024, 1, 1),
        Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"),
    )
    nav_lookup = _mock_nav_batch((Decimal("60.0000"), date.today()))

    with (
        patch("app.services.dashboard.holdings.get_navs_on_or_before", new=nav_lookup),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    ):
        first = asyncio.run(compute_holdings(db, [member_a.id, member_b.id]))
        second = asyncio.run(compute_holdings(db, [member_b.id, member_a.id]))

    assert second == first
    nav_lookup.assert_awaited_once()


def test_compute_holdings_caches_delayed_nav_for_holdings_and_allocation_calls():
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _persisted_txn(
        db, folio, TransactionType.PURCHASE, date(2024, 1, 1),
        Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"),
    )
    yesterday = date.fromordinal(date.today().toordinal() - 1)
    nav_lookup = _mock_nav_batch((Decimal("60.0000"), yesterday))

    with (
        patch("app.services.dashboard.holdings.get_navs_on_or_before", new=nav_lookup),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    ):
        holdings_rows = asyncio.run(compute_holdings(db, [member.id]))
        allocation_rows = asyncio.run(compute_holdings(db, [member.id]))

    assert allocation_rows == holdings_rows
    assert holdings_rows[0].current_nav == "60.0000"
    nav_lookup.assert_awaited_once()


def test_compute_holdings_recomputes_expired_entry_through_generation_guard():
    import asyncio

    async def scenario():
        db = _session()
        member = _household_member(db)
        scheme = _scheme(db)
        folio = _folio(db, member, scheme)
        _persisted_txn(
            db, folio, TransactionType.PURCHASE, date(2024, 1, 1),
            Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"),
        )
        now = [1000.0]
        expired_compute_started = asyncio.Event()
        release_expired_compute = asyncio.Event()

        async def lookup(_db, scheme_date_pairs):
            call_number = nav_lookup.await_count
            if call_number == 2:
                expired_compute_started.set()
                await release_expired_compute.wait()
            nav = Decimal(str(59 + call_number))
            return {item.id: (nav, date.today()) for item, _ in scheme_date_pairs}

        with (
            patch("app.services.dashboard.holdings._holdings_cache_clock", side_effect=lambda: now[0]),
            patch("app.services.dashboard.holdings.get_navs_on_or_before", side_effect=lookup) as nav_lookup,
            patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
        ):
            first = await compute_holdings(db, [member.id])
            now[0] += 901.0
            expired_task = asyncio.create_task(compute_holdings(db, [member.id]))
            await asyncio.wait_for(expired_compute_started.wait(), timeout=1)
            invalidate_holdings_cache(member.id)
            release_expired_compute.set()
            expired = await expired_task
            fresh = await compute_holdings(db, [member.id])

        assert first[0].current_nav == "60"
        assert expired[0].current_nav == "61"
        assert fresh[0].current_nav == "62"
        assert nav_lookup.await_count == 3

    asyncio.run(scenario())


def test_compute_holdings_reuses_entry_inside_ttl_window():
    import asyncio

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _persisted_txn(
        db, folio, TransactionType.PURCHASE, date(2024, 1, 1),
        Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"),
    )
    now = [1000.0]
    nav_lookup = _mock_nav_batch((Decimal("60.0000"), date.today()))

    with (
        patch("app.services.dashboard.holdings._holdings_cache_clock", side_effect=lambda: now[0]),
        patch("app.services.dashboard.holdings.get_navs_on_or_before", new=nav_lookup),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    ):
        first = asyncio.run(compute_holdings(db, [member.id]))
        now[0] += 899.0
        second = asyncio.run(compute_holdings(db, [member.id]))

    assert second == first
    nav_lookup.assert_awaited_once()


def test_invalidation_cannot_interleave_between_generation_check_and_publish():
    import asyncio
    import app.services.dashboard.holdings as holdings_module

    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _persisted_txn(
        db, folio, TransactionType.PURCHASE, date(2024, 1, 1),
        Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"),
    )
    publish_reached = threading.Event()
    invalidation_attempted = threading.Event()
    invalidation_completed = threading.Event()
    original_cache = holdings_module._holdings_cache

    class PausingCache(dict):
        def __setitem__(self, key, value):
            publish_reached.set()
            assert invalidation_attempted.wait(timeout=2)
            # On the broken implementation invalidation completes in this
            # exact gap. With the cache lock it must wait until publication.
            invalidation_completed.wait(timeout=0.2)
            super().__setitem__(key, value)

    holdings_module._holdings_cache = PausingCache(original_cache)

    def invalidate_during_publish():
        assert publish_reached.wait(timeout=2)
        invalidation_attempted.set()
        invalidate_holdings_cache(member.id)
        invalidation_completed.set()

    invalidator = threading.Thread(target=invalidate_during_publish)
    invalidator.start()
    try:
        with (
            patch(
                "app.services.dashboard.holdings.get_navs_on_or_before",
                new=_mock_nav_batch((Decimal("60.0000"), date.today())),
            ),
            patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
        ):
            asyncio.run(compute_holdings(db, [member.id]))
        invalidator.join(timeout=2)
        assert not invalidator.is_alive()
        cache_key = ((member.id,), date.today())
        assert cache_key not in holdings_module._holdings_cache
    finally:
        holdings_module._holdings_cache = original_cache


def test_late_compute_cannot_publish_after_import_invalidation():
    import asyncio

    async def scenario():
        db = _session()
        member = _household_member(db)
        scheme = _scheme(db)
        folio = _folio(db, member, scheme)
        _persisted_txn(
            db, folio, TransactionType.PURCHASE, date(2024, 1, 1),
            Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"),
        )
        stale_compute_started = asyncio.Event()
        release_stale_compute = asyncio.Event()

        async def lookup(_db, scheme_date_pairs):
            if not stale_compute_started.is_set():
                stale_compute_started.set()
                await release_stale_compute.wait()
                nav = Decimal("60.0000")
            else:
                nav = Decimal("61.0000")
            return {item.id: (nav, date.today()) for item, _ in scheme_date_pairs}

        with (
            patch("app.services.dashboard.holdings.get_navs_on_or_before", side_effect=lookup) as nav_lookup,
            patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
        ):
            stale_task = asyncio.create_task(compute_holdings(db, [member.id]))
            await stale_compute_started.wait()
            invalidate_holdings_cache(member.id)
            release_stale_compute.set()
            stale = await stale_task
            fresh = await compute_holdings(db, [member.id])

        assert stale[0].current_nav == "60.0000"
        assert fresh[0].current_nav == "61.0000"
        assert nav_lookup.await_count == 2

    asyncio.run(scenario())
