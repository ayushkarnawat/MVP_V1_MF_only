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

from sqlalchemy.orm import Session

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


def _normalize(text: str | None) -> str:
    if not text:
        return ""
    # Strip whitespace, punctuation, and lowercase
    cleaned = re.sub(r"\s+", " ", text.strip().lower())
    return cleaned


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

    matched_member: HouseholdMember | None = None

    for m in members:
        norm_member_name = _normalize(m.name)
        if norm_member_name and (norm_member_name == investor_name or norm_member_name in investor_name or investor_name in norm_member_name):
            matched_member = m
            break

    # If not matched by name, check if email matches User email and member is 'self'
    if not matched_member and investor_email and user and user.email:
        if _normalize(user.email) == investor_email:
            for m in members:
                if m.relationship.value == "self":
                    matched_member = m
                    break

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
    return AttributionDecision(
        status=AttributionStatus.MISMATCH_CONFIRMATION_REQUIRED,
        resolved_member_id=matched_member.id,
        matched_member_name=matched_member.name,
        requires_confirmation=True,
        prompt_message=f"This looks like {matched_member.name}'s statement — import for {matched_member.name} instead?",
        candidate_members=candidates,
    )
