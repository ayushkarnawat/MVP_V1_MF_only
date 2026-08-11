import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme, SchemeAaum
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.category_ranking import (
    _aum_weighted_average,
    _blend_returns,
    _cagr,
    _rank_and_percentile,
    compute_category_ranking,
)

_TODAY = date.today()
_START_3Y = _TODAY.replace(year=_TODAY.year - 3)
_START_5Y = _TODAY.replace(year=_TODAY.year - 5)


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


def _scheme(db, name="Test Fund", sebi_category="Equity Scheme - Flexi Cap Fund"):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name=name, amc_name="HDFC AMC", sebi_category=sebi_category)
    db.add(scheme)
    db.commit()
    return scheme


def _folio_with_purchase(db, member, scheme, amount, units, nav, txn_date, plan_type=PlanType.DIRECT):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=plan_type)
    db.add(folio)
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=txn_date, amount=amount, units=units, nav=nav))
    db.commit()
    return folio


def _nav_side_effect(nav_data: dict[uuid.UUID, dict[str, Decimal]]):
    async def _fn(db_, scheme, on_date):
        entry = nav_data.get(scheme.id)
        if entry is None:
            return None
        if on_date == _TODAY:
            key = "today"
        elif on_date == _START_3Y:
            key = "start3"
        elif on_date == _START_5Y:
            key = "start5"
        else:
            return None
        value = entry.get(key)
        return (value, on_date) if value is not None else None

    return _fn


def _mock_nav(nav_data):
    side_effect = _nav_side_effect(nav_data)
    return (
        patch("app.services.dashboard.holdings.get_nav_on_or_before", new=AsyncMock(side_effect=side_effect)),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
        patch("app.services.analytics.category_ranking.get_nav_on_or_before", new=AsyncMock(side_effect=side_effect)),
    )


def _mock_universe(schemes):
    return patch("app.services.analytics.category_ranking.get_category_universe", new=AsyncMock(return_value=schemes))


def test_cagr_exact_ten_percent_over_three_years():
    # 1.1 ** 3 = 1.331
    result = _cagr(Decimal("100"), Decimal("133.1"), 3)
    assert abs(result - Decimal("0.10")) < Decimal("0.0001")


def test_blend_returns_falls_back_to_3yr_only_when_no_5yr():
    assert _blend_returns(Decimal("0.20"), None) == Decimal("0.20")


def test_blend_returns_weights_3yr_40_and_5yr_60():
    result = _blend_returns(Decimal("0.20"), Decimal("0.10"))
    assert result == Decimal("0.4") * Decimal("0.20") + Decimal("0.6") * Decimal("0.10")


def test_rank_and_percentile_orders_descending_by_return():
    ids = [uuid.uuid4() for _ in range(4)]
    returns = {ids[0]: Decimal("0.30"), ids[1]: Decimal("0.10"), ids[2]: Decimal("0.20"), ids[3]: Decimal("0.05")}
    rank, percentile = _rank_and_percentile(returns, ids[2])
    assert rank == 2
    assert percentile == Decimal("50")


def test_rank_and_percentile_returns_none_when_scheme_not_in_pool():
    assert _rank_and_percentile({}, uuid.uuid4()) is None


def test_aum_weighted_average_weights_by_aum():
    id1, id2 = uuid.uuid4(), uuid.uuid4()
    returns = {id1: Decimal("0.10"), id2: Decimal("0.20")}
    aaum = {id1: Decimal("100"), id2: Decimal("300")}
    # (0.10*100 + 0.20*300) / 400 = (10+60)/400 = 0.175
    assert _aum_weighted_average(returns, aaum) == Decimal("0.175")


def test_aum_weighted_average_returns_none_with_no_aum_data():
    assert _aum_weighted_average({uuid.uuid4(): Decimal("0.10")}, {}) is None


def test_compute_category_ranking_empty_when_no_holdings():
    db = _session()
    member = _household_member(db)
    summary = asyncio.run(compute_category_ranking(db, [member.id]))
    assert summary.funds == []


def test_compute_category_ranking_marks_category_unavailable():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db, sebi_category="")
    _folio_with_purchase(db, member, scheme, Decimal("1000"), Decimal("100"), Decimal("10"), _START_3Y)

    nav_data = {scheme.id: {"today": Decimal("12")}}
    p1, p2, p3 = _mock_nav(nav_data)
    with p1, p2, p3:
        summary = asyncio.run(compute_category_ranking(db, [member.id]))

    row = summary.funds[0]
    assert row.category_unavailable is True
    assert row.sebi_category is None


def test_compute_category_ranking_ranks_against_peers_not_thin():
    db = _session()
    member = _household_member(db)
    held = _scheme(db, "Held Fund")
    peers = [_scheme(db, f"Peer {i}") for i in range(4)]
    _folio_with_purchase(db, member, held, Decimal("1000"), Decimal("100"), Decimal("10"), _START_3Y)

    # Held scheme grows 100 -> 130 over 3yr (30% CAGR-ish window return);
    # peers grow at progressively smaller rates so held scheme ranks #1.
    nav_data = {held.id: {"today": Decimal("13"), "start3": Decimal("10")}}
    for i, peer in enumerate(peers):
        nav_data[peer.id] = {"today": Decimal(str(11 - i)), "start3": Decimal("10")}

    p1, p2, p3 = _mock_nav(nav_data)
    with p1, p2, p3, _mock_universe([held, *peers]):
        summary = asyncio.run(compute_category_ranking(db, [member.id]))

    row = summary.funds[0]
    assert row.category_unavailable is False
    assert row.insufficient_history is False
    assert row.category_rank == 1
    assert row.category_size == 5
    assert row.thin_category is False
    assert Decimal(row.percentile) == Decimal("80")


def test_compute_category_ranking_flags_thin_category():
    db = _session()
    member = _household_member(db)
    held = _scheme(db, "Held Fund")
    peer = _scheme(db, "Peer Fund")
    _folio_with_purchase(db, member, held, Decimal("1000"), Decimal("100"), Decimal("10"), _START_3Y)

    nav_data = {
        held.id: {"today": Decimal("13"), "start3": Decimal("10")},
        peer.id: {"today": Decimal("11"), "start3": Decimal("10")},
    }
    p1, p2, p3 = _mock_nav(nav_data)
    with p1, p2, p3, _mock_universe([held, peer]):
        summary = asyncio.run(compute_category_ranking(db, [member.id]))

    row = summary.funds[0]
    assert row.category_size == 2
    assert row.thin_category is True


def test_compute_category_ranking_blends_3yr_and_5yr_when_both_available():
    db = _session()
    member = _household_member(db)
    held = _scheme(db, "Held Fund")
    peers = [_scheme(db, f"Peer {i}") for i in range(4)]
    _folio_with_purchase(db, member, held, Decimal("1000"), Decimal("100"), Decimal("10"), _START_5Y)

    # 3yr: 10 -> 13 (30% window return); 5yr: 10 -> 20 (100% window return).
    nav_data = {
        held.id: {"today": Decimal("13"), "start3": Decimal("10"), "start5": Decimal("10")},
    }
    # Patch NAV so the 5yr lookup for "held" actually resolves to a
    # different figure at start5 vs start3 by giving distinct NAV values
    # keyed by exact date via a richer side effect below instead.
    for i, peer in enumerate(peers):
        nav_data[peer.id] = {"today": Decimal("11"), "start3": Decimal("10")}

    async def _fn(db_, scheme, on_date):
        if scheme.id == held.id:
            if on_date == _TODAY:
                return Decimal("20"), on_date
            if on_date == _START_3Y:
                return Decimal("13"), on_date
            if on_date == _START_5Y:
                return Decimal("10"), on_date
            return None
        entry = nav_data.get(scheme.id)
        if entry is None:
            return None
        if on_date == _TODAY:
            key = "today"
        elif on_date == _START_3Y:
            key = "start3"
        else:
            return None
        value = entry.get(key)
        return (value, on_date) if value is not None else None

    with (
        patch("app.services.dashboard.holdings.get_nav_on_or_before", new=AsyncMock(side_effect=_fn)),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
        patch("app.services.analytics.category_ranking.get_nav_on_or_before", new=AsyncMock(side_effect=_fn)),
        _mock_universe([held, *peers]),
    ):
        summary = asyncio.run(compute_category_ranking(db, [member.id]))

    row = summary.funds[0]
    r3 = _cagr(Decimal("13"), Decimal("20"), 3)
    r5 = _cagr(Decimal("10"), Decimal("20"), 5)
    expected = Decimal("0.4") * r3 + Decimal("0.6") * r5
    assert Decimal(row.scheme_return) == expected


def test_compute_category_ranking_insufficient_history_for_held_scheme():
    db = _session()
    member = _household_member(db)
    held = _scheme(db, "New Fund")
    peer = _scheme(db, "Peer Fund")
    recent_purchase = _TODAY.replace(year=_TODAY.year - 1)
    _folio_with_purchase(db, member, held, Decimal("1000"), Decimal("100"), Decimal("10"), recent_purchase)

    # No start3/start5 NAV data for `held` -- launched too recently.
    nav_data = {
        held.id: {"today": Decimal("11")},
        peer.id: {"today": Decimal("11"), "start3": Decimal("10")},
    }
    p1, p2, p3 = _mock_nav(nav_data)
    with p1, p2, p3, _mock_universe([held, peer]):
        summary = asyncio.run(compute_category_ranking(db, [member.id]))

    row = summary.funds[0]
    assert row.insufficient_history is True
    assert row.scheme_return is None
    assert row.category_rank is None


def test_compute_category_ranking_category_avg_none_without_aaum_data():
    db = _session()
    member = _household_member(db)
    held = _scheme(db, "Held Fund")
    _folio_with_purchase(db, member, held, Decimal("1000"), Decimal("100"), Decimal("10"), _START_3Y)

    nav_data = {held.id: {"today": Decimal("13"), "start3": Decimal("10")}}
    p1, p2, p3 = _mock_nav(nav_data)
    with p1, p2, p3, _mock_universe([held]):
        summary = asyncio.run(compute_category_ranking(db, [member.id]))

    assert summary.funds[0].category_avg_return is None


def test_compute_category_ranking_uses_aum_weighted_average():
    db = _session()
    member = _household_member(db)
    held = _scheme(db, "Held Fund")
    peer = _scheme(db, "Peer Fund")
    _folio_with_purchase(db, member, held, Decimal("1000"), Decimal("100"), Decimal("10"), _START_3Y)

    db.add(SchemeAaum(scheme_id=held.id, reference_period=date(2026, 3, 31), aaum_value=Decimal("100")))
    db.add(SchemeAaum(scheme_id=peer.id, reference_period=date(2026, 3, 31), aaum_value=Decimal("300")))
    db.commit()

    nav_data = {
        held.id: {"today": Decimal("13"), "start3": Decimal("10")},
        peer.id: {"today": Decimal("12"), "start3": Decimal("10")},
    }
    p1, p2, p3 = _mock_nav(nav_data)
    with p1, p2, p3, _mock_universe([held, peer]):
        summary = asyncio.run(compute_category_ranking(db, [member.id]))

    row = summary.funds[0]
    held_return = _cagr(Decimal("10"), Decimal("13"), 3)
    peer_return = _cagr(Decimal("10"), Decimal("12"), 3)
    expected = (held_return * Decimal("100") + peer_return * Decimal("300")) / Decimal("400")
    assert Decimal(row.category_avg_return) == expected
