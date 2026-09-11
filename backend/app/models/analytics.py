"""Precomputed per-scope, per-section Analytics results (see
Docs/superpowers/specs/2026-09-02-analytics-precompute-architecture-design.md).
Every GET /analytics/{scope} read is a plain row lookup here — never a live
call into allocation.py/ter.py/benchmark.py/category_ranking.py/scorer.py."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AnalyticsSection(Base):
    __tablename__ = "analytics_sections"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    # "combined" or a household_members.id rendered as str — deliberately
    # NOT the nullable household_member_id FK below: Postgres treats NULL as
    # distinct-from-every-other-NULL, so a nullable column can't anchor a
    # composite PK's uniqueness the way a literal "combined" string can.
    scope_key: Mapped[str] = mapped_column(String, primary_key=True)
    section: Mapped[str] = mapped_column(String, primary_key=True)
    # NULL for the "combined" scope; set for a member scope. Not part of the
    # PK — kept only so a future member-deletion feature has a column to
    # cascade against. No such feature exists yet (YAGNI: no cascade logic
    # is wired up here, there is nothing to cascade from).
    household_member_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("household_members.id"))
    payload: Mapped[dict] = mapped_column(JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Cleared (set back to NULL) on the next successful recompute of this
    # exact row. A row with no prior success is simply absent (see
    # recompute.py's _mark_section_failed) rather than present-with-NULL-
    # payload — the frontend's cold-start "no row yet" state covers that.
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AnalyticsRecomputeStatus(Base):
    """One row per user: is a recompute currently running for this
    household? A household-level fact, not per-section — matches the
    warm-once/fan-out design where "in progress" naturally applies to the
    whole recompute run, not any one of its 35 output rows."""

    __tablename__ = "analytics_recompute_status"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    generation: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
