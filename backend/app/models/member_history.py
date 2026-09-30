"""Audit tables for CAS member detection (migration 0018): renames of a
household member (U1, U2, M8, user edits) and merges of two members (M11)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import NameChangeReason, enum_column


class HouseholdMemberNameChange(Base):
    __tablename__ = "household_member_name_changes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    household_member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False
    )
    old_name: Mapped[str] = mapped_column(String, nullable=False)
    new_name: Mapped[str] = mapped_column(String, nullable=False)
    reason: Mapped[NameChangeReason] = mapped_column(enum_column(NameChangeReason), nullable=False)
    import_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("imports.id", ondelete="SET NULL"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class HouseholdMemberMerge(Base):
    __tablename__ = "household_member_merges"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    # No FKs on the member ids (spec ER diagram): the removed member is deleted
    # in the same transaction that writes this row, and the audit row must
    # outlive a later delete of the kept member too.
    kept_member_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    removed_member_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    removed_member_name: Mapped[str] = mapped_column(String, nullable=False)
    folios_moved: Mapped[int] = mapped_column(Integer, nullable=False)
    transactions_dropped: Mapped[int] = mapped_column(Integer, nullable=False)
    merged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
