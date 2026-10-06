import uuid
from datetime import date as date_
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, PrimaryKeyConstraint, SmallInteger, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import CostSource, TransactionOrigin, TransactionType, enum_column


class Transaction(Base):
    """Partitioned by RANGE(date), yearly, on Postgres — see Task 7's migration.

    The ORM model is dialect-agnostic; only the physical CREATE TABLE differs.
    """
    __tablename__ = "transactions"
    __table_args__ = (
        PrimaryKeyConstraint("id", "date"),
        # Occurrence separates genuine identical rows; keep in lockstep with
        # migration 0026 and confirm_people's balance/occurrence matcher.
        UniqueConstraint(
            "folio_id", "date", "amount", "units", "type", "occurrence",
            name="uq_transactions_folio_date_amount_units_type_occ",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, default=uuid.uuid4)
    folio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("folios.id"), nullable=False)
    import_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("imports.id"), nullable=False)
    type: Mapped[TransactionType] = mapped_column(enum_column(TransactionType), nullable=False)
    date: Mapped[date_] = mapped_column(nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    units: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    nav: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    raw_description: Mapped[str | None] = mapped_column(String)
    # The earliest-statement rule replaces only CAS openings, never manual lots.
    origin: Mapped[TransactionOrigin] = mapped_column(
        enum_column(TransactionOrigin), nullable=False, default=TransactionOrigin.CAS_ROW,
        server_default=TransactionOrigin.CAS_ROW.value,
    )
    cost_source: Mapped[CostSource | None] = mapped_column(enum_column(CostSource))

    balance_units: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    occurrence: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1, server_default="1")
