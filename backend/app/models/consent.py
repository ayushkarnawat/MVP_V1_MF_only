import uuid
from datetime import datetime

from sqlalchemy import DDL, DateTime, Index, String, Text, Uuid, event
from sqlalchemy.orm import Mapped, mapped_column

from app.db import consent_trigger_sql
from app.db.base import Base
from app.models.enums import ConsentAction, ConsentDocumentType, ConsentPurpose, enum_column


class ConsentRecord(Base):
    """One append-only row per (document, purpose) a user gave or withdrew
    consent for. Database triggers reject every UPDATE and DELETE.

    Deliberately NO foreign keys (not to ``users`` nor ``imports``): a user
    hard-delete must not try to UPDATE/SET NULL or cascade-DELETE these rows
    (the triggers would abort the whole deletion), and per decision Q6 consent
    rows are kept indefinitely for now -- there is no retention job. So
    ``user_id`` / ``related_import_id`` may point at rows that no longer exist.

    Raw IPs are never stored: only ``ip_truncated`` (IPv4 /24, IPv6 /48) and
    ``ip_hmac`` (HMAC-SHA256 under a key derived from PAN_LOOKUP_PEPPER).
    """

    __tablename__ = "consent_records"
    __table_args__ = (
        Index("ix_consent_records_user_purpose_recorded", "user_id", "purpose_code", "recorded_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    action: Mapped[ConsentAction] = mapped_column(enum_column(ConsentAction), nullable=False)
    purpose_code: Mapped[ConsentPurpose] = mapped_column(enum_column(ConsentPurpose), nullable=False)
    document_type: Mapped[ConsentDocumentType] = mapped_column(
        enum_column(ConsentDocumentType), nullable=False
    )
    document_version: Mapped[str] = mapped_column(String, nullable=False)
    document_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    surface: Mapped[str] = mapped_column(String, nullable=False)
    ip_truncated: Mapped[str | None] = mapped_column(String)
    ip_hmac: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(Text)
    device_id: Mapped[str | None] = mapped_column(String)
    related_import_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    related_file_sha256: Mapped[str | None] = mapped_column(String(64))


# Attached to the table (not only migration 0022) so Base.metadata.create_all
# -- the test fixtures and functional_postgres -- also gets the append-only
# backstop. Same wiring as HouseholdMember's never-relock trigger.
event.listen(
    ConsentRecord.__table__,
    "after_create",
    DDL(consent_trigger_sql.SQLITE_APPEND_ONLY_UPDATE).execute_if(dialect="sqlite"),
)
event.listen(
    ConsentRecord.__table__,
    "after_create",
    DDL(consent_trigger_sql.SQLITE_APPEND_ONLY_DELETE).execute_if(dialect="sqlite"),
)
event.listen(
    ConsentRecord.__table__,
    "after_create",
    DDL(consent_trigger_sql.POSTGRES_APPEND_ONLY_FN).execute_if(dialect="postgresql"),
)
event.listen(
    ConsentRecord.__table__,
    "after_create",
    DDL(consent_trigger_sql.POSTGRES_APPEND_ONLY_TRIGGER).execute_if(dialect="postgresql"),
)
