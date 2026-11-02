from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from app.models.enums import Relationship


@dataclass(frozen=True)
class MemberLabel:
    """One member's relationship before the head change.

    The new head is included once with ``is_new_head=True`` so a missing
    label can be tied to that member id in ``LabelPlan.needs_input``.
    The old head is omitted because its result has a dedicated field.
    """

    member_id: uuid.UUID
    relationship: Relationship | None
    relationship_other_label: str | None = None
    is_new_head: bool = False


@dataclass(frozen=True)
class LabelPlan:
    old_head_new_label: Relationship | None
    member_labels: dict[uuid.UUID, Relationship | None]
    needs_input: list[uuid.UUID]
    member_other_labels: dict[uuid.UUID, str] = field(default_factory=dict)
    review_recommended: list[uuid.UUID] = field(default_factory=list)


@dataclass(frozen=True)
class LabelRule:
    relationship: Relationship | None = None
    other_label: str | None = None
    unchanged: bool = False
    review_recommended: bool = False


OLD_HEAD_LABEL_TABLE: dict[Relationship | None, Relationship | None] = {
    Relationship.SPOUSE: Relationship.SPOUSE,
    Relationship.PARENT: Relationship.CHILD,
    Relationship.CHILD: Relationship.PARENT,
    Relationship.SIBLING: Relationship.SIBLING,
    Relationship.OTHER: None,
    None: None,
}


OTHER_MEMBER_LABEL_TABLE: dict[
    Relationship, dict[Relationship | None, LabelRule]
] = {
    Relationship.SPOUSE: {
        Relationship.SPOUSE: LabelRule(Relationship.OTHER, "second spouse"),
        Relationship.PARENT: LabelRule(Relationship.OTHER, "parent-in-law"),
        Relationship.CHILD: LabelRule(
            Relationship.CHILD, review_recommended=True
        ),
        Relationship.SIBLING: LabelRule(Relationship.OTHER, "sibling-in-law"),
        Relationship.OTHER: LabelRule(unchanged=True),
        None: LabelRule(unchanged=True),
    },
    Relationship.PARENT: {
        Relationship.SPOUSE: LabelRule(Relationship.OTHER, "child-in-law"),
        Relationship.PARENT: LabelRule(
            Relationship.SPOUSE, review_recommended=True
        ),
        Relationship.CHILD: LabelRule(Relationship.OTHER, "grandchild"),
        Relationship.SIBLING: LabelRule(Relationship.CHILD),
        Relationship.OTHER: LabelRule(unchanged=True),
        None: LabelRule(unchanged=True),
    },
    Relationship.CHILD: {
        Relationship.SPOUSE: LabelRule(
            Relationship.PARENT, review_recommended=True
        ),
        Relationship.PARENT: LabelRule(Relationship.OTHER, "grandparent"),
        Relationship.CHILD: LabelRule(Relationship.SIBLING),
        Relationship.SIBLING: LabelRule(Relationship.OTHER, "uncle or aunt"),
        Relationship.OTHER: LabelRule(unchanged=True),
        None: LabelRule(unchanged=True),
    },
    Relationship.SIBLING: {
        Relationship.SPOUSE: LabelRule(Relationship.OTHER, "sibling-in-law"),
        Relationship.PARENT: LabelRule(Relationship.PARENT),
        Relationship.CHILD: LabelRule(Relationship.OTHER, "niece or nephew"),
        Relationship.SIBLING: LabelRule(Relationship.SIBLING),
        Relationship.OTHER: LabelRule(unchanged=True),
        None: LabelRule(unchanged=True),
    },
}


# There is no reliable way to infer whether arbitrary kinship prose reads
# the same in both directions. Keep the two symmetric labels named by the
# product brief; every other free-text value is sent back for human input.
SYMMETRIC_OTHER_LABELS = frozenset({"friend", "business partner"})


def flip_labels(
    new_head_old_label: Relationship | None, members: list[MemberLabel]
) -> LabelPlan:
    """Build a reviewable relationship plan without inferring kinship."""
    old_head_new_label = OLD_HEAD_LABEL_TABLE.get(new_head_old_label)
    labels: dict[uuid.UUID, Relationship | None] = {}
    other_labels: dict[uuid.UUID, str] = {}
    needs_input: list[uuid.UUID] = []
    review_recommended: list[uuid.UUID] = []

    for member in members:
        if member.is_new_head:
            labels[member.member_id] = Relationship.SELF
            if old_head_new_label is None:
                needs_input.append(member.member_id)
            continue

        row = OTHER_MEMBER_LABEL_TABLE.get(new_head_old_label)
        # Any value the table does not name (for example a stray SELF row) is left as it is.
        rule = (
            row.get(member.relationship, LabelRule(unchanged=True))
            if row is not None
            else LabelRule(unchanged=True)
        )
        relationship, other_label = _apply_rule(member, rule)
        labels[member.member_id] = relationship
        if other_label is not None:
            other_labels[member.member_id] = other_label
        # A member who had no label stays "not set" and needs nothing from the person;
        # only a label the flip had to clear (free text that does not read the same from
        # either side) is sent back for input.
        if relationship is None and member.relationship is not None:
            needs_input.append(member.member_id)
        if rule.review_recommended:
            review_recommended.append(member.member_id)

    return LabelPlan(
        old_head_new_label=old_head_new_label,
        member_labels=labels,
        needs_input=needs_input,
        member_other_labels=other_labels,
        review_recommended=review_recommended,
    )


def _apply_rule(
    member: MemberLabel, rule: LabelRule
) -> tuple[Relationship | None, str | None]:
    if not rule.unchanged:
        return rule.relationship, rule.other_label
    if member.relationship != Relationship.OTHER:
        return member.relationship, None
    label = (member.relationship_other_label or "").strip()
    if label.casefold() in SYMMETRIC_OTHER_LABELS:
        return Relationship.OTHER, label
    return None, None
