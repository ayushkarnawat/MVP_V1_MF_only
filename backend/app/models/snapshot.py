import uuid
from datetime import date as date_, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, JSON, false, DateTime, ForeignKey, Numeric, Uuid
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    household_member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("household_members.id"), primary_key=True)
    snapshot_month: Mapped[date_] = mapped_column(primary_key=True)
    total_value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    invested_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    is_partial: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    missing_scheme_ids: Mapped[list[str] | None] = mapped_column(JSON().with_variant(postgresql.JSONB(), "postgresql"))
    data_version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
