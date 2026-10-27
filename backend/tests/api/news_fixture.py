"""T7: wraps tests/api/home_fixture.py's Home fixture for the news routes.

Renames the generic "Home Test AMC" and "Top Stock 1..5" fixture data to
real-sounding names so the actual `load_dictionaries`/`tag_title` matching
machinery (T4) produces genuine entity tags against GDELT-style headlines,
instead of a test asserting against a mocked match.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.db.session import get_db
from app.models.analytics import AnalyticsSection
from app.models.news import JobRun, NewsItem
from app.models.reference import Scheme, StockMaster
from app.services.news.normalise import load_dictionaries, tag_title
from tests.api.home_fixture import HomeFixtureRuntime, build_home_fixture

NEWS_NAMESPACE = uuid.UUID("c6f3f8f0-8f2b-5a9b-9a8e-2a7a5b0a7a6b")

# isin (from home_fixture's "Top Stock {n}") -> (real name, real sector_raw)
STOCK_NAMES: dict[str, tuple[str, str]] = {
    "INE00000001": ("HDFC Bank", "Banking"),
    "INE00000002": ("Reliance Industries", "Oil and Gas"),
    "INE00000003": ("Infosys", "Information Technology"),
    "INE00000004": ("Tata Motors", "Automobile"),
    "INE00000005": ("Sun Pharmaceutical Industries", "Pharmaceuticals"),
}
AMC_NAME = "HDFC Mutual Fund"


def news_id(name: str) -> uuid.UUID:
    return uuid.uuid5(NEWS_NAMESPACE, name)


def _rename_fixture_entities(db) -> None:
    for scheme in db.query(Scheme).all():
        scheme.amc_name = AMC_NAME
    for stock in db.query(StockMaster).all():
        mapped = STOCK_NAMES.get(stock.isin)
        if mapped:
            stock.name, stock.sector = mapped
    for section in db.query(AnalyticsSection).filter(AnalyticsSection.section == "stock_holdings").all():
        rows = section.payload.get("rows", [])
        for row in rows:
            mapped = STOCK_NAMES.get(row.get("isin"))
            if mapped:
                row["instrument_name"], row["sector_raw"] = mapped
        section.payload = {**section.payload, "rows": rows}
    db.commit()


_SAME_AS_INGESTED = object()


def set_news_job_run(db, last_success_at: datetime | None) -> None:
    """Set (or clear, with None) the refresh_news last-success row the route reads."""
    db.query(JobRun).filter_by(job_name="refresh_news").delete()
    if last_success_at is not None:
        db.add(JobRun(job_name="refresh_news", last_success_at=last_success_at))
    db.commit()


def seed_news_items(db, articles: list[dict], *, ingested_at: datetime, job_run_at=_SAME_AS_INGESTED) -> None:
    """Each article dict needs source/title/published_at (and optionally url,
    ingested_at). Tags are produced by the real tag_title pipeline, not
    asserted by hand, so a test exercises genuine matching end to end."""
    dictionaries = load_dictionaries(db)
    for article in articles:
        tags = tag_title(article["title"], dictionaries)
        tier = min((tag.tier for tag in tags), default=7)
        db.add(NewsItem(
            id=news_id(article["title"]),
            source=article["source"],
            title=article["title"],
            url=article.get("url", f"https://example.com/{news_id(article['title'])}"),
            published_at=article["published_at"],
            ingested_at=article.get("ingested_at", ingested_at),
            language="en",
            entity_tags=[tag.as_json() for tag in tags],
            tier=tier,
        ))
    db.commit()
    # The route's feed_as_of is the last successful refresh_news run, not an item's
    # ingested_at. By default a seeded batch counts as a run at that same instant;
    # pass job_run_at=None for "never ran" or another time to decouple them.
    set_news_job_run(db, ingested_at if job_run_at is _SAME_AS_INGESTED else job_run_at)


def build_news_fixture(
    *, variant: str = "base", now: datetime | None = None, fund_count: int = 4
) -> HomeFixtureRuntime:
    from tests.api.home_fixture import FIXED_NOW

    runtime = build_home_fixture(variant=variant, now=now or FIXED_NOW, fund_count=fund_count)
    db = next(runtime.client.app.dependency_overrides[get_db]())
    _rename_fixture_entities(db)
    return runtime


def set_coverage(db, covered_value_pct: str) -> None:
    """D4's coverage<50% lookthrough-chip gate needs a stock_holdings section
    below the base fixture's fixed 100.00% -- override it after the fixture
    is built rather than adding another home_fixture.py variant."""
    section = db.query(AnalyticsSection).filter(AnalyticsSection.section == "stock_holdings").one()
    section.payload = {**section.payload, "coverage": {"covered_value_pct": covered_value_pct}}
    db.commit()
