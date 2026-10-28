from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import RootModel
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import fund_page
from app.api.home import get_now_ist
from app.db.base import Base
from app.db.session import get_db
from app.models.analytics import AnalyticsSection
from app.models.enums import (
    AssetType,
    BenchmarkIndex,
    BenchmarkReturnType,
    MarketCapBucket,
    SchemePlanType,
    SchemeSource,
)
from app.models.reference import BenchmarkIndexHistory, NavHistory, Scheme, SchemeTer
from app.models.transaction import Transaction
from app.services.analytics.recompute import _upsert_section
from app.services.analytics.scheme_universe import CategoryPeers
from app.services.auth.session import get_active_user
from app.services.dashboard.holdings import _holdings_cache, _holdings_cache_generation
from app.services.fund_page.peer_cache import peer_cache
from tests.services.fund_page.factories import (
    Household,
    add_aaum,
    add_disclosure_batch,
    add_folio,
    add_manager,
    add_market_cap,
    add_purchase,
    add_scheme,
    add_stock_master,
    add_user_household,
    fx_hold,
)


FIXED_NOW = datetime(2026, 10, 23, 18, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))
EQUITY_CATEGORY = "Equity Scheme - Flexi Cap Fund"


class _Payload(RootModel[dict]):
    pass


class _FixtureUniverse:
    def __init__(self, limit: int | None = None):
        self.limit = limit

    async def get_category_peers(self, db, sebi_category, plan_type):
        schemes = (
            db.query(Scheme)
            .filter(Scheme.sebi_category == sebi_category, Scheme.plan_type == plan_type)
            .order_by(Scheme.id)
            .all()
        )
        if self.limit is not None:
            schemes = schemes[: self.limit]
        return CategoryPeers(
            schemes=schemes,
            fund_count=len(schemes),
            representative_of={scheme.id: scheme.id for scheme in schemes},
        )


@dataclass
class FundFixtureRuntime:
    client: TestClient
    household: Household
    scheme_id: uuid.UUID
    other_scheme_id: uuid.UUID
    debt_scheme_id: uuid.UUID
    young_scheme_id: uuid.UUID
    cas_scheme_id: uuid.UUID
    folio_id: uuid.UUID
    engine: object
    universe_patch: object

    def close(self) -> None:
        self.client.close()
        self.universe_patch.stop()
        _holdings_cache.clear()
        _holdings_cache_generation.clear()
        peer_cache.clear()
        self.engine.dispose()


def _daily_series(db, scheme, start: date, end: date, annual: Decimal, final: Decimal):
    days = Decimal((end - start).days)
    base = final / ((Decimal("1") + annual) ** (days / Decimal("365")))
    day = start
    while day <= end:
        elapsed = Decimal((day - start).days) / Decimal("365")
        value = (base * ((Decimal("1") + annual) ** elapsed)).quantize(Decimal("0.0001"))
        db.add(NavHistory(scheme_id=scheme.id, date=day, nav=value))
        day += timedelta(days=1)


def _tri_series(db, index: BenchmarkIndex, start: date, end: date, annual: Decimal):
    day = start
    while day <= end:
        elapsed = Decimal((day - start).days) / Decimal("365")
        value = (Decimal("10000") * ((Decimal("1") + annual) ** elapsed)).quantize(Decimal("0.01"))
        db.add(BenchmarkIndexHistory(
            index_name=index, date=day, return_type=BenchmarkReturnType.TRI, value=value,
        ))
        day += timedelta(days=1)


def _score_row(scheme: Scheme) -> dict:
    return {
        "scheme_id": str(scheme.id), "scheme_name": scheme.name,
        "category_unavailable": False, "insufficient_history": False,
        "thin_category": False, "risk_adjusted_tier": 4,
        "cost_adjustment": "0.25", "final_score": "78.50",
        "return_percentile": "82.00", "risk_percentile": "72.00",
        "consistency_hit_rate": "80.00", "scheme_return": "0.1150",
        "category_avg_return": "0.0950", "downside_deviation": "0.0410",
        "category_avg_downside_deviation": "0.0520", "consistency_hits": 4,
        "consistency_total_windows": 5,
    }


def _put_sections(db, household: Household, scheme: Scheme, other: Scheme):
    rows = {
        "score": {"score": {"funds": [_score_row(scheme)]}},
        "benchmark_funds": {"comparison": {"funds": [
            {"scheme_id": str(scheme.id), "fund_xirr": "0.1234"},
        ]}},
        "overlap": {"overlap": {"pairs_above_low": [{
            "fund_a": {"scheme_id": str(scheme.id), "scheme_name": scheme.name},
            "fund_b": {"scheme_id": str(other.id), "scheme_name": other.name},
            "overlap_pct": "35.0000",
        }]}},
        "allocation": {"allocation": {"total_value": "2380.00"}},
    }
    for name, payload in rows.items():
        _upsert_section(db, household.user_id, "combined", None, name, _Payload(payload))
    db.flush()
    fixed = FIXED_NOW.astimezone(timezone.utc)
    for row in db.query(AnalyticsSection).all():
        row.computed_at = fixed


def _seed(db, variant: str):
    household = add_user_household(db)
    held = fx_hold(db, household)
    main = held.scheme
    db.query(NavHistory).filter(NavHistory.scheme_id == main.id).delete()
    start = date(2020, 10, 23)
    _daily_series(db, main, start, FIXED_NOW.date(), Decimal("0.10"), Decimal("15"))

    peers = []
    for index in range(6):
        peer = add_scheme(
            db, f"golden-peer-{index}", EQUITY_CATEGORY, SchemePlanType.DIRECT,
            f"GOLDPEER{index}", name=f"Golden Peer {index + 1} Fund",
        )
        _daily_series(
            db, peer, start, FIXED_NOW.date(), Decimal("0.075") + Decimal(index) / Decimal("100"),
            Decimal("12") + Decimal(index),
        )
        add_aaum(db, peer, Decimal("10000000") * Decimal(index + 1), date(2026, 9, 30))
        peers.append(peer)

    other = peers[0]
    other_folio = add_folio(db, other, household.dev_id, "PEER-001")
    add_purchase(db, other_folio, date(2025, 8, 1), Decimal("10"), Decimal("10"))

    debt = add_scheme(
        db, "golden-debt", "Debt Scheme - Corporate Bond Fund", SchemePlanType.DIRECT,
        "GOLDDEBT", name="Golden Corporate Bond Fund",
    )
    _daily_series(db, debt, date(2023, 10, 23), FIXED_NOW.date(), Decimal("0.07"), Decimal("12"))
    young = add_scheme(
        db, "golden-young", EQUITY_CATEGORY, SchemePlanType.DIRECT, "GOLDYOUNG",
        name="Golden Young Flexi Cap Fund",
    )
    _daily_series(db, young, date(2026, 3, 23), FIXED_NOW.date(), Decimal("0.08"), Decimal("11"))
    cas = add_scheme(
        db, "golden-cas", EQUITY_CATEGORY, SchemePlanType.DIRECT, None,
        name="Golden Statement Priced Fund",
    )
    cas.source = SchemeSource.CAS_ONLY
    cas_folio = add_folio(db, cas, household.asha_id, "CAS-ONLY-1")

    _tri_series(db, BenchmarkIndex.NIFTY_500, start, FIXED_NOW.date(), Decimal("0.12"))
    _tri_series(db, BenchmarkIndex.NIFTY_50, start, FIXED_NOW.date(), Decimal("0.11"))

    holdings = []
    sectors = ["Financial Services", "IT", "Industrials", "Healthcare"]
    buckets = [MarketCapBucket.LARGE, MarketCapBucket.MID, MarketCapBucket.SMALL]
    for index in range(12):
        isin = f"INEGOLD{index:05d}"
        sector = sectors[index % len(sectors)] if index != 11 else None
        holdings.append((
            f"Golden Stock {index + 1}", isin, Decimal("5") + Decimal(index % 4),
            AssetType.EQUITY_DOMESTIC, sector,
        ))
        add_stock_master(
            db, isin, name=f"Golden Stock {index + 1}", sector=sector,
            as_of=date(2026, 9, 30),
        )
        add_market_cap(db, isin, buckets[index % 3], date(2026, 9, 1))
    holdings.extend([
        ("Government Bond", None, Decimal("12"), AssetType.DEBT, "Sovereign"),
        ("Cash and equivalents", None, Decimal("4"), AssetType.CASH_EQUIVALENT, None),
    ])
    add_disclosure_batch(db, main, date(2026, 9, 30), holdings)
    add_disclosure_batch(db, other, date(2026, 9, 30), [
        (f"Golden Stock {index + 1}", f"INEGOLD{index:05d}", Decimal("10"),
         AssetType.EQUITY_DOMESTIC, sectors[index % len(sectors)])
        for index in range(3)
    ])

    add_manager(
        db, main, "Ananya Shah", date(2026, 9, 30), role="Fund Manager",
        sequence_order=0, managing_since=date(2018, 4, 1),
    )
    add_manager(
        db, main, "Vikram Iyer", date(2026, 9, 30), role="Co-Fund Manager",
        sequence_order=1, managing_since=date(2021, 7, 1),
    )
    for scheme in [main, *peers]:
        db.add(SchemeTer(
            scheme_id=scheme.id, reference_period=date(2026, 9, 30),
            ter_value=Decimal("0.70") + Decimal(peers.index(scheme) if scheme in peers else 0) / Decimal("10"),
        ))
    _put_sections(db, household, main, other)

    if variant == "not_held_by_member":
        dev_folio_id = held.dev_folio.id
        transaction = db.query(Transaction).filter(Transaction.folio_id == dev_folio_id).one()
        db.delete(transaction)
    elif variant == "cas_only":
        add_purchase(db, cas_folio, date(2026, 5, 1), Decimal("100"), Decimal("10"))
        db.add(NavHistory(scheme_id=cas.id, date=date(2026, 10, 15), nav=Decimal("10.6000")))
    elif variant == "no_disclosure":
        from app.models.reference import DisclosureBatch, SchemeHolding
        batch_ids = [row[0] for row in db.query(DisclosureBatch.id).filter(DisclosureBatch.scheme_id == main.id)]
        db.query(SchemeHolding).filter(SchemeHolding.batch_id.in_(batch_ids)).delete(synchronize_session=False)
        db.query(DisclosureBatch).filter(DisclosureBatch.id.in_(batch_ids)).delete(synchronize_session=False)
    elif variant == "no_managers":
        from app.models.reference import SchemeFundManager
        db.query(SchemeFundManager).filter(SchemeFundManager.scheme_id == main.id).delete()
    elif variant == "no_sections":
        db.query(AnalyticsSection).delete()

    db.commit()
    return household, held, main, other, debt, young, cas


def build_fund_fixture(variant: str = "base", now: datetime = FIXED_NOW) -> FundFixtureRuntime:
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(autoflush=False, bind=engine)
    with sessions() as db:
        household, held, main, other, debt, young, cas = _seed(db, variant)
        ids = (
            household, held.asha_folio.id, main.id, other.id,
            debt.id, young.id, cas.id,
        )

    limit = 0 if variant == "no_peers" else (3 if variant == "thin_category" else None)
    universe_patch = patch(
        "app.services.analytics.scheme_universe.scheme_universe_client",
        _FixtureUniverse(limit=limit),
    )
    universe_patch.start()

    def override_db():
        with sessions() as db:
            yield db

    app = FastAPI()
    app.include_router(fund_page.router)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_active_user] = lambda: SimpleNamespace(id=household.user_id)
    app.dependency_overrides[get_now_ist] = lambda: now
    client = TestClient(app)
    return FundFixtureRuntime(
        client=client, household=ids[0], scheme_id=ids[2], other_scheme_id=ids[3],
        debt_scheme_id=ids[4], young_scheme_id=ids[5], cas_scheme_id=ids[6],
        folio_id=ids[1], engine=engine, universe_patch=universe_patch,
    )
