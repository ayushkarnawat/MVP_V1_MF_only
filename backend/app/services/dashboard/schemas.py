from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.models.enums import PlanType, Relationship, TransactionType


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


class SipRow(BaseModel):
    scheme_id: str
    scheme_name: str
    household_member_id: str
    household_member_name: str
    sip_date: date
    sip_amount: str


class CashFlowEntry(BaseModel):
    date: date
    type: TransactionType
    amount: str
    direction: str
    scheme_name: str
    household_member_id: str
    household_member_name: str


class SnapshotRow(BaseModel):
    household_member_id: str
    household_member_name: str
    snapshot_month: date
    total_value: str


class MemberStatus(BaseModel):
    id: str
    name: str
    has_data: bool


class AggregateHoldingsResponse(BaseModel):
    members: list[MemberStatus]
    holdings: list[HoldingRow]


class AggregateAllocationResponse(BaseModel):
    members: list[MemberStatus]
    allocation: AllocationSummary


class AggregateSipsResponse(BaseModel):
    members: list[MemberStatus]
    sips: list[SipRow]


class AggregateCashFlowResponse(BaseModel):
    members: list[MemberStatus]
    cash_flow: list[CashFlowEntry]


class AggregateSnapshotsResponse(BaseModel):
    members: list[MemberStatus]
    snapshots: list[SnapshotRow]
