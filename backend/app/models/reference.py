"""Reference-data tables — no household/user FK, shared platform-wide.

Per Database-Schema-Unifolio.md Design Principle 1.
"""
import uuid
from datetime import date as date_, datetime, timezone
from decimal import Decimal

from sqlalchemy import Date, UniqueConstraint, CheckConstraint, Boolean, Index, true, DateTime, ForeignKey, Integer, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ArnStatus, BenchmarkIndex, BenchmarkReturnType, PlanNameVariant, SchemeSource, SchemePlanType, enum_column


class Scheme(Base):
    __tablename__ = "schemes"
    __table_args__ = (Index("ix_schemes_amc_base", "amc_name", "base_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    amfi_code: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    isin: Mapped[str | None] = mapped_column(String, index=True)
    isin_reinvest: Mapped[str | None] = mapped_column(String, index=True)
    base_name: Mapped[str | None] = mapped_column(String)
    name: Mapped[str] = mapped_column(String, nullable=False)
    amc_name: Mapped[str] = mapped_column(String, nullable=False)
    sebi_category: Mapped[str] = mapped_column(String, nullable=False)
    plan_name_variant: Mapped[PlanNameVariant | None] = mapped_column(enum_column(PlanNameVariant))
    plan_type: Mapped[SchemePlanType | None] = mapped_column(enum_column(SchemePlanType))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    source: Mapped[SchemeSource] = mapped_column(enum_column(SchemeSource), nullable=False,
                                               default=SchemeSource.AMFI, server_default="amfi")

    # SEBI scheme code of this fund's row in AMFI's TER feed (NSDLSchemeCode).
    # Set once by an exact name match ("exact_name") or by hand ("manual");
    # every later month's TER joins by it (decided 8 Oct).
    ter_scheme_code: Mapped[str | None] = mapped_column(String, index=True)
    ter_link_source: Mapped[str | None] = mapped_column(String)
    ter_linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NavHistory(Base):
    __tablename__ = "nav_history"

    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    date: Mapped[date_] = mapped_column(primary_key=True)
    nav: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)


class SchemeTer(Base):
    __tablename__ = "scheme_ter"

    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    reference_period: Mapped[date_] = mapped_column(primary_key=True)
    # NULL means "checked this scheme against this period's AMFI feed, found
    # no usable TER" -- distinct from no row at all ("never checked"). See
    # amfi_ter_client.py's `_mark_checked_no_match` for why this distinction
    # exists (avoids re-triggering a full AMFI rescan forever for a scheme
    # that will never match, e.g. a matured FMP no longer in AMFI's feed).
    ter_value: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)


class SchemeAaum(Base):
    __tablename__ = "scheme_aaum"

    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    reference_period: Mapped[date_] = mapped_column(primary_key=True)
    aaum_value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)


class BenchmarkIndexHistory(Base):
    __tablename__ = "benchmark_index_history"

    index_name: Mapped[BenchmarkIndex] = mapped_column(enum_column(BenchmarkIndex), primary_key=True)
    date: Mapped[date_] = mapped_column(primary_key=True)
    # Python default too, not just server_default: existing code and tests create
    # rows without return_type (test_nse_indices_client.py), and an ORM insert of
    # a primary-key column needs the value up front.
    return_type: Mapped[BenchmarkReturnType] = mapped_column(
        enum_column(BenchmarkReturnType), primary_key=True,
        default=BenchmarkReturnType.PRICE, server_default="price",
    )
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)


class ArnDirectory(Base):
    __tablename__ = "arn_directory"

    arn_code: Mapped[str] = mapped_column(String, primary_key=True)
    distributor_name: Mapped[str | None] = mapped_column(String)
    status: Mapped[ArnStatus] = mapped_column(enum_column(ArnStatus), nullable=False, default=ArnStatus.UNRESOLVED)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FundScore(Base):
    __tablename__ = "fund_scores"

    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    risk_adjusted_tier: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_adjustment: Mapped[Decimal] = mapped_column(Numeric(3, 2), nullable=False)
    final_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)


class SchemeRanking(Base):
    __tablename__ = "scheme_rankings"

    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    composite_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    category_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category_size: Mapped[int] = mapped_column(Integer, nullable=False)
    percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    return_1y: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    return_3y: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    return_5y: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    category_relative: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    downside_deviation: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    ter_value: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    return_3y_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    return_5y_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    category_relative_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    volatility_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    ter_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)


class RankingWeight(Base):
    __tablename__ = "ranking_weights"
    __table_args__ = (CheckConstraint("id = true", name="ck_ranking_weights_singleton"),)

    id: Mapped[bool] = mapped_column(Boolean, primary_key=True, default=True)
    weight_return_3y: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.25"))
    weight_return_5y: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.25"))
    weight_category_relative: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.20"))
    weight_low_volatility: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.15"))
    weight_low_ter: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.15"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class SchemeFundManager(Base):
    __tablename__ = "scheme_fund_managers"
    __table_args__ = (
        UniqueConstraint(
            "scheme_id", "manager_name", "reference_period",
            name="uq_scheme_fund_managers_scheme_manager_period",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), nullable=False, index=True)
    manager_name: Mapped[str] = mapped_column(String, nullable=False)
    # Verbatim source label (e.g. "Assistant Fund Manager") or NULL when the
    # source doesn't label one name as more senior than another (ABSL: every
    # name is unlabeled). Never fabricated as "Primary Manager" -- see
    # Review Focus #5 and the frontend spec's explicit "never a fabricated
    # label" rule.
    role: Mapped[str | None] = mapped_column(String, nullable=True)
    # 0 = first-listed/primary in the source's own order; used for stable
    # ordering only, never displayed as a rank.
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    managing_since_raw: Mapped[str | None] = mapped_column(String, nullable=True)
    managing_since: Mapped[date_ | None] = mapped_column(Date, nullable=True)
    reference_period: Mapped[date_] = mapped_column(nullable=False)
    # "ISIN" | "EXACT" | "FUZZY" | "MANUAL" -- plain String + module constants
    # (amfi_factsheet_client.py), mirroring ter_link_source's convention,
    # not a DB enum.
    match_method: Mapped[str] = mapped_column(String, nullable=False)
    match_confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
