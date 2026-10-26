"""T4: tag_title and friends. Precision/recall are measured against
tests/fixtures/news/labelled_headlines.json (150 self-written headlines,
originals -- never copied from a real outlet) using a small, self-written
stock/AMC/foreign-holding universe seeded into an in-memory DB."""

from __future__ import annotations

import json
import time
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from app.models.enums import AssetType, DisclosureBatchStatus
from app.models.news import NewsItem
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding, StockMaster
from app.services.news.ingest import RawArticle
from app.services.news.normalise import (
    Dictionaries,
    category_key,
    fund_house_key,
    icon_for,
    load_dictionaries,
    normalise_title,
    sector_key,
    store_items,
    tag_title,
)

UTC = timezone.utc
FIXTURES = Path(__file__).parents[2] / "fixtures/news"

# name, symbol, sector raw label, isin
STOCK_ROWS = [
    ("HDFC Bank Limited", "HDFCBANK", "Financial Services", "INTEST0001"),
    ("Reliance Industries Limited", "RELIANCE", "Oil Gas & Consumable Fuels", "INTEST0002"),
    ("Tata Motors Limited", "TATAMOTORS", "Automobile and Auto Components", "INTEST0003"),
    ("Tata Steel Limited", "TATASTEEL", "Metals & Mining", "INTEST0004"),
    ("Infosys Limited", "INFY", "Information Technology", "INTEST0005"),
    ("Tata Consultancy Services Limited", "TCS", "Information Technology", "INTEST0006"),
    ("ITC Limited", "ITC", "Fast Moving Consumer Goods", "INTEST0007"),
    ("Oil And Natural Gas Corporation Limited", "ONGC", "Oil Gas & Consumable Fuels", "INTEST0008"),
    ("State Bank Of India", "SBIN", "Financial Services", "INTEST0009"),
    ("NTPC Limited", "NTPC", "Power", "INTEST0010"),
    ("Titan Company Limited", "TITAN", "Consumer Durables", "INTEST0011"),
    ("Trent Limited", "TRENT", "Consumer Services", "INTEST0012"),
    ("Eternal Limited", "ETERNAL", "Consumer Services", "INTEST0013"),
    ("Jio Limited", "JIOTEST", "Telecommunication", "INTEST0014"),
    ("Adani Enterprises Limited", "ADANIENT", "Diversified", "INTEST0015"),
    ("Birla Corporation Limited", "BIRLACORPN", "Construction", "INTEST0016"),
    ("Bajaj Finance Limited", "BAJFINANCE", "Financial Services", "INTEST0017"),
    ("Sun Pharmaceutical Industries Limited", "SUNPHARMA", "Healthcare", "INTEST0018"),
    ("Hindustan Unilever Limited", "HINDUNILVR", "Fast Moving Consumer Goods", "INTEST0019"),
    ("Maruti Suzuki India Limited", "MARUTI", "Automobile and Auto Components", "INTEST0020"),
    ("DLF Limited", "DLF", "Realty", "INTEST0021"),
    ("Apollo Hospitals Enterprise Limited", "APOLLOHOSP", "Healthcare", "INTEST0022"),
]

AMC_NAMES = [
    "HDFC Asset Management Company Limited",
    "ICICI Prudential Asset Management Company Limited",
    "SBI Asset Management Company Limited",
    "Axis Asset Management Company Limited",
    "Kotak Mahindra Asset Management Company Limited",
    "Nippon India Asset Management Company Limited",
    "Aditya Birla Sun Life Asset Management Company Limited",
    "UTI Asset Management Company Limited",
    "Mirae Asset Asset Management Company Limited",
    "Edelweiss Asset Management Company Limited",
]

FOREIGN_NAMES = [
    "Apple Inc", "Microsoft Corp", "Amazon.com Inc", "Alphabet Inc Class A",
    "Meta Platforms Inc", "NVIDIA Corp", "Tesla Inc",
    "Taiwan Semiconductor Manufacturing Co Ltd", "Samsung Electronics Co Ltd",
    "Visa Inc", "Mastercard Inc", "Johnson & Johnson", "Nestle SA",
    "ASML Holding NV",
]


def _seed(db_session) -> None:
    for name, symbol, sector, isin in STOCK_ROWS:
        db_session.add(StockMaster(isin=isin, name=name, sector=sector, as_of_date=date(2026, 10, 1), source="NSE", nse_symbol=symbol))
    for i, amc_name in enumerate(AMC_NAMES):
        db_session.add(Scheme(name=f"{amc_name} Growth Plan {i}", amc_name=amc_name, sebi_category="Flexi Cap Fund"))
    scheme = Scheme(name="Global Opportunities Fund", amc_name="Edelweiss Asset Management Company Limited", sebi_category="Fund of Funds (Overseas)")
    db_session.add(scheme)
    db_session.flush()
    batch = DisclosureBatch(scheme_id=scheme.id, as_of_date=date(2026, 9, 30), amc_name=scheme.amc_name, status=DisclosureBatchStatus.WRITTEN)
    db_session.add(batch)
    db_session.flush()
    for value, name in enumerate(reversed(FOREIGN_NAMES), start=1):
        db_session.add(SchemeHolding(
            batch_id=batch.id, instrument_name=name, asset_type=AssetType.EQUITY_INTERNATIONAL,
            market_value=value * 1000, pct_to_nav=1,
        ))
    db_session.commit()


@pytest.fixture()
def dictionaries(db_session) -> Dictionaries:
    _seed(db_session)
    return load_dictionaries(db_session)


# ---------------------------------------------------------------------------
# (1) normalise_title
# ---------------------------------------------------------------------------

def test_normalise_title_lowercases_ampersand_and_punctuation():
    assert normalise_title("HDFC Bank & Co.  reports   Q2 profit!") == "hdfc bank and co reports q2 profit"


def test_normalise_title_collapses_whitespace_and_strips_ends():
    assert normalise_title("  Gold   Prices\tRise  ") == "gold prices rise"


# ---------------------------------------------------------------------------
# (2) stock tag: ISIN as key, symbol only when the column is set
# ---------------------------------------------------------------------------

def test_stock_tag_uses_isin_as_key(dictionaries):
    tags = tag_title("HDFC Bank reports an 11 percent jump in quarterly net profit", dictionaries)
    stock_tags = [t for t in tags if t.kind == "stock"]
    assert stock_tags == [stock_tags[0]]
    assert stock_tags[0].key == "INTEST0001"
    assert stock_tags[0].tier == 1


def test_stock_tag_matches_by_symbol(dictionaries):
    tags = tag_title("ONGC discovers a new natural gas field off the eastern coast", dictionaries)
    assert any(t.kind == "stock" and t.key == "INTEST0008" for t in tags)


def test_symbol_alias_absent_when_nse_symbol_is_null(db_session):
    db_session.add(StockMaster(isin="INTEST0099", name="No Symbol Company Limited", sector="Services", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol=None))
    db_session.commit()
    dicts = load_dictionaries(db_session)
    assert "no symbol" in dicts.stocks  # name-derived alias still present
    assert all(isin != "INTEST0099" or alias == "no symbol" for alias, (isin, _label) in dicts.stocks.items())


# ---------------------------------------------------------------------------
# (3) fund house needs a fund context
# ---------------------------------------------------------------------------

def test_fund_house_requires_fund_context(dictionaries):
    with_context = tag_title("HDFC Mutual Fund launches a new flexi cap NFO this week", dictionaries)
    assert any(t.kind == "fund_house" and t.key == "hdfc" for t in with_context)

    without_context = tag_title("HDFC stands for a concept explained in the economics textbook", dictionaries)
    assert not any(t.kind == "fund_house" for t in without_context)
    assert not any(t.kind == "stock" for t in without_context)  # bare "HDFC" never a stock either


# ---------------------------------------------------------------------------
# (4) category_key is exhaustive over sebi_categories.json
# ---------------------------------------------------------------------------

def test_category_key_handles_every_sebi_category_without_raising():
    names = json.loads((FIXTURES / "sebi_categories.json").read_text())
    assert len(names) >= 35
    for name in names:
        category_key(name)  # must not raise
    assert category_key("Large Cap Fund") == "large_cap"
    assert category_key("ELSS") == "elss"
    assert category_key("Gold ETF") is None
    assert category_key("Not A Real Category") is None


def test_category_key_also_accepts_the_stored_amfi_canonical_form():
    # Scheme.sebi_category is stored AMFI-canonical ("<Type> Scheme - <Name>", via
    # canonical_category()), not the bare SEBI name a headline uses -- T5's watch list
    # calls category_key() on held funds directly, so both forms must resolve the same key.
    assert category_key("Equity Scheme - Large Cap Fund") == "large_cap"
    assert category_key("Debt Scheme - Short Duration Fund") == "short_duration"
    assert category_key("Equity Scheme - ELSS") == "elss"
    assert category_key("Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage") == "balanced_advantage"
    assert category_key("Hybrid Scheme - Equity Savings") == "equity_savings"
    assert category_key("Hybrid Scheme - Multi Asset Allocation") == "multi_asset_allocation"
    assert category_key("Equity Scheme - Sectoral/ Thematic") == "sectoral_thematic"
    assert category_key("Gold ETF") is None
    assert category_key("Other Scheme - Fund of Funds (Overseas)") == "fof_overseas"
    assert category_key("Other Scheme - Some Unmapped Niche Category") is None  # no raise


# ---------------------------------------------------------------------------
# (5) gold/silver: bare mention is not enough, a negative phrase cancels it
# ---------------------------------------------------------------------------

def test_gold_silver_requires_a_specific_market_phrase(dictionaries):
    assert any(t.kind == "asset_class" and t.key == "gold_silver" for t in tag_title("Gold prices hit a fresh record high", dictionaries))
    assert not any(t.kind == "asset_class" for t in tag_title("The town celebrated its golden jubilee with a festival", dictionaries))
    assert not any(t.kind == "asset_class" for t in tag_title("The veteran actor won a gold medal at the state meet", dictionaries))


# ---------------------------------------------------------------------------
# (6) rates/macro: no bare "rate"
# ---------------------------------------------------------------------------

def test_rates_macro_ignores_bare_rate_words(dictionaries):
    assert any(t.kind == "rates_macro" for t in tag_title("The RBI kept the repo rate unchanged at its policy review", dictionaries))
    assert not any(t.kind == "rates_macro" for t in tag_title("The bowler's economy and run rate were both impressive today", dictionaries))
    assert not any(t.kind == "rates_macro" for t in tag_title("The sprinter's strike rate improved after months of training", dictionaries))


# ---------------------------------------------------------------------------
# (7) general tags carry no label, and icon_for splits markets/regulation/general
# ---------------------------------------------------------------------------

def test_general_tag_has_no_label_and_icon_splits_by_key(dictionaries):
    sensex_tags = [t for t in tag_title("Sensex climbed over four hundred points in early trade", dictionaries) if t.kind == "general"]
    assert sensex_tags and sensex_tags[0].label is None
    assert icon_for(sensex_tags[0]) == "markets"

    sebi_tags = [t for t in tag_title("SEBI tightened disclosure norms for listed companies", dictionaries) if t.kind == "general"]
    assert icon_for(sebi_tags[0]) == "regulation"

    gdp_tags = [t for t in tag_title("India's GDP growth for the quarter beat expectations", dictionaries) if t.kind == "general"]
    assert icon_for(gdp_tags[0]) == "general"


def test_stock_and_general_tag_together_min_tier_is_one(dictionaries):
    title = "Sensex gains as HDFC Bank shares jump 3 percent on strong earnings"
    tags = tag_title(title, dictionaries)
    kinds = {t.kind for t in tags}
    assert "stock" in kinds and "general" in kinds
    assert min(t.tier for t in tags) == 1


# ---------------------------------------------------------------------------
# (8) foreign stock tag
# ---------------------------------------------------------------------------

def test_foreign_stock_tag_is_marked_foreign(dictionaries):
    tags = tag_title("Apple Inc unveiled its latest lineup of devices at a flagship event", dictionaries)
    foreign_tags = [t for t in tags if t.kind == "stock" and t.foreign]
    assert foreign_tags
    assert foreign_tags[0].label == "Apple Inc"


def test_foreign_dictionary_capped_at_300_distinct_by_market_value(db_session):
    scheme = Scheme(name="Overseas Fund", amc_name="Edelweiss Asset Management Company Limited", sebi_category="Fund of Funds (Overseas)")
    db_session.add(scheme)
    db_session.flush()
    batch = DisclosureBatch(scheme_id=scheme.id, as_of_date=date(2026, 9, 30), amc_name=scheme.amc_name)
    db_session.add(batch)
    db_session.flush()
    for i in range(320):
        db_session.add(SchemeHolding(
            batch_id=batch.id, instrument_name=f"Foreign Holding Number {i}",
            asset_type=AssetType.EQUITY_INTERNATIONAL, market_value=320 - i, pct_to_nav=1,
        ))
    db_session.commit()
    dicts = load_dictionaries(db_session)
    assert len(dicts.foreign) == 300
    assert "foreign holding number 0" in dicts.foreign  # highest market_value, kept
    assert "foreign holding number 319" not in dicts.foreign  # lowest, trimmed


# ---------------------------------------------------------------------------
# (9) group names never tag a stock alone; ambiguous aliases need context
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("title", [
    "Tata spoke warmly about her grandchildren during the interview",
    "Reliance on imported components has slowed the local workshop",
    "Adani described the weather as unusually humid this week",
    "Birla Corporation delivered the keynote address at the university convocation",
])
def test_bare_group_names_never_tag_a_stock(dictionaries, title):
    assert not any(t.kind == "stock" for t in tag_title(title, dictionaries))


def test_ambiguous_alias_needs_context_to_tag_a_stock(dictionaries):
    assert any(t.kind == "stock" and t.key == "INTEST0011" for t in tag_title("Titan posts strong festive season jewellery and watches sales", dictionaries))
    assert not any(t.kind == "stock" for t in tag_title("Titan submarine search operation concludes without survivors", dictionaries))


def test_compound_group_company_names_still_tag(dictionaries):
    assert any(t.kind == "stock" and t.key == "INTEST0003" for t in tag_title("Tata Motors domestic sales rise sharply ahead of the festive season", dictionaries))
    assert any(t.kind == "stock" and t.key == "INTEST0015" for t in tag_title("Adani Enterprises lists a new airport infrastructure subsidiary", dictionaries))


# ---------------------------------------------------------------------------
# (10) fund_house_key / sector_key agree between tagger and watch-list use
# ---------------------------------------------------------------------------

def test_fund_house_key_strips_generic_and_legal_words():
    assert fund_house_key("HDFC Asset Management Company Limited") == "hdfc"
    assert fund_house_key("ICICI Prudential Asset Management Company Limited") == "icici_prudential"


def test_sector_key_maps_raw_nse_labels_to_icon_buckets():
    assert sector_key("Financial Services") == "banks_financials"
    assert sector_key("Oil Gas & Consumable Fuels") == "energy"
    assert sector_key("Other") is None
    assert sector_key(None) is None
    assert sector_key("Some Unmapped Niche Industry") is None  # never raises


# ---------------------------------------------------------------------------
# (11) store_items: dedup by URL, global gating, tier = min tag tier
# ---------------------------------------------------------------------------

def _article(url, title, origin="indian", source="Moneycontrol"):
    return RawArticle(url=url, title=title, domain="moneycontrol.com", source=source, published_at=datetime(2026, 10, 23, 8, 0, tzinfo=UTC), origin=origin)


def test_store_items_skips_untagged_indian_article(db_session, dictionaries):
    result = store_items(db_session, [_article("https://x/1", "A regional theatre group staged a sold out revival of a classic play")], dictionaries, datetime.now(UTC))
    assert result.inserted == 0
    assert result.skipped_untagged == 1
    assert db_session.query(NewsItem).count() == 0


def test_store_items_requires_foreign_tag_for_global_origin(db_session, dictionaries):
    tagged_but_not_foreign = _article("https://reuters/1", "Sensex gains as RBI holds the repo rate steady", origin="global", source="Reuters")
    result = store_items(db_session, [tagged_but_not_foreign], dictionaries, datetime.now(UTC))
    assert result.inserted == 0
    assert result.skipped_global_untagged == 1

    with_foreign = _article("https://reuters/2", "Apple Inc unveiled its latest lineup of devices at a flagship event", origin="global", source="Reuters")
    result = store_items(db_session, [with_foreign], dictionaries, datetime.now(UTC))
    assert result.inserted == 1


def test_store_items_dedups_by_url_and_sets_min_tier(db_session, dictionaries):
    article = _article("https://x/dup", "Sensex gains as HDFC Bank shares jump 3 percent on strong earnings")
    now = datetime.now(UTC)
    first = store_items(db_session, [article], dictionaries, now)
    assert first.inserted == 1
    db_session.commit()  # store_items leaves the commit boundary to its caller (job/script)
    stored = db_session.query(NewsItem).filter(NewsItem.url == article.url).one()
    assert stored.tier == 1  # stock tag (tier 1) beats the general Sensex tag (tier 7)

    second = store_items(db_session, [article], dictionaries, now)
    assert second.inserted == 0
    assert second.skipped_existing == 1
    assert db_session.query(NewsItem).count() == 1


# ---------------------------------------------------------------------------
# (12) speed: a realistic alias table against many titles stays fast
# ---------------------------------------------------------------------------

def test_tag_title_speed_at_scale(dictionaries):
    big_stocks = dict(dictionaries.stocks)
    for i in range(2000):
        big_stocks[f"synthetic company number {i}"] = (f"SYN{i:04d}", f"Synthetic Company Number {i}")
    big_dictionaries = Dictionaries(stocks=big_stocks, fund_houses=dictionaries.fund_houses, foreign=dictionaries.foreign)

    labelled = json.loads((FIXTURES / "labelled_headlines.json").read_text())
    titles = [row["title"] for row in labelled] * 35  # 150 * 35 = 5250 titles

    started = time.perf_counter()
    for title in titles:
        tag_title(title, big_dictionaries)
    elapsed = time.perf_counter() - started
    assert elapsed < 5.0, f"tag_title took {elapsed:.2f}s for {len(titles)} titles (budget 5s)"


# ---------------------------------------------------------------------------
# (13) precision/recall on the labelled set
# ---------------------------------------------------------------------------

_TOPIC_BY_KIND = {
    "stock": "stock", "fund_house": "fund_house", "fund_category": "fund_category",
    "asset_class": "gold_silver", "sector": "sector", "rates_macro": "rates",
    "general": "general",
}


def test_labelled_headline_precision_and_recall_bars(dictionaries):
    labelled = json.loads((FIXTURES / "labelled_headlines.json").read_text())

    overall_tp = overall_fp = overall_fn = 0
    by_topic: dict[str, list[int]] = {}  # topic -> [tp, fp, fn]

    for row in labelled:
        expected = {(kind, key) for kind, key in row["expected"]}
        actual_tags = tag_title(row["title"], dictionaries)
        actual = {(t.kind, t.key) for t in actual_tags}

        tp = expected & actual
        fp = actual - expected
        fn = expected - actual

        overall_tp += len(tp)
        overall_fp += len(fp)
        overall_fn += len(fn)

        for kind, key in expected | actual:
            topic = _TOPIC_BY_KIND.get(kind, kind)
            bucket = by_topic.setdefault(topic, [0, 0, 0])
            if (kind, key) in tp:
                bucket[0] += 1
            elif (kind, key) in fp:
                bucket[1] += 1
            elif (kind, key) in fn:
                bucket[2] += 1

    precision = overall_tp / (overall_tp + overall_fp) if (overall_tp + overall_fp) else 1.0
    recall = overall_tp / (overall_tp + overall_fn) if (overall_tp + overall_fn) else 1.0
    assert precision >= 0.95, f"overall precision {precision:.3f} (bar 0.95); fp={overall_fp}"
    assert recall >= 0.80, f"overall recall {recall:.3f} (bar 0.80); fn={overall_fn}"

    for topic in ("gold_silver", "rates", "sector"):
        tp, fp, fn = by_topic.get(topic, [0, 0, 0])
        topic_precision = tp / (tp + fp) if (tp + fp) else 1.0
        assert topic_precision >= 0.95, f"{topic} precision {topic_precision:.3f} (bar 0.95); fp={fp}"

    tp, fp, fn = by_topic.get("fund_category", [0, 0, 0])
    topic_precision = tp / (tp + fp) if (tp + fp) else 1.0
    assert topic_precision >= 0.95, f"fund_category precision {topic_precision:.3f} (bar 0.95); fp={fp}"
