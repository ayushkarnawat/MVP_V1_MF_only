"""Risk (downside deviation) and Consistency (rolling 12-month peer-beat
rate) — PRD-04 FR-5a. Both operate on a shared monthly-NAV-series
abstraction so a scheme's NAV history is fetched and bucketed once and
reused for both components.

**Why downside deviation, not plain standard deviation:** Morningstar and
CRISIL both essentially measure symmetric volatility (up-swings count as
"risk" the same as down-swings). An investor doesn't experience a fund's
good months as risk — only the bad ones. Downside deviation (MAR = 0, i.e.
only negative months contribute) is closer to how risk is actually felt,
and is a deliberate point of difference from those two named competitors
per the Phase 4 design doc §6.

**Why rolling-12-month Consistency exists at all:** this is Unifolio's own
differentiating ingredient (user's explicit requirement — see design doc
§6) — no cited competitor scores "how often did this fund beat its peers,
not just by how much" as its own visible axis.

**Unannualized by design:** downside deviation here stays in monthly units.
Annualizing (multiplying by sqrt(12)) is a constant scalar applied equally
to every scheme in a category, so it would not change the relative
percentile ranking this feeds into — skipped as unnecessary work for a
value that's never displayed on its own, only used for ranking.
"""

from __future__ import annotations

import calendar
import statistics
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.reference import NavHistory

_ROLLING_WINDOW_MONTHS = 12


def month_end_dates(start: date, end: date) -> list[date]:
    """Calendar month-end dates from `start`'s month through the last
    complete month at or before `end`. Never includes a partial/current
    month — a volatility measure over years doesn't need this month's
    still-incomplete data point."""
    dates: list[date] = []
    year, month = start.year, start.month
    while True:
        last_day = calendar.monthrange(year, month)[1]
        month_end = date(year, month, last_day)
        if month_end > end:
            break
        dates.append(month_end)
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1
    return dates


def build_monthly_series(
    db: Session, scheme_id: uuid.UUID, month_ends: list[date]
) -> list[Decimal | None]:
    """One NAV-on-or-before value per `month_ends` anchor, position-aligned
    so index i means the same calendar month across every scheme in a
    category — required for Consistency's cross-scheme median comparison.
    `None` for anchors before the scheme's first cached NAV row. Assumes
    the caller has already ensured NAV cache warmth (Task 2's caller
    triggers this as a side effect of the Return computation it runs
    first) — reads the cache only, no network call."""
    if not month_ends:
        return []
    rows = (
        db.query(NavHistory)
        .filter(NavHistory.scheme_id == scheme_id, NavHistory.date <= month_ends[-1])
        .order_by(NavHistory.date)
        .all()
    )
    values: list[Decimal | None] = []
    idx = 0
    last_nav: Decimal | None = None
    for month_end in month_ends:
        while idx < len(rows) and rows[idx].date <= month_end:
            last_nav = rows[idx].nav
            idx += 1
        values.append(last_nav)
    return values


def monthly_returns(series: list[Decimal | None]) -> list[Decimal | None]:
    """Month-over-month % change, position-aligned with `series` (index 0
    is always `None` — no prior point to compare the first anchor to)."""
    result: list[Decimal | None] = [None] * len(series)
    for i in range(1, len(series)):
        prev, curr = series[i - 1], series[i]
        if prev is not None and curr is not None:
            result[i] = curr / prev - Decimal(1)
    return result


def compute_downside_deviation(returns: list[Decimal | None]) -> Decimal | None:
    """Population downside deviation (MAR = 0): sqrt(sum(min(r, 0)^2) / n),
    n = count of usable (non-None) returns. `None` if there are none."""
    values = [r for r in returns if r is not None]
    if not values:
        return None
    sum_sq_downside = sum((v * v for v in values if v < 0), Decimal(0))
    return (sum_sq_downside / Decimal(len(values))).sqrt()


def rolling_12m_returns(series: list[Decimal | None]) -> list[Decimal | None]:
    """Trailing 12-month return ending at each anchor, position-aligned
    with `series` (the first 12 entries are always `None` — no 12 months
    of prior data yet)."""
    result: list[Decimal | None] = [None] * len(series)
    for i in range(_ROLLING_WINDOW_MONTHS, len(series)):
        prev, curr = series[i - _ROLLING_WINDOW_MONTHS], series[i]
        if prev is not None and curr is not None:
            result[i] = curr / prev - Decimal(1)
    return result


def category_medians(rolling_by_scheme: list[list[Decimal | None]]) -> list[Decimal | None]:
    """Per-index median across every scheme's rolling-return series (all
    position-aligned to the same month-end anchors). `None` at an index
    with no data from any scheme."""
    if not rolling_by_scheme:
        return []
    length = len(rolling_by_scheme[0])
    medians: list[Decimal | None] = []
    for i in range(length):
        values = [series[i] for series in rolling_by_scheme if series[i] is not None]
        medians.append(statistics.median(values) if values else None)
    return medians


def compute_consistency_hit_rate(
    scheme_rolling: list[Decimal | None], medians: list[Decimal | None]
) -> Decimal | None:
    """% of rolling 12-month windows where the scheme's return was at or
    above its category's median for that same window. `None` if there are
    no comparable windows (e.g. a fund too new to overlap the category's
    shared history)."""
    hits = 0
    total = 0
    for value, median in zip(scheme_rolling, medians):
        if value is None or median is None:
            continue
        total += 1
        if value >= median:
            hits += 1
    if total == 0:
        return None
    return Decimal(hits) / Decimal(total) * Decimal(100)
