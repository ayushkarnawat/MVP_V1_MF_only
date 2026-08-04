"""SQLAlchemy ORM models — Postgres-portable Numeric columns."""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class MatchStatus(str, enum.Enum):
    CONFIRMED = "confirmed"
    PENDING = "pending"


class ImportStatus(str, enum.Enum):
    PREVIEW = "preview"
    COMPLETED = "completed"
    FAILED = "failed"


class TxnType(str, enum.Enum):
    PURCHASE = "PURCHASE"
    PURCHASE_SIP = "PURCHASE_SIP"
    REDEMPTION = "REDEMPTION"
    SWITCH_IN = "SWITCH_IN"
    SWITCH_OUT = "SWITCH_OUT"
    DIVIDEND_PAYOUT = "DIVIDEND_PAYOUT"
    DIVIDEND_REINVEST = "DIVIDEND_REINVEST"
    SEGREGATION = "SEGREGATION"
    STAMP_DUTY = "STAMP_DUTY"
    STT = "STT"
    MISC = "MISC"


class Investor(Base):
    __tablename__ = "investors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    pan_masked: Mapped[str | None] = mapped_column(String(20))


class Folio(Base):
    __tablename__ = "folios"
    __table_args__ = (UniqueConstraint("folio_number", "amc", name="uq_folio_amc"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    folio_number: Mapped[str] = mapped_column(String(64), nullable=False)
    amc: Mapped[str] = mapped_column(String(255), nullable=False)
    pan_masked: Mapped[str | None] = mapped_column(String(20))

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="folio")


class Scheme(Base):
    __tablename__ = "schemes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    isin: Mapped[str | None] = mapped_column(String(20))
    amfi_code: Mapped[str | None] = mapped_column(String(16))
    category: Mapped[str | None] = mapped_column(String(255))
    match_confidence: Mapped[float | None] = mapped_column(Numeric(5, 4))
    match_status: Mapped[MatchStatus] = mapped_column(
        Enum(MatchStatus), default=MatchStatus.PENDING
    )

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="scheme")


class ImportRecord(Base):
    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    filename: Mapped[str] = mapped_column(String(512))
    imported_at: Mapped[datetime | None] = mapped_column(DateTime)
    schemes_found: Mapped[int] = mapped_column(Integer, default=0)
    txns_added: Mapped[int] = mapped_column(Integer, default=0)
    txns_skipped: Mapped[int] = mapped_column(Integer, default=0)
    raw_json: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ImportStatus] = mapped_column(Enum(ImportStatus), default=ImportStatus.PREVIEW)


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (Index("ix_transactions_dedupe", "dedupe_hash", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scheme_id: Mapped[int] = mapped_column(ForeignKey("schemes.id"), nullable=False)
    folio_id: Mapped[int] = mapped_column(ForeignKey("folios.id"), nullable=False)
    import_id: Mapped[int | None] = mapped_column(ForeignKey("imports.id"))
    txn_date: Mapped[date] = mapped_column(Date, nullable=False)
    txn_type: Mapped[TxnType] = mapped_column(Enum(TxnType), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    units: Mapped[float | None] = mapped_column(Numeric(18, 3))
    nav: Mapped[float | None] = mapped_column(Numeric(18, 4))
    dedupe_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    scheme: Mapped["Scheme"] = relationship(back_populates="transactions")
    folio: Mapped["Folio"] = relationship(back_populates="transactions")
