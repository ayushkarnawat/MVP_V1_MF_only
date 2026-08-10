"""Granular SEBI-category allocation — PRD-04 FR-2. AMC allocation (FR-1)
already exists at Dashboard's compute_allocation (by_amc); re-exposed here
alongside the new by_category view so the Analytics tab has one response to
render, without duplicating the holdings/NAV computation to get it."""

from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.reference import Scheme
from app.services.analytics.schemas import AggregateAnalyticsAllocationResponse, AnalyticsAllocationSummary
from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.schemas import AllocationBucket


def _to_buckets(grouped: dict[str, Decimal], total_value: Decimal) -> list[AllocationBucket]:
    buckets = []
    for label, value in grouped.items():
        percentage = (value / total_value * 100) if total_value else Decimal("0")
        buckets.append(
            AllocationBucket(
                label=label,
                current_value=str(value),
                percentage=str(percentage.quantize(Decimal("0.01"))),
            )
        )
    return buckets


async def compute_category_allocation(
    db: Session, household_member_ids: list[uuid.UUID]
) -> AnalyticsAllocationSummary:
    holdings = await compute_holdings(db, household_member_ids)
    total_value = sum((Decimal(h.current_value) for h in holdings), Decimal("0"))

    # sebi_category isn't on HoldingRow — one batch query for every scheme in
    # this holding set, same pattern as dashboard/allocation.py.
    scheme_ids = {uuid.UUID(h.scheme_id) for h in holdings}
    categories = (
        {s.id: s.sebi_category for s in db.query(Scheme).filter(Scheme.id.in_(scheme_ids)).all()}
        if scheme_ids
        else {}
    )

    by_category: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    by_amc: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for holding in holdings:
        value = Decimal(holding.current_value)
        by_amc[holding.amc_name] += value
        category = categories.get(uuid.UUID(holding.scheme_id), "Unclassified")
        by_category[category] += value

    return AnalyticsAllocationSummary(
        by_category=_to_buckets(by_category, total_value),
        by_amc=_to_buckets(by_amc, total_value),
        total_value=str(total_value),
    )


async def get_aggregate_category_allocation(
    db: Session, user_id: uuid.UUID
) -> AggregateAnalyticsAllocationResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    allocation = await compute_category_allocation(db, [m.id for m in members])
    return AggregateAnalyticsAllocationResponse(members=statuses, allocation=allocation)
