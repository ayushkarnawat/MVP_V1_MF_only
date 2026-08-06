"""Shallow asset-class/AMC allocation — Dashboard Service's own job per
PRD-03 FR-4, not deferred to the (unbuilt) Analytics service. Groups
already-computed holdings; does no NAV fetching or FIFO processing of its
own."""

from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.reference import Scheme
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.schemas import AllocationBucket, AllocationSummary


def _asset_class_bucket(sebi_category: str) -> str:
    lower = sebi_category.lower()
    if "equity" in lower:
        return "Equity"
    if "debt" in lower or "income" in lower or "liquid" in lower or "money market" in lower:
        return "Debt"
    if "hybrid" in lower:
        return "Hybrid"
    return "Other"


async def compute_allocation(db: Session, household_member_ids: list[uuid.UUID]) -> AllocationSummary:
    holdings = await compute_holdings(db, household_member_ids)

    total_value = sum((Decimal(h.current_value) for h in holdings), Decimal("0"))

    # Bucket label needs the raw sebi_category, which HoldingRow doesn't
    # carry — one batch query for every scheme in this holding set, not one
    # query per holding row.
    scheme_ids = {uuid.UUID(h.scheme_id) for h in holdings}
    categories = {s.id: s.sebi_category for s in db.query(Scheme).filter(Scheme.id.in_(scheme_ids)).all()} if scheme_ids else {}

    by_class: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    by_amc: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for holding in holdings:
        value = Decimal(holding.current_value)
        by_amc[holding.amc_name] += value
        category = categories.get(uuid.UUID(holding.scheme_id), "")
        by_class[_asset_class_bucket(category)] += value

    def _to_buckets(grouped: dict[str, Decimal]) -> list[AllocationBucket]:
        buckets = []
        for label, value in grouped.items():
            percentage = (value / total_value * 100) if total_value else Decimal("0")
            buckets.append(AllocationBucket(label=label, current_value=str(value), percentage=str(percentage.quantize(Decimal("0.01")))))
        return buckets

    return AllocationSummary(
        by_asset_class=_to_buckets(by_class),
        by_amc=_to_buckets(by_amc),
        total_value=str(total_value),
    )
