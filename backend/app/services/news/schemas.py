"""T7: response contract for GET .../home/news (section 5 of the handoff).
Field names, order and optionality are fixed by the front-end packet; do
not add or reorder fields without updating that contract.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from app.services.home.schemas import Envelope, HomeModel, PlainDecimal
from app.services.news.normalise import Kind

IconKey = Literal[
    "banks_financials", "it_tech", "pharma_health", "auto_ev", "consumer_fmcg",
    "energy", "metals_mining", "realty_infra", "gold_silver", "rates_rbi",
    "funds_amc", "markets", "regulation", "general",
]


class NewsFundOut(HomeModel):
    scheme_id: str
    name: str


class NewsItemOut(HomeModel):
    id: str
    kind: Kind
    tier: int
    specific: bool
    source: str
    headline: str
    url: str
    published_at: datetime
    icon_key: IconKey
    entity_label: str | None
    reason: str
    exposure_pct: PlainDecimal | None
    exposure_text: str | None
    exposure_as_of: date | None
    funds: list[NewsFundOut]


class NewsTextsOut(HomeModel):
    title: str
    subtext: str
    disclaimer: str
    about_credit_text: str
    about_credit_url: str


class NewsResponse(Envelope):
    enabled: bool
    state: Literal["items", "empty", "hidden", "disabled"]
    feed_as_of: datetime | None
    stale: bool
    hidden: bool
    texts: NewsTextsOut
    items: list[NewsItemOut]
