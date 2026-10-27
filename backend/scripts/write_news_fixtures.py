"""T7: writes tests/fixtures/news/*.json from live route responses, mirroring
write_home_fixtures.py's write_fixture_set(destination, write=True) shape.
Each named fixture needs its own seed (articles, coverage override, kill
switch), so this is a dict of builder functions rather than a single
declarative spec list.
"""

from __future__ import annotations

import json
import sys
from datetime import timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.db.session import get_db
from tests.api.home_fixture import FIXED_NOW
from tests.api.news_fixture import build_news_fixture, seed_news_items, set_coverage

# NewsItem's DateTime(timezone=True) round-trips tz-aware values on SQLite as
# naive wall-clock strings (verified empirically); seeding from FIXED_NOW
# (IST) directly would silently shift every timestamp by the IST offset once
# read back. Seed from the UTC instant instead.
NOW_UTC = FIXED_NOW.astimezone(timezone.utc)


def _db(runtime):
    return next(runtime.client.app.dependency_overrides[get_db]())


_SPECIFIC_ARTICLES = [
    {"source": "Moneycontrol", "title": "HDFC Bank shares rally after strong quarterly results",
     "published_at": NOW_UTC - timedelta(hours=2)},
    {"source": "Mint", "title": "HDFC Mutual Fund AUM crosses record high as fund house expands",
     "published_at": NOW_UTC - timedelta(hours=4)},
    {"source": "The Economic Times", "title": "Gold prices hit a new all-time high amid global uncertainty",
     "published_at": NOW_UTC - timedelta(hours=6)},
]


def _news_specific_three():
    runtime = build_news_fixture()
    seed_news_items(_db(runtime), _SPECIFIC_ARTICLES, ingested_at=NOW_UTC - timedelta(hours=1))
    return runtime, "/household/aggregate/home/news"


def _news_member_debt():
    runtime = build_news_fixture()
    seed_news_items(_db(runtime), [
        {"source": "Mint", "title": "RBI holds repo rate steady amid inflation concerns",
         "published_at": NOW_UTC - timedelta(hours=5)},
        {"source": "Moneycontrol", "title": "Gold prices rally to fresh highs on safe-haven demand",
         "published_at": NOW_UTC - timedelta(hours=1)},
        {"source": "The Economic Times", "title": "Sensex ends higher on strong earnings",
         "published_at": NOW_UTC - timedelta(hours=30)},
    ], ingested_at=NOW_UTC - timedelta(hours=1))
    return runtime, f"/household-members/{runtime.household.dev_id}/home/news"


def _news_general_only():
    runtime = build_news_fixture(variant="empty")
    seed_news_items(_db(runtime), [
        {"source": "Mint", "title": "Sensex ends flat amid mixed global cues",
         "published_at": NOW_UTC - timedelta(hours=1)},
        {"source": "Moneycontrol", "title": "Nifty closes marginally lower in a volatile session",
         "published_at": NOW_UTC - timedelta(hours=3)},
        {"source": "The Economic Times", "title": "SEBI proposes new disclosure norms for mutual funds",
         "published_at": NOW_UTC - timedelta(hours=5)},
    ], ingested_at=NOW_UTC - timedelta(hours=1))
    return runtime, "/household/aggregate/home/news"


def _news_low_coverage():
    runtime = build_news_fixture()
    set_coverage(_db(runtime), "40.00")
    seed_news_items(_db(runtime), _SPECIFIC_ARTICLES, ingested_at=NOW_UTC - timedelta(hours=1))
    return runtime, "/household/aggregate/home/news"


def _news_stale():
    runtime = build_news_fixture()
    old = NOW_UTC - timedelta(hours=37)
    seed_news_items(_db(runtime), [
        {"source": "Mint", "title": "Sensex ends higher on strong earnings", "published_at": old},
    ], ingested_at=old)
    return runtime, "/household/aggregate/home/news"


def _news_hidden():
    runtime = build_news_fixture()
    old = NOW_UTC - timedelta(hours=80)
    seed_news_items(_db(runtime), [
        {"source": "Mint", "title": "Sensex ends higher on strong earnings", "published_at": old},
    ], ingested_at=old)
    return runtime, "/household/aggregate/home/news"


def _news_disabled():
    runtime = build_news_fixture()
    seed_news_items(_db(runtime), [
        {"source": "Mint", "title": "HDFC Bank shares rally after strong quarterly results",
         "published_at": NOW_UTC - timedelta(hours=2)},
    ], ingested_at=NOW_UTC - timedelta(hours=1))
    settings.news_enabled = False
    return runtime, "/household/aggregate/home/news"


def _news_empty():
    return build_news_fixture(), "/household/aggregate/home/news"


BUILDERS = {
    "news_specific_three.json": _news_specific_three,
    "news_member_debt.json": _news_member_debt,
    "news_general_only.json": _news_general_only,
    "news_low_coverage.json": _news_low_coverage,
    "news_stale.json": _news_stale,
    "news_hidden.json": _news_hidden,
    "news_disabled.json": _news_disabled,
    "news_empty.json": _news_empty,
}


def write_fixture_set(destination: Path, *, write: bool = True) -> dict[str, dict]:
    if write:
        destination.mkdir(parents=True, exist_ok=True)
    written: dict[str, dict] = {}
    previous_enabled = settings.news_enabled
    previous_disabled_sources = settings.news_disabled_sources
    try:
        for filename, builder in BUILDERS.items():
            settings.news_enabled = True
            settings.news_disabled_sources = ""
            runtime, path = builder()
            try:
                response = runtime.client.get(path)
                if response.status_code != 200:
                    raise RuntimeError(f"{path}: {response.status_code} {response.text}")
                payload = response.json()
                if write:
                    fixture_path = destination / filename
                    rendered = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
                    if not fixture_path.exists() or fixture_path.read_text(encoding="utf-8") != rendered:
                        fixture_path.write_text(rendered, encoding="utf-8", newline="\n")
                written[filename] = payload
            finally:
                runtime.close()
    finally:
        settings.news_enabled = previous_enabled
        settings.news_disabled_sources = previous_disabled_sources
    return written


def main() -> None:
    destination = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "news"
    write_fixture_set(destination)
    print(f"wrote {len(BUILDERS)} news fixtures to {destination}")


if __name__ == "__main__":
    main()
