from datetime import datetime, timezone
import uuid

import pytest

from app.models.enums import Relationship
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.user import HouseholdMember, User
from app.services.import_.attribution import (
    AttributionConfirmationRequiredError,
    AttributionDecision,
    AttributionStatus,
    CrossAccountPanBlockedError,
    backfill_pan_if_missing,
    enforce_attribution_confirmation,
    resolve_attribution,
)
from app.services.import_.crypto import encrypt_pan, hash_pan
from app.services.import_.parser import ParsedInvestor, ParsedScheme, ParseResult


def _parse_result(*, pan: str | None = None, folio: str | None = None, amc: str | None = None) -> ParseResult:
    schemes = (
        [ParsedScheme(name="Test Fund", isin=None, amfi="123456", scheme_type="Equity", folio=folio, amc=amc, transaction_count=0)]
        if folio and amc
        else []
    )
    return ParseResult(
        investor=ParsedInvestor(name="Some Investor", email=None, pan_masked=None, pan=pan),
        schemes=schemes,
        transactions=[],
        raw_json="{}",
    )


def _existing_folio(db_session, member: HouseholdMember, *, folio: str, amc: str) -> None:
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex, name="Existing Fund", amc_name=amc, sebi_category="Equity")
    db_session.add(scheme)
    db_session.flush()
    from app.models.enums import PlanType
    db_session.add(Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=folio, plan_type=PlanType.DIRECT))
    db_session.commit()


def _user_with_member(db_session, *, name: str, pan: str | None = None) -> tuple[User, HouseholdMember]:
    now = datetime.now(timezone.utc)
    user = User(id=uuid.uuid4(), phone_number=f"+91{uuid.uuid4().int % 10_000_000_000:010d}", created_at=now)
    member = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name=name, relationship=Relationship.SELF, created_at=now,
        pan_encrypted=encrypt_pan(pan) if pan else None,
        pan_lookup_hash=hash_pan(pan) if pan else None,
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(member)
    db_session.commit()
    return user, member


@pytest.fixture
def household_setup(db_session):
    now = datetime.now(timezone.utc)
    user = User(id=uuid.uuid4(), phone_number="+919876543210", email="rajesh.kumar@example.com", created_at=now)
    db_session.add(user)
    db_session.flush()

    member_self = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Rajesh Kumar", relationship=Relationship.SELF, created_at=now,
        pan_encrypted=encrypt_pan("ABCDE1111A"), pan_lookup_hash=hash_pan("ABCDE1111A"),
    )
    member_spouse = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Priya Kumar", relationship=Relationship.SPOUSE, created_at=now,
        pan_encrypted=encrypt_pan("BCDEF2222B"), pan_lookup_hash=hash_pan("BCDEF2222B"),
    )
    member_child_no_pan = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Aarav Kumar", relationship=Relationship.CHILD, created_at=now,
    )
    db_session.add_all([member_self, member_spouse, member_child_no_pan])
    db_session.commit()
    return {"user": user, "self": member_self, "spouse": member_spouse, "child": member_child_no_pan}


def test_pan_match_within_household_auto_attributes_with_disclaimer(db_session, household_setup):
    decision = resolve_attribution(
        db=db_session, user_id=household_setup["user"].id,
        selected_member_id=household_setup["self"].id,
        parse_result=_parse_result(pan="BCDEF2222B"),
    )
    assert decision.status == AttributionStatus.AUTO_MATCHED
    assert decision.resolved_member_id == household_setup["spouse"].id
    assert decision.requires_confirmation is False
    assert decision.matched_by_pan is True
    assert "Priya Kumar" in decision.prompt_message


def test_pan_match_to_different_account_is_blocked(db_session, household_setup):
    _user_with_member(db_session, name="Someone Else", pan="ZZZZZ9999Z")

    with pytest.raises(CrossAccountPanBlockedError):
        resolve_attribution(
            db=db_session, user_id=household_setup["user"].id,
            selected_member_id=household_setup["self"].id,
            parse_result=_parse_result(pan="ZZZZZ9999Z"),
        )


def test_no_pan_parsed_falls_back_to_folio_match(db_session, household_setup):
    _existing_folio(db_session, household_setup["spouse"], folio="12345/67", amc="ICICI Prudential Mutual Fund")

    decision = resolve_attribution(
        db=db_session, user_id=household_setup["user"].id,
        selected_member_id=household_setup["self"].id,
        parse_result=_parse_result(pan=None, folio="12345/67", amc="ICICI Prudential Mutual Fund"),
    )
    assert decision.status == AttributionStatus.MISMATCH_CONFIRMATION_REQUIRED
    assert decision.resolved_member_id == household_setup["spouse"].id


def test_no_pan_and_no_folio_match_prompts_unrecognized_member(db_session, household_setup):
    decision = resolve_attribution(
        db=db_session, user_id=household_setup["user"].id,
        selected_member_id=household_setup["self"].id,
        parse_result=_parse_result(pan=None),
    )
    assert decision.status == AttributionStatus.UNRECOGNIZED_MEMBER
    assert decision.resolved_member_id is None


def test_name_on_the_cas_never_affects_matching(db_session, household_setup):
    # Investor name is "Some Investor" (see _parse_result) -- matches no
    # household member's name at all, but the PAN belongs to "self".
    decision = resolve_attribution(
        db=db_session, user_id=household_setup["user"].id,
        selected_member_id=household_setup["spouse"].id,
        parse_result=_parse_result(pan="ABCDE1111A"),
    )
    assert decision.status == AttributionStatus.AUTO_MATCHED
    assert decision.resolved_member_id == household_setup["self"].id


def test_backfill_stores_pan_on_first_successful_match(db_session, household_setup):
    member = household_setup["child"]
    assert member.pan_lookup_hash is None

    backfill_pan_if_missing(db_session, member, _parse_result(pan="CDEFG3333C"))

    assert member.pan_lookup_hash == hash_pan("CDEFG3333C")
    from app.services.import_.crypto import decrypt_pan
    assert decrypt_pan(member.pan_encrypted) == "CDEFG3333C"


def test_backfill_does_not_overwrite_an_existing_pan(db_session, household_setup):
    member = household_setup["self"]
    original_hash = member.pan_lookup_hash

    backfill_pan_if_missing(db_session, member, _parse_result(pan="DIFFERENT99Z"))

    assert member.pan_lookup_hash == original_hash


def test_backfill_no_ops_when_cas_has_no_pan(db_session, household_setup):
    member = household_setup["child"]
    backfill_pan_if_missing(db_session, member, _parse_result(pan=None))
    assert member.pan_lookup_hash is None
    assert member.pan_encrypted is None


def test_attribution_confirmation_gate_requires_an_explicit_override():
    decision = AttributionDecision(
        status=AttributionStatus.MISMATCH_CONFIRMATION_REQUIRED, resolved_member_id=uuid.uuid4(),
        matched_member_name="Priya Kumar", requires_confirmation=True, prompt_message="Confirm this member mismatch.",
    )
    with pytest.raises(AttributionConfirmationRequiredError, match="Confirm this member mismatch."):
        enforce_attribution_confirmation(decision, confirmed_override=False)


def test_attribution_confirmation_gate_allows_an_explicit_override():
    decision = AttributionDecision(
        status=AttributionStatus.UNRECOGNIZED_MEMBER, resolved_member_id=None,
        matched_member_name="Unknown Investor", requires_confirmation=True, prompt_message="Confirm this unmatched investor.",
    )
    enforce_attribution_confirmation(decision, confirmed_override=True)
