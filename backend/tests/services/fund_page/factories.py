"""Shared fixture builders for fund-page tests (service-level, no TestClient).

Deterministic only: uuid5 off a fixed namespace, closed-form NAV/TRI series,
no `random`, no wall clock -- built once here per the handoff; sessions 2 and
3 extend this module, they never fork it.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.decimal_utils import quantize_amount, quantize_nav
from app.db.base import Base
from app.models.analytics import AnalyticsSection
from app.models.enums import (
    AssetType,
    BenchmarkIndex,
    BenchmarkReturnType,
    DisclosureBatchStatus,
    ImportStatus,
    MarketCapBucket,
    PlanType,
    Relationship,
    SchemePlanType,
    TransactionType,
)
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import (
    BenchmarkIndexHistory,
    DisclosureBatch,
    MarketCapClassification,
    NavHistory,
    Scheme,
    SchemeHolding,
    StockMaster,
)
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User


NAMESPACE = uuid.UUID("5f7b6a3a-1b7a-4b6a-9b1a-2c6a7a2a6a7a")
TODAY = date(2026, 10, 23)  # a Friday


def uid(name: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, name)


def make_session() -> Session:
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    event.listen(
        engine, "connect",
        lambda connection, _record: connection.execute("PRAGMA foreign_keys=ON"),
    )
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


@dataclass(frozen=True)
class Household:
    user_id: uuid.UUID
    asha_id: uuid.UUID
    dev_id: uuid.UUID


def add_user_household(db: Session, *, key: str = "default") -> Household:
    """FX-HH: one user, members ASHA (self) and DEV. No imports yet -- a
    member only gets a CONFIRMED import once `add_purchase` is called for one
    of their folios (see its docstring), so "no import at all" stays reachable.
    `key` only matters for a second, unrelated household in the same test (a
    foreign-member-id check) -- the default call needs no argument."""
    phone_last_digit = "1" if key == "default" else "2"
    user = User(id=uid(f"user-{key}"), phone_number=f"+91900000000{phone_last_digit}",
                created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    asha = HouseholdMember(id=uid(f"asha-{key}"), user_id=user.id, name="ASHA RAO",
                           relationship=Relationship.SELF,
                           created_at=datetime(2026, 1, 2, tzinfo=timezone.utc))
    dev = HouseholdMember(id=uid(f"dev-{key}"), user_id=user.id, name="Dev Rao",
                          relationship=Relationship.SPOUSE,
                          created_at=datetime(2026, 1, 3, tzinfo=timezone.utc))
    db.add(user)
    db.flush()
    db.add_all([asha, dev])
    db.flush()
    return Household(user.id, asha.id, dev.id)


def _attach(db: Session, obj):
    db.add(obj)
    db.flush()
    return obj


def add_scheme(
    db: Session, key: str, category: str, plan: SchemePlanType, amfi: str | None,
    *, name: str | None = None, amc_name: str = "Test AMC",
) -> Scheme:
    return _attach(db, Scheme(
        id=uid(f"scheme-{key}"), amfi_code=amfi, name=name or f"{key.title()} Fund",
        amc_name=amc_name, sebi_category=category, plan_type=plan,
    ))


def add_folio(db: Session, scheme: Scheme, member_id: uuid.UUID, folio_number: str) -> Folio:
    return _attach(db, Folio(
        id=uid(f"folio-{scheme.id}-{member_id}-{folio_number}"),
        household_member_id=member_id, scheme_id=scheme.id,
        folio_number=folio_number, plan_type=PlanType.DIRECT,
    ))


def add_import(
    db: Session, member_id: uuid.UUID, *, confirmed_at: datetime, uploaded_at: datetime | None = None,
) -> Import:
    return _attach(db, Import(
        id=uid(f"import-{member_id}-{confirmed_at.isoformat()}"),
        household_member_id=member_id, status=ImportStatus.CONFIRMED,
        uploaded_at=uploaded_at or confirmed_at, confirmed_at=confirmed_at,
    ))


def add_purchase(db: Session, folio: Folio, purchase_date: date, units: Decimal, nav: Decimal) -> Transaction:
    """One purchase row, plus -- since `Transaction.import_id` is not null --
    a CONFIRMED import for that folio's member, confirmed the same day."""
    confirmed_at = datetime(purchase_date.year, purchase_date.month, purchase_date.day, tzinfo=timezone.utc)
    imported = add_import(db, folio.household_member_id, confirmed_at=confirmed_at)
    return _attach(db, Transaction(
        id=uid(f"txn-{folio.id}-{purchase_date}-{units}-{nav}"), folio_id=folio.id, import_id=imported.id,
        type=TransactionType.PURCHASE, date=purchase_date,
        amount=quantize_amount(units * nav), units=units, nav=nav,
    ))


def add_nav_closed_form(
    db: Session, scheme: Scheme, start: date, end: date, annual: Decimal, base: Decimal = Decimal("100"),
) -> None:
    """A NAV row every calendar day: NAV = base * (1 + annual) ** (days_since_start / 365)."""
    day = start
    while day <= end:
        elapsed = Decimal(str((day - start).days)) / Decimal("365")
        nav = quantize_nav(base * (Decimal("1") + annual) ** elapsed)
        db.add(NavHistory(scheme_id=scheme.id, date=day, nav=nav))
        day += timedelta(days=1)
    db.flush()


def add_tri_closed_form(
    db: Session, index: BenchmarkIndex, start: date, end: date, annual: Decimal, base: Decimal = Decimal("10000"),
) -> None:
    day = start
    while day <= end:
        elapsed = Decimal(str((day - start).days)) / Decimal("365")
        value = (base * (Decimal("1") + annual) ** elapsed).quantize(Decimal("0.01"))
        db.add(BenchmarkIndexHistory(
            index_name=index, date=day, return_type=BenchmarkReturnType.TRI, value=value,
        ))
        day += timedelta(days=1)
    db.flush()


def add_nav_factors(db: Session, scheme: Scheme, start: date, factors: list[Decimal], base: Decimal = Decimal("100")) -> None:
    """One row per day: day 0 is `base`, day i is day (i-1) times `factors[i-1]`."""
    nav = base
    db.add(NavHistory(scheme_id=scheme.id, date=start, nav=quantize_nav(nav)))
    for offset, factor in enumerate(factors, start=1):
        nav = nav * factor
        db.add(NavHistory(scheme_id=scheme.id, date=start + timedelta(days=offset), nav=quantize_nav(nav)))
    db.flush()


def put_section(
    db: Session, user_id: uuid.UUID, scope_key: str, section: str, payload, computed_at: datetime,
    *, household_member_id: uuid.UUID | None = None, failed_at: datetime | None = None,
) -> AnalyticsSection:
    return _attach(db, AnalyticsSection(
        user_id=user_id, scope_key=scope_key, section=section, payload=payload,
        household_member_id=household_member_id, computed_at=computed_at, failed_at=failed_at,
    ))


def add_disclosure_batch(
    db: Session,
    scheme: Scheme,
    as_of: date,
    rows: list[tuple[str, str | None, Decimal, AssetType, str | None]],
    *,
    status: DisclosureBatchStatus = DisclosureBatchStatus.WRITTEN,
) -> DisclosureBatch:
    batch = _attach(db, DisclosureBatch(
        id=uid(f"batch-{scheme.id}-{as_of}-{status.value}"), scheme_id=scheme.id,
        as_of_date=as_of, amc_name=scheme.amc_name, status=status,
    ))
    for index, (name, isin, weight, asset_type, sector_raw) in enumerate(rows):
        db.add(SchemeHolding(
            id=uid(f"holding-{batch.id}-{index}-{isin or name}"), batch_id=batch.id,
            instrument_name=name, isin=isin, sector_raw=sector_raw,
            asset_type=asset_type, market_value=Decimal("1"), pct_to_nav=weight,
        ))
    db.flush()
    return batch


def add_market_cap(
    db: Session, isin: str, bucket: MarketCapBucket, effective_date: date,
) -> MarketCapClassification:
    rank = {
        MarketCapBucket.LARGE: 1,
        MarketCapBucket.MID: 101,
        MarketCapBucket.SMALL: 251,
    }[bucket]
    return _attach(db, MarketCapClassification(
        id=uid(f"market-cap-{isin}-{effective_date}"), isin=isin, rank=rank,
        bucket=bucket, effective_date=effective_date, source_period=effective_date,
    ))


def add_stock_master(
    db: Session, isin: str, *, name: str, sector: str | None, as_of: date,
) -> StockMaster:
    return _attach(db, StockMaster(
        isin=isin, name=name, sector=sector, as_of_date=as_of, source="fixture",
    ))


@dataclass(frozen=True)
class FxHold:
    scheme: Scheme
    asha_folio: Folio
    dev_folio: Folio


def fx_hold(db: Session, household: Household) -> FxHold:
    """FX-HOLD: Alpha Flexi Cap Fund, ASHA buys 100 units at 10.00 on
    2025-01-01, DEV buys 50 units at 12.00 on 2025-06-01, two current NAV rows."""
    scheme = add_scheme(
        db, "alpha", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "ALPHA",
        name="Alpha Flexi Cap Fund - Direct Plan", amc_name="Alpha AMC",
    )
    asha_folio = add_folio(db, scheme, household.asha_id, "4400918/3")
    dev_folio = add_folio(db, scheme, household.dev_id, "A12345678")
    add_purchase(db, asha_folio, date(2025, 1, 1), Decimal("100"), Decimal("10.00"))
    add_purchase(db, dev_folio, date(2025, 6, 1), Decimal("50"), Decimal("12.00"))
    db.add(NavHistory(scheme_id=scheme.id, date=date(2026, 10, 22), nav=Decimal("14.9000")))
    db.add(NavHistory(scheme_id=scheme.id, date=date(2026, 10, 23), nav=Decimal("15.0000")))
    db.flush()
    return FxHold(scheme, asha_folio, dev_folio)


def fx_nav10(db: Session, scheme: Scheme) -> None:
    add_nav_closed_form(db, scheme, date(2021, 10, 23), TODAY, Decimal("0.10"))


def fx_tri12(db: Session, index: BenchmarkIndex = BenchmarkIndex.NIFTY_500) -> None:
    add_tri_closed_form(db, index, date(2021, 10, 23), TODAY, Decimal("0.12"))
