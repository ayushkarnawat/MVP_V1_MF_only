"""Family Member Attribution Engine per Updated-CAS-PRD FR-4 and Updated-CAS-App-Flow.

Ensures every imported CAS is attributed to the correct family member in the household:
- Single clean match to current member -> Auto-attributed.
- Single match to different member -> Mismatch confirmation dialog.
- Unrecognized member -> Add new family member prompt.
- Invariant: No commit without either clean match or explicit user confirmation.
- Non-negotiable: Never logs or persists PAN (ADR-004).
"""

from __future__ import annotations

import enum
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.user import HouseholdMember, User
from app.services.import_.parser import ParseResult


class AttributionStatus(str, enum.Enum):
    AUTO_MATCHED = "auto_matched"
    MISMATCH_CONFIRMATION_REQUIRED = "mismatch_confirmation_required"
    MULTI_MEMBER_CONFIRMATION_REQUIRED = "multi_member_confirmation_required"
    UNRECOGNIZED_MEMBER = "unrecognized_member"


@dataclass
class AttributionDecision:
    status: AttributionStatus
    resolved_member_id: uuid.UUID | None
    matched_member_name: str | None
    requires_confirmation: bool
    prompt_message: str | None = None
    candidate_members: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class CrossAccountDuplicateWarning:
    detected: bool
    reason: str


CROSS_ACCOUNT_DUPLICATE_WARNING = (
    "This investment may already be tracked under a different Unifolio account. "
    "If that's you, consider using that account instead."
)


class AttributionConfirmationRequiredError(Exception):
    """Raised when attribution needs an explicit user confirmation."""

    def __init__(self, attribution: AttributionDecision):
        self.attribution = attribution
        super().__init__(
            attribution.prompt_message
            or "Confirm which family member this statement belongs to."
        )


def enforce_attribution_confirmation(
    attribution: AttributionDecision,
    confirmed_override: bool,
) -> None:
    """Block every commit path until a required attribution is confirmed."""
    if attribution.requires_confirmation and not confirmed_override:
        raise AttributionConfirmationRequiredError(attribution)


def _normalize(text: str | None) -> str:
    if not text:
        return ""
    # Strip whitespace, punctuation, and lowercase
    cleaned = re.sub(r"\s+", " ", text.strip().lower())
    return cleaned


def detect_cross_account_duplicate(
    db: Session,
    user_id: uuid.UUID,
    parse_result: ParseResult,
) -> CrossAccountDuplicateWarning | None:
    """Return an identity-free advisory signal for matches in other accounts.

    This check is deliberately non-blocking: it never returns the matched
    account/member, and query failures degrade to no signal so an import can
    continue unchanged.
    """
    try:
        parsed_folio_keys = {
            (scheme.folio, scheme.amc)
            for scheme in parse_result.schemes
            if scheme.folio and scheme.amc
        }
        investor_name = _normalize(parse_result.investor.name)
    except (AttributeError, TypeError):
        return None

    try:
        with db.begin_nested():
            if parsed_folio_keys:
                key_predicates = [
                    and_(Folio.folio_number == folio_number, Scheme.amc_name == amc_name)
                    for folio_number, amc_name in parsed_folio_keys
                ]
                folio_hit = (
                    db.query(Folio.id)
                    .join(Scheme, Folio.scheme_id == Scheme.id)
                    .join(HouseholdMember, Folio.household_member_id == HouseholdMember.id)
                    .filter(
                        HouseholdMember.user_id != user_id,
                        or_(*key_predicates),
                    )
                    .first()
                )
                if folio_hit is not None:
                    return CrossAccountDuplicateWarning(detected=True, reason="folio_match")

            if investor_name:
                other_account_names = (
                    db.query(HouseholdMember.name)
                    .filter(HouseholdMember.user_id != user_id)
                    .all()
                )
                if any(
                    normalized_name
                    and (
                        normalized_name == investor_name
                        or normalized_name in investor_name
                        or investor_name in normalized_name
                    )
                    for (name,) in other_account_names
                    if (normalized_name := _normalize(name))
                ):
                    return CrossAccountDuplicateWarning(detected=True, reason="name_match")
    except SQLAlchemyError:
        return None

    return None


def resolve_attribution(
    db: Session,
    user_id: uuid.UUID,
    selected_member_id: uuid.UUID | None,
    parse_result: ParseResult,
) -> AttributionDecision:
    """Resolve attribution for a parsed CAS statement against the household roster."""
    members = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user_id)
        .all()
    )
    user = db.query(User).filter(User.id == user_id).first()

    candidates = [{"id": str(m.id), "name": m.name, "relationship": m.relationship.value} for m in members]

    investor_name = _normalize(parse_result.investor.name)
    investor_email = _normalize(parse_result.investor.email)

    parsed_folio_keys = {
        (scheme.folio, scheme.amc)
        for scheme in parse_result.schemes
        if scheme.folio and scheme.amc
    }
    folio_matched_member: HouseholdMember | None = None
    folio_matched_key: tuple[str, str] | None = None
    if parsed_folio_keys and members:
        try:
            with db.begin_nested():
                existing_folios = (
                    db.query(Folio.household_member_id, Folio.folio_number, Scheme.amc_name)
                    .join(Scheme, Folio.scheme_id == Scheme.id)
                    .filter(Folio.household_member_id.in_([member.id for member in members]))
                    .all()
                )
        except SQLAlchemyError:
            existing_folios = []

        folio_key_to_member_id = {
            (folio_number, amc_name): member_id
            for member_id, folio_number, amc_name in existing_folios
        }
        for key in parsed_folio_keys:
            member_id = folio_key_to_member_id.get(key)
            if member_id is None:
                continue
            folio_matched_member = next(
                (member for member in members if member.id == member_id),
                None,
            )
            if folio_matched_member:
                folio_matched_key = key
                break

    name_matched_member: HouseholdMember | None = None

    for m in members:
        norm_member_name = _normalize(m.name)
        if norm_member_name and (norm_member_name == investor_name or norm_member_name in investor_name or investor_name in norm_member_name):
            name_matched_member = m
            break

    # If not matched by name, check if email matches User email and member is 'self'
    if not name_matched_member and investor_email and user and user.email:
        if _normalize(user.email) == investor_email:
            for m in members:
                if m.relationship.value == "self":
                    name_matched_member = m
                    break

    matched_member = folio_matched_member or name_matched_member

    if not matched_member:
        return AttributionDecision(
            status=AttributionStatus.UNRECOGNIZED_MEMBER,
            resolved_member_id=None,
            matched_member_name=parse_result.investor.name,
            requires_confirmation=True,
            prompt_message="We couldn't match this statement to an existing family member. Would you like to add a new member?",
            candidate_members=candidates,
        )

    # If matched member is the one currently selected
    if selected_member_id and matched_member.id == selected_member_id:
        return AttributionDecision(
            status=AttributionStatus.AUTO_MATCHED,
            resolved_member_id=matched_member.id,
            matched_member_name=matched_member.name,
            requires_confirmation=False,
            candidate_members=candidates,
        )

    # Mismatch with currently selected member
    prompt_message = (
        f"This folio ({folio_matched_key[0]} at {folio_matched_key[1]}) is already linked to "
        f"{matched_member.name} — import for {matched_member.name} instead?"
        if folio_matched_key is not None
        else f"This looks like {matched_member.name}'s statement — import for {matched_member.name} instead?"
    )
    return AttributionDecision(
        status=AttributionStatus.MISMATCH_CONFIRMATION_REQUIRED,
        resolved_member_id=matched_member.id,
        matched_member_name=matched_member.name,
        requires_confirmation=True,
        prompt_message=prompt_message,
        candidate_members=candidates,
    )
