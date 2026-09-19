import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import InvestorType, PrimaryGoal, Relationship, enum_column


class User(Base):
    __tablename__ = "users"
    __table_args__ = (Index("ix_users_deletion_scheduled_at", "deletion_scheduled_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    phone_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    onboarding_step: Mapped[str | None] = mapped_column(String)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    investor_type: Mapped[InvestorType | None] = mapped_column(enum_column(InvestorType))
    primary_goal: Mapped[PrimaryGoal | None] = mapped_column(enum_column(PrimaryGoal))
    pending_deletion: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deletion_scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HouseholdMember(Base):
    __tablename__ = "household_members"
    # unique=True: enforces the "one PAN, one household member, system-wide"
    # invariant at the DB level, not just in application code, closing a
    # TOCTOU race where two concurrent imports of the same PAN under
    # different accounts could both see "no match" and both backfill
    # (Fix 6, 2026-09-18 whole-branch review). Unique + nullable is safe on
    # both SQLite and Postgres -- both allow multiple NULLs in a unique
    # index, so members with no PAN backfilled yet don't collide with each
    # other; only non-null hashes are constrained to be distinct, which is
    # exactly the semantic this invariant needs.
    __table_args__ = (
        Index("ix_household_members_pan_lookup_hash", "pan_lookup_hash", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    relationship: Mapped[Relationship] = mapped_column(enum_column(Relationship), nullable=False)
    relationship_other_label: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    pan_encrypted: Mapped[str | None] = mapped_column(String)
    pan_lookup_hash: Mapped[str | None] = mapped_column(String)
