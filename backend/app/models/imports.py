import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, Uuid
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ImportErrorType, ImportStatus, SourceCasType, enum_column


class Import(Base):
    __tablename__ = "imports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    household_member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("household_members.id"), nullable=False)
    status: Mapped[ImportStatus] = mapped_column(enum_column(ImportStatus), nullable=False)
    source_cas_type: Mapped[SourceCasType | None] = mapped_column(enum_column(SourceCasType))
    raw_parser_output: Mapped[dict | None] = mapped_column(JSON().with_variant(postgresql.JSONB(), "postgresql"))
    error_type: Mapped[ImportErrorType | None] = mapped_column(enum_column(ImportErrorType))
    new_transactions_count: Mapped[int | None] = mapped_column(Integer)
    duplicate_transactions_count: Mapped[int | None] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
