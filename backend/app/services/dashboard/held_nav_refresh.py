"""Daily NAV refresh for the funds people actually HOLD, driven by AMFI's own dates.

Why this exists (found 13 Nov 2026): `nav.warm_nav_history` skips any fund that has a stored
NAV from the last 3 days. That rule is right for the ~1,500 category *peers* (ranking does not
need a daily price, and re-downloading them all is costly), but nav-daily reused it for held
funds. Home and Portfolio read stored prices only, so held funds sat 1-3 days behind until some
live page happened to refresh them. A held fund must be refreshed every day, however old its
last row is.

How: AMFI's NAVAll.txt lists, for every scheme, its latest NAV *and that NAV's own date*. We
compare each held fund with its own AMFI date (no weekday or holiday guessing: liquid funds
publish on weekends, equity funds do not), and fill what is behind:
  * normal case (behind by a few days): write AMFI's row itself, with no extra network call;
  * big gap (more than `GAP_DAYS_FOR_HISTORY` days, or no rows): fetch the fund's full history
    from mfapi.in to repair the gap, then still write AMFI's row, so a mfapi.in outage or lag
    cannot leave the fund behind.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.reference import NavHistory, Scheme
from app.services.analytics.scheme_universe import UniverseRow
from app.services.dashboard.nav import _fetch_nav_history, _upsert_nav_history

# A fund more than this many days behind its AMFI date probably has missing days in between, so
# its full history is re-fetched. Smaller gaps are filled with AMFI's own row (no mfapi.in call).
GAP_DAYS_FOR_HISTORY = 4
# A held fund whose own AMFI date is more than this many days older than the newest date in the
# file has probably stopped publishing. Same 4-day limit as the "stale NAV" flag on the holdings
# row (dashboard/holdings.py), so the chip and this alarm agree.
VERY_STALE_DAYS = 4
# Fewer stored rows than this means the history was never filled (or a fetch failed): re-fetch it.
MIN_ROWS_BEFORE_TRUSTING_HISTORY = 30

_IST = timezone(timedelta(hours=5, minutes=30))  # India has no daylight saving; no tz database needed


def today_ist() -> date:
    return datetime.now(_IST).date()


def last_weekday_before(today: date) -> date:
    """The most recent Monday-Friday strictly before `today` (Mon, Sat and Sun all give Friday)."""
    day = today - timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day


@dataclass
class HeldNavResult:
    held: int
    behind: int
    filled_amfi: int
    filled_mfapi: int
    still_behind: int
    missing_from_amfi: list[str] = field(default_factory=list)
    very_stale: list[str] = field(default_factory=list)
    amfi_newest: date | None = None
    # The schemes behind `missing_from_amfi`: the job still gives them the old (mfapi.in) refresh.
    missing_schemes: list[Scheme] = field(default_factory=list)
    filled_scheme_ids: list[uuid.UUID] = field(default_factory=list)

    def summary_line(self, *, mode: str, stamp: str) -> str:
        """One greppable line per run; the daily digest and the log both rely on this exact shape."""
        newest = self.amfi_newest.isoformat() if self.amfi_newest else "none"
        return (
            f"NAV_SUMMARY ts={stamp} mode={mode} held={self.held} behind={self.behind} "
            f"filled_amfi={self.filled_amfi} filled_mfapi={self.filled_mfapi} "
            f"still_behind={self.still_behind} missing_from_amfi={len(self.missing_from_amfi)} "
            f"very_stale={len(self.very_stale)} amfi_newest={newest}"
        )


def _stored_stats(db: Session, scheme_ids: Iterable) -> dict:
    """scheme id -> (newest stored date, number of stored rows)."""
    ids = list(scheme_ids)
    if not ids:
        return {}
    rows = (
        db.query(NavHistory.scheme_id, func.max(NavHistory.date), func.count())
        .filter(NavHistory.scheme_id.in_(ids))
        .group_by(NavHistory.scheme_id)
        .all()
    )
    return {scheme_id: (latest, count) for scheme_id, latest, count in rows}


async def refresh_held_navs(
    db: Session, schemes: Iterable[Scheme], amfi_rows: Sequence[UniverseRow], *, today: date | None = None
) -> HeldNavResult:
    today = today or today_ist()
    held = {scheme.id: scheme for scheme in schemes if scheme.amfi_code is not None}

    # A row with no usable NAV, or a date in the future, cannot be trusted as "AMFI's latest".
    usable: dict[str, UniverseRow] = {}
    for row in amfi_rows:
        if row.nav is not None and row.nav > Decimal(0) and row.nav_date is not None and row.nav_date <= today:
            usable[row.amfi_code] = row
    amfi_newest = max((row.nav_date for row in usable.values()), default=None)

    stored = _stored_stats(db, held)
    not_in_file = [s for s in held.values() if s.amfi_code not in usable]
    missing = sorted(s.name for s in not_in_file)

    behind: list[tuple[Scheme, UniverseRow, date | None, int]] = []
    for scheme_id, scheme in held.items():
        amfi_row = usable.get(scheme.amfi_code)
        latest, count = stored.get(scheme_id, (None, 0))
        if amfi_row is not None and (latest is None or amfi_row.nav_date > latest):
            behind.append((scheme, amfi_row, latest, count))

    # Full history when there is probably a hole to repair: a big gap, nothing stored, or so few stored
    # rows that an earlier history fetch must have failed (the 4-day rule alone would never retry it).
    needs_history = [
        (scheme, amfi_row) for scheme, amfi_row, latest, count in behind
        if latest is None or count < MIN_ROWS_BEFORE_TRUSTING_HISTORY
        or (amfi_row.nav_date - latest).days > GAP_DAYS_FOR_HISTORY
    ]

    async def fetch(scheme: Scheme):
        try:
            return scheme.id, await _fetch_nav_history(scheme.amfi_code)
        # One failed or malformed mfapi.in response (network error, JSON `null`, a list instead of an
        # object...) must not stop the run: AMFI's own row still fills the fund. `Exception` does not
        # include asyncio.CancelledError, so cancellation still propagates.
        except Exception:
            return scheme.id, None

    histories = dict(await asyncio.gather(*(fetch(scheme) for scheme, _ in needs_history)))

    filled_mfapi = filled_amfi = 0
    for scheme, amfi_row, _latest, _count in behind:
        history = histories.get(scheme.id)
        if history:
            await _upsert_nav_history(db, scheme.id, history, commit=False)
            filled_mfapi += 1
        else:
            filled_amfi += 1
        # Always write AMFI's own row too: mfapi.in may lag or fail, AMFI is the reference for the date.
        await _upsert_nav_history(db, scheme.id, [(amfi_row.nav_date, amfi_row.nav)], commit=False)
    if behind:
        await commit_off_loop(db)

    after = _stored_stats(db, held) if behind else stored
    still_behind = sum(
        1 for scheme_id, scheme in held.items()
        if scheme.amfi_code in usable
        and (after.get(scheme_id, (None, 0))[0] is None or after[scheme_id][0] < usable[scheme.amfi_code].nav_date)
    )
    very_stale = sorted(
        scheme.name for scheme in held.values()
        if amfi_newest is not None and scheme.amfi_code in usable
        and (amfi_newest - usable[scheme.amfi_code].nav_date).days > VERY_STALE_DAYS
    )
    return HeldNavResult(
        held=len(held), behind=len(behind), filled_amfi=filled_amfi, filled_mfapi=filled_mfapi,
        still_behind=still_behind, missing_from_amfi=missing, very_stale=very_stale, amfi_newest=amfi_newest,
        missing_schemes=not_in_file,
        filled_scheme_ids=[scheme.id for scheme, _, _, _ in behind],
    )


def alert_problems(result: HeldNavResult, *, today: date | None = None) -> list[str]:
    """Plain-language problems worth an email. A held fund missing from the file entirely (a closed
    fund) is listed in the log by the summary but is deliberately not a problem."""
    today = today or today_ist()
    problems: list[str] = []
    expected = last_weekday_before(today)
    if result.amfi_newest is None:
        problems.append("AMFI file has no usable NAV dates")
    elif result.amfi_newest < expected:
        problems.append(
            f"AMFI file is late: its newest NAV date is {result.amfi_newest.isoformat()}, "
            f"expected at least {expected.isoformat()}"
        )
    for name in result.very_stale:
        problems.append(f"{name}: its NAV is more than {VERY_STALE_DAYS} days older than AMFI's newest date (fund may have stopped publishing)")
    if result.still_behind:
        problems.append(f"{result.still_behind} held fund(s) are still behind AMFI after the refresh")
    return problems
