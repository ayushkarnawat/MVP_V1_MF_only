from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.analytics import AnalyticsSection
from app.models.enums import ImportStatus
from app.models.imports import Import


SECTION_WRAPPER_KEYS: Mapping[str, str] = {
    "asset_allocation": "asset_allocation",
    "score": "score",
    "category_ranking": "ranking",
    "stock_holdings": "stock_holdings",
    "cap_allocation": "cap_allocation",
}


@dataclass(frozen=True)
class StoredSection:
    section: str
    payload: Mapping[str, Any]
    computed_at: datetime


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def unwrap_section(
    section: str, payload: Mapping[str, Any]
) -> Mapping[str, Any] | None:
    try:
        wrapper_key = SECTION_WRAPPER_KEYS[section]
    except KeyError as exc:
        raise ValueError(f"Unknown stored section: {section}") from exc
    body = payload[wrapper_key] if wrapper_key in payload else payload
    return body if isinstance(body, Mapping) else None


def scope_key_for(
    scope: Literal["aggregate", "member"],
    household_member_ids: Sequence[uuid.UUID],
) -> str:
    return "combined" if scope == "aggregate" else str(household_member_ids[0])


def load_fresh_sections(
    db: Session,
    user_id: uuid.UUID,
    *,
    scope_key: str,
    sections: Sequence[str],
    household_member_ids: Sequence[uuid.UUID],
) -> dict[str, StoredSection]:
    for section in sections:
        if section not in SECTION_WRAPPER_KEYS:
            raise ValueError(f"Unknown stored section: {section}")
    rows = (
        db.query(AnalyticsSection)
        .filter(
            AnalyticsSection.user_id == user_id,
            AnalyticsSection.scope_key == scope_key,
            AnalyticsSection.section.in_(sections),
        )
        .all()
    )
    if not rows:
        return {}

    latest_import = (
        db.query(func.max(func.coalesce(Import.confirmed_at, Import.uploaded_at)))
        .filter(
            Import.household_member_id.in_(household_member_ids),
            Import.status == ImportStatus.CONFIRMED,
        )
        .scalar()
    )
    latest = None if latest_import is None else _utc(latest_import)
    result = {}
    for row in rows:
        computed_at = _utc(row.computed_at)
        payload = unwrap_section(row.section, row.payload)
        if (
            row.failed_at is None
            and payload is not None
            and (latest is None or computed_at >= latest)
        ):
            result[row.section] = StoredSection(
                section=row.section,
                payload=payload,
                computed_at=computed_at,
            )
    return result
