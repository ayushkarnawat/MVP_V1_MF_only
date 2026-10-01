import uuid
from datetime import datetime, timezone

from sqlalchemy import DDL, JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Uuid, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import member_trigger_sql
from app.db.base import Base
from app.models.enums import (
    InvestorType,
    MemberLockReason,
    MemberNameSource,
    MemberOrigin,
    MemberPanSource,
    PrimaryGoal,
    Relationship,
    enum_column,
)


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
    # Staging-QA fix 2 (2026-09-30), expand phase: the list is the source of
    # truth; primary_goal is dual-written (first item) until migration 0021
    # drops it. Always ASSIGN a new list -- in-place .append() isn't tracked.
    # none_as_null: None must be SQL NULL -- a JSON null fails Postgres's
    # ck_users_primary_goals_allowed.
    primary_goals: Mapped[list[str] | None] = mapped_column(
        JSON(none_as_null=True).with_variant(JSONB(none_as_null=True), "postgresql")
    )
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
        # CAS member detection (0018). Locked = details_completed_at IS NULL.
        CheckConstraint(
            "relationship IS NOT NULL OR details_completed_at IS NULL",
            name="ck_member_relationship_when_complete",
        ),
        CheckConstraint(
            "relationship IS NULL OR relationship <> 'other' OR relationship_other_label IS NOT NULL",
            name="ck_member_other_label",
        ),
        CheckConstraint(
            "(lock_reason IS NULL AND details_completed_at IS NOT NULL)"
            " OR (lock_reason IS NOT NULL AND details_completed_at IS NULL)",
            name="ck_member_lock_reason",
        ),
        CheckConstraint(
            "(detected_pan_encrypted IS NULL) = (detected_pan_hash IS NULL)",
            name="ck_member_detected_pan_pair",
        ),
        # Non-unique by spec: the same detected PAN can sit on more than one
        # locked row of one user until those are merged.
        Index("ix_member_user_detected_pan_hash", "user_id", "detected_pan_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Nullable only while locked (ck_member_relationship_when_complete).
    relationship: Mapped[Relationship | None] = mapped_column(enum_column(Relationship))
    relationship_other_label: Mapped[str | None] = mapped_column(String)
    # Contact details only: unverified (no OTP) and not unique (decision Q8).
    phone_number: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    pan_encrypted: Mapped[str | None] = mapped_column(String)
    pan_lookup_hash: Mapped[str | None] = mapped_column(String)
    # Non-null = the PAN above is a *pending* upload-time claim that becomes
    # permanent on Confirm Import (set back to NULL) or is released on
    # discard/expiry. NULL with a PAN set = permanent. See
    # app/services/import_/pan_claims.py.
    pan_pending_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    origin: Mapped[MemberOrigin] = mapped_column(
        enum_column(MemberOrigin), nullable=False,
        default=MemberOrigin.MANUAL, server_default=MemberOrigin.MANUAL.value,
    )
    name_source: Mapped[MemberNameSource] = mapped_column(
        enum_column(MemberNameSource), nullable=False,
        default=MemberNameSource.USER_ENTERED, server_default=MemberNameSource.USER_ENTERED.value,
    )
    name_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # NULL = locked. See __init__ for how it defaults.
    details_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lock_reason: Mapped[MemberLockReason | None] = mapped_column(enum_column(MemberLockReason))
    # use_alter + an explicit name (F4): imports.household_member_id already
    # points the other way, and without it SQLAlchemy can't order the
    # CREATE/DROP of the two tables on Postgres.
    detected_from_import_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "imports.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_household_members_detected_from_import_id",
        )
    )
    pan_source: Mapped[MemberPanSource | None] = mapped_column(enum_column(MemberPanSource))
    pan_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The PAN a detected person was found with (NULL for name-only people),
    # kept apart from pan_encrypted/pan_lookup_hash so a locked person never
    # holds the system-wide unique PAN claim.
    detected_pan_encrypted: Mapped[str | None] = mapped_column(String)
    detected_pan_hash: Mapped[str | None] = mapped_column(String)

    def __init__(self, **kwargs):
        # F1 ruling: omitting details_completed_at means "created unlocked"
        # (the ~44 pre-existing constructor sites); an explicit None means
        # "locked" and must stay None. A column default can't express this --
        # SQLAlchemy applies it even when None is passed explicitly.
        if "details_completed_at" not in kwargs:
            kwargs["details_completed_at"] = datetime.now(timezone.utc)
        super().__init__(**kwargs)

    @property
    def is_locked(self) -> bool:
        return self.details_completed_at is None


# Attached to the table (not only migration 0018) so Base.metadata.create_all
# -- the test fixtures and functional_postgres -- also gets I15's backstop.
event.listen(
    HouseholdMember.__table__,
    "after_create",
    DDL(member_trigger_sql.SQLITE_NEVER_RELOCK).execute_if(dialect="sqlite"),
)
event.listen(
    HouseholdMember.__table__,
    "after_create",
    DDL(member_trigger_sql.POSTGRES_NEVER_RELOCK_FN).execute_if(dialect="postgresql"),
)
event.listen(
    HouseholdMember.__table__,
    "after_create",
    DDL(member_trigger_sql.POSTGRES_NEVER_RELOCK_TRIGGER).execute_if(dialect="postgresql"),
)
