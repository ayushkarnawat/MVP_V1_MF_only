"""T9 prep (handoff section 11): read-only review of what the news job stored,
for the owner's staging check -- does the tagging look right on real headlines?

Prints counts per tier and per tag kind, a spread of sample headlines per tag
kind, rows per source, and the published_at / ingested_at ranges. Only SELECTs
run; the session is rolled back and closed, never committed.

Untagged titles are never stored (the job drops them), so this script cannot
show what the tagger missed. For that, run the job's own
`scripts/jobs/refresh_news.py --dry-run`, which lists untagged Indian-site titles.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.news import NewsItem

_DEFAULT_SAMPLES = 20


def _spread(rows: list[NewsItem], count: int) -> list[NewsItem]:
    # Evenly spaced picks over the newest-first list, so the sample covers the
    # whole window rather than only the latest hours; deterministic, no RNG.
    if len(rows) <= count:
        return rows
    step = len(rows) / count
    return [rows[int(index * step)] for index in range(count)]


def _tag_summary(row: NewsItem) -> str:
    return ", ".join(
        f"{tag.get('kind')}:{tag.get('label') or tag.get('key')}" for tag in (row.entity_tags or [])
    )


def report(db, samples: int) -> list[str]:
    rows = list(db.execute(select(NewsItem).order_by(NewsItem.published_at.desc(), NewsItem.id)).scalars())
    lines = [f"news_items total={len(rows)}"]
    if not rows:
        lines.append("(no rows stored: has the job run with NEWS_ENABLED=true?)")
        return lines

    lines.append(f"published_at oldest={min(r.published_at for r in rows).isoformat()} newest={max(r.published_at for r in rows).isoformat()}")
    lines.append(f"ingested_at  oldest={min(r.ingested_at for r in rows).isoformat()} newest={max(r.ingested_at for r in rows).isoformat()}")

    lines.append("rows per tier:")
    for tier, count in sorted(Counter(r.tier for r in rows).items()):
        lines.append(f"  tier {tier}: {count}")

    by_kind: dict[str, list[NewsItem]] = {}
    for row in rows:
        # Count a row once per distinct kind it carries, however many tags of that kind.
        for kind in sorted({tag.get("kind") for tag in (row.entity_tags or []) if tag.get("kind")}):
            by_kind.setdefault(kind, []).append(row)
    lines.append("rows per tag kind (a row with several kinds counts under each):")
    for kind in sorted(by_kind):
        lines.append(f"  {kind}: {len(by_kind[kind])}")

    lines.append("rows per source:")
    for source, count in sorted(Counter(r.source for r in rows).items(), key=lambda item: (-item[1], item[0])):
        lines.append(f"  {source}: {count}")

    for kind in sorted(by_kind):
        picked = _spread(by_kind[kind], samples)
        lines.append(f"samples for kind={kind} ({len(picked)} of {len(by_kind[kind])}, spread newest to oldest):")
        for row in picked:
            lines.append(f"  [tier {row.tier}] {row.title}")
            lines.append(f"      {row.source} | {row.published_at.isoformat()} | tags: {_tag_summary(row)}")

    lines.append("untagged titles are not stored: use `refresh_news.py --dry-run` to review those.")
    return lines


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Read-only review of the stored news feed (T9 staging check).")
    parser.add_argument("--samples", type=int, default=_DEFAULT_SAMPLES, help="sample headlines per tag kind (default: 20)")
    args = parser.parse_args(argv)
    db = SessionLocal()
    try:
        for line in report(db, args.samples):
            print(line)
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
