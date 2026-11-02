import uuid

import pytest

from app.models.enums import Relationship
from app.services.auth.head_labels import MemberLabel, flip_labels


def _member(
    relationship: Relationship | None,
    *,
    other_label: str | None = None,
    is_new_head: bool = False,
) -> MemberLabel:
    return MemberLabel(
        member_id=uuid.uuid4(),
        relationship=relationship,
        relationship_other_label=other_label,
        is_new_head=is_new_head,
    )


@pytest.mark.parametrize(
    ("new_head_old_label", "expected"),
    [
        (Relationship.SPOUSE, Relationship.SPOUSE),
        (Relationship.PARENT, Relationship.CHILD),
        (Relationship.CHILD, Relationship.PARENT),
        (Relationship.SIBLING, Relationship.SIBLING),
    ],
)
def test_every_old_head_label_table_cell(new_head_old_label, expected):
    new_head = _member(new_head_old_label, is_new_head=True)

    plan = flip_labels(new_head_old_label, [new_head])

    assert plan.old_head_new_label == expected
    assert plan.member_labels == {new_head.member_id: Relationship.SELF}
    assert plan.needs_input == []


@pytest.mark.parametrize("new_head_old_label", [Relationship.OTHER, None])
def test_old_head_label_is_not_guessed_when_new_head_was_other_or_not_set(new_head_old_label):
    new_head = _member(new_head_old_label, other_label="Friend", is_new_head=True)

    plan = flip_labels(new_head_old_label, [new_head])

    assert plan.old_head_new_label is None
    assert plan.member_labels == {new_head.member_id: Relationship.SELF}
    assert plan.needs_input == [new_head.member_id]


EVERY_OTHER_MEMBER_TABLE_CELL = [
    (Relationship.SPOUSE, Relationship.SPOUSE, Relationship.OTHER, "second spouse", False),
    (Relationship.SPOUSE, Relationship.PARENT, Relationship.OTHER, "parent-in-law", False),
    (Relationship.SPOUSE, Relationship.CHILD, Relationship.CHILD, None, True),
    (Relationship.SPOUSE, Relationship.SIBLING, Relationship.OTHER, "sibling-in-law", False),
    (Relationship.SPOUSE, Relationship.OTHER, Relationship.OTHER, "Friend", False),
    (Relationship.SPOUSE, None, None, None, False),
    (Relationship.PARENT, Relationship.SPOUSE, Relationship.OTHER, "child-in-law", False),
    (Relationship.PARENT, Relationship.PARENT, Relationship.SPOUSE, None, True),
    (Relationship.PARENT, Relationship.CHILD, Relationship.OTHER, "grandchild", False),
    (Relationship.PARENT, Relationship.SIBLING, Relationship.CHILD, None, False),
    (Relationship.PARENT, Relationship.OTHER, Relationship.OTHER, "Friend", False),
    (Relationship.PARENT, None, None, None, False),
    (Relationship.CHILD, Relationship.SPOUSE, Relationship.PARENT, None, True),
    (Relationship.CHILD, Relationship.PARENT, Relationship.OTHER, "grandparent", False),
    (Relationship.CHILD, Relationship.CHILD, Relationship.SIBLING, None, False),
    (Relationship.CHILD, Relationship.SIBLING, Relationship.OTHER, "uncle or aunt", False),
    (Relationship.CHILD, Relationship.OTHER, Relationship.OTHER, "Friend", False),
    (Relationship.CHILD, None, None, None, False),
    (Relationship.SIBLING, Relationship.SPOUSE, Relationship.OTHER, "sibling-in-law", False),
    (Relationship.SIBLING, Relationship.PARENT, Relationship.PARENT, None, False),
    (Relationship.SIBLING, Relationship.CHILD, Relationship.OTHER, "niece or nephew", False),
    (Relationship.SIBLING, Relationship.SIBLING, Relationship.SIBLING, None, False),
    (Relationship.SIBLING, Relationship.OTHER, Relationship.OTHER, "Friend", False),
    (Relationship.SIBLING, None, None, None, False),
]


@pytest.mark.parametrize(
    ("new_head_old_label", "old_label", "expected_label", "expected_other", "review"),
    EVERY_OTHER_MEMBER_TABLE_CELL,
)
def test_every_other_member_label_table_cell(
    new_head_old_label,
    old_label,
    expected_label,
    expected_other,
    review,
):
    new_head = _member(new_head_old_label, is_new_head=True)
    other = _member(old_label, other_label="Friend" if old_label == Relationship.OTHER else None)

    plan = flip_labels(new_head_old_label, [new_head, other])

    assert plan.member_labels[other.member_id] == expected_label
    assert plan.member_other_labels.get(other.member_id) == expected_other
    assert (other.member_id in plan.review_recommended) is review
    # A table cell never asks the person for anything: only cleared free text does (tests below).
    assert other.member_id not in plan.needs_input


@pytest.mark.parametrize("new_head_old_label", [Relationship.SPOUSE, Relationship.PARENT, Relationship.CHILD, Relationship.SIBLING])
def test_member_with_no_label_stays_not_set_and_is_not_asked_about(new_head_old_label):
    new_head = _member(new_head_old_label, is_new_head=True)
    unlabelled = _member(None)

    plan = flip_labels(new_head_old_label, [new_head, unlabelled])

    assert plan.member_labels[unlabelled.member_id] is None
    assert unlabelled.member_id not in plan.needs_input
    assert plan.needs_input == []


def test_a_relationship_value_the_tables_do_not_name_is_left_alone():
    new_head = _member(Relationship.SPOUSE, is_new_head=True)
    stray = _member(Relationship.SELF)

    plan = flip_labels(Relationship.SPOUSE, [new_head, stray])

    assert plan.member_labels[stray.member_id] == Relationship.SELF
    assert stray.member_id not in plan.needs_input


def test_unlabelled_new_head_needs_input():
    new_head = _member(None, is_new_head=True)

    plan = flip_labels(None, [new_head])

    assert plan.old_head_new_label is None
    assert plan.needs_input == [new_head.member_id]


@pytest.mark.parametrize("label", ["Friend", "Business partner", " business partner "])
def test_symmetric_free_text_other_is_kept(label):
    new_head = _member(Relationship.SIBLING, is_new_head=True)
    other = _member(Relationship.OTHER, other_label=label)

    plan = flip_labels(Relationship.SIBLING, [new_head, other])

    assert plan.member_labels[other.member_id] == Relationship.OTHER
    assert plan.member_other_labels[other.member_id] == label.strip()
    assert other.member_id not in plan.needs_input


@pytest.mark.parametrize("label", ["Mother-in-law", "Uncle", "", None])
def test_free_text_other_is_cleared_unless_symmetric(label):
    new_head = _member(Relationship.CHILD, is_new_head=True)
    other = _member(Relationship.OTHER, other_label=label)

    plan = flip_labels(Relationship.CHILD, [new_head, other])

    assert plan.member_labels[other.member_id] is None
    assert other.member_id not in plan.member_other_labels
    assert plan.needs_input == [other.member_id]


def test_hedged_cells_are_marked_for_review():
    new_head = _member(Relationship.SPOUSE, is_new_head=True)
    stepchild = _member(Relationship.CHILD)
    ordinary = _member(Relationship.PARENT)

    plan = flip_labels(Relationship.SPOUSE, [new_head, stepchild, ordinary])

    assert plan.review_recommended == [stepchild.member_id]
