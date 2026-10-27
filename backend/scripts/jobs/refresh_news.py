"""T6: refresh the shared GDELT news feed (Home news section).

Order (handoff section 10): kill switch -> ingest -> tag/store -> purge ->
one summary log line -> Healthchecks ping. The whole ingest/store/purge body
is one try/except so ANY exception (ingest, tagging, store, commit) rolls
back and exits 1 with no ping, per spec; a ping failure never changes the
exit code because it is a separate, narrower try/except around the ping
call only.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import resource
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import SessionLocal
from app.models.news import NewsItem
from app.services.news.ingest import ingest_window
from app.services.news.normalise import Dictionaries, load_dictionaries, store_items, tag_title

logger = logging.getLogger(__name__)

_RETENTION_DAYS = 14
_USER_AGENT = "Unifolio news refresh (contact: ops)"
_DRY_RUN_SAMPLE_SIZE = 20


def _ping(url: str) -> None:
    httpx.get(url, timeout=10)


def _peak_mb() -> float | None:
    try:
        usage = resource.getrusage(resource.RUSAGE_SELF)
    except (AttributeError, ValueError):
        return None
    return usage.ru_maxrss / 1024  # ru_maxrss is KB on Linux, the only platform this job runs on


def _disabled_sources() -> set[str]:
    return {domain.strip() for domain in settings.news_disabled_sources.split(",") if domain.strip()}


def _print_dry_run(articles, dictionaries: Dictionaries) -> None:
    by_kind: dict[str, list[str]] = {}
    untagged_indian: list[str] = []
    for article in articles:
        tags = tag_title(article.title, dictionaries)
        if tags:
            for tag in tags:
                by_kind.setdefault(tag.kind, []).append(article.title)
        elif article.origin == "indian":
            untagged_indian.append(article.title)

    print(f"dry_run: articles={len(articles)}")
    for kind in sorted(by_kind):
        titles = by_kind[kind]
        print(f"  kind={kind} count={len(titles)}")
        for title in titles[:_DRY_RUN_SAMPLE_SIZE]:
            print(f"    {title}")
    print(f"untagged indian-site titles: count={len(untagged_indian)}")
    for title in untagged_indian[:_DRY_RUN_SAMPLE_SIZE]:
        print(f"  {title}")


async def main_async(db: Session, *, hours: int = 5, dry_run: bool = False) -> int:
    if not settings.news_enabled:
        logger.info("news_refresh: news disabled")
        return 0

    start = time.monotonic()
    now_utc = datetime.now(timezone.utc)

    try:
        async with httpx.AsyncClient(
            timeout=60, follow_redirects=True, headers={"User-Agent": _USER_AGENT},
        ) as client:
            articles, stats = await ingest_window(client, now_utc, hours, disabled_sources=_disabled_sources())

        dictionaries = load_dictionaries(db)

        if dry_run:
            _print_dry_run(articles, dictionaries)
            return 0

        result = store_items(db, articles, dictionaries, now_utc)
        db.commit()

        cutoff = now_utc - timedelta(days=_RETENTION_DAYS)
        purged = db.query(NewsItem).filter(NewsItem.published_at < cutoff).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("news_refresh: failed")
        return 1

    if stats.files_missing or stats.files_failed:
        logger.warning(
            "news_refresh: partial failure files_missing=%d files_failed=%d",
            stats.files_missing, stats.files_failed,
        )

    seconds = time.monotonic() - start
    peak_mb = _peak_mb()
    logger.info(
        "news_refresh files_ok=%d missing=%d failed=%d rows=%d kept=%d inserted=%d purged=%d seconds=%.1f peak_mb=%s",
        stats.files_ok, stats.files_missing, stats.files_failed, stats.rows_seen, stats.rows_kept,
        result.inserted, purged, seconds, f"{peak_mb:.1f}" if peak_mb is not None else "n/a",
    )

    if stats.files_ok == 0:
        return 1

    if settings.healthcheck_news_url:
        try:
            _ping(settings.healthcheck_news_url)
        except Exception:
            logger.exception("news_refresh: heartbeat ping failed")
    return 0


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Refresh the shared GDELT news feed (Home news section).")
    parser.add_argument("--hours", type=int, default=5, help="ingest window size in hours (default: 5)")
    parser.add_argument("--dry-run", action="store_true", help="read and tag only; write nothing, never pings")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        raise SystemExit(asyncio.run(main_async(db, hours=args.hours, dry_run=args.dry_run)))


if __name__ == "__main__":
    main()
