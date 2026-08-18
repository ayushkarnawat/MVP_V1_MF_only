import asyncio
import threading
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.services.analytics.ter as ter_module
from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme, SchemeTer
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.ter import _ensure_ter_fresh, compute_direct_regular_ter_comparison, compute_weighted_ter


@pytest.fixture(autouse=True)
def _reset_ter_refresh_backoff():
    # The backoff state is a module-level global (mirrors nav.py's warm
    # cache) so it persists across tests within one pytest process unless
    # explicitly cleared — without this, an earlier test's refresh attempt
    # would silently suppress a later test's expected refresh call.
    ter_module._last_ter_refresh_attempt = None
    yield
    ter_module._last_ter_refresh_attempt = None


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _household_member(db):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Self", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _scheme(db, name="Test Fund"):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name=name, amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    return scheme


def _folio_with_purchase(db, member, scheme, amount, units, nav, plan_type=PlanType.DIRECT):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=plan_type)
    db.add(folio)
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=date(2024, 1, 1), amount=amount, units=units, nav=nav))
    db.commit()
    return folio


def _current_month_start():
    return date.today().replace(day=1)


def test_compute_weighted_ter_empty_when_no_holdings():
    db = _session()
    member = _household_member(db)
    summary = asyncio.run(compute_weighted_ter(db, [member.id]))
    assert summary.weighted_ter is None
    assert Decimal(summary.total_value) == Decimal("0")
    assert summary.uncovered_schemes == []


def _mock_holdings(scheme_a, scheme_b):
    return (
        patch(
            "app.services.dashboard.holdings.get_nav_on_or_before",
            new=AsyncMock(side_effect=lambda db_, scheme, on_date: (Decimal("60.0000"), date(2024, 6, 1)) if scheme.id == scheme_a.id else (Decimal("40.0000"), date(2024, 6, 1))),
        ),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    )


def test_compute_weighted_ter_computes_holding_value_weighted_average():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    scheme_b = _scheme(db, "Fund B")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    _folio_with_purchase(db, member, scheme_b, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"))
    db.add(SchemeTer(scheme_id=scheme_a.id, reference_period=_current_month_start(), ter_value=Decimal("1.00")))
    db.add(SchemeTer(scheme_id=scheme_b.id, reference_period=_current_month_start(), ter_value=Decimal("2.00")))
    db.commit()

    p1, p2 = _mock_holdings(scheme_a, scheme_b)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(side_effect=AssertionError("should not refresh"))):
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    # current_value: scheme_a 100*60=6000, scheme_b 100*40=4000, total 10000.
    # weighted TER = (6000*1.00 + 4000*2.00) / 10000 = (6000+8000)/10000 = 1.40
    assert Decimal(summary.weighted_ter) == Decimal("1.40")
    assert Decimal(summary.total_value) == Decimal("10000.00")
    assert Decimal(summary.covered_value) == Decimal("10000.00")
    assert summary.reference_period == _current_month_start()
    assert summary.uncovered_schemes == []


def test_compute_weighted_ter_triggers_refresh_when_current_month_ter_missing():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    scheme_b = _scheme(db, "Fund B")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    _folio_with_purchase(db, member, scheme_b, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"))
    # No scheme_ter rows exist yet at all.

    async def _fake_refresh(db_):
        db_.add(SchemeTer(scheme_id=scheme_a.id, reference_period=_current_month_start(), ter_value=Decimal("1.00")))
        db_.add(SchemeTer(scheme_id=scheme_b.id, reference_period=_current_month_start(), ter_value=Decimal("2.00")))
        db_.commit()
        return True

    p1, p2 = _mock_holdings(scheme_a, scheme_b)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(side_effect=_fake_refresh)) as mock_refresh:
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    mock_refresh.assert_awaited_once()
    assert Decimal(summary.weighted_ter) == Decimal("1.40")


def test_compute_weighted_ter_flags_uncovered_scheme_without_crashing():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    scheme_b = _scheme(db, "Fund B (no TER ever resolved)")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    _folio_with_purchase(db, member, scheme_b, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"))
    db.add(SchemeTer(scheme_id=scheme_a.id, reference_period=_current_month_start(), ter_value=Decimal("1.00")))
    db.commit()

    async def _fake_refresh(db_):
        return False  # scheme_b's fuzzy match never resolves — same as a live failure.

    p1, p2 = _mock_holdings(scheme_a, scheme_b)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(side_effect=_fake_refresh)):
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    assert Decimal(summary.weighted_ter) == Decimal("1.00")
    assert Decimal(summary.covered_value) == Decimal("6000.00")
    assert Decimal(summary.total_value) == Decimal("10000.00")
    assert summary.uncovered_schemes == ["Fund B (no TER ever resolved)"]


def test_compute_weighted_ter_returns_none_weighted_ter_when_nothing_covered():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))

    p1, p2 = _mock_holdings(scheme_a, scheme_a)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(return_value=False)):
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    assert summary.weighted_ter is None
    assert Decimal(summary.covered_value) == Decimal("0")
    assert summary.uncovered_schemes == ["Fund A"]


def test_compute_direct_regular_ter_comparison_splits_by_plan_type():
    db = _session()
    member = _household_member(db)
    direct_scheme = _scheme(db, "Direct Fund")
    regular_scheme = _scheme(db, "Regular Fund")
    _folio_with_purchase(db, member, direct_scheme, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"), plan_type=PlanType.DIRECT)
    _folio_with_purchase(db, member, regular_scheme, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"), plan_type=PlanType.REGULAR)
    db.add(SchemeTer(scheme_id=direct_scheme.id, reference_period=_current_month_start(), ter_value=Decimal("0.50")))
    db.add(SchemeTer(scheme_id=regular_scheme.id, reference_period=_current_month_start(), ter_value=Decimal("1.75")))
    db.commit()

    p1, p2 = _mock_holdings(direct_scheme, regular_scheme)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(side_effect=AssertionError("should not refresh"))):
        comparison = asyncio.run(compute_direct_regular_ter_comparison(db, [member.id]))

    assert Decimal(comparison.direct.weighted_ter) == Decimal("0.50")
    assert Decimal(comparison.direct.total_value) == Decimal("6000.00")
    assert Decimal(comparison.regular.weighted_ter) == Decimal("1.75")
    assert Decimal(comparison.regular.total_value) == Decimal("4000.00")


def test_ensure_ter_fresh_backs_off_after_recent_attempt_even_if_still_missing():
    db = _session()
    scheme = _scheme(db, "Fund Never Resolved")
    # refresh_ter_data never actually resolves this scheme's TER (e.g. a
    # permanently-unresolvable fuzzy match) — coverage stays missing after
    # every refresh, so a naive "missing => refresh" check would re-scan
    # AMFI's whole feed on every single call.
    mock_refresh = AsyncMock(return_value=False)
    now = [1000.0]
    with (
        patch("app.services.analytics.ter.refresh_ter_data", new=mock_refresh),
        patch.object(ter_module, "_ter_refresh_clock", side_effect=lambda: now[0]),
    ):
        asyncio.run(_ensure_ter_fresh(db, {scheme.id}))
        now[0] += 60  # well within the backoff window
        asyncio.run(_ensure_ter_fresh(db, {scheme.id}))

    mock_refresh.assert_awaited_once()


def test_ensure_ter_fresh_retries_after_backoff_window_expires():
    db = _session()
    scheme = _scheme(db, "Fund Never Resolved")
    mock_refresh = AsyncMock(return_value=False)
    now = [1000.0]
    with (
        patch("app.services.analytics.ter.refresh_ter_data", new=mock_refresh),
        patch.object(ter_module, "_ter_refresh_clock", side_effect=lambda: now[0]),
    ):
        asyncio.run(_ensure_ter_fresh(db, {scheme.id}))
        now[0] += ter_module._TER_REFRESH_BACKOFF_SECONDS + 1
        asyncio.run(_ensure_ter_fresh(db, {scheme.id}))

    assert mock_refresh.await_count == 2


def test_ensure_ter_fresh_coalesces_concurrent_refresh_attempts():
    db = _session()
    scheme = _scheme(db, "Fund A")

    async def _fake_refresh(db_):
        await asyncio.sleep(0.05)
        db_.add(SchemeTer(scheme_id=scheme.id, reference_period=_current_month_start(), ter_value=Decimal("1.00")))
        db_.commit()
        return True

    async def _run_concurrent():
        await asyncio.gather(
            _ensure_ter_fresh(db, {scheme.id}),
            _ensure_ter_fresh(db, {scheme.id}),
        )

    mock_refresh = AsyncMock(side_effect=_fake_refresh)
    with patch("app.services.analytics.ter.refresh_ter_data", new=mock_refresh):
        asyncio.run(_run_concurrent())

    mock_refresh.assert_awaited_once()


def test_ensure_ter_fresh_lock_survives_contention_from_a_different_event_loop():
    """Review finding: `_ter_refresh_lock` was a bare module-global
    `asyncio.Lock()`. Python's `_LoopBoundMixin` only binds a lock to a
    running loop -- and enforces that binding -- once it's actually
    contended (the uncontended fast path in `Lock.acquire` never touches
    the loop at all), so two *sequential*, non-overlapping `asyncio.run()`
    calls never hit this. It only breaks under genuine concurrent
    contention from two different event loops at once -- e.g. two OS
    threads each running their own loop, which is exactly what this test
    reproduces (each thread gets its own DB session/scheme so only the
    lock/backoff state is contended across loops).

    Also covers a second, related finding on that same per-loop-lock fix:
    the per-loop lock only coalesces callers on the SAME loop, so the
    shared `_last_ter_refresh_attempt` backoff check-and-claim must itself
    be atomic across threads (`_claim_ter_refresh_slot`'s `threading.Lock`)
    -- otherwise two different loops could both slip past a stale
    timestamp and both trigger a refresh. `mock_refresh.assert_awaited_once()`
    below asserts exactly that: only the first thread's refresh ever fires."""
    refresh_started = threading.Event()
    release_refresh = threading.Event()

    async def _shared_refresh(db_):
        refresh_started.set()
        await asyncio.to_thread(release_refresh.wait, 5)
        return True

    mock_refresh = AsyncMock(side_effect=_shared_refresh)
    errors: list[BaseException] = []

    def _run(wait_for_first: bool):
        # sqlite connections are thread-affine -- each thread needs its own
        # engine/session, created AND torn down on that same thread, never
        # shared with or finalized from another thread (an engine disposed
        # from the wrong thread at GC time raises `sqlite3.ProgrammingError`).
        db_ = None
        try:
            if wait_for_first:
                assert refresh_started.wait(5), "first thread never entered refresh"
            db_ = _session()
            scheme_ = _scheme(db_)
            asyncio.run(_ensure_ter_fresh(db_, {scheme_.id}))
        except BaseException as exc:  # noqa: BLE001 -- must catch RuntimeError from a different thread
            errors.append(exc)
        finally:
            if db_ is not None:
                db_.close()
                db_.get_bind().dispose()
            if wait_for_first:
                release_refresh.set()  # let the first thread's blocked refresh finish

    with patch("app.services.analytics.ter.refresh_ter_data", new=mock_refresh):
        t1 = threading.Thread(target=_run, args=(False,))
        t2 = threading.Thread(target=_run, args=(True,))
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)

    assert not t1.is_alive(), "first thread deadlocked"
    assert not t2.is_alive(), "second thread deadlocked"
    assert errors == []
    mock_refresh.assert_awaited_once()


def test_compute_direct_regular_ter_comparison_empty_bucket_when_no_regular_holdings():
    db = _session()
    member = _household_member(db)
    direct_scheme = _scheme(db, "Direct Fund")
    _folio_with_purchase(db, member, direct_scheme, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"), plan_type=PlanType.DIRECT)
    db.add(SchemeTer(scheme_id=direct_scheme.id, reference_period=_current_month_start(), ter_value=Decimal("0.50")))
    db.commit()

    p1, p2 = _mock_holdings(direct_scheme, direct_scheme)
    with p1, p2, patch("app.services.analytics.ter.refresh_ter_data", new=AsyncMock(side_effect=AssertionError("should not refresh"))):
        comparison = asyncio.run(compute_direct_regular_ter_comparison(db, [member.id]))

    assert comparison.regular.weighted_ter is None
    assert Decimal(comparison.regular.total_value) == Decimal("0")
