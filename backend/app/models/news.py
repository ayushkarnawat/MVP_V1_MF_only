"""GDELT news feed items (Home news section) — platform-wide, no household/user FK."""
import uuid
from datetime import datetime

from sqlalchemy.dialects import postgresql
from sqlalchemy import CheckConstraint, DateTime, Index, Integer, JSON, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NewsItem(Base):
    __tablename__ = "news_items"
    __table_args__ = (
        UniqueConstraint("url", name="uq_news_items_url"),
        CheckConstraint("tier BETWEEN 1 AND 7", name="ck_news_items_tier_range"),
        Index("ix_news_items_published_at", "published_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="en", server_default="en")
    # Tag dicts, e.g. {"kind": "stock", "key": "<isin>", "label": "...", "tier": 1}.
    entity_tags: Mapped[list[dict]] = mapped_column(
        JSON().with_variant(postgresql.JSONB(astext_type=String()), "postgresql"),
        nullable=False, default=list, server_default="[]",
    )
    tier: Mapped[int] = mapped_column(Integer, nullable=False)


class JobRun(Base):
    """Last successful run of a batch job, keyed by job name (e.g. "refresh_news").
    Platform-wide, no user FK. Written only on success, so a failed run leaves the
    previous value in place."""

    __tablename__ = "job_runs"

    job_name: Mapped[str] = mapped_column(String(64), primary_key=True)
    last_success_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
