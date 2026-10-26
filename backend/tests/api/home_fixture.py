from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.api.home import get_now_ist
from app.db.session import get_db
from app.models.enums import (
    BenchmarkIndex,
    BenchmarkReturnType,
    ImportStatus,
    PlanType,
    Relationship,
    TransactionType,
)
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import BenchmarkIndexHistory, NavHistory, Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user


NAMESPACE = uuid.UUID("a9e2af5e-e37b-5dc5-bba2-94130b7d7c2e")
FIXED_NOW = datetime(2026, 10, 23, 18, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))


def uid(name: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, name)


@dataclass(frozen=True)
class HomeHousehold:
    user_id: uuid.UUID
    asha_id: uuid.UUID
    dev_id: uuid.UUID


def seed_home_household(client) -> HomeHousehold:
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
    imports = {}
    for member in (asha, dev):
        imported = Import(
            id=uid(f"import-{member.name}"), household_member_id=member.id,
            status=ImportStatus.CONFIRMED,
            uploaded_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
            statement_to_date=date(2026, 10, 23),
        )
        imports[member.id] = imported
        db.add(imported)
    db.flush()

    specifications = (
        ("large", "Asha Large Cap", "Equity Scheme - Large Cap Fund", asha, "100", "10", "12.00", "12.10"),
        ("flexi", "Asha Flexi Cap", "Equity Scheme - Flexi Cap Fund", asha, "50", "20", "20.00", "19.80"),
        ("debt", "Dev Short Duration Debt", "Debt Scheme - Short Duration Fund", dev, "200", "10", "10.00", "10.01"),
        ("gold", "Dev Gold Fund", "Gold ETF", dev, "10", "100", "100.00", "101.00"),
    )
    for key, name, category, member, units, purchase_nav, previous_nav, latest_nav in specifications:
        scheme = Scheme(
            id=uid(f"scheme-{key}"), amfi_code=f"HOME-{key}", name=name,
            amc_name="Home Test AMC", sebi_category=category,
        )
        db.add(scheme)
        db.flush()
        folio = Folio(
            id=uid(f"folio-{key}"), household_member_id=member.id,
            scheme_id=scheme.id, folio_number=f"HOME-{key}", plan_type=PlanType.DIRECT,
        )
        db.add(folio)
        db.flush()
        transaction = Transaction(
            id=uid(f"transaction-{key}"), folio_id=folio.id,
            import_id=imports[member.id].id, type=TransactionType.PURCHASE,
            date=date(2026, 9, 15), amount=Decimal(units) * Decimal(purchase_nav),
            units=Decimal(units), nav=Decimal(purchase_nav),
        )
        db.add(transaction)
        for offset in range(40):
            nav_date = date(2026, 9, 14) + timedelta(days=offset)
            if nav_date.weekday() >= 5:
                continue
            if nav_date == date(2026, 10, 22):
                nav = Decimal(previous_nav)
            elif nav_date == date(2026, 10, 23):
                nav = Decimal(latest_nav)
            else:
                nav = Decimal(previous_nav) - Decimal("0.01") * Decimal((date(2026, 10, 22) - nav_date).days)
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
    user_id, asha_id, dev_id = user.id, asha.id, dev.id
    db.commit()
    client.app.dependency_overrides[get_active_user] = lambda: SimpleNamespace(id=user_id)
    client.app.dependency_overrides[get_now_ist] = lambda: FIXED_NOW
    return HomeHousehold(user_id, asha_id, dev_id)
