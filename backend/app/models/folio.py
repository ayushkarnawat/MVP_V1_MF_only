import uuid

from sqlalchemy import Boolean, ForeignKey, JSON, String, UniqueConstraint, Uuid
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import PlanType, enum_column


class Folio(Base):
    __tablename__ = "folios"
    __table_args__ = (
        UniqueConstraint("household_member_id", "scheme_id", "folio_number", name="uq_folio_member_scheme_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    household_member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("household_members.id"), nullable=False)
    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), nullable=False)
    folio_number: Mapped[str] = mapped_column(String, nullable=False)
    arn_code: Mapped[str | None] = mapped_column(String)
    plan_type: Mapped[PlanType] = mapped_column(enum_column(PlanType), nullable=False, default=PlanType.UNCLASSIFIED)
    has_coverage_gap: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    coverage_gap_details: Mapped[dict | None] = mapped_column(JSON().with_variant(postgresql.JSONB(), "postgresql"))

