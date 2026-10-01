"""Profile completion for a household member: five fields, 20% each,
computed from the row on every read and never stored (spec "How the % is
counted"). Self's phone and email live on users, so the caller passes them."""

from __future__ import annotations

from app.models.enums import MemberNameSource, MemberOrigin, MemberPanSource, Relationship
from app.models.user import HouseholdMember

PROFILE_FIELD_COUNT = 5  # name (always set), pan, relationship, phone, email


def has_profile_pan(m: HouseholdMember) -> bool:
    # A PAN held by another account never counts: it can't be added here.
    return m.pan_lookup_hash is not None and m.pan_conflict is None


def missing_profile_fields(
    m: HouseholdMember, *, account_phone: str | None, account_email: str | None
) -> list[str]:
    is_self = m.relationship == Relationship.SELF
    missing: list[str] = []
    if not has_profile_pan(m):
        missing.append("pan")
    if m.relationship is None:
        missing.append("relationship")
    if not (account_phone if is_self else m.phone_number):
        missing.append("phone_number")
    if not (account_email if is_self else m.email):
        missing.append("email")
    return missing


def completion_percent(missing: list[str]) -> int:
    return round(100 * (PROFILE_FIELD_COUNT - len(missing)) / PROFILE_FIELD_COUNT)


def pan_editable(m: HouseholdMember) -> bool:
    """Q2: the popup's PAN box is editable only for a non-self member with no
    claimed PAN whose PAN never came from a statement. That covers a member
    with no PAN at all, or one whose typed PAN hit another account (so it
    can be corrected)."""
    return (
        m.relationship != Relationship.SELF
        and m.pan_lookup_hash is None
        and m.pan_source != MemberPanSource.CAS
    )


def removed_with_last_import(m: HouseholdMember) -> bool:
    """M17 without locks: a detected member the user never touched exists
    only because of a statement, so it leaves with its last import. Any
    profile data (relationship, phone, email, an edited name) keeps it."""
    return (
        m.origin == MemberOrigin.CAS_DETECTED
        and m.relationship is None
        and not m.phone_number
        and not m.email
        and m.name_source != MemberNameSource.USER_EDITED
    )
