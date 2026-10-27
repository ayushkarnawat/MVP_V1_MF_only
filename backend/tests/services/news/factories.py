"""T5: plain factories for score.py tests -- no DB, just the frozen
dataclasses `select_items`/`build_watchlist` consume."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from app.services.news.match import WatchEntity, WatchList
from app.services.news.normalise import EntityTag
from app.services.news.score import NewsRow

NOW = datetime(2026, 10, 23, 13, 0, 0)


def row(
    *,
    id: str | None = None,
    title: str = "A headline",
    tags: tuple[EntityTag, ...] = (),
    tier: int | None = None,
    published_at: datetime = NOW,
    source: str = "moneycontrol.com",
    url: str | None = None,
) -> NewsRow:
    row_id = id or str(uuid.uuid4())
    return NewsRow(
        id=row_id,
        url=url or f"https://{source}/{row_id}",
        title=title,
        source=source,
        published_at=published_at,
        tags=tags,
        tier=tier if tier is not None else (min((t.tier for t in tags), default=7)),
    )


def entity(
    kind: str = "stock",
    key: str = "INE000A01001",
    *,
    label: str = "A Stock",
    exposure_pct: Decimal | str | None = "5.00",
    chip: str = "lookthrough",
    funds: tuple[tuple[str, str], ...] = (),
) -> WatchEntity:
    pct = None if exposure_pct is None else Decimal(exposure_pct)
    return WatchEntity(kind=kind, key=key, label=label, exposure_pct=pct, chip=chip, funds=funds)


def watch(
    *,
    entities: tuple[WatchEntity, ...] = (),
    majority_class: str | None = None,
    coverage_pct: Decimal | str | None = None,
    holdings_as_of=None,
) -> WatchList:
    pct = None if coverage_pct is None else Decimal(coverage_pct)
    return WatchList(
        entities=entities, majority_class=majority_class, coverage_pct=pct, holdings_as_of=holdings_as_of,
    )
