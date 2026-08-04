"""Pydantic schemas — money serialized as strings."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class DecimalStrModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @field_serializer("*", mode="wrap")
    @classmethod
    def serialize_decimals(cls, value: Any, handler):
        result = handler(value)
        if isinstance(result, Decimal):
            return str(result)
        return result


def decimal_to_str(v: Decimal | None) -> str | None:
    return str(v) if v is not None else None


class ErrorResponse(BaseModel):
    code: str
    message: str


class SchemeMatchPreview(BaseModel):
    temp_id: str
    name: str
    isin: str | None
    amfi_code: str | None
    suggested_amfi_code: str | None
    suggested_name: str | None
    match_confidence: float
    match_status: str
    folio: str
    amc: str
    transaction_count: int
    latest_nav: str | None = None
    category: str | None = None


class TransactionPreview(BaseModel):
    folio: str
    scheme_name: str
    txn_date: date
    txn_type: str
    description: str | None
    amount: str | None
    units: str | None
    nav: str | None


class ImportPreviewResponse(BaseModel):
    session_id: str
    filename: str
    investor_name: str | None
    investor_email: str | None
    pan_masked: str | None
    schemes: list[SchemeMatchPreview]
    transactions: list[TransactionPreview]
    transaction_count: int
    parse_warnings: list[str]
    cas_type: str
    file_type: str


class SchemeMatchConfirm(BaseModel):
    temp_id: str
    amfi_code: str


class ImportConfirmRequest(BaseModel):
    session_id: str
    scheme_matches: list[SchemeMatchConfirm] = Field(default_factory=list)


class ImportConfirmResponse(BaseModel):
    added: int
    skipped: int
    import_id: int


class ImportHistoryItem(BaseModel):
    id: int
    filename: str
    imported_at: datetime | None
    schemes_found: int
    txns_added: int
    txns_skipped: int
    status: str


class PortfolioSummary(BaseModel):
    current_value: str
    invested: str
    absolute_gain: str
    xirr: str | None
    disclaimer: str = "Capital gains and tax estimates are illustrative only — not tax advice."


class HoldingRow(BaseModel):
    scheme_id: int
    scheme_name: str
    folio: str
    units: str
    avg_cost: str
    current_nav: str
    current_value: str
    gain: str
    xirr: str | None
    category: str | None


class AllocationSlice(BaseModel):
    category: str
    weight: str


class NavDataPoint(BaseModel):
    date: date
    nav: str


class TransactionMarker(BaseModel):
    date: date
    txn_type: str
    amount: str | None
    units: str | None


class SchemeDetail(BaseModel):
    scheme_id: int
    scheme_name: str
    folio: str
    units: str
    current_nav: str
    current_value: str
    invested: str
    gain: str
    xirr: str | None
    category: str | None
    nav_history: list[NavDataPoint]
    transactions: list[TransactionMarker]
    capital_gains: dict[str, str]
    tax_notes: list[str]


class ValuationPoint(BaseModel):
    date: date
    value: str


class ConfirmMatchRequest(BaseModel):
    amfi_code: str
