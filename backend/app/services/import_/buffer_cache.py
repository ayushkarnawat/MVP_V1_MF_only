"""Ephemeral in-memory cache for raw encrypted PDF bytes on password retry per FR-3.

Guarantees:
- Buffers are stored only when a CAS parsing attempt fails due to wrong_password.
- Buffers expire after a short TTL (15 minutes).
- Buffers are permanently removed/wiped immediately upon successful unlock or explicit clearance.
- Never persists to disk or DB (CLAUDE.md non-negotiable / ADR-004).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

BUFFER_TTL_MINUTES = 15

_pdf_buffers: dict[str, dict[str, Any]] = {}


def _sweep_expired_buffers() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=BUFFER_TTL_MINUTES)
    expired = [key for key, val in _pdf_buffers.items() if val["created_at"] < cutoff]
    for key in expired:
        del _pdf_buffers[key]


def store_pdf_buffer(import_id: str, pdf_bytes: bytes) -> None:
    _sweep_expired_buffers()
    _pdf_buffers[str(import_id)] = {
        "created_at": datetime.now(timezone.utc),
        "data": pdf_bytes,
    }


def get_pdf_buffer(import_id: str) -> bytes | None:
    _sweep_expired_buffers()
    entry = _pdf_buffers.get(str(import_id))
    if not entry:
        return None
    return entry["data"]


def remove_pdf_buffer(import_id: str) -> None:
    _pdf_buffers.pop(str(import_id), None)
