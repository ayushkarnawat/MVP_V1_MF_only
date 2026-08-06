"""On-demand NAV fetch-and-cache — a separate client from Import Service's
MfApiClient (import_/enrich.py), which explicitly scopes itself to scheme
metadata, not valuation history (see its module docstring). This phase's
real production plan is a daily EventBridge-scheduled refresh job
(TDD-Unifolio.md Background Jobs), but that's deployment-phase
infrastructure — this module is the local-dev-first stand-in: fetch a
scheme's NAV the first time it's needed, cache it in `nav_history`, reuse
the cache after that.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from app.models.reference import NavHistory, Scheme

MFAPI_BASE = "https://api.mfapi.in"


async def _fetch_nav_history(amfi_code: str) -> list[tuple[date, Decimal]]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{MFAPI_BASE}/mf/{amfi_code}")
        resp.raise_for_status()
        payload = resp.json()

    rows: list[tuple[date, Decimal]] = []
    for entry in payload.get("data", []):
        # mfapi.in dates are DD-MM-YYYY.
        parsed_date = datetime.strptime(entry["date"], "%d-%m-%Y").date()
        rows.append((parsed_date, Decimal(entry["nav"])))
    return rows


def _upsert_nav_history(db: Session, scheme_id: uuid.UUID, rows: list[tuple[date, Decimal]]) -> None:
    existing_dates = {d for (d,) in db.query(NavHistory.date).filter_by(scheme_id=scheme_id).all()}
    for row_date, nav in rows:
        if row_date not in existing_dates:
            db.add(NavHistory(scheme_id=scheme_id, date=row_date, nav=nav))
    db.commit()


def _latest_cached_on_or_before(db: Session, scheme_id: uuid.UUID, on_date: date) -> NavHistory | None:
    return (
        db.query(NavHistory)
        .filter(NavHistory.scheme_id == scheme_id, NavHistory.date <= on_date)
        .order_by(NavHistory.date.desc())
        .first()
    )


async def get_nav_on_or_before(db: Session, scheme: Scheme, on_date: date) -> tuple[Decimal, date] | None:
    """Most recent NAV on or before `on_date`. Returns `(nav, actual_date)`,
    or `None` if nothing is available even after attempting a fetch.

    A cached row exactly on a past `on_date` is trusted without fetching —
    there's no reason to expect a fresher fetch to change history. A cached
    row on `on_date == date.today()` is NOT trusted without at least
    attempting a fetch, since today's NAV may not have been published yet
    when it was last cached (FR-3's "not yet published" case is normal, not
    an error, but this function should still try to get the freshest data
    available)."""
    cached = _latest_cached_on_or_before(db, scheme.id, on_date)
    have_trustworthy_cache = cached is not None and (cached.date == on_date or on_date != date.today())
    if have_trustworthy_cache:
        return cached.nav, cached.date

    try:
        rows = await _fetch_nav_history(scheme.amfi_code)
    except httpx.HTTPError:
        return (cached.nav, cached.date) if cached else None

    _upsert_nav_history(db, scheme.id, rows)
    refreshed = _latest_cached_on_or_before(db, scheme.id, on_date)
    return (refreshed.nav, refreshed.date) if refreshed else None


def get_previous_nav_from_cache(db: Session, scheme_id: uuid.UUID, before_date: date) -> tuple[Decimal, date] | None:
    row = (
        db.query(NavHistory)
        .filter(NavHistory.scheme_id == scheme_id, NavHistory.date < before_date)
        .order_by(NavHistory.date.desc())
        .first()
    )
    return (row.nav, row.date) if row else None
