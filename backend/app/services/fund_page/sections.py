from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, NamedTuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.analytics import AnalyticsSection
from app.models.enums import ImportStatus
from app.models.folio import Folio
from app.models.imports import Import
from app.models.transaction import Transaction
from app.services.dashboard.xirr import _FUND_RELEVANT_TYPES


# D4: a combined-scope stored section wraps its per-fund payload under one of
# these keys; a member-scope row is already bare. `score`/`overlap` carry no
# extra wrapper today but are listed so a future wrapper change here is a
# one-line fix instead of a new reader.
_COMBINED_INNER_KEY = {
    "allocation": "allocation",
    "benchmark_funds": "comparison",
    "score": "score",
    "overlap": "overlap",
}


class StoredSection(NamedTuple):
    payload: Any
    computed_at: datetime


def stored_section(
    db: Session, user_id: uuid.UUID, scope_key: str, name: str, member_ids: list[uuid.UUID],
) -> StoredSection | None:
    """D4: the same freshness rule as `home/stored.py::load_fresh_sections`
    (not `failed_at`, `computed_at` at or after the scope's latest CONFIRMED
    import), reimplemented locally -- `home/stored.py` whitelists five section
    names and raises for the ones this page needs (`benchmark_funds`,
    `overlap`, `allocation`), so it cannot be reused as-is."""
    row = (
        db.query(AnalyticsSection)
        .filter_by(user_id=user_id, scope_key=scope_key, section=name)
        .first()
    )
    if row is None or row.failed_at is not None or row.payload is None:
        return None
    latest = (
        db.query(func.max(func.coalesce(Import.confirmed_at, Import.uploaded_at)))
        .filter(Import.household_member_id.in_(member_ids), Import.status == ImportStatus.CONFIRMED)
        .scalar()
    )
    if latest is not None and row.computed_at < latest:
        return None
    payload = row.payload
    if scope_key == "combined":
        inner_key = _COMBINED_INNER_KEY.get(name)
        if inner_key is not None:
            # A payload without the wrapper is unusable: treat as no stored section.
            payload = payload.get(inner_key) if isinstance(payload, dict) else None
            if payload is None:
                return None
    return StoredSection(payload, row.computed_at)


def scheme_flows(db: Session, member_ids: list[uuid.UUID], scheme_id: uuid.UUID) -> list[Transaction]:
    return (
        db.query(Transaction)
        .join(Folio, Folio.id == Transaction.folio_id)
        .filter(
            Folio.household_member_id.in_(member_ids),
            Folio.scheme_id == scheme_id,
            Transaction.type.in_(_FUND_RELEVANT_TYPES),
        )
        .order_by(Transaction.date, Transaction.id)
        .all()
    )
