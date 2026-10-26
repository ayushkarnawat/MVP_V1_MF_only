"""T5: pick which news rows fill the Home feed's news slots (D5 ladder,
D6 majority override). Pure function, no DB -- `match.py` builds the
`WatchList` once per request; this module only ranks already-tagged rows
against it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Sequence

from app.services.news.match import WatchEntity, WatchList
from app.services.news.normalise import EntityTag

_SPECIFIC_WINDOW = timedelta(hours=24)
_GENERAL_WINDOW = timedelta(hours=72)
_GENERAL_TIER = 7


@dataclass(frozen=True)
class NewsRow:
    id: str
    url: str
    title: str
    source: str
    published_at: datetime
    tags: tuple[EntityTag, ...]
    tier: int


@dataclass(frozen=True)
class Selected:
    row: NewsRow
    entity: WatchEntity | None
    specific: bool


@dataclass(frozen=True)
class _Candidate:
    tier: int
    published_at: datetime
    exposure_pct: Decimal
    row_id: str
    row: NewsRow
    entity: WatchEntity | None
    specific: bool

    def sort_key(self) -> tuple:
        # tier asc, published_at desc, exposure_pct desc, id asc (R12)
        return (self.tier, -self.published_at.timestamp(), -self.exposure_pct, self.row_id)


def _watch_by_kind_key(watch: WatchList) -> dict[tuple[str, str], WatchEntity]:
    return {(entity.kind, entity.key): entity for entity in watch.entities}


def _candidates(rows: Sequence[NewsRow], watch: WatchList, now_utc: datetime) -> list[_Candidate]:
    by_entity = _watch_by_kind_key(watch)
    candidates: list[_Candidate] = []
    for row in rows:
        age = now_utc - row.published_at
        if age <= _SPECIFIC_WINDOW:
            for tag in row.tags:
                if tag.kind == "general":
                    continue
                entity = by_entity.get((tag.kind, tag.key))
                if entity is None:
                    continue
                candidates.append(_Candidate(
                    tier=tag.tier, published_at=row.published_at,
                    exposure_pct=entity.exposure_pct or Decimal("0"),
                    row_id=row.id, row=row, entity=entity, specific=True,
                ))
        if age <= _GENERAL_WINDOW:
            candidates.append(_Candidate(
                tier=_GENERAL_TIER, published_at=row.published_at,
                exposure_pct=Decimal("-1"),  # always last among same-tier ties
                row_id=row.id, row=row, entity=None, specific=False,
            ))
    return candidates


def _majority_entity(watch: WatchList) -> WatchEntity | None:
    if watch.majority_class == "gold":
        key = ("asset_class", "gold_silver")
    elif watch.majority_class == "debt":
        key = ("rates_macro", "rates")
    else:
        return None
    return _watch_by_kind_key(watch).get(key)


def select_items(
    rows: Sequence[NewsRow], watch: WatchList, now_utc: datetime, *, slots: int = 3
) -> list[Selected]:
    candidates = _candidates(rows, watch, now_utc)
    candidates.sort(key=lambda c: c.sort_key())

    used_rows: set[str] = set()
    used_entities: set[tuple[str, str]] = set()
    selected: list[Selected] = []

    override_entity = _majority_entity(watch)
    if override_entity is not None:
        override_candidates = [
            c for c in candidates
            if c.specific and c.entity is not None
            and c.entity.kind == override_entity.kind and c.entity.key == override_entity.key
        ]
        if override_candidates:
            override_candidates.sort(key=lambda c: (-c.published_at.timestamp(), c.row_id))
            winner = override_candidates[0]
            selected.append(Selected(row=winner.row, entity=winner.entity, specific=True))
            used_rows.add(winner.row_id)
            used_entities.add((winner.entity.kind, winner.entity.key))

    for candidate in candidates:
        if len(selected) >= slots:
            break
        if candidate.row_id in used_rows:
            continue
        if candidate.entity is not None and (candidate.entity.kind, candidate.entity.key) in used_entities:
            continue
        selected.append(Selected(row=candidate.row, entity=candidate.entity, specific=candidate.specific))
        used_rows.add(candidate.row_id)
        if candidate.entity is not None:
            used_entities.add((candidate.entity.kind, candidate.entity.key))

    return selected
