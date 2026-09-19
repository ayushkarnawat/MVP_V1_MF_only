"""Local-disk CAS file retention (30-day window) for dispute/re-parse support.

ADR-004 reopened 2026-09-18: the source CAS PDF is now retained for a bounded
window instead of always being discarded immediately after parsing. This
module is deliberately swappable — LocalFileStorage is the dev/demo backend;
production maps this same protocol onto S3 + a Lifecycle rule (see design
spec's "Production mapping") without changing any caller. This is separate
from, and does not change, the existing temp-file-delete-immediately-after-
parse behavior in parser.py (that temp file only ever exists to hand
casparser a filesystem path) — this module's copy is the new, deliberate
30-day retention.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Protocol

from sqlalchemy.orm import Session

from app.config import settings
from app.models.imports import Import

CAS_FILE_RETENTION_DAYS = 30


class FileStorage(Protocol):
    def save(self, key: str, data: bytes) -> str: ...
    def read(self, reference: str) -> bytes: ...
    def delete(self, reference: str) -> None: ...


class LocalFileStorage:
    def __init__(self, base_dir: str | None = None):
        self._base_dir = Path(base_dir if base_dir is not None else settings.cas_file_storage_dir)

    def save(self, key: str, data: bytes) -> str:
        path = self._base_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    def read(self, reference: str) -> bytes:
        return (self._base_dir / reference).read_bytes()

    def delete(self, reference: str) -> None:
        (self._base_dir / reference).unlink(missing_ok=True)


default_file_storage = LocalFileStorage()


def storage_key_for_import(user_id: uuid.UUID, import_id: uuid.UUID) -> str:
    return f"{user_id}/{import_id}.pdf"


def store_cas_file(
    import_rec: Import,
    user_id: uuid.UUID,
    pdf_bytes: bytes,
    storage: FileStorage = default_file_storage,
) -> None:
    key = storage_key_for_import(user_id, import_rec.id)
    import_rec.file_reference = storage.save(key, pdf_bytes)
    import_rec.file_expires_at = datetime.now(timezone.utc) + timedelta(days=CAS_FILE_RETENTION_DAYS)


def expire_stored_files(db: Session, storage: FileStorage = default_file_storage) -> int:
    now = datetime.now(timezone.utc)
    expired = (
        db.query(Import)
        .filter(Import.file_reference.isnot(None), Import.file_expires_at < now)
        .all()
    )
    for import_rec in expired:
        storage.delete(import_rec.file_reference)
        import_rec.file_reference = None
        import_rec.file_expires_at = None
    if expired:
        db.commit()
    return len(expired)
