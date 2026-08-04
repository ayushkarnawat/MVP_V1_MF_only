"""Reference-data tables — no household/user FK, shared platform-wide.

Per Database-Schema-Unifolio.md Design Principle 1.
"""
import uuid
from datetime import date as date_, datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ArnStatus, BenchmarkIndex, PlanNameVariant


class Scheme(Base):
    __tablename__ = "schemes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    amfi_code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    isin: Mapped[str | None] = mapped_column(String)
    name: Mapped[str] = mapped_column(String, nullable=False)
    amc_name: Mapped[str] = mapped_column(String, nullable=False)
    sebi_category: Mapped[str] = mapped_column(String, nullable=False)
    plan_name_variant: Mapped[PlanNameVariant | None] = mapped_column(Enum(PlanNameVariant))


class NavHistory(Base):
    __tablename__ = "nav_history"

    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    date: Mapped[date_] = mapped_column(primary_key=True)
    nav: Mapped[Numeric] = mapped_column(Numeric(10, 4), nullable=False)


class SchemeTer(Base):
    __tablename__ = "scheme_ter"

    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    reference_period: Mapped[date_] = mapped_column(primary_key=True)
    ter_value: Mapped[Numeric] = mapped_column(Numeric(5, 2), nullable=False)


class SchemeAaum(Base):
    __tablename__ = "scheme_aaum"

    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    reference_period: Mapped[date_] = mapped_column(primary_key=True)
    aaum_value: Mapped[Numeric] = mapped_column(Numeric(18, 2), nullable=False)


class BenchmarkIndexHistory(Base):
    __tablename__ = "benchmark_index_history"

    index_name: Mapped[BenchmarkIndex] = mapped_column(Enum(BenchmarkIndex), primary_key=True)
    date: Mapped[date_] = mapped_column(primary_key=True)
    value: Mapped[Numeric] = mapped_column(Numeric(12, 2), nullable=False)


class ArnDirectory(Base):
    __tablename__ = "arn_directory"

    arn_code: Mapped[str] = mapped_column(String, primary_key=True)
    distributor_name: Mapped[str | None] = mapped_column(String)
    status: Mapped[ArnStatus] = mapped_column(Enum(ArnStatus), nullable=False, default=ArnStatus.UNRESOLVED)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FundScore(Base):
    __tablename__ = "fund_scores"

    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    risk_adjusted_tier: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_adjustment: Mapped[Numeric] = mapped_column(Numeric(3, 2), nullable=False)
    final_score: Mapped[Numeric] = mapped_column(Numeric(5, 2), nullable=False)
