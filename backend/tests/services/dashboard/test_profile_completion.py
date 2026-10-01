import uuid
from datetime import datetime, timezone

from app.models.enums import MemberNameSource, MemberOrigin, MemberPanConflict, MemberPanSource, Relationship
from app.models.user import HouseholdMember
from app.services.dashboard.profile_completion import (
    completion_percent, missing_profile_fields, pan_editable, removed_with_last_import,
)


def _m(**kw) -> HouseholdMember:
    base = dict(id=uuid.uuid4(), user_id=uuid.uuid4(), name="Ramesh Sharma",
                created_at=datetime.now(timezone.utc), origin=MemberOrigin.CAS_DETECTED,
                name_source=MemberNameSource.CAS)
    base.update(kw)
    return HouseholdMember(**base)


def test_detected_member_with_cas_pan_starts_at_40():
    m = _m(pan_lookup_hash="h", pan_encrypted="e", pan_source=MemberPanSource.CAS)
    missing = missing_profile_fields(m, account_phone=None, account_email=None)
    assert missing == ["relationship", "phone_number", "email"]
    assert completion_percent(missing) == 40


def test_name_only_member_starts_at_20_and_pan_is_editable():
    m = _m()
    assert completion_percent(missing_profile_fields(m, account_phone=None, account_email=None)) == 20
    assert pan_editable(m) is True


def test_pan_conflict_never_counts_pan_so_max_is_80():
    m = _m(detected_pan_hash="h", detected_pan_encrypted="e", pan_source=MemberPanSource.CAS,
           pan_conflict=MemberPanConflict.OTHER_ACCOUNT, relationship=Relationship.PARENT,
           phone_number="+919800000002", email="r@example.com")
    missing = missing_profile_fields(m, account_phone=None, account_email=None)
    assert missing == ["pan"] and completion_percent(missing) == 80
    assert pan_editable(m) is False  # a CAS PAN is never typed over


def test_self_uses_account_phone_and_email():
    m = _m(relationship=Relationship.SELF, origin=MemberOrigin.ONBOARDING,
           pan_lookup_hash="h", pan_encrypted="e", pan_source=MemberPanSource.CAS)
    assert missing_profile_fields(m, account_phone="+919800000001", account_email="a@example.com") == []
    assert pan_editable(m) is False


def test_removed_with_last_import_only_when_untouched():
    assert removed_with_last_import(_m()) is True
    assert removed_with_last_import(_m(relationship=Relationship.CHILD)) is False
    assert removed_with_last_import(_m(phone_number="+919800000002")) is False
    assert removed_with_last_import(_m(name_source=MemberNameSource.USER_EDITED)) is False
    assert removed_with_last_import(_m(origin=MemberOrigin.MANUAL)) is False
