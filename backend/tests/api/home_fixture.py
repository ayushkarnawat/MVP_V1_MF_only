from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.home import get_now_ist
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.analytics import AnalyticsSection
from app.models.enums import (
    AssetType,
    BenchmarkIndex,
    BenchmarkReturnType,
    DisclosureBatchStatus,
    ImportStatus,
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
    NavHistory,
    Scheme,
    SchemeHolding,
    SchemeTer,
    StockMaster,
)
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user
from app.services.dashboard.holdings import _holdings_cache


NAMESPACE = uuid.UUID("a9e2af5e-e37b-5dc5-bba2-94130b7d7c2e")
FIXED_NOW = datetime(2026, 10, 23, 18, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))
WEEKEND_NOW = datetime(2026, 10, 26, 10, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))


def uid(name: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, name)


@dataclass(frozen=True)
class HomeHousehold:
    user_id: uuid.UUID
    asha_id: uuid.UUID
    dev_id: uuid.UUID


@dataclass
class HomeFixtureRuntime:
    client: TestClient
    household: HomeHousehold
    engine: object

    def close(self) -> None:
        self.client.close()
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_active_user, None)
        app.dependency_overrides.pop(get_now_ist, None)
        _holdings_cache.clear()
        self.engine.dispose()


def _put_section(db, user_id, scope_key, member_id, section, payload, computed_at):
    db.add(AnalyticsSection(
        user_id=user_id,
        scope_key=scope_key,
        household_member_id=member_id,
        section=section,
        payload=payload,
        computed_at=computed_at,
        failed_at=None,
    ))


def _write_sections(db, household, schemes, *, benign: bool) -> None:
    computed_at = datetime(2026, 10, 23, 13, 30, tzinfo=timezone.utc)
    allocation = {
        "hide_headlines": False,
        "total_portfolio_value": "5212.00",
        "covered_value": "5212.00",
        "nav_as_of": "2026-10-23",
        "as_disclosed": {"classes": [
            {"key": "equity", "value": "2200.00"},
            {"key": "debt", "value": "2002.00"},
            {"key": "gold", "value": "1010.00"},
            {"key": "cash_like", "value": "0.00"},
        ]},
    }
    _put_section(db, household.user_id, "combined", None, "asset_allocation", allocation, computed_at)
    _put_section(
        db, household.user_id, str(household.dev_id), household.dev_id, "asset_allocation",
        {**allocation, "total_portfolio_value": "3012.00", "covered_value": "3012.00",
         "as_disclosed": {"classes": [
             {"key": "equity", "value": "0.00"},
             {"key": "debt", "value": "2002.00"},
             {"key": "gold", "value": "1010.00"},
             {"key": "cash_like", "value": "0.00"},
         ]}},
        computed_at,
    )
    score_rows = [] if benign else [
        {"scheme_id": str(schemes["large"].id), "risk_adjusted_tier": 1, "final_score": "35.00"},
        {"scheme_id": str(schemes["flexi"].id), "risk_adjusted_tier": 2, "final_score": "72.00"},
    ]
    ranking_rows = [] if benign else [
        {"scheme_id": str(schemes["large"].id), "periods": {"1y": {
            "fund_return": "0.11", "category_avg": "0.11"}}},
        {"scheme_id": str(schemes["flexi"].id), "periods": {"1y": {
            "fund_return": "0.05", "category_avg": "0.12"}}},
    ]
    stock_rows = [] if benign else [
        {"instrument_name": f"Top Stock {number}", "isin": f"INE0000000{number}",
         "exposure_pct": "5.00"}
        for number in range(1, 6)
    ]
    sections = {
        "score": {"funds": score_rows},
        "category_ranking": {"funds": ranking_rows},
        "stock_holdings": {
            "rows": stock_rows,
            "holdings_as_of": "2026-09-30",
            "coverage": {"covered_value_pct": "100.00"},
            "hide_headlines": False,
        },
        "cap_allocation": {
            "hide_headlines": False,
            "buckets": [
                {"key": "LARGE", "percentage_equity": "60.00"},
                {"key": "MID", "percentage_equity": "25.00"},
                {"key": "SMALL", "percentage_equity": "15.00"},
            ],
        },
    }
    for section, payload in sections.items():
        _put_section(db, household.user_id, "combined", None, section, payload, computed_at)


def _write_disclosures(db, schemes, *, earlier: bool) -> None:
    for number in range(1, 6):
        db.add(StockMaster(
            isin=f"INE0000000{number}", name=f"Top Stock {number}", sector="Banks",
            as_of_date=date(2026, 9, 30), source="fixture",
        ))
    for index, (key, scheme) in enumerate(schemes.items(), start=1):
        current = DisclosureBatch(
            id=uid(f"batch-current-{key}"), scheme_id=scheme.id,
            as_of_date=date(2026, 9, 30), amc_name="Home Test AMC",
            status=DisclosureBatchStatus.WRITTEN,
        )
        db.add(current)
        db.flush()
        db.add(SchemeHolding(
            id=uid(f"holding-sector-{key}"), batch_id=current.id,
            instrument_name=f"Sector holding {key}", isin=f"INE0000000{index}",
            sector_raw="Banks", asset_type=AssetType.EQUITY_DOMESTIC,
            market_value=Decimal("70.00"), pct_to_nav=Decimal("70.000"),
        ))
        if earlier:
            old = DisclosureBatch(
                id=uid(f"batch-old-{key}"), scheme_id=scheme.id,
                as_of_date=date(2026, 6, 30), amc_name="Home Test AMC",
                status=DisclosureBatchStatus.WRITTEN,
            )
            db.add(old)
            db.flush()
            for number in range(1, 6):
                db.add(SchemeHolding(
                    id=uid(f"holding-old-{key}-{number}"), batch_id=old.id,
                    instrument_name=f"Top Stock {number}", isin=f"INE0000000{number}",
                    sector_raw="Banks", asset_type=AssetType.EQUITY_DOMESTIC,
                    market_value=Decimal("2.00"), pct_to_nav=Decimal("2.000"),
                ))


# This definition intentionally supersedes the simple base seeder above: existing route
# tests keep the same call site while the golden writer selects explicit variants.
def seed_home_household(
    client,
    *,
    variant: str = "base",
    now: datetime = FIXED_NOW,
    fund_count: int = 4,
) -> HomeHousehold:
    db = next(client.app.dependency_overrides[get_db]())
    user = User(
        id=uid("user"), phone_number="+919000000001",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    asha = HouseholdMember(
        id=uid("asha"), user_id=user.id, name="ASHA RAO", relationship=Relationship.SELF,
        created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    dev = HouseholdMember(
        id=uid("dev"), user_id=user.id, name="Dev Rao", relationship=Relationship.SPOUSE,
        created_at=datetime(2026, 1, 3, tzinfo=timezone.utc),
    )
    db.add(user)
    db.flush()
    db.add_all([asha, dev])
    db.flush()
    household = HomeHousehold(user.id, asha.id, dev.id)

    if variant == "empty":
        db.commit()
        client.app.dependency_overrides[get_active_user] = lambda: SimpleNamespace(
            id=household.user_id
        )
        client.app.dependency_overrides[get_now_ist] = lambda: now
        return household

    imports = {}
    for member in (asha, dev):
        imported = Import(
            id=uid(f"import-{member.name}"), household_member_id=member.id,
            status=ImportStatus.CONFIRMED,
            uploaded_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
            confirmed_at=datetime(2026, 9, 1, 1, tzinfo=timezone.utc),
            statement_to_date=date(2026, 10, 23),
        )
        imports[member.id] = imported
        db.add(imported)
    db.flush()

    specifications = [
        ("large", "Asha Large Cap", "Equity Scheme - Large Cap Fund", asha, "100", "10", "12.00", "12.10"),
        ("flexi", "Asha Flexi Cap", "Equity Scheme - Flexi Cap Fund", asha, "50", "20", "20.00", "19.80"),
        ("debt", "Dev Short Duration Debt", "Debt Scheme - Short Duration Fund", dev, "200", "10", "10.00", "10.01"),
        ("gold", "Dev Gold Fund", "Gold ETF", dev, "10", "100", "100.00", "101.00"),
    ]
    for number in range(5, fund_count + 1):
        specifications.append((
            f"extra-{number}", f"Extra Fund {number}", "Hybrid Scheme - Balanced Advantage Fund",
            asha if number % 2 else dev, "1", "10", "10.00", "10.01",
        ))
    specifications = specifications[:fund_count]
    schemes = {}
    for key, name, category, member, units, purchase_nav, previous_nav, latest_nav in specifications:
        if variant == "all_down":
            latest_nav = str(Decimal(previous_nav) - Decimal("0.01"))
        scheme = Scheme(
            id=uid(f"scheme-{key}"),
            amfi_code=None if variant == "partial" and key == "gold" else f"HOME-{key}",
            name=name, amc_name="Home Test AMC", sebi_category=category,
            plan_type=SchemePlanType.DIRECT,
        )
        schemes[key] = scheme
        db.add(scheme)
        db.flush()
        folio = Folio(
            id=uid(f"folio-{key}"), household_member_id=member.id,
            scheme_id=scheme.id, folio_number=f"HOME-{key}", plan_type=PlanType.DIRECT,
        )
        db.add(folio)
        db.flush()
        transaction_date = date(2026, 9, 15) if member is asha else date(2026, 8, 25)
        db.add(Transaction(
            id=uid(f"transaction-{key}"), folio_id=folio.id,
            import_id=imports[member.id].id, type=TransactionType.PURCHASE,
            date=transaction_date, amount=Decimal(units) * Decimal(purchase_nav),
            units=Decimal(units), nav=Decimal(purchase_nav),
        ))
        if variant == "redemption" and key == "large":
            db.add(Transaction(
                id=uid("transaction-large-redemption"), folio_id=folio.id,
                import_id=imports[member.id].id, type=TransactionType.REDEMPTION,
                date=date(2026, 10, 10), amount=Decimal("115.00"),
                units=Decimal("10"), nav=Decimal("11.50"),
            ))
        if variant == "partial" and key == "gold":
            continue
        for offset in range(40):
            nav_date = date(2026, 9, 14) + timedelta(days=offset)
            if nav_date.weekday() >= 5:
                continue
            if variant == "one_nav" and nav_date != date(2026, 10, 23):
                continue
            if nav_date == date(2026, 10, 22):
                nav = Decimal(previous_nav)
            elif nav_date == date(2026, 10, 23):
                nav = Decimal(latest_nav)
            else:
                nav = Decimal(previous_nav) - Decimal("0.01") * Decimal(
                    (date(2026, 10, 22) - nav_date).days
                )
            db.add(NavHistory(scheme_id=scheme.id, date=nav_date, nav=nav))

    for index, start, daily in (
        (BenchmarkIndex.NIFTY_50, date(2025, 10, 1), Decimal("1.00")),
        (BenchmarkIndex.NIFTY_SMALLCAP_250, date(2026, 9, 1), Decimal("2.00")),
    ):
        day = start
        counter = 0
        while day <= date(2026, 10, 23):
            if day.weekday() < 5:
                db.add(BenchmarkIndexHistory(
                    index_name=index, date=day, return_type=BenchmarkReturnType.TRI,
                    value=Decimal("10000") + daily * Decimal(counter),
                ))
                counter += 1
            day += timedelta(days=1)

    if variant not in {"no_sections", "partial"}:
        _write_sections(db, household, schemes, benign=variant == "nothing_flagged")
    for scheme in schemes.values():
        db.add(SchemeTer(
            scheme_id=scheme.id, reference_period=date(2026, 9, 1), ter_value=Decimal("1.00")
        ))
    if variant not in {"no_disclosures", "no_sections", "partial"}:
        _write_disclosures(db, schemes, earlier=variant == "earlier")

    db.commit()
    client.app.dependency_overrides[get_active_user] = lambda: SimpleNamespace(
        id=household.user_id
    )
    client.app.dependency_overrides[get_now_ist] = lambda: now
    _holdings_cache.clear()
    return household


def build_home_fixture(
    *, variant: str = "base", now: datetime = FIXED_NOW, fund_count: int = 4
) -> HomeFixtureRuntime:
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    event.listen(
        engine, "connect",
        lambda connection, _record: connection.execute("PRAGMA foreign_keys=ON"),
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(autoflush=False, bind=engine)

    def override_db():
        with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    household = seed_home_household(client, variant=variant, now=now, fund_count=fund_count)
    return HomeFixtureRuntime(client, household, engine)
