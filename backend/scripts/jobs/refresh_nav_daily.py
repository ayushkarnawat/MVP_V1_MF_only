import argparse
import asyncio
import logging
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import distinct
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.folio import Folio
from app.models.reference import Scenario, Scheme
from app.services.analytics.scenario_engine import compute_scenario_results
from app.services.analytics.scheme_universe import (
    SchemeUniverseClient,
    _parse_nav_all,
    canonical_category,
    get_category_peers,
)
from app.services.dashboard.held_nav_refresh import (
    HeldNavResult,
    _IST,
    alert_problems,
    refresh_held_navs,
    today_ist,
)
from app.services.dashboard.nav import warm_nav_history

logger = logging.getLogger(__name__)


@dataclass
class RunOutcome:
    problems: list[str]
    summary: str
    result: HeldNavResult | None


def load_held_schemes(db: Session) -> list[Scheme]:
    return (
        db.query(Scheme)
        .join(Folio, Folio.scheme_id == Scheme.id)
        .filter(Scheme.id.in_(db.query(distinct(Folio.scheme_id))))
        .all()
    )


async def fetch_amfi_rows():
    """A fresh AMFI NAVAll download every run (never the 24 h cache: the retry runs exist to pick up
    NAVs published since the last run). An empty parse is treated as a failure, not as 'nothing to do'."""
    text = await SchemeUniverseClient()._fetch_nav_all_text()
    rows = _parse_nav_all(text)
    if not rows:
        raise ValueError("AMFI NAVAll file parsed to zero rows")
    return rows


async def refresh_peers(db: Session, schemes: list[Scheme]) -> None:
    """Category peers of the held funds, on the 3-day freshness rule (ranking does not need a daily price)."""
    # Fix D (7 Oct): also every peer in the held funds' SEBI categories, so
    # category ranking and the quality score find them fresh at 06:30 and the
    # Analytics run downloads nothing. Its own warm-up stays as a safety net
    # for a category nobody held at 06:00. Peers are one series per fund of the
    # holding's plan type (9 Oct) -- the set all three ranking sections read --
    # not every plan row, which is ~4x the downloads in the merged categories.
    held_ids = {scheme.id for scheme in schemes}
    groups: dict[tuple, Scheme] = {}
    for scheme in schemes:
        if scheme.amfi_code and scheme.sebi_category:
            groups.setdefault((canonical_category(scheme.sebi_category), scheme.plan_type), scheme)
    peers: dict = {}
    for held in groups.values():
        category = held.sebi_category
        try:
            universe = (await get_category_peers(db, category, held.plan_type)).schemes
        except Exception:  # one bad category must not stop the others (8 Oct review)
            logger.exception("refresh_nav_daily: peers for category %r skipped", category)
            db.rollback()  # e.g. a failed commit of new peer rows; keep the session usable
            continue
        for peer in universe:
            if peer.id not in held_ids:
                peers[peer.id] = peer
    await warm_nav_history(db, peers.values())
    logger.info(
        "refresh_nav_daily: held_schemes=%d categories=%d peer_schemes=%d success=True",
        len(schemes), len(groups), len(peers),
    )


async def main_async(db: Session, *, held_only: bool = False) -> RunOutcome:
    mode = "held-only" if held_only else "full"
    stamp = datetime.now(_IST).isoformat(timespec="seconds")
    held = load_held_schemes(db)
    result: HeldNavResult | None = None
    try:
        rows = await fetch_amfi_rows()
    except Exception as exc:  # download, HTTP or parse failure: fall back to the old refresh, and say so
        logger.exception("refresh_nav_daily: AMFI NAVAll could not be read")
        problems = [f"AMFI file could not be read ({type(exc).__name__}); held-fund prices were refreshed the old way and may be behind"]
        summary = f"NAV_SUMMARY ts={stamp} mode={mode} amfi=FAILED held={len(held)}"
        await warm_nav_history(db, held)
    else:
        try:
            result = await refresh_held_navs(db, held, rows)
        except Exception as exc:  # e.g. a database error: say so loudly, but still let peers and scenarios run
            logger.exception("refresh_nav_daily: held-fund refresh from AMFI failed")
            db.rollback()
            problems = [f"held-fund refresh from AMFI failed ({type(exc).__name__}); see the log for the traceback"]
            summary = f"NAV_SUMMARY ts={stamp} mode={mode} held_refresh=FAILED held={len(held)}"
        else:
            problems = alert_problems(result, today=today_ist())
            summary = result.summary_line(mode=mode, stamp=stamp)
            if result.missing_schemes:
                # Not in AMFI's file (or no usable NAV there): keep the old mfapi.in refresh for them.
                await warm_nav_history(db, result.missing_schemes)
    # Printed straight away so the log has the outcome even if a later step crashes.
    print(summary, flush=True)
    for problem in problems:
        print(f"NAV_PROBLEM {problem}", flush=True)
    for name in (result.missing_from_amfi if result else []):
        print(f"NAV_NOTE not in AMFI file: {name}", flush=True)

    if not held_only:
        await refresh_peers(db, held)
        recompute_ongoing_scenarios(db)
    return RunOutcome(problems=problems, summary=summary, result=result)


def recompute_ongoing_scenarios(db: Session) -> None:
    ongoing = db.query(Scenario).filter_by(is_ongoing=True).all()
    for scenario in ongoing:
        try:
            compute_scenario_results(db, scenario)
        except Exception:
            logger.exception("refresh_nav_daily: scenario recompute failed for %s", scenario.name)
            db.rollback()
    logger.info("refresh_nav_daily: recomputed %d is_ongoing scenarios", len(ongoing))


def exit_code(outcome: RunOutcome, *, alert_if_behind: bool) -> int:
    """Nonzero only when asked to alert AND something is wrong: run-job.sh then emails the run's output."""
    return 1 if (alert_if_behind and outcome.problems) else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Daily NAV refresh (held funds from AMFI, then peers and scenarios).")
    parser.add_argument("--held-only", action="store_true", help="held funds only: no peers, no scenario recompute")
    parser.add_argument("--alert-if-behind", action="store_true", help="exit nonzero when a NAV_PROBLEM exists, so run-job.sh emails it")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)  # one INFO line per request would bury the summary
    with SessionLocal() as db:
        outcome = asyncio.run(main_async(db, held_only=args.held_only))
    return exit_code(outcome, alert_if_behind=args.alert_if_behind)


if __name__ == "__main__":
    sys.exit(main())
