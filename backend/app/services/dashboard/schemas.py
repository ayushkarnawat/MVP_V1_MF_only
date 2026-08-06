from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.models.enums import PlanType, Relationship


class HouseholdMemberCreate(BaseModel):
    name: str
    relationship: Relationship
    relationship_other_label: str | None = None


class HouseholdMemberResponse(BaseModel):
    id: str
    name: str
    relationship: Relationship
    relationship_other_label: str | None


class HoldingRow(BaseModel):
    scheme_id: str
    scheme_name: str
    amc_name: str
    household_member_id: str
    household_member_name: str
    plan_type: PlanType
    units_held: str
    average_nav: str | None
    current_nav: str
    current_nav_date: date
    amount_invested: str
    current_value: str
    current_profit_total: str
    realized_gain: str
    unrealized_gain: str
    today_gain: str


class AllocationBucket(BaseModel):
    label: str
    current_value: str
    percentage: str


class AllocationSummary(BaseModel):
    by_asset_class: list[AllocationBucket]
    by_amc: list[AllocationBucket]
    total_value: str
