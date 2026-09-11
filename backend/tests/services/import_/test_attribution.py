from dataclasses import asdict
from datetime import datetime, timezone
import uuid
import pytest
from sqlalchemy.exc import SQLAlchemyError
from app.services.import_ import attribution
from app.models.enums import PlanType, Relationship
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.user import HouseholdMember, User
from app.services.import_.attribution import (
    AttributionConfirmationRequiredError,
    AttributionDecision,
    AttributionStatus,
    enforce_attribution_confirmation,
    resolve_attribution,
)
from app.services.import_.parser import ParsedInvestor, ParsedScheme, ParseResult


def _parse_result(*, investor_name: str, folio: str, amc: str) -> ParseResult:
    return ParseResult(
        investor=ParsedInvestor(name=investor_name, email=None, pan_masked=None),
        schemes=[
            ParsedScheme(
                name="Test Fund",
                isin=None,
                amfi="123456",
                scheme_type="Equity",
                folio=folio,
                amc=amc,
                transaction_count=0,
            )
        ],
        transactions=[],
        raw_json="{}",
    )


def _existing_folio(db_session, member: HouseholdMember, *, folio: str, amc: str) -> None:
    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code=uuid.uuid4().hex,
        name="Existing Fund",
        amc_name=amc,
        sebi_category="Equity",
    )
    db_session.add(scheme)
    db_session.flush()
    db_session.add(
        Folio(
            id=uuid.uuid4(),
            household_member_id=member.id,
            scheme_id=scheme.id,
            folio_number=folio,
            plan_type=PlanType.DIRECT,
        )
    )
    db_session.commit()


def _member_for_new_user(db_session, *, name: str) -> tuple[User, HouseholdMember]:
    now = datetime.now(timezone.utc)
    user = User(
        id=uuid.uuid4(),
        phone_number=f"+91{uuid.uuid4().int % 10_000_000_000:010d}",
        created_at=now,
    )
    member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=name,
        relationship=Relationship.SELF,
        created_at=now,
    )
    # Flush the user before adding the member: without an ORM relationship()
    # between User and HouseholdMember, the unit-of-work's insert ordering
    # doesn't follow add_all()'s list order, so a single flush can attempt
    # the FK-dependent insert first.
    db_session.add(user)
    db_session.flush()
    db_session.add(member)
    db_session.commit()
    return user, member


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


def test_folio_match_takes_priority_over_conflicting_name_match(db_session, household_setup):
    _existing_folio(
        db_session,
        household_setup["spouse"],
        folio="12345/67",
        amc="ICICI Prudential Mutual Fund",
    )

    decision = resolve_attribution(
        db=db_session,
        user_id=household_setup["user"].id,
        selected_member_id=household_setup["self"].id,
        parse_result=_parse_result(
            investor_name="Rajesh Kumar",
            folio="12345/67",
            amc="ICICI Prudential Mutual Fund",
        ),
    )

    assert decision.status == AttributionStatus.MISMATCH_CONFIRMATION_REQUIRED
    assert decision.resolved_member_id == household_setup["spouse"].id
    assert decision.requires_confirmation is True
    assert decision.prompt_message == (
        "This folio (12345/67 at ICICI Prudential Mutual Fund) is already linked to "
        "Priya Kumar — import for Priya Kumar instead?"
    )


def test_folio_match_to_selected_member_is_auto_matched_despite_conflicting_name(db_session, household_setup):
    _existing_folio(
        db_session,
        household_setup["spouse"],
        folio="76543/21",
        amc="HDFC Mutual Fund",
    )

    decision = resolve_attribution(
        db=db_session,
        user_id=household_setup["user"].id,
        selected_member_id=household_setup["spouse"].id,
        parse_result=_parse_result(
            investor_name="Rajesh Kumar",
            folio="76543/21",
            amc="HDFC Mutual Fund",
        ),
    )

    assert decision.status == AttributionStatus.AUTO_MATCHED
    assert decision.resolved_member_id == household_setup["spouse"].id
    assert decision.requires_confirmation is False


def test_cross_account_folio_match_returns_identity_free_warning(db_session, household_setup):
    other_user, other_member = _member_for_new_user(db_session, name="Secret Other Person")
    _existing_folio(
        db_session,
        other_member,
        folio="CROSS-123",
        amc="SBI Mutual Fund",
    )

    warning = attribution.detect_cross_account_duplicate(
        db_session,
        household_setup["user"].id,
        _parse_result(
            investor_name="Completely Different Name",
            folio="CROSS-123",
            amc="SBI Mutual Fund",
        ),
    )

    assert warning is not None
    assert asdict(warning) == {"detected": True, "reason": "folio_match"}
    warning_repr = repr(warning)
    assert str(other_user.id) not in warning_repr
    assert str(other_member.id) not in warning_repr
    assert other_member.name not in warning_repr


def test_cross_account_duplicate_ignores_same_users_household(db_session, household_setup):
    _existing_folio(
        db_session,
        household_setup["spouse"],
        folio="OWN-456",
        amc="Axis Mutual Fund",
    )

    warning = attribution.detect_cross_account_duplicate(
        db_session,
        household_setup["user"].id,
        _parse_result(
            investor_name="No Household Name Match",
            folio="OWN-456",
            amc="Axis Mutual Fund",
        ),
    )

    assert warning is None


def test_cross_account_name_only_match_is_lower_confidence(db_session, household_setup):
    _member_for_new_user(db_session, name="Same Display Name")

    warning = attribution.detect_cross_account_duplicate(
        db_session,
        household_setup["user"].id,
        _parse_result(
            investor_name="  SAME   DISPLAY NAME ",
            folio="NO-CROSS-FOLIO",
            amc="Kotak Mutual Fund",
        ),
    )

    assert warning is not None
    assert asdict(warning) == {"detected": True, "reason": "name_match"}


def test_cross_account_detection_query_failure_degrades_to_no_signal():
    class FailingSession:
        def begin_nested(self):
            raise SQLAlchemyError("database unavailable")

    warning = attribution.detect_cross_account_duplicate(
        FailingSession(),  # type: ignore[arg-type]
        uuid.uuid4(),
        _parse_result(
            investor_name="Test Investor",
            folio="BROKEN-QUERY",
            amc="Test Mutual Fund",
        ),
    )

    assert warning is None


def test_attribution_confirmation_gate_requires_an_explicit_override():
    decision = AttributionDecision(
        status=AttributionStatus.MISMATCH_CONFIRMATION_REQUIRED,
        resolved_member_id=uuid.uuid4(),
        matched_member_name="Priya Kumar",
        requires_confirmation=True,
        prompt_message="Confirm this member mismatch.",
    )

    with pytest.raises(
        AttributionConfirmationRequiredError,
        match="Confirm this member mismatch.",
    ) as exc_info:
        enforce_attribution_confirmation(decision, confirmed_override=False)

    assert exc_info.value.attribution is decision


def test_attribution_confirmation_gate_allows_an_explicit_override():
    decision = AttributionDecision(
        status=AttributionStatus.UNRECOGNIZED_MEMBER,
        resolved_member_id=None,
        matched_member_name="Unknown Investor",
        requires_confirmation=True,
        prompt_message="Confirm this unmatched investor.",
    )

    enforce_attribution_confirmation(decision, confirmed_override=True)
