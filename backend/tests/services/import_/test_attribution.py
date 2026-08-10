from datetime import datetime, timezone
import uuid
import pytest
from app.models.enums import Relationship
from app.models.user import HouseholdMember, User
from app.services.import_.attribution import (
    AttributionDecision,
    AttributionStatus,
    resolve_attribution,
)
from app.services.import_.parser import ParsedInvestor, ParseResult


@pytest.fixture
def household_setup(db_session):
    now = datetime.now(timezone.utc)
    user = User(
        id=uuid.uuid4(),
        phone_number="+919876543210",
        email="rajesh.kumar@example.com",
        created_at=now,
    )
    db_session.add(user)
    db_session.flush()

    member_self = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Rajesh Kumar",
        relationship=Relationship.SELF,
        created_at=now,
    )
    member_spouse = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Priya Kumar",
        relationship=Relationship.SPOUSE,
        created_at=now,
    )
    member_child = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Aarav Kumar",
        relationship=Relationship.CHILD,
        created_at=now,
    )
    db_session.add_all([member_self, member_spouse, member_child])
    db_session.commit()

    return {
        "user": user,
        "self": member_self,
        "spouse": member_spouse,
        "child": member_child,
    }


def test_clean_single_match_to_selected_member(db_session, household_setup):
    selected_member_id = household_setup["self"].id
    investor = ParsedInvestor(name="Rajesh Kumar", email="rajesh.kumar@example.com", pan_masked="A*****1")
    parse_result = ParseResult(
        investor=investor,
        schemes=[],
        transactions=[],
        raw_json="{}",
    )

    decision = resolve_attribution(
        db=db_session,
        user_id=household_setup["user"].id,
        selected_member_id=selected_member_id,
        parse_result=parse_result,
    )

    assert decision.status == AttributionStatus.AUTO_MATCHED
    assert decision.resolved_member_id == selected_member_id
    assert decision.requires_confirmation is False
    assert decision.matched_member_name == "Rajesh Kumar"


def test_mismatch_detected_when_statement_belongs_to_different_member(db_session, household_setup):
    selected_member_id = household_setup["self"].id
    # Statement belongs to Priya (Spouse), but user was on Rajesh (Self)
    investor = ParsedInvestor(name="Priya Kumar", email="priya.kumar@example.com", pan_masked="B*****2")
    parse_result = ParseResult(
        investor=investor,
        schemes=[],
        transactions=[],
        raw_json="{}",
    )

    decision = resolve_attribution(
        db=db_session,
        user_id=household_setup["user"].id,
        selected_member_id=selected_member_id,
        parse_result=parse_result,
    )

    assert decision.status == AttributionStatus.MISMATCH_CONFIRMATION_REQUIRED
    assert decision.resolved_member_id == household_setup["spouse"].id
    assert decision.requires_confirmation is True
    assert decision.matched_member_name == "Priya Kumar"
    assert "Priya Kumar" in decision.prompt_message


def test_unrecognized_member_prompts_add_member(db_session, household_setup):
    selected_member_id = household_setup["self"].id
    # Investor not in household
    investor = ParsedInvestor(name="Sunil Sharma", email="sunil.sharma@example.com", pan_masked="C*****3")
    parse_result = ParseResult(
        investor=investor,
        schemes=[],
        transactions=[],
        raw_json="{}",
    )

    decision = resolve_attribution(
        db=db_session,
        user_id=household_setup["user"].id,
        selected_member_id=selected_member_id,
        parse_result=parse_result,
    )

    assert decision.status == AttributionStatus.UNRECOGNIZED_MEMBER
    assert decision.resolved_member_id is None
    assert decision.requires_confirmation is True


def test_name_matching_handles_case_and_formatting(db_session, household_setup):
    selected_member_id = household_setup["spouse"].id
    investor = ParsedInvestor(name="PRIYA  KUMAR", email=None, pan_masked="B*****2")
    parse_result = ParseResult(
        investor=investor,
        schemes=[],
        transactions=[],
        raw_json="{}",
    )

    decision = resolve_attribution(
        db=db_session,
        user_id=household_setup["user"].id,
        selected_member_id=selected_member_id,
        parse_result=parse_result,
    )

    assert decision.status == AttributionStatus.AUTO_MATCHED
    assert decision.resolved_member_id == household_setup["spouse"].id
