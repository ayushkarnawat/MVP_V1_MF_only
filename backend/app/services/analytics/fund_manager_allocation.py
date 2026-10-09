# backend/app/services/analytics/fund_manager_allocation.py
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.reference import SchemeFundManager
from app.services.analytics.schemas import (
    FundManagerAllocationSummary,
    ManagerFundRow,
    ManagerGroup,
    UnavailableScheme,
)
from app.services.dashboard.holdings import compute_holdings


def _months_back(first_of_month: date, months: int) -> date:
    year, month = divmod(first_of_month.year * 12 + first_of_month.month - 1 - months, 12)
    return date(year, month + 1, 1)


def _oldest_period_shown(today: date) -> date:
    # "Older than 3 months" is unavailable: this month and the two before are shown
    # (in October: October, September, August).
    return _months_back(today.replace(day=1), 2)


async def compute_fund_manager_allocation(
    db: Session, household_member_ids: list[uuid.UUID]
) -> FundManagerAllocationSummary:
    holdings = await compute_holdings(db, household_member_ids)
    if not holdings:
        return FundManagerAllocationSummary(manager_groups=[], unavailable_schemes=[])

    scheme_ids = {uuid.UUID(h.scheme_id) for h in holdings}
    manager_rows = (
        db.query(SchemeFundManager)
        .filter(SchemeFundManager.scheme_id.in_(scheme_ids))
        .order_by(SchemeFundManager.reference_period.desc())
        .all()
    )
    # Latest reference_period per scheme only -- a scheme's older-month
    # manager rows aren't shown alongside this month's.
    latest_period_by_scheme: dict[uuid.UUID, date] = {}
    for row in manager_rows:
        if row.scheme_id not in latest_period_by_scheme or row.reference_period > latest_period_by_scheme[row.scheme_id]:
            latest_period_by_scheme[row.scheme_id] = row.reference_period
    # Card 2: when an AMC's import fails, last month's managers keep serving -- but rows
    # older than 3 months count as "not available yet" rather than lingering as fact.
    oldest_shown = _oldest_period_shown(date.today())
    rows_by_scheme: dict[uuid.UUID, list[SchemeFundManager]] = defaultdict(list)
    for row in manager_rows:
        if row.reference_period == latest_period_by_scheme.get(row.scheme_id) and row.reference_period >= oldest_shown:
            rows_by_scheme[row.scheme_id].append(row)

    groups: dict[str, dict] = {}
    unavailable: list[UnavailableScheme] = []

    # compute_holdings returns one row per member per scheme; a manager card lists each
    # fund once with the household's combined value (A04 Run 1 ruling).
    value_by_scheme: dict[str, Decimal] = {}
    first_row: dict[str, object] = {}
    for holding in holdings:
        value_by_scheme[holding.scheme_id] = value_by_scheme.get(holding.scheme_id, Decimal("0")) + Decimal(holding.current_value or "0")
        first_row.setdefault(holding.scheme_id, holding)

    for scheme_id_str, holding in first_row.items():
        scheme_id = uuid.UUID(scheme_id_str)
        manager_rows_for_scheme = rows_by_scheme.get(scheme_id, [])
        if not manager_rows_for_scheme:
            unavailable.append(UnavailableScheme(
                scheme_id=holding.scheme_id, scheme_name=holding.scheme_name, amc_name=holding.amc_name,
            ))
            continue
        value = value_by_scheme[scheme_id_str]
        for row in sorted(manager_rows_for_scheme, key=lambda r: r.sequence_order):
            group = groups.setdefault(row.manager_name, {"roles": set(), "total": Decimal("0"), "funds": []})
            group["roles"].add(row.role)
            group["total"] += value
            group["funds"].append(ManagerFundRow(
                scheme_id=holding.scheme_id, scheme_name=holding.scheme_name,
                household_value=str(value), sequence_order=row.sequence_order, role=row.role,
            ))

    manager_groups = sorted(
        (
            # The card badge only when every fund agrees; otherwise each fund row carries its own
            # role (a manager can lead one fund and assist on another -- review, 9 Oct).
            ManagerGroup(manager_name=name, role=next(iter(g["roles"])) if len(g["roles"]) == 1 else None,
                         total_household_value=str(g["total"]), funds=g["funds"])
            for name, g in groups.items()
        ),
        key=lambda mg: Decimal(mg.total_household_value),
        reverse=True,
    )
    return FundManagerAllocationSummary(manager_groups=manager_groups, unavailable_schemes=unavailable)
