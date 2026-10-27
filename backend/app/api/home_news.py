"""T7: GET .../home/news (section 5/11 of the handoff).

Flow: resolve_scope -> compute_holdings (stored only, for the envelope) ->
[kill switch check] -> load_allocation -> load_fresh_sections(stock_holdings)
-> build_watchlist -> one aggregate + one windowed query against NewsItem ->
select_items -> map to response models. All of D4 (ranking/minimums/coverage
gating) and D5/D6 (ladder/majority override) already live in match.py/
score.py; this module is plumbing, not new ranking logic.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.home import get_now_ist
from app.config import settings
from app.db.session import get_db
from app.models.news import JobRun, NewsItem
from app.models.user import User
from app.services.auth.session import get_active_user
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.schemas import HoldingRow
from app.services.home.allocation import load_allocation
from app.services.home.context import ScopeContext, resolve_scope
from app.services.home.schemas import MissingFund
from app.services.home.stored import load_fresh_sections, scope_key_for
from app.services.news import copy
from app.services.news.config import SOURCE_DISPLAY_NAMES
from app.services.news.match import WatchEntity, WatchList, build_watchlist
from app.services.news.normalise import EntityTag, icon_for, normalise_title, sector_key
from app.services.news.schemas import NewsFundOut, NewsItemOut, NewsResponse, NewsTextsOut
from app.services.news.score import NewsRow, Selected, select_items

router = APIRouter(tags=["home"])

_STALE_AFTER = timedelta(hours=36)
_HIDDEN_AFTER = timedelta(hours=72)
_ITEM_WINDOW = timedelta(hours=72)
_TIER_BY_KIND = {
    "stock": 1, "fund_category": 2, "fund_house": 3,
    "asset_class": 4, "sector": 5, "rates_macro": 6, "general": 7,
}

_TEXTS = NewsTextsOut(
    title=copy.TITLE, subtext=copy.SUBTEXT, disclaimer=copy.DISCLAIMER,
    about_credit_text=copy.ABOUT_CREDIT_TEXT, about_credit_url=copy.ABOUT_CREDIT_URL,
)


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _disabled_source_names() -> set[str]:
    domains = {d.strip().lower() for d in settings.news_disabled_sources.split(",") if d.strip()}
    return {SOURCE_DISPLAY_NAMES[d] for d in domains if d in SOURCE_DISPLAY_NAMES}


def _envelope(ctx: ScopeContext, holdings: Sequence[HoldingRow], now_utc: datetime) -> dict:
    valued_dates = [
        row.current_nav_date for row in holdings
        if not row.nav_unavailable and row.current_nav_date is not None
    ]
    missing_by_id = {row.scheme_id: row.scheme_name for row in holdings if row.nav_unavailable}
    missing = sorted(
        (MissingFund(scheme_id=scheme_id, name=name) for scheme_id, name in missing_by_id.items()),
        key=lambda item: (item.name, item.scheme_id),
    )
    return {
        "scope": ctx.scope,
        "member_id": None if ctx.member_id is None else str(ctx.member_id),
        "nav_as_of": max(valued_dates) if valued_dates else None,
        "partial": bool(missing),
        "missing_funds": missing,
        "computed_at": now_utc,
    }


def _stock_row_key(row: Mapping) -> str:
    isin = row.get("isin")
    name = row.get("instrument_name", "")
    if row.get("asset_type") == "equity_international":
        return normalise_title(name)
    return isin or f"name:{normalise_title(name)}"


def _find_stock_row(entity_key: str, stock_rows: Sequence[Mapping]) -> Mapping | None:
    return next((row for row in stock_rows if _stock_row_key(row) == entity_key), None)


def _holding_values(holdings: Sequence[HoldingRow]) -> dict[str, Decimal]:
    return {
        row.scheme_id: Decimal(row.current_value)
        for row in holdings if not row.nav_unavailable and row.current_value is not None
    }


def _weight_pct(scheme_id: str, holding_values: Mapping[str, Decimal], total: Decimal) -> Decimal | None:
    value = holding_values.get(scheme_id)
    if value is None or total <= 0:
        return None
    return (value / total * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _funds_out(
    entity: WatchEntity, holding_values: Mapping[str, Decimal], stock_weights: Mapping[str, Decimal] | None,
) -> list[NewsFundOut]:
    def value_for(scheme_id: str) -> Decimal:
        base = holding_values.get(scheme_id, Decimal("0"))
        if stock_weights is None:
            return base
        return base * stock_weights.get(scheme_id, Decimal("0")) / Decimal("100")

    ranked = sorted(entity.funds, key=lambda pair: (-value_for(pair[0]), pair[1]))
    total = sum(holding_values.values(), Decimal("0"))
    return [
        NewsFundOut(scheme_id=scheme_id, name=name, weight_pct=_weight_pct(scheme_id, holding_values, total))
        for scheme_id, name in ranked[:5]
    ]


def _icon_key(entity: WatchEntity | None, row: NewsRow, stock_sector_raw: str | None) -> str:
    if entity is None:
        tag = next((t for t in row.tags if t.kind == "general"), None)
        return icon_for(tag) if tag is not None else "general"
    synthetic = EntityTag(kind=entity.kind, key=entity.key, label=entity.label, tier=_TIER_BY_KIND[entity.kind])
    stock_sector = sector_key(stock_sector_raw) if stock_sector_raw else None
    return icon_for(synthetic, stock_sector_key=stock_sector)


def _to_item_out(
    selection: Selected, watch: WatchList, stock_rows: Sequence[Mapping], holding_values: Mapping[str, Decimal],
) -> NewsItemOut:
    row = selection.row
    entity = selection.entity

    stock_row = _find_stock_row(entity.key, stock_rows) if entity is not None and entity.kind == "stock" else None
    stock_sector_raw = stock_row.get("sector_raw") if stock_row else None
    stock_weights = (
        {f["scheme_id"]: Decimal(str(f["stock_weight_pct"])) for f in stock_row.get("contributing_funds", [])}
        if stock_row else None
    )

    kind = entity.kind if entity is not None else "general"
    entity_label = entity.label if entity is not None else None

    exposure_pct = exposure_text_value = exposure_as_of = None
    if entity is not None and entity.exposure_pct is not None:
        exposure_pct = entity.exposure_pct
        exposure_text_value = copy.exposure_text(
            entity.exposure_pct, chip=entity.chip,
            coverage_pct=watch.coverage_pct, holdings_as_of=watch.holdings_as_of,
        )
        exposure_as_of = watch.holdings_as_of if entity.chip == "lookthrough" else None

    funds = _funds_out(entity, holding_values, stock_weights) if entity is not None else []

    return NewsItemOut(
        id=row.id, kind=kind, tier=_TIER_BY_KIND[kind], specific=selection.specific,
        source=row.source, headline=row.title, url=row.url, published_at=row.published_at,
        icon_key=_icon_key(entity, row, stock_sector_raw), entity_label=entity_label,
        reason=copy.reason_for(kind, entity_label),
        exposure_pct=exposure_pct, exposure_text=exposure_text_value, exposure_as_of=exposure_as_of,
        funds=funds,
    )


async def _news(db: Session, user: User, member_id: uuid.UUID | None, now_ist: datetime) -> NewsResponse:
    ctx = resolve_scope(db, user, member_id)
    holdings = await compute_holdings(db, list(ctx.member_ids), allow_stale_today=True, stored_only=True)
    now_utc = now_ist.astimezone(timezone.utc)
    envelope = _envelope(ctx, holdings, now_utc)

    if not settings.news_enabled:
        return NewsResponse(
            **envelope, enabled=False, state="disabled",
            feed_as_of=None, stale=False, hidden=False, texts=_TEXTS, items=[],
        )

    allocation = await load_allocation(
        db, user.id, scope=ctx.scope, household_member_ids=ctx.member_ids,
        members=[(uuid.UUID(member.id), member.name) for member in ctx.members] if ctx.scope == "aggregate" else [],
    )
    scope_key = scope_key_for(ctx.scope, ctx.member_ids)
    sections = load_fresh_sections(
        db, user.id, scope_key=scope_key, sections=["stock_holdings"], household_member_ids=ctx.member_ids,
    )
    watch = build_watchlist(db, user, ctx, holdings, allocation, sections, today=now_ist.date())

    # Freshness = last SUCCESSFUL refresh_news run, not the newest inserted article: a healthy
    # run that finds only duplicates inserts nothing and must not make the feed look stale.
    feed_as_of_raw = db.query(JobRun.last_success_at).filter(JobRun.job_name == "refresh_news").scalar()
    if feed_as_of_raw is None:
        return NewsResponse(
            **envelope, enabled=True, state="empty",
            feed_as_of=None, stale=False, hidden=False, texts=_TEXTS, items=[],
        )
    feed_as_of = _utc(feed_as_of_raw)
    age = now_utc - feed_as_of
    stale = age > _STALE_AFTER
    if age > _HIDDEN_AFTER:
        return NewsResponse(
            **envelope, enabled=True, state="hidden",
            feed_as_of=feed_as_of, stale=stale, hidden=True, texts=_TEXTS, items=[],
        )

    cutoff = now_utc - _ITEM_WINDOW
    query = db.query(NewsItem).filter(NewsItem.published_at >= cutoff)
    disabled_names = _disabled_source_names()
    if disabled_names:
        query = query.filter(NewsItem.source.notin_(disabled_names))
    rows = [
        NewsRow(
            id=str(item.id), url=item.url, title=item.title, source=item.source,
            published_at=_utc(item.published_at),
            tags=tuple(EntityTag(**tag) for tag in item.entity_tags), tier=item.tier,
        )
        for item in query.all()
    ]
    selected = select_items(rows, watch, now_utc)

    stock_section = sections.get("stock_holdings")
    stock_rows = stock_section.payload.get("rows", []) if stock_section is not None else []
    holding_values = _holding_values(holdings)
    items = [_to_item_out(selection, watch, stock_rows, holding_values) for selection in selected]

    return NewsResponse(
        **envelope, enabled=True, state="items",
        feed_as_of=feed_as_of, stale=stale, hidden=False, texts=_TEXTS, items=items,
    )


@router.get("/household/aggregate/home/news", response_model=NewsResponse)
async def aggregate_news(
    user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist),
) -> NewsResponse:
    return await _news(db, user, None, now)


@router.get("/household-members/{member_id}/home/news", response_model=NewsResponse)
async def member_news(
    member_id: uuid.UUID,
    user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist),
) -> NewsResponse:
    return await _news(db, user, member_id, now)
