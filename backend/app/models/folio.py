import uuid

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import PlanType


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
    plan_type: Mapped[PlanType] = mapped_column(Enum(PlanType), nullable=False, default=PlanType.UNCLASSIFIED)
