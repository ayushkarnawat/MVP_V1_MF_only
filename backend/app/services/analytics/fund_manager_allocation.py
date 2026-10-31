# backend/app/services/analytics/fund_manager_allocation.py
from __future__ import annotations

import re
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.models.reference import SchemeFundManager
from app.services.analytics.schemas import (
    FundManagerAllocationSummary,
    ManagerFundRow,
    ManagerGroup,
    UnavailableScheme,
)
from app.services.dashboard.holdings import compute_holdings


def _months_back(first_of_month: date, months: int) -> date:
    year, month = divmod(first_of_month.year * 12 + first_of_month.month - 1 - months, 12)
    return date(year, month + 1, 1)


def _oldest_period_shown(today: date) -> date:
    # "Older than 3 months" is unavailable: this month and the two before are shown
    # (in October: October, September, August).
    return _months_back(today.replace(day=1), 2)


def _split_equally(value: Decimal, parts: int) -> list[Decimal]:
    if parts < 1:
        raise ValueError("parts must be at least one")
    share = (value / parts).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    shares = [share] * parts
    shares[0] += value - sum(shares, Decimal("0"))
    return shares


@dataclass(frozen=True)
class MainManager:
    row: SchemeFundManager | None
    assumed: bool
    with_others: int


def _role_text(row: SchemeFundManager) -> str:
    return re.sub(r"[^a-z]+", " ", (row.role or "").casefold()).strip()


def _supporting(row: SchemeFundManager) -> bool:
    role = _role_text(row)
    return bool(re.search(r"\b(?:assistant|asst|associate) (?:fund )?manager\b|\bco (?:fund )?manager\b|\b(?:overseas|foreign|gold|silver|commodity|commodities|arbitrage|advisor)\b", role))


def _active_rows(rows: list[SchemeFundManager]) -> list[SchemeFundManager]:
    from app.services.analytics.amfi_factsheet_client import _parse_managing_since
    active = []
    for row in rows:
        raw = re.sub(r"^(?:w\.?e\.?f\.?|with effect from)\s*", "", row.managing_since_raw or "", flags=re.I)
        since = row.managing_since or _parse_managing_since(raw)
        if since is None or since <= date.today():
            active.append(row)
    return sorted(active, key=lambda row: row.sequence_order)


def pick_main_manager(rows: list[SchemeFundManager]) -> MainManager:
    """Use source order unless the role labels distinguish one main manager.

    Assistant/Associate/Co-Fund Manager and sleeve specialists do not outrank
    a general manager. A sole ordinary manager needs no assumption; a sole
    specialist remains assumed. Equal co-managers imply no main rank.
    """
    active = _active_rows(rows)
    if not active:
        return MainManager(None, False, 0)
    if len(active) == 1:
        specialist = bool(re.search(
            r"\b(?:overseas|foreign|gold|silver|commodity|commodities|arbitrage)\b",
            _role_text(active[0]),
        ))
        return MainManager(active[0], specialist, 0)
    explicit = [row for row in active if re.search(r"\b(?:main|lead|primary) (?:fund )?manager\b", _role_text(row))]
    if len(explicit) == 1:
        return MainManager(explicit[0], False, len(active) - 1)
    general = [row for row in active if not _supporting(row)]
    if len(general) == 1 and len(active) > 1:
        return MainManager(general[0], False, len(active) - 1)
    return MainManager(active[0], True, len(active) - 1)


def _pick_for_fund(rows: list[SchemeFundManager], holding) -> MainManager:
    active = _active_rows(rows)
    overall = pick_main_manager(active)
    # An explicit main designation (lead, or one ordinary manager beside assistants)
    # always wins; the fund's equity/debt orientation only breaks an otherwise assumed pick.
    if len(active) < 2 or not overall.assumed:
        return overall
    category = (holding.sebi_category or "").casefold()
    orientation = holding.asset_class.casefold()
    if category.startswith("equity scheme") or "aggressive hybrid" in category:
        orientation = "equity"
    elif category.startswith("debt scheme"):
        orientation = "debt"
    # The public picker has no fund argument. Apply known fund orientation here,
    # without altering the persisted roles or source order.
    pattern = {"equity": r"\bequity\b", "debt": r"\bdebt\b|\bfixed income\b"}.get(orientation)
    preferred = [row for row in active if pattern and re.search(pattern, _role_text(row)) and not _supporting(row)]
    if preferred:
        chosen = pick_main_manager(preferred)
        return MainManager(chosen.row, len(preferred) > 1 and chosen.assumed, max(len(active) - 1, 0))
    return pick_main_manager(active)


async def compute_fund_manager_allocation(
    db: Session, household_member_ids: list[uuid.UUID]
) -> FundManagerAllocationSummary:
    holdings = await compute_holdings(db, household_member_ids)
    if not holdings:
        return FundManagerAllocationSummary(manager_groups=[], unavailable_schemes=[])

    scheme_ids = {uuid.UUID(h.scheme_id) for h in holdings}
    manager_rows = (
        db.query(SchemeFundManager)
        .filter(SchemeFundManager.scheme_id.in_(scheme_ids))
        .order_by(SchemeFundManager.reference_period.desc())
        .all()
    )
    # Latest reference_period per scheme only -- a scheme's older-month
    # manager rows aren't shown alongside this month's.
    latest_period_by_scheme: dict[uuid.UUID, date] = {}
    for row in manager_rows:
        if row.scheme_id not in latest_period_by_scheme or row.reference_period > latest_period_by_scheme[row.scheme_id]:
            latest_period_by_scheme[row.scheme_id] = row.reference_period
    # Card 2: when an AMC's import fails, last month's managers keep serving -- but rows
    # older than 3 months count as "not available yet" rather than lingering as fact.
    oldest_shown = _oldest_period_shown(date.today())
    rows_by_scheme: dict[uuid.UUID, list[SchemeFundManager]] = defaultdict(list)
    for row in manager_rows:
        if row.reference_period == latest_period_by_scheme.get(row.scheme_id) and row.reference_period >= oldest_shown:
            rows_by_scheme[row.scheme_id].append(row)

    groups: dict[tuple[str, str], dict] = {}
    unavailable: list[UnavailableScheme] = []

    # compute_holdings returns one row per member per scheme; a manager card lists each
    # fund once with the household's combined value (A04 Run 1 ruling).
    value_by_scheme: dict[str, Decimal] = {}
    first_row: dict[str, object] = {}
    for holding in holdings:
        value_by_scheme[holding.scheme_id] = value_by_scheme.get(holding.scheme_id, Decimal("0")) + Decimal(holding.current_value or "0")
        first_row.setdefault(holding.scheme_id, holding)
    # units x NAV carries sub-paisa precision. Round each fund's combined value to the paisa once,
    # before attribution, so every fund row, manager total, covered value and portfolio value is a
    # whole number of paise and the figures shown always add up.
    value_by_scheme = {sid: v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) for sid, v in value_by_scheme.items()}

    for scheme_id_str, holding in first_row.items():
        scheme_id = uuid.UUID(scheme_id_str)
        manager_rows_for_scheme = rows_by_scheme.get(scheme_id, [])
        chosen = _pick_for_fund(manager_rows_for_scheme, holding)
        if chosen.row is None:
            unavailable.append(UnavailableScheme(
                scheme_id=holding.scheme_id, scheme_name=holding.scheme_name, amc_name=holding.amc_name,
            ))
            continue
        value = value_by_scheme[scheme_id_str]
        row = chosen.row
        group = groups.setdefault((row.manager_name, holding.amc_name), {"roles": set(), "sources": set(), "total": Decimal("0"), "funds": []})
        group["roles"].add(row.role)
        group["sources"].add("assumed" if chosen.assumed else "marked")
        group["total"] += value
        group["funds"].append(ManagerFundRow(
            scheme_id=holding.scheme_id, scheme_name=holding.scheme_name,
            household_value=f"{value:.2f}", sequence_order=row.sequence_order, role=row.role,
        ))

    portfolio_value = sum(value_by_scheme.values(), Decimal("0"))

    def percentage(value: Decimal) -> str:
        return str((value / portfolio_value * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) if portfolio_value else "0.00"

    manager_groups = sorted(
        (
            # The card badge only when every fund agrees; otherwise each fund row carries its own
            # role (a manager can lead one fund and assist on another -- review, 9 Oct).
            ManagerGroup(manager_name=name, amc_name=amc, percentage=percentage(g["total"]),
                         main_source="assumed" if "assumed" in g["sources"] else "marked",
                         role=next(iter(g["roles"])) if len(g["roles"]) == 1 else None,
                         total_household_value=f"{g['total']:.2f}", funds=g["funds"])
            for (name, amc), g in groups.items()
        ),
        key=lambda mg: (-Decimal(mg.total_household_value), mg.manager_name),
    )
    covered_value = sum((g["total"] for g in groups.values()), Decimal("0"))
    return FundManagerAllocationSummary(
        manager_groups=manager_groups, unavailable_schemes=unavailable,
        portfolio_value=f"{portfolio_value:.2f}", covered_value=f"{covered_value:.2f}",
        covered_percentage=percentage(covered_value),
    )
