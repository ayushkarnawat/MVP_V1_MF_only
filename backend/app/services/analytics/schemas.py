from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.services.dashboard.schemas import AllocationBucket, MemberStatus


class AnalyticsAllocationSummary(BaseModel):
    by_category: list[AllocationBucket]
    by_amc: list[AllocationBucket]
    total_value: str


class AggregateAnalyticsAllocationResponse(BaseModel):
    members: list[MemberStatus]
    allocation: AnalyticsAllocationSummary


class WeightedTerSummary(BaseModel):
    """PRD-04 FR-10 — weighted by the user's own holding value, not the
    fund's platform-wide AAUM (see amfi_aaum_client.py's docstring)."""

    weighted_ter: str | None
    covered_value: str
    total_value: str
    reference_period: date | None
    uncovered_schemes: list[str]


class DirectRegularTerComparison(BaseModel):
    """PRD-04 FR-11 — same weighting method as WeightedTerSummary, split
    by PlanType.DIRECT vs. PlanType.REGULAR."""

    direct: WeightedTerSummary
    regular: WeightedTerSummary


class AggregateWeightedTerResponse(BaseModel):
    members: list[MemberStatus]
    ter: WeightedTerSummary


class AggregateDirectRegularTerResponse(BaseModel):
    members: list[MemberStatus]
    ter: DirectRegularTerComparison
