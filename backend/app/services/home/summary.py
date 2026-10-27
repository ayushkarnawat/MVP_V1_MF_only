from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.enums import ImportStatus
from app.models.imports import Import
from app.services.home.movers import Movers


@dataclass(frozen=True)
class Summary:
    display_name: str
    greeting: str
    scope_label: str
    change_amount: Decimal
    change_pct: Decimal | None
    direction: Literal["up", "down", "flat"]
    status_phrase: str
    since_label: str
    since_date: date | None
    top_contributor: str | None
    members_connected: int
    members_total: int
    data_line: str | None
    top_contributor_scheme_id: str | None = None


def greeting_for_hour(hour: int) -> str:
    if hour < 12:
        return "morning"
    if hour < 17:
        return "afternoon"
    return "evening"


def _top_contributor_fund(movers: Movers):
    nonzero = [fund for fund in movers.funds if fund.change]
    if not nonzero:
        return None
    if movers.net_change > 0:
        positive = [fund for fund in nonzero if fund.change > 0]
        return max(positive, key=lambda fund: fund.change) if positive else None
    if movers.net_change < 0:
        negative = [fund for fund in nonzero if fund.change < 0]
        return min(negative, key=lambda fund: fund.change) if negative else None
    return max(nonzero, key=lambda fund: abs(fund.change))


def _top_contributor(movers: Movers) -> str | None:
    fund = _top_contributor_fund(movers)
    return fund.name if fund is not None else None


def _top_contributor_scheme_id(movers: Movers) -> str | None:
    fund = _top_contributor_fund(movers)
    return str(fund.scheme_id) if fund is not None else None


def build_summary(
    *,
    display_name: str,
    now_ist: datetime,
    scope: Literal["aggregate", "member"],
    member_name: str | None,
    movers: Movers,
    members_connected: int,
    members_total: int,
) -> Summary:
    if scope == "member" and not member_name:
        raise ValueError("member_name is required for member scope")
    scope_label = "Your family portfolio" if scope == "aggregate" else f"{member_name}'s portfolio"
    is_flat = (
        movers.net_change == 0
        or movers.net_pct is None
        or abs(movers.net_pct) < Decimal("0.05")
    )
    if is_flat:
        direction: Literal["up", "down", "flat"] = "flat"
        status_phrase = "little changed"
    elif movers.net_change > 0:
        direction = "up"
        status_phrase = "up"
    else:
        direction = "down"
        status_phrase = "down"

    if movers.previous_nav_date is None or movers.as_of_nav_date == now_ist.date():
        since_label = "today"
    else:
        since_label = f"since {movers.previous_nav_date:%A}'s close"
    data_line = None
    if scope == "aggregate" and members_total > 1:
        data_line = f"Data from {members_connected} of {members_total} family members"
    return Summary(
        display_name=display_name,
        greeting=greeting_for_hour(now_ist.hour),
        scope_label=scope_label,
        change_amount=movers.net_change,
        change_pct=movers.net_pct,
        direction=direction,
        status_phrase=status_phrase,
        since_label=since_label,
        since_date=movers.previous_nav_date,
        top_contributor=_top_contributor(movers),
        top_contributor_scheme_id=_top_contributor_scheme_id(movers),
        members_connected=members_connected,
        members_total=members_total,
        data_line=data_line,
    )


def load_members_connected(
    db: Session,
    household_member_ids: Sequence[uuid.UUID],
) -> int:
    if not household_member_ids:
        return 0
    count = (
        db.query(func.count(func.distinct(Import.household_member_id)))
        .filter(
            Import.household_member_id.in_(household_member_ids),
            Import.status == ImportStatus.CONFIRMED,
        )
        .scalar()
    )
    return int(count or 0)
