from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db
from app.models.user import User
from app.services.auth.session import get_current_user
from app.services.dashboard.household_members import create_household_member, list_household_members
from app.services.dashboard.schemas import HouseholdMemberCreate, HouseholdMemberResponse

router = APIRouter(tags=["dashboard"])


@router.post("/household-members", response_model=HouseholdMemberResponse)
def create_member(
    body: HouseholdMemberCreate,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    member = create_household_member(
        db, user.id, body.name, body.relationship, body.relationship_other_label
    )
    return HouseholdMemberResponse(
        id=str(member.id),
        name=member.name,
        relationship=member.relationship,
        relationship_other_label=member.relationship_other_label,
    )


@router.get("/household-members", response_model=list[HouseholdMemberResponse])
def list_members(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    members = list_household_members(db, user.id)
    return [
        HouseholdMemberResponse(
            id=str(m.id),
            name=m.name,
            relationship=m.relationship,
            relationship_other_label=m.relationship_other_label,
        )
        for m in members
    ]
