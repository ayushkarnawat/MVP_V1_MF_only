"""Finding Me in a statement and planning what to do with each detected person.

Read-only: nothing here writes or flushes. Names are only used to find Me,
decide renames and flag possible duplicates; PAN HMAC identifies people.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy.orm import Session

from app.models.enums import MemberPanSource, Relationship
from app.models.user import HouseholdMember
from app.services.import_.crypto import hash_pan
from app.services.import_.name_match import compare_names, has_more_tokens
from app.services.import_.pan_claims import classify_detected_pan
from app.services.import_.people import ParsedPerson

SelfKind = Literal["pan", "exact", "variant", "ambiguous", "mismatch", "absent"]
PersonStatus = Literal["me", "new", "existing_member", "locked_member", "other_account"]
NameUpdate = Literal["none", "update", "ask"]


@dataclass
class SelfMatch:
    kind: SelfKind
    person_key: str | None
    candidate_keys: list[str] = field(default_factory=list)


@dataclass
class PersonPlan:
    person_key: str
    status: PersonStatus
    member_id: uuid.UUID | None
    name: str
    name_update: NameUpdate
    current_name: str | None
    same_person_member_id: uuid.UUID | None


def has_permanent_pan(member: HouseholdMember) -> bool:
    return member.pan_lookup_hash is not None and member.pan_pending_until is None


def resolve_self(self_member: HouseholdMember, people: list[ParsedPerson]) -> SelfMatch:
    if has_permanent_pan(self_member):
        # F11: once Me's PAN is permanent, only the PAN can find Me. Never
        # fall back to names (an Add-data upload of Dad's CAS has no Me).
        hit = next(
            (p for p in people if p.pan and hash_pan(p.pan) == self_member.pan_lookup_hash), None
        )
        return SelfMatch("pan", hit.key, [hit.key]) if hit else SelfMatch("absent", None, [])

    exact: list[str] = []
    variant: list[str] = []
    for p in people:
        result = compare_names(self_member.name, p.name).result
        if result == "exact":
            exact.append(p.key)
        elif result == "variant":
            variant.append(p.key)
    for kind, keys in (("exact", exact), ("variant", variant)):
        if len(keys) == 1:
            return SelfMatch(kind, keys[0], keys)  # type: ignore[arg-type]
        if len(keys) > 1:
            return SelfMatch("ambiguous", None, keys)
    return SelfMatch("mismatch", None, [])


def plan_name_update(current: str, statement: str) -> NameUpdate:
    result = compare_names(statement, current).result
    if result == "mismatch":
        return "ask"  # M8
    if result == "variant" and has_more_tokens(statement, current):
        return "update"  # I9: only a longer statement name renames
    return "none"


def plan_people(
    db: Session, user_id: uuid.UUID, people: list[ParsedPerson], me_key: str | None
) -> list[PersonPlan]:
    members = db.query(HouseholdMember).filter(HouseholdMember.user_id == user_id).all()
    by_id = {m.id: m for m in members}
    self_member = next((m for m in members if m.relationship == Relationship.SELF), None)

    plans: list[PersonPlan] = []
    for p in people:
        if me_key is not None and p.key == me_key and self_member is not None:
            if has_permanent_pan(self_member):
                update = plan_name_update(self_member.name, p.name)
            else:
                # I10: first upload, Me's typed name vs the statement's.
                # Only a variant is a rename; a mismatch can't get here
                # (resolve_self would not have produced a me_key).
                update = (
                    "update"
                    if compare_names(p.name, self_member.name).result == "variant"
                    else "none"
                )
            name = self_member.name if p.needs_name else p.name
            plans.append(
                PersonPlan(p.key, "me", self_member.id, name, "none" if p.needs_name else update,
                           self_member.name, None)
            )
            continue

        status: PersonStatus = "new"
        member: HouseholdMember | None = None
        if p.pan:
            found, member_id = classify_detected_pan(db, user_id, p.pan)
            status = found
            member = by_id.get(member_id) if member_id else None

        if member is not None:
            update = "none" if p.needs_name else plan_name_update(member.name, p.name)
            name = member.name if p.needs_name else p.name
            plans.append(PersonPlan(p.key, status, member.id, name, update, member.name, None))
            continue

        same: uuid.UUID | None = None
        if status == "new" and p.pan and not p.needs_name:
            new_hash = hash_pan(p.pan)
            # U13: a typed, never-verified PAN on an unlocked member with the
            # same person's name -- probably the same human, ask the user.
            same = next(
                (
                    m.id
                    for m in members
                    if not m.is_locked
                    and m.pan_source == MemberPanSource.USER_ENTERED
                    and m.pan_verified_at is None
                    and m.pan_lookup_hash is not None
                    and m.pan_lookup_hash != new_hash
                    and compare_names(p.name, m.name).result in ("exact", "variant")
                ),
                None,
            )
        plans.append(PersonPlan(p.key, status, None, p.name, "none", None, same))
    return plans
