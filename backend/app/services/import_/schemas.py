"""Pydantic request/response contracts for the Import Service API."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


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
    plan_type: str
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


class SchemeConfirmation(BaseModel):
    temp_id: str
    amfi_code: str | None = None
    plan_type_override: str | None = None


class ImportConfirmRequest(BaseModel):
    session_id: str
    household_member_id: str
    scheme_confirmations: list[SchemeConfirmation] = Field(default_factory=list)


class ImportConfirmResponse(BaseModel):
    added: int
    skipped: int
    import_id: str
