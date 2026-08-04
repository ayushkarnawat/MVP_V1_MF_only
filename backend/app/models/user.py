import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import InvestorType, PrimaryGoal, Relationship


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    phone_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    onboarding_step: Mapped[str | None] = mapped_column(String)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    investor_type: Mapped[InvestorType | None] = mapped_column(Enum(InvestorType))
    primary_goal: Mapped[PrimaryGoal | None] = mapped_column(Enum(PrimaryGoal))


class HouseholdMember(Base):
    __tablename__ = "household_members"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    relationship: Mapped[Relationship] = mapped_column(Enum(Relationship), nullable=False)
    relationship_other_label: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
