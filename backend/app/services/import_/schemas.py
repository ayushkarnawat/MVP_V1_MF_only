"""Pydantic request/response contracts for the Import Service API."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.enums import PlanType


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
    person_key: str | None = None


class TransactionPreview(BaseModel):
    folio: str
    scheme_name: str
    txn_date: date
    txn_type: str
    description: str | None
    amount: str | None
    units: str | None
    nav: str | None


class PersonPreview(BaseModel):
    person_key: str
    name: str
    name_source: str
    needs_name: bool
    # None = "(PAN not on statement)"; the client renders that text.
    pan_masked: str | None
    is_me: bool
    status: str
    member_id: str | None
    fund_count: int
    unresolved_count: int
    matched_by_name_temp_ids: list[str] = Field(default_factory=list)


class NameNotice(BaseModel):
    person_key: str
    member_id: str | None
    current_name: str
    statement_name: str
    kind: Literal["update", "ask"]
    first_upload: bool


class SamePersonPrompt(BaseModel):
    person_key: str
    member_id: str
    member_name: str
    # "" for kind="name_only": that member has no PAN at all.
    entered_pan_masked: str
    statement_pan_masked: str
    # Staging-QA fix 5B: "typed_pan" = U13 (member's typed PAN differs);
    # "name_only" = a PAN-less member this statement's person may be.
    kind: Literal["typed_pan", "name_only"] = "typed_pan"
    member_fund_count: int = 0
    statement_name: str = ""


class ImportPromptDetail(BaseModel):
    """The 409 `detail` body of an upload-time prompt. `session_id` is None
    when the prompt ended the review (member_details_required, F30)."""

    code: str
    message: str
    session_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


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
    people: list[PersonPreview] = Field(default_factory=list)
    unassigned_temp_ids: list[str] = Field(default_factory=list)
    name_notices: list[NameNotice] = Field(default_factory=list)
    same_person_prompts: list[SamePersonPrompt] = Field(default_factory=list)
    expires_at: datetime  # session created_at + SESSION_TTL_MINUTES


class ResolveNameRequest(BaseModel):
    name: str


class ResolveSelfRequest(BaseModel):
    # None = "None of these" (U3) -> continues as U2.
    person_key: str | None = None


class ResolvePanRequest(BaseModel):
    choice: Literal["statement"]


class ResolveSamePersonRequest(BaseModel):
    person_key: str
    member_id: str
    same: bool


class AcknowledgeRequest(BaseModel):
    code: Literal["member_not_in_file", "locked_member_only", "cross_account_pan_blocked"]


class SchemeConfirmation(BaseModel):
    temp_id: str
    amfi_code: str | None = None
    plan_type_override: PlanType | None = None


class PersonConfirmation(BaseModel):
    """One person's choices from the people popup and their ribbon."""

    person_key: str
    # An edited or typed (U9) name; the plan's name when omitted.
    name: str | None = None
    # False = U8 "Leave it" (only for a person on another account).
    include: bool = True
    scheme_confirmations: list[SchemeConfirmation] = Field(default_factory=list)
    # Answers an M8 "ask" name notice; None/False keeps the stored name.
    accept_name_update: bool | None = None


class ImportConfirmRequest(BaseModel):
    session_id: str
    # Old single-member body (F12): household_member_id + scheme_confirmations,
    # used when `people` is None; maps to the file's only person.
    household_member_id: str | None = None
    scheme_confirmations: list[SchemeConfirmation] = Field(default_factory=list)
    people: list[PersonConfirmation] | None = None
    # F16: temp_id -> person_key, for "Move to…" and the U10 owner picker.
    moved_funds: dict[str, str] = Field(default_factory=dict)


class PersonConfirmResult(BaseModel):
    person_key: str
    member_id: str
    name: str
    import_id: str
    added: int
    skipped: int


class ImportConfirmResponse(BaseModel):
    # Totals across people; import_id is Me's import (else the first).
    added: int
    skipped: int
    import_id: str
    warnings: list[str] = Field(default_factory=list)
    people: list[PersonConfirmResult] = Field(default_factory=list)
    upload_group_id: str | None = None


class HouseholdImportHistoryItem(BaseModel):
    import_id: str
    household_member_id: str
    uploaded_at: str
    statement_from_date: str | None
    statement_to_date: str | None
    status: str
    new_transactions_count: int | None
    # F26: the list stays flat; the frontend groups by upload_group_id.
    upload_group_id: str | None = None
    member_name: str = ""
    group_people_count: int = 1


class DeleteImportResponse(BaseModel):
    deleted_transactions_count: int
    removed_member_ids: list[str] = Field(default_factory=list)
    deleted_file: bool = False
