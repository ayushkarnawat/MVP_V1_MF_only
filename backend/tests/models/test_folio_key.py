"""#4: a folio's key is its folio number with all whitespace removed, filled
automatically when the caller doesn't pass one."""
import uuid
from datetime import datetime, timezone

from app.models.enums import PlanType, Relationship
from app.models.folio import Folio, normalise_folio_key
from app.models.reference import Scheme
from app.models.user import HouseholdMember, User


def test_normalise_folio_key_strips_all_whitespace():
    assert normalise_folio_key("4400918 / 3") == "4400918/3"
    assert normalise_folio_key(" 12 34 /\t5 ") == "1234/5"


def test_folio_key_defaults_from_folio_number(db_session):
    now = datetime.now(timezone.utc)
    user = User(id=uuid.uuid4(), phone_number="+919800003001", created_at=now)
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="A", relationship=Relationship.SELF, created_at=now)
    scheme = Scheme(id=uuid.uuid4(), amfi_code="FK1", name="X", amc_name="A", sebi_category="E")
    db_session.add_all([member, scheme])
    db_session.flush()
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id,
                  folio_number="4400918 / 3", plan_type=PlanType.REGULAR)
    db_session.add(folio)
    db_session.commit()
    assert folio.folio_key == "4400918/3" and folio.folio_number == "4400918 / 3"
