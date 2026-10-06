"""Every import that contained a transaction row (#5).

transactions.import_id keeps the first writer (NOT NULL); this table records
all of them, so deleting one import removes only rows no other import holds.
The FK is composite because transactions is RANGE-partitioned on Postgres
with primary key (id, date).
"""
import uuid
from datetime import date as date_

from sqlalchemy import ForeignKey, ForeignKeyConstraint, Index, PrimaryKeyConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TransactionImport(Base):
    __tablename__ = "transaction_imports"
    __table_args__ = (
        PrimaryKeyConstraint("transaction_id", "import_id"),
        ForeignKeyConstraint(
            ["transaction_id", "transaction_date"], ["transactions.id", "transactions.date"], ondelete="CASCADE",
        ),
        Index("ix_transaction_imports_import_id", "import_id"),
    )

    transaction_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    transaction_date: Mapped[date_] = mapped_column(nullable=False)
    import_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("imports.id", ondelete="CASCADE"), nullable=False)
