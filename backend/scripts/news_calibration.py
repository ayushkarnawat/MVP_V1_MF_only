"""T5 calibration (handoff section 9, E20): for a real household, print per
kind every candidate watch entity (D4) -- its exposure percent, rank, and
whether it survives top-5 and the current `MIN_SIZE_PCT` -- so the owner can
sign off on (or adjust) the starting thresholds before T6 begins.

Never writes the source database: copies it to a temp file first (pattern of
`scripts/home_synthetic_gate.py`), and prints a before/after sha256 of the
source to prove it was untouched.

Stock and sector entities need per-fund disclosures (`SchemeHolding`); the
calibration DB (`s25.db`) has none, so those two kinds always print
"n/a (no disclosures in this file)" instead of a ranked list.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import shutil
import sys
import tempfile
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.reference import Scheme
from app.models.user import HouseholdMember, User
from app.services.home.allocation import load_allocation
from app.services.home.context import resolve_scope
from app.services.news.config import MIN_SIZE_PCT, TOP_N
from app.services.news.match import (
    WatchEntity, _allocation_entities, _group_by_fund_category, _group_by_fund_house, _valued,
)
from app.services.news.normalise import category_key

_NO_DISCLOSURE_KINDS = ("stock", "sector")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _real_entities(db, user_id, ctx) -> list[WatchEntity]:
    rows = asyncio.run(load_allocation(
        db, user_id, scope=ctx.scope, household_member_ids=ctx.member_ids,
        members=[(uuid.UUID(m.id), m.name) for m in ctx.members],
    ))
    from app.services.dashboard.holdings import compute_holdings
    holdings = asyncio.run(compute_holdings(db, list(ctx.member_ids), allow_stale_today=True, stored_only=True))
    valued = _valued(holdings)
    total = rows.total_value or Decimal("0")
    return [
        *_group_by_fund_house(valued, total),
        *_group_by_fund_category(valued, total),
        *_allocation_entities(rows),
    ]


def _report_kind(kind: str, entities: list[WatchEntity]) -> list[str]:
    lines = [f"  kind={kind}:"]
    if kind in _NO_DISCLOSURE_KINDS:
        lines.append("    n/a (no disclosures in this file)")
        return lines
    minimum = MIN_SIZE_PCT.get(kind, Decimal("0.00"))
    ordered = sorted(entities, key=lambda e: (-(e.exposure_pct or Decimal("0")), e.key))
    survivors = 0
    for rank, entity in enumerate(ordered, start=1):
        top5 = rank <= TOP_N
        meets_min = entity.exposure_pct is not None and entity.exposure_pct >= minimum
        survives = top5 and meets_min
        survivors += survives
        lines.append(
            f"    rank={rank} label={entity.label!r} exposure_pct={entity.exposure_pct} "
            f"top5={top5} meets_min={meets_min} survives={survives}"
        )
    if not ordered:
        lines.append("    (none held)")
    lines.append(f"    survivors={survivors}")
    return lines


def _unmatched_category_strings(db) -> list[str]:
    """C137 diagnostic: `sebi_category` strings held by real schemes in this
    file that `category_key` still can't resolve, so a calibration gap like
    the Axis/UTI one this task fixed shows up here instead of silently
    vanishing from `fund_category`'s percentages."""
    categories = {row[0] for row in db.query(Scheme.sebi_category).distinct() if row[0]}
    return sorted(name for name in categories if category_key(name) is None)


def _report_for_scope(db, label: str, user_id, ctx) -> list[str]:
    entities = _real_entities(db, user_id, ctx)
    by_kind: dict[str, list[WatchEntity]] = {}
    for entity in entities:
        by_kind.setdefault(entity.kind, []).append(entity)
    lines = [f"scope={label}"]
    for kind in ("fund_house", "fund_category", "asset_class", "rates_macro", "stock", "sector"):
        lines.extend(_report_kind(kind, by_kind.get(kind, [])))
    return lines


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path", type=Path)
    args = parser.parse_args()
    source = args.db_path.resolve()
    before = _sha256(source)
    print(f"source_sha256_before: {before}")

    print("MIN_SIZE_PCT in force:")
    for kind, value in MIN_SIZE_PCT.items():
        print(f"  {kind}: {value}")
    print(f"TOP_N: {TOP_N}")

    with tempfile.TemporaryDirectory(prefix="unifolio-news-calibration-") as directory:
        copy = Path(directory) / "calibration.db"
        shutil.copy2(source, copy)
        engine = create_engine(f"sqlite:///{copy}", connect_args={"check_same_thread": False})
        sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        with sessions() as db:
            user = db.query(User).one()
            members = (
                db.query(HouseholdMember)
                .filter(HouseholdMember.user_id == user.id)
                .order_by(HouseholdMember.created_at, HouseholdMember.id)
                .all()
            )
            unmatched = _unmatched_category_strings(db)
            print("unmatched sebi_category strings (no category_key match):")
            if unmatched:
                for name in unmatched:
                    print(f"  {name!r}")
            else:
                print("  (none)")

            aggregate_ctx = resolve_scope(db, SimpleNamespace(id=user.id), None)
            for line in _report_for_scope(db, "aggregate", user.id, aggregate_ctx):
                print(line)
            for member in members:
                member_ctx = resolve_scope(db, SimpleNamespace(id=user.id), member.id)
                for line in _report_for_scope(db, f"member:{member.name}", user.id, member_ctx):
                    print(line)

    after = _sha256(source)
    print(f"source_sha256_after: {after}")
    if before != after:
        raise SystemExit(f"source was modified: before={before} after={after}")


if __name__ == "__main__":
    main()
