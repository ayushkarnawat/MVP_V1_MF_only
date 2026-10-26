from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_amount, quantize_nav
from app.models.enums import TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.user import HouseholdMember
from app.services.analytics.ter import _latest_ter_for_scheme
from app.services.dashboard.holdings import compute_holdings, invalidate_holdings_cache, peek_cached_holdings
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.nav import _fresh_scheme_ids, warm_nav_history
from app.services.dashboard.xirr import _FUND_DEBIT_TYPES, portfolio_xirr, xirr_string
from app.services.fund_page.folios import mask_folio
from app.services.fund_page.schemas import (
    DetailsOut,
    ExpenseRatioOut,
    FolioOut,
    OpeningLotOut,
    OtherMemberOut,
    SchemeInfoOut,
    SummaryResponse,
    TilesOut,
    plain,
)
from app.services.fund_page.scope import ScopeContext
from app.services.fund_page.sections import scheme_flows, stored_section
from app.services.home.movers import STALE_FEED_DAYS

_SOLD_OUT_OF_HOUSEHOLD = "Scheme not held by this household."


async def ensure_recent_nav(db: Session, scheme: Scheme, member_ids: list[uuid.UUID]) -> None:
    """D2: a scheme row in no master gets no live fetch; otherwise warm it
    (best-effort -- a fetch failure must not surface as a 500) and only
    invalidate caches when the row was actually stale, so a page view of an
    already-fresh fund never evicts every member's holdings cache."""
    if scheme.amfi_code is None:
        return
    was_fresh = scheme.id in _fresh_scheme_ids(db, [scheme.id])
    try:
        await warm_nav_history(db, [scheme])
    except Exception:
        pass
    if not was_fresh:
        for member_id in member_ids:
            invalidate_holdings_cache(member_id)


def _plan_label(plan_type) -> str | None:
    return plan_type.value.title() if plan_type is not None else None


def _merge_opening_lots(rows) -> OpeningLotOut | None:
    lots = [row.opening_lot for row in rows if row.opening_lot is not None]
    if not lots:
        return None
    return OpeningLotOut(
        units=plain(sum((Decimal(lot.units) for lot in lots), Decimal("0")), 3),
        since=min(lot.since for lot in lots),
        cost_source="nav_on_start" if any(lot.cost_source == "nav_on_start" for lot in lots) else "cas_cost",
    )


def _share_of_portfolio(
    db: Session, user_id: uuid.UUID, ctx: ScopeContext, current_value: Decimal | None,
) -> str | None:
    if current_value is None:
        return None
    cached = peek_cached_holdings(ctx.member_ids)
    if cached is not None:
        total = quantize_amount(
            sum((quantize_amount(Decimal(row.current_value)) for row in cached if row.current_value is not None), Decimal("0"))
        )
    else:
        stored = stored_section(db, user_id, ctx.scope_key, "allocation", ctx.member_ids)
        if stored is None:
            return None
        total = Decimal(stored.payload["total_value"])
    if not total:
        return None
    return plain(current_value / total * 100, 4)


async def build_summary(db: Session, scheme: Scheme, ctx: ScopeContext, user_id: uuid.UUID, today: date) -> SummaryResponse:
    all_member_ids = [member.id for member in list_household_members(db, user_id)]
    await ensure_recent_nav(db, scheme, all_member_ids)

    # One call, filtered by this scheme, over the whole household (never the
    # unfiltered household-wide read, rule 6): `ctx`'s own rows are a subset
    # of this result (each row's FIFO replay only touches its own member's
    # folios, independent of who else is in the member-id list), and the
    # complement gives `held_by_other_members` for free -- no second call.
    all_rows = await compute_holdings(
        db, all_member_ids, scheme_ids=frozenset({scheme.id}), allow_stale_today=True, stored_only=True,
    )
    if not all_rows:
        raise HTTPException(status_code=404, detail=_SOLD_OUT_OF_HOUSEHOLD)

    ctx_member_ids = {str(member_id) for member_id in ctx.member_ids}
    ctx_rows = [row for row in all_rows if row.household_member_id in ctx_member_ids]

    others: dict[str, str] = {}
    for row in all_rows:
        if row.household_member_id not in ctx_member_ids:
            others.setdefault(row.household_member_id, row.household_member_name)
    held_by_other_members = [OtherMemberOut(id=member_id, name=name) for member_id, name in others.items()]

    header_row = all_rows[0]
    has_history = scheme.amfi_code is not None
    nav_as_of = header_row.current_nav_date
    nav_stale = bool(
        not header_row.price_from_statement and nav_as_of is not None and (today - nav_as_of).days > STALE_FEED_DAYS
    )

    ter = _latest_ter_for_scheme(db, scheme.id)
    expense_ratio = (
        ExpenseRatioOut(value=plain(ter[0], 2), reference_period=ter[1], plan=_plan_label(scheme.plan_type))
        if ter is not None
        else None
    )
    scheme_info = SchemeInfoOut(
        id=str(scheme.id), name=scheme.name, plan=_plan_label(scheme.plan_type),
        category=scheme.sebi_category, amc_name=scheme.amc_name,
    )

    if not ctx_rows:
        tiles = TilesOut(
            current_value=None, share_of_portfolio_pct=None, invested=None, total_gain=None,
            total_gain_pct=None, xirr=None, expense_ratio=expense_ratio,
        )
        details = DetailsOut(
            units=None, average_nav=None, current_nav=None, invested=None, current_value=None,
            gain=None, gain_pct=None, xirr=None, first_investment=None, last_investment=None,
            opening_lot=None, folios=[],
        )
        return SummaryResponse(
            scope=ctx.scope_key, held=False, held_by_other_members=held_by_other_members,
            nav_as_of=nav_as_of, nav_stale=nav_stale, has_history=has_history,
            scheme=scheme_info, tiles=tiles, details=details,
        )

    units = sum((Decimal(row.units_held) for row in ctx_rows), Decimal("0"))
    invested = quantize_amount(sum((quantize_amount(Decimal(row.amount_invested)) for row in ctx_rows), Decimal("0")))
    current_value = None
    if all(row.current_value is not None for row in ctx_rows):
        current_value = quantize_amount(sum((quantize_amount(Decimal(row.current_value)) for row in ctx_rows), Decimal("0")))
    current_nav = Decimal(ctx_rows[0].current_nav) if ctx_rows[0].current_nav is not None else None
    average_nav = quantize_nav(invested / units) if units else None
    gain = (current_value - invested) if current_value is not None else None
    gain_pct = plain(gain / invested * 100, 4) if gain is not None and invested else None

    flows = scheme_flows(db, ctx.member_ids, scheme.id)
    debit_dates = [flow.date for flow in flows if flow.type in _FUND_DEBIT_TYPES]
    first_investment = min(debit_dates) if debit_dates else None
    last_investment = max(debit_dates) if debit_dates else None

    fund_xirr: str | None = None
    stored = stored_section(db, user_id, ctx.scope_key, "benchmark_funds", ctx.member_ids)
    if stored is not None:
        match = next((row for row in stored.payload.get("funds", []) if row.get("scheme_id") == str(scheme.id)), None)
        if match is not None:
            fund_xirr = match.get("fund_xirr")
    if fund_xirr is None and current_value is not None:
        rate = portfolio_xirr(flows, current_value, extra_debit_types={TransactionType.SWITCH_IN})
        fund_xirr = xirr_string(rate)

    folio_rows = (
        db.query(Folio, HouseholdMember.name)
        .join(HouseholdMember, HouseholdMember.id == Folio.household_member_id)
        .filter(Folio.scheme_id == scheme.id, Folio.household_member_id.in_(ctx.member_ids))
        .order_by(Folio.household_member_id, Folio.folio_number)
        .all()
    )
    folios = [
        FolioOut(folio_id=str(folio.id), member_id=str(folio.household_member_id), member_name=name, folio_masked=mask_folio(folio.folio_number))
        for folio, name in folio_rows
    ]

    tiles = TilesOut(
        current_value=plain(current_value, 2) if current_value is not None else None,
        share_of_portfolio_pct=_share_of_portfolio(db, user_id, ctx, current_value),
        invested=plain(invested, 2),
        total_gain=plain(gain, 2) if gain is not None else None,
        total_gain_pct=gain_pct,
        xirr=fund_xirr,
        expense_ratio=expense_ratio,
    )
    details = DetailsOut(
        units=plain(units, 3),
        average_nav=plain(average_nav, 4) if average_nav is not None else None,
        current_nav=plain(current_nav, 4) if current_nav is not None else None,
        invested=plain(invested, 2),
        current_value=plain(current_value, 2) if current_value is not None else None,
        gain=plain(gain, 2) if gain is not None else None,
        gain_pct=gain_pct,
        xirr=fund_xirr,
        first_investment=first_investment,
        last_investment=last_investment,
        opening_lot=_merge_opening_lots(ctx_rows),
        folios=folios,
    )
    return SummaryResponse(
        scope=ctx.scope_key, held=True, held_by_other_members=held_by_other_members,
        nav_as_of=nav_as_of, nav_stale=nav_stale, has_history=has_history,
        scheme=scheme_info, tiles=tiles, details=details,
    )
