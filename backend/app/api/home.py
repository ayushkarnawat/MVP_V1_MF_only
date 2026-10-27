from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_amount
from app.db.session import get_db
from app.models.enums import BenchmarkIndex, Relationship
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user
from app.services.home.allocation import load_allocation
from app.services.home.benchmarks import HOME_BENCHMARKS, load_cap_mix, recommend_benchmark
from app.services.home.context import HomeInputs, ScopeContext, load_home_inputs, resolve_scope
from app.services.home.series import MAX_CUSTOM_YEARS
from app.services.home.schemas import (
    AllocationResponse,
    BenchmarkOptionOut,
    BenchmarkPointOut,
    BenchmarkSeriesOut,
    BenchmarksResponse,
    ClassRowOut,
    MoverBarOut,
    MoverFundOut,
    MoversResponse,
    PointOut,
    SummaryResponse,
    WealthSeriesResponse,
    WorthCardOut,
    WorthResponse,
)
from app.services.home.summary import build_summary, load_members_connected
from app.services.home.wealth import build_wealth_series
from app.services.home.worth import STORED_SECTION_NAMES, build_worth_cards, load_worth_facts


router = APIRouter(tags=["home"])
CENT = Decimal("0.01")
HOME_BENCHMARK_VALUES = tuple(option.index.value for option in HOME_BENCHMARKS)
HomeBenchmark = Literal[
    "nifty_50", "nifty_500", "nifty_largemidcap_250", "nifty_midcap_150",
    "nifty_smallcap_250",
]
Period = Literal["1D", "1W", "1M", "1Y", "custom"]
MoverView = Literal["sector", "category", "fund"]


def get_now_ist() -> datetime:
    return datetime.now(ZoneInfo("Asia/Kolkata"))


def _money(value: Decimal) -> Decimal:
    rounded = value.quantize(CENT, rounding=ROUND_HALF_UP)
    return abs(rounded) if rounded.is_zero() else rounded


def _display_name(db: Session, user_id: uuid.UUID) -> str:
    members = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user_id)
        .order_by(HouseholdMember.created_at, HouseholdMember.id)
        .all()
    )
    if not members:
        return ""
    member = next(
        (candidate for candidate in members if candidate.relationship == Relationship.SELF),
        members[0],
    )
    return member.name.split()[0].title() if member.name.split() else ""


def _envelope(ctx: ScopeContext, inputs: HomeInputs, now_ist: datetime) -> dict:
    return {
        "scope": ctx.scope,
        "member_id": None if ctx.member_id is None else str(ctx.member_id),
        "nav_as_of": inputs.nav_as_of,
        "partial": inputs.partial,
        "missing_funds": list(inputs.missing_funds),
        "computed_at": now_ist.astimezone(timezone.utc),
    }


def valued_amounts_by_scheme(holdings) -> dict[str, Decimal]:
    """Per-scheme sum of the per-row quantized current values (rows repeat per member/plan).

    The single source of Home's total: `_total_value` and the news weight_pct both use it.
    """
    amounts: dict[str, Decimal] = {}
    for row in holdings:
        if row.nav_unavailable or row.current_value is None:
            continue
        amounts[row.scheme_id] = amounts.get(row.scheme_id, Decimal("0.00")) + quantize_amount(
            Decimal(row.current_value)
        )
    return amounts


def _total_value(inputs: HomeInputs) -> Decimal:
    return sum(valued_amounts_by_scheme(inputs.holdings).values(), Decimal("0.00"))


async def _inputs(
    db: Session,
    ctx: ScopeContext,
    now_ist: datetime,
    *,
    nav_start: date | None = None,
    view: MoverView = "sector",
) -> HomeInputs:
    return await load_home_inputs(
        db,
        ctx,
        now_ist.date(),
        nav_start=nav_start or now_ist.date() - timedelta(days=15),
        view=view,
    )


async def _summary(db: Session, user: User, member_id: uuid.UUID | None, now_ist: datetime):
    ctx = resolve_scope(db, user, member_id)
    inputs = await _inputs(db, ctx, now_ist)
    summary = build_summary(
        display_name=_display_name(db, user.id),
        now_ist=now_ist,
        scope=ctx.scope,
        member_name=ctx.member_name,
        movers=inputs.movers,
        members_connected=load_members_connected(db, ctx.member_ids),
        members_total=len(ctx.members) if ctx.scope == "aggregate" else 1,
    )
    return SummaryResponse(
        **_envelope(ctx, inputs, now_ist),
        **summary.__dict__,
        has_holdings=bool(inputs.holdings),
        total_value=_total_value(inputs),
        members=list(ctx.members),
    )


def _mover_bars(inputs: HomeInputs, bars) -> list[MoverBarOut]:
    funds = {fund.scheme_id: fund for fund in inputs.movers.funds}
    output = []
    for bar in bars:
        scheme_ids = bar.scheme_ids
        if inputs.movers.view == "fund" and not scheme_ids:
            try:
                scheme_ids = (uuid.UUID(bar.key),)
            except ValueError:
                scheme_ids = ()
        output.append(MoverBarOut(
            key=bar.key,
            label=bar.label,
            change=bar.change,
            funds=[
                MoverFundOut(
                    scheme_id=str(scheme_id),
                    name=funds[scheme_id].name,
                    change=None if inputs.movers.view == "sector" else funds[scheme_id].change,
                )
                for scheme_id in scheme_ids if scheme_id in funds
            ],
        ))
    return output


async def _movers(
    db: Session, user: User, member_id: uuid.UUID | None, now_ist: datetime, by: MoverView
):
    ctx = resolve_scope(db, user, member_id)
    inputs = await _inputs(db, ctx, now_ist, view=by)
    movers = inputs.movers
    return MoversResponse(
        **_envelope(ctx, inputs, now_ist),
        requested_view=movers.requested_view,
        view=movers.view,
        fell_back=movers.fell_back,
        estimated=movers.estimated,
        coverage_pct=movers.coverage_pct,
        net_change=movers.net_change,
        net_pct=movers.net_pct,
        previous_value=_money(movers.previous_value),
        previous_nav_date=movers.previous_nav_date,
        gains=_mover_bars(inputs, movers.result.gains),
        losses=_mover_bars(inputs, movers.result.losses),
        others_count=movers.result.others_count,
        others_change=movers.result.others_change,
    )


async def _allocation(db: Session, user: User, member_id: uuid.UUID | None, now_ist: datetime):
    ctx = resolve_scope(db, user, member_id)
    inputs = await _inputs(db, ctx, now_ist)
    allocation = await load_allocation(
        db,
        user.id,
        scope=ctx.scope,
        household_member_ids=ctx.member_ids,
        members=[(uuid.UUID(member.id), member.name) for member in ctx.members]
        if ctx.scope == "aggregate" else [],
    )
    return AllocationResponse(
        **_envelope(ctx, inputs, now_ist),
        source=allocation.source,
        approximate=allocation.approximate,
        total_value=_money(allocation.total_value),
        classes=[ClassRowOut(**row.__dict__) for row in allocation.classes],
        covered_pct=allocation.covered_pct,
        mix_as_of=allocation.mix_as_of,
        members=None if allocation.members is None else [
            {"id": str(row.member_id), "name": row.name, "value": row.value,
             "percentage": row.percentage}
            for row in allocation.members
        ],
    )


async def _worth(db: Session, user: User, member_id: uuid.UUID | None, now_ist: datetime):
    ctx = resolve_scope(db, user, member_id)
    inputs = await _inputs(db, ctx, now_ist)
    facts = load_worth_facts(
        db, user.id, scope=ctx.scope, household_member_ids=ctx.member_ids,
        holdings=inputs.holdings,
    )
    cards = build_worth_cards(facts.funds, facts.concentration)
    if cards:
        state = "cards"
    elif not inputs.holdings or set(facts.unavailable) == set(STORED_SECTION_NAMES):
        state = "unavailable"
    else:
        state = "nothing_flagged"
    return WorthResponse(
        **_envelope(ctx, inputs, now_ist),
        cards=[WorthCardOut(
            kind=card.kind,
            rank=card.rank,
            scheme_id=None if card.scheme_id is None else str(card.scheme_id),
            scheme_name=card.scheme_name,
            evidence=dict(card.evidence),
        ) for card in cards],
        unavailable=list(facts.unavailable),
        state=state,
    )


async def _benchmarks(db: Session, user: User, member_id: uuid.UUID | None, now_ist: datetime):
    ctx = resolve_scope(db, user, member_id)
    inputs = await _inputs(db, ctx, now_ist)
    recommendation = recommend_benchmark(load_cap_mix(
        db, user.id, scope=ctx.scope, household_member_ids=ctx.member_ids
    ))
    return BenchmarksResponse(
        **_envelope(ctx, inputs, now_ist),
        options=[BenchmarkOptionOut(
            index=option.index.value,
            label=option.label,
            recommended=option.index == recommendation.index,
        ) for option in HOME_BENCHMARKS],
        recommended_index=recommendation.index.value,
        reason=recommendation.reason,
    )


async def _wealth(
    db: Session,
    user: User,
    member_id: uuid.UUID | None,
    now_ist: datetime,
    period: Period,
    date_from: date | None,
    date_to: date | None,
    benchmark: HomeBenchmark | None,
):
    custom = None
    if period == "custom":
        if date_from is None or date_to is None:
            raise HTTPException(status_code=422, detail="custom dates are required")
        custom = (date_from, date_to)
    ctx = resolve_scope(db, user, member_id)
    if period == "custom":
        # Read prices from the clamped start, never from a raw date that may be centuries back (review F7).
        today = now_ist.date()
        floor = date(today.year - MAX_CUSTOM_YEARS, today.month, min(today.day, 28)) - timedelta(days=15)
        nav_start = max(date_from, floor)
    elif period == "1Y":
        nav_start = now_ist.date() - timedelta(days=373)
    elif period == "1M":
        nav_start = now_ist.date() - timedelta(days=38)
    else:
        nav_start = now_ist.date() - timedelta(days=15)
    try:
        inputs = await _inputs(db, ctx, now_ist, nav_start=nav_start)
        wealth = build_wealth_series(
            db,
            ctx,
            inputs,
            today=now_ist.date(),
            period=period,
            custom=custom,
            benchmark=None if benchmark is None else BenchmarkIndex(benchmark),
        )
    except (ValueError, OverflowError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    benchmark_out = None
    if wealth.benchmark is not None:
        label = next(option.label for option in HOME_BENCHMARKS if option.index == wealth.benchmark.index)
        benchmark_out = BenchmarkSeriesOut(
            index=wealth.benchmark.index.value,
            label=label,
            available=wealth.benchmark.available,
            pct=wealth.benchmark.pct,
            effective_start=wealth.benchmark.effective_start,
            clipped=wealth.benchmark.clipped,
            points=[BenchmarkPointOut(date=day, pct=pct) for day, pct in wealth.benchmark.points],
        )
    return WealthSeriesResponse(
        **_envelope(ctx, inputs, now_ist),
        period=wealth.period,
        start=wealth.start,
        end=wealth.end,
        clamped=wealth.clamped,
        empty=wealth.empty,
        points=[PointOut(date=point.date, value=point.value) for point in wealth.points],
        start_value=wealth.start_value,
        end_value=wealth.end_value,
        net_contributions=wealth.net_contributions,
        change_amount=wealth.change_amount,
        change_pct=wealth.change_pct,
        change_method=wealth.change_method,
        benchmark=benchmark_out,
    )


@router.get("/household/aggregate/home/summary", response_model=SummaryResponse)
async def aggregate_summary(user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _summary(db, user, None, now)


@router.get("/household-members/{member_id}/home/summary", response_model=SummaryResponse)
async def member_summary(member_id: uuid.UUID, user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _summary(db, user, member_id, now)


@router.get("/household/aggregate/home/wealth-series", response_model=WealthSeriesResponse)
async def aggregate_wealth(period: Period = "1M", date_from: date | None = Query(None, alias="from"), date_to: date | None = Query(None, alias="to"), benchmark: HomeBenchmark | None = None, user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _wealth(db, user, None, now, period, date_from, date_to, benchmark)


@router.get("/household-members/{member_id}/home/wealth-series", response_model=WealthSeriesResponse)
async def member_wealth(member_id: uuid.UUID, period: Period = "1M", date_from: date | None = Query(None, alias="from"), date_to: date | None = Query(None, alias="to"), benchmark: HomeBenchmark | None = None, user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _wealth(db, user, member_id, now, period, date_from, date_to, benchmark)


@router.get("/household/aggregate/home/allocation", response_model=AllocationResponse)
async def aggregate_allocation(user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _allocation(db, user, None, now)


@router.get("/household-members/{member_id}/home/allocation", response_model=AllocationResponse)
async def member_allocation(member_id: uuid.UUID, user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _allocation(db, user, member_id, now)


@router.get("/household/aggregate/home/movers", response_model=MoversResponse)
async def aggregate_movers(by: MoverView = "sector", user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _movers(db, user, None, now, by)


@router.get("/household-members/{member_id}/home/movers", response_model=MoversResponse)
async def member_movers(member_id: uuid.UUID, by: MoverView = "sector", user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _movers(db, user, member_id, now, by)


@router.get("/household/aggregate/home/worth-a-look", response_model=WorthResponse)
async def aggregate_worth(user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _worth(db, user, None, now)


@router.get("/household-members/{member_id}/home/worth-a-look", response_model=WorthResponse)
async def member_worth(member_id: uuid.UUID, user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _worth(db, user, member_id, now)


@router.get("/household/aggregate/home/benchmarks", response_model=BenchmarksResponse)
async def aggregate_benchmarks(user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _benchmarks(db, user, None, now)


@router.get("/household-members/{member_id}/home/benchmarks", response_model=BenchmarksResponse)
async def member_benchmarks(member_id: uuid.UUID, user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _benchmarks(db, user, member_id, now)
