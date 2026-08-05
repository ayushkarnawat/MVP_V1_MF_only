"""One-time dev fixture: creates a User + HouseholdMember so the frontend
has a real household_member_id to send. No auth flow exists yet (PRD-02 is
a separate phase) to create one for real. Idempotent — safe to run more
than once, always prints the same UUID once seeded.

Run from backend/: .venv/bin/python scripts/seed_dev_household_member.py
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import SessionLocal
from app.models.enums import Relationship
from app.models.user import HouseholdMember, User

DEV_PHONE_NUMBER = "+910000000000"


def main() -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(phone_number=DEV_PHONE_NUMBER).first()
        if not user:
            user = User(phone_number=DEV_PHONE_NUMBER, created_at=datetime.now(timezone.utc))
            db.add(user)
            db.flush()

        member = db.query(HouseholdMember).filter_by(user_id=user.id).first()
        if not member:
            member = HouseholdMember(
                user_id=user.id,
                name="Dev User",
                relationship=Relationship.SELF,
                created_at=datetime.now(timezone.utc),
            )
            db.add(member)
            db.commit()

        print(f"household_member_id={member.id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
