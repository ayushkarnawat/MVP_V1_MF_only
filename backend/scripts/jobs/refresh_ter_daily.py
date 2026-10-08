import argparse
import asyncio
from datetime import datetime
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.services.analytics.amfi_ter_client import refresh_ter

logger = logging.getLogger(__name__)


async def main_async(db: Session, month: str | None = None) -> None:
    # Daily at 06:20 IST (decided 7 Oct): after the 06:15 fund-list job, so new
    # funds get a TER the same morning, and before the 06:30 Analytics run.
    # --month MM-YYYY processes that month instead (the deploy rebuilds last
    # month first, whose feed is complete; 8 Oct).
    result = await refresh_ter(db, month=month)
    logger.info(
        "refresh_ter_daily: success=%s month=%s schemes=%d matched=%d no_match=%d new_links=%d seconds=%.1f",
        result.success, result.month, result.schemes, result.matched, result.no_match, result.new_links, result.seconds,
    )


def _month(value: str) -> str:
    """AMFI's month format, "MM-YYYY"; rejected before anything is fetched."""
    try:
        datetime.strptime(value, "%m-%Y")
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f'expected MM-YYYY, e.g. 09-2026, got {value!r}') from exc
    return value


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Refresh AMFI TER into scheme_ter.")
    parser.add_argument("--month", type=_month, help='AMFI TER month as "MM-YYYY"; default: the latest published month')
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db, month=args.month))


if __name__ == "__main__":
    main()
