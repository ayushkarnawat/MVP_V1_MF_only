import re
import uuid

from sqlalchemy import Boolean, ForeignKey, JSON, String, UniqueConstraint, Uuid
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import PlanType, enum_column


def normalise_folio_key(folio_number: str) -> str:
    """Same rule as people.folio_key: CAMS/KFintech print one folio with and
    without spaces around "/" (#4)."""
    return re.sub(r"\s+", "", folio_number)


def _default_folio_key(context) -> str:
    # Filled from folio_number when a caller doesn't pass folio_key, so no
    # code path can create a folio whose key disagrees with its number.
    return normalise_folio_key(context.get_current_parameters()["folio_number"])


class Folio(Base):
    __tablename__ = "folios"
    __table_args__ = (
        # #4: folios match on folio_key (whitespace-stripped folio number), so
        # "4400918 / 3" and "4400918/3" are one folio. Lockstep with 0027.
        UniqueConstraint("household_member_id", "scheme_id", "folio_key", name="uq_folio_member_scheme_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    household_member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("household_members.id"), nullable=False)
    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), nullable=False)
    folio_number: Mapped[str] = mapped_column(String, nullable=False)  # as first printed; display only
    folio_key: Mapped[str] = mapped_column(String, nullable=False, default=_default_folio_key)
    arn_code: Mapped[str | None] = mapped_column(String)
    plan_type: Mapped[PlanType] = mapped_column(enum_column(PlanType), nullable=False, default=PlanType.UNCLASSIFIED)
    has_coverage_gap: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    coverage_gap_details: Mapped[dict | None] = mapped_column(JSON().with_variant(postgresql.JSONB(), "postgresql"))

