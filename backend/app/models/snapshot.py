import uuid
from datetime import date as date_, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    household_member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("household_members.id"), primary_key=True)
    snapshot_month: Mapped[date_] = mapped_column(primary_key=True)
    total_value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
