import uuid
from datetime import date as date_
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, PrimaryKeyConstraint, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import TransactionType, enum_column


class Transaction(Base):
    """Partitioned by RANGE(date), yearly, on Postgres — see Task 7's migration.

    The ORM model is dialect-agnostic; only the physical CREATE TABLE differs.
    """
    __tablename__ = "transactions"
    __table_args__ = (
        PrimaryKeyConstraint("id", "date"),
        # Must stay in lockstep with migration 0002 (NEW_CONSTRAINT_NAME) and
        # confirm_import's dedupe_key/filter_by — all three define the same
        # 5-column dedupe identity.
        UniqueConstraint(
            "folio_id", "date", "amount", "units", "type",
            name="uq_transactions_folio_date_amount_units_type",
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
