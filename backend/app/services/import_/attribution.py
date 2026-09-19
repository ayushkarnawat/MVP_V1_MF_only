"""Family Member Attribution Engine — PAN-based (ADR-004 reopened 2026-09-18).

Matches an imported CAS to a household member by PAN, not name/email:
- PAN match to a member of the SAME household -> auto-attributed, disclaimer shown.
- PAN match to a member of a DIFFERENT account -> blocked outright, no override
  (CrossAccountPanBlockedError) -- see Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md.
- No PAN parsed -> falls back to folio-number+AMC reuse (unchanged from before).
- No match anywhere -> unrecognized member prompt (add new member).
Name is display-only from here on -- it is never read for matching.
"""

from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.user import HouseholdMember
from app.services.import_.crypto import encrypt_pan, hash_pan
from app.services.import_.parser import ParseResult


class AttributionStatus(str, enum.Enum):
    AUTO_MATCHED = "auto_matched"
    MISMATCH_CONFIRMATION_REQUIRED = "mismatch_confirmation_required"
    UNRECOGNIZED_MEMBER = "unrecognized_member"


@dataclass
class AttributionDecision:
    status: AttributionStatus
    resolved_member_id: uuid.UUID | None
    matched_member_name: str | None
    requires_confirmation: bool
    prompt_message: str | None = None
    candidate_members: list[dict[str, Any]] = field(default_factory=list)
    matched_by_pan: bool = False


class AttributionConfirmationRequiredError(Exception):
    """Raised when attribution needs an explicit user confirmation."""

    def __init__(self, attribution: AttributionDecision):
        self.attribution = attribution
        super().__init__(attribution.prompt_message or "Confirm which family member this statement belongs to.")


class CrossAccountPanBlockedError(Exception):
    """Raised when the parsed CAS's PAN already belongs to a member of a
    different Unifolio account. This is a hard stop, not a confirmable
    decision -- there is no self-serve override or merge path (see design
    spec's "Scope decisions")."""


CROSS_ACCOUNT_PAN_BLOCKED_MESSAGE = (
    "This PAN is already tracked under a different Unifolio account. "
    "Contact support if you believe this is a mistake."
)


class PanAlreadyAttributedError(Exception):
    """Raised by backfill_pan_if_missing when the confirmed member (picked via
    confirmed_member_override, which lets the caller pick any household
    member regardless of what resolve_attribution() already matched) isn't
    who this PAN is actually on file for. Without this check the write hits
    ix_household_members_pan_lookup_hash's unique index and surfaces as a
    raw IntegrityError instead of a clean message (known edge case flagged
    in the 2026-09-18 whole-branch review)."""


PAN_ALREADY_ATTRIBUTED_MESSAGE = (
    "This PAN is already on file for a different family member. "
    "Contact support if you believe this is a mistake."
)


def enforce_attribution_confirmation(attribution: AttributionDecision, confirmed_override: bool) -> None:
    if attribution.requires_confirmation and not confirmed_override:
        raise AttributionConfirmationRequiredError(attribution)


def _find_member_by_pan_hash(db: Session, pan_hash: str) -> HouseholdMember | None:
    return db.query(HouseholdMember).filter(HouseholdMember.pan_lookup_hash == pan_hash).first()


def _find_folio_matched_member(
    db: Session, members: list[HouseholdMember], parse_result: ParseResult
) -> tuple[HouseholdMember | None, tuple[str, str] | None]:
    parsed_folio_keys = {(s.folio, s.amc) for s in parse_result.schemes if s.folio and s.amc}
    if not parsed_folio_keys or not members:
        return None, None
    try:
        with db.begin_nested():
            existing_folios = (
                db.query(Folio.household_member_id, Folio.folio_number, Scheme.amc_name)
                .join(Scheme, Folio.scheme_id == Scheme.id)
                .filter(Folio.household_member_id.in_([m.id for m in members]))
                .all()
            )
    except SQLAlchemyError:
        return None, None

    folio_key_to_member_id = {(fn, amc): mid for mid, fn, amc in existing_folios}
    for key in parsed_folio_keys:
        member_id = folio_key_to_member_id.get(key)
        if member_id is None:
            continue
        member = next((m for m in members if m.id == member_id), None)
        if member:
            return member, key
    return None, None


def resolve_attribution(
    db: Session,
    user_id: uuid.UUID,
    selected_member_id: uuid.UUID | None,
    parse_result: ParseResult,
) -> AttributionDecision:
    """Resolve attribution for a parsed CAS statement against the household roster.

    Raises CrossAccountPanBlockedError immediately, before returning any
    decision, if the parsed PAN belongs to a member of a different account.
    """
    members = db.query(HouseholdMember).filter(HouseholdMember.user_id == user_id).all()
    candidates = [{"id": str(m.id), "name": m.name, "relationship": m.relationship.value} for m in members]

    pan = parse_result.investor.pan
    matched_member: HouseholdMember | None = None
    matched_by_pan = False
    folio_matched_key: tuple[str, str] | None = None

    if pan:
        pan_hash = hash_pan(pan)
        system_match = _find_member_by_pan_hash(db, pan_hash)
        if system_match is not None:
            if system_match.user_id != user_id:
                raise CrossAccountPanBlockedError(CROSS_ACCOUNT_PAN_BLOCKED_MESSAGE)
            matched_member = system_match
            matched_by_pan = True

    if matched_member is None:
        matched_member, folio_matched_key = _find_folio_matched_member(db, members, parse_result)

    if not matched_member:
        return AttributionDecision(
            status=AttributionStatus.UNRECOGNIZED_MEMBER,
            resolved_member_id=None,
            matched_member_name=parse_result.investor.name,
            requires_confirmation=True,
            prompt_message="We couldn't match this statement to an existing family member. Would you like to add a new member?",
            candidate_members=candidates,
        )

    if matched_by_pan:
        return AttributionDecision(
            status=AttributionStatus.AUTO_MATCHED,
            resolved_member_id=matched_member.id,
            matched_member_name=matched_member.name,
            requires_confirmation=False,
            prompt_message=f"Matched to {matched_member.name} by PAN — attaching this statement to their account.",
            candidate_members=candidates,
            matched_by_pan=True,
        )

    if selected_member_id and matched_member.id == selected_member_id:
        return AttributionDecision(
            status=AttributionStatus.AUTO_MATCHED,
            resolved_member_id=matched_member.id,
            matched_member_name=matched_member.name,
            requires_confirmation=False,
            candidate_members=candidates,
        )

    prompt_message = (
        f"This folio ({folio_matched_key[0]} at {folio_matched_key[1]}) is already linked to "
        f"{matched_member.name} — import for {matched_member.name} instead?"
    )
    return AttributionDecision(
        status=AttributionStatus.MISMATCH_CONFIRMATION_REQUIRED,
        resolved_member_id=matched_member.id,
        matched_member_name=matched_member.name,
        requires_confirmation=True,
        prompt_message=prompt_message,
        candidate_members=candidates,
    )


def backfill_pan_if_missing(db: Session, member: HouseholdMember, parse_result: ParseResult) -> None:
    """Stores this member's PAN on first successful attribution, if not
    already on file. This is the only place PAN gets written -- there is no
    separate backfill/migration script (see design spec)."""
    if member.pan_lookup_hash is not None:
        return
    pan = parse_result.investor.pan
    if not pan:
        return
    pan_hash = hash_pan(pan)
    existing = _find_member_by_pan_hash(db, pan_hash)
    if existing is not None and existing.id != member.id:
        raise PanAlreadyAttributedError(PAN_ALREADY_ATTRIBUTED_MESSAGE)
    member.pan_encrypted = encrypt_pan(pan)
    member.pan_lookup_hash = pan_hash
