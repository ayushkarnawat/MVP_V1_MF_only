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
    ("TAKE", "TAKE", "Information Technology", "INTEST0023"),
    ("STAR", "STAR", "Healthcare", "INTEST0024"),
    ("STANLEY", "STANLEY", "Consumer Durables", "INTEST0025"),
    ("YATRA", "YATRA", "Consumer Services", "INTEST0026"),
    ("BAJEL", "BAJEL", "Capital Goods", "INTEST0027"),
    ("Urban Company Limited", "URBANCO", "Consumer Services", "INTEST0028"),
    ("FSN E-Commerce Ventures Limited", "NYKAA", "Consumer Services", "INTEST0029"),
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


def test_category_key_c137_tolerates_dash_glued_descriptors_and_plural_fund_names():
    # C137: real AMC `sebi_category` strings found via s25.db calibration that the
    # pre-fix fold/key logic resolved to None. Axis glues a plain-English descriptor
    # onto the real category name with a bare "-" (no space before it); UTI uses the
    # plural "Funds" where the bare SEBI name says "Index Funds/ETFs".
    assert category_key("Equity Schemes - ELSS- Tax Saver Fund") == "elss"
    assert category_key("Other Scheme - Index Funds") == "index_etf"


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


def test_plain_word_nse_symbols_do_not_become_stock_tags(db_session):
    for isin, name, symbol in (
        ("INTEST0201", "Oil India Limited", "OIL"),
        ("INTEST0202", "BSE Limited", "BSE"),
        ("INTEST0203", "Sun Pharmaceutical Industries Limited", "SUN"),
        ("INTEST0204", "Vodafone Idea Limited", "IDEA"),
    ):
        db_session.add(StockMaster(isin=isin, name=name, sector="Services", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol=symbol))
    db_session.commit()
    dicts = load_dictionaries(db_session)
    # Length rule: 3-letter symbols that are plain words are not aliases at all.
    assert "oil" not in dicts.stocks and "bse" not in dicts.stocks and "sun" not in dicts.stocks
    # A 4+ letter plain word needs stock/market context, like ambiguous name aliases.
    assert not [t for t in tag_title("An idea whose time has come for savers", dicts) if t.kind == "stock"]
    assert not [t for t in tag_title("Oil prices slip as the sun sets on the BSE lawn", dicts) if t.kind == "stock"]
    tagged = tag_title("Idea shares jump after the AGR relief", dicts)
    assert [t.key for t in tagged if t.kind == "stock"] == ["INTEST0204"]

# ---------------------------------------------------------------------------
# (11) symbol-only aliases (an NSE symbol that is not also part of the name)
# match only as an ALL-CAPS token, never as an everyday lower-case word
# ---------------------------------------------------------------------------

SYMBOL_ONLY_ROWS = [
    ("Take Solutions Limited", "TAKE", "INTEST0301"),
    ("Strides Pharma Science Limited", "STAR", "INTEST0302"),
    ("Stanley Lifestyles Limited", "STANLEY", "INTEST0303"),
    ("Yatra Online Limited", "YATRA", "INTEST0304"),
    ("Bajel Projects Limited", "BAJEL", "INTEST0305"),
]


@pytest.fixture()
def symbol_dictionaries(db_session) -> Dictionaries:
    for name, symbol, isin in SYMBOL_ONLY_ROWS:
        db_session.add(StockMaster(isin=isin, name=name, sector="Services", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol=symbol))
    db_session.commit()
    return load_dictionaries(db_session)


def _stock_keys(title, dicts):
    return [t.key for t in tag_title(title, dicts) if t.kind == "stock"]


@pytest.mark.parametrize("title", [
    "Microsoft techie who topped performance ratings says he'll take VEP, but won't work till his exit",
    "Egypt parliament backs Sisi to take 'all necessary measures' to support Saudi Arabia against Houthis",
    "Shaan pays tribute to Michael Jackson in Dubai, fans call him 'pop star'",
    "Digi Yatra international passenger trials to go live at seven airports from Nov 1",
    "Experts take a view on the stock rally after shares surge",
])
def test_lowercase_symbol_word_never_tags_a_stock(symbol_dictionaries, title):
    assert _stock_keys(title, symbol_dictionaries) == []


def test_bajel_headline_tags_only_bajel_not_take(symbol_dictionaries):
    title = "Bajel Projects shares surge over 12% - What's behind the stock rally? Can it rise further? Experts take"
    assert _stock_keys(title, symbol_dictionaries) == ["INTEST0305"]


def test_all_caps_symbol_still_tags(symbol_dictionaries):
    assert _stock_keys("TAKE Solutions wins a new contract", symbol_dictionaries) == ["INTEST0301"]
    assert _stock_keys("Brokerages upgrade YATRA after strong bookings", symbol_dictionaries) == ["INTEST0304"]


# ---------------------------------------------------------------------------
# (12) a one-word alias left over after dropping "Company"/"Corporation" from
# the name ("Urban Company Limited" -> "urban") is a common word: it needs
# stock context, or the company's full name
# ---------------------------------------------------------------------------

@pytest.fixture()
def urban_dictionaries(db_session) -> Dictionaries:
    db_session.add(StockMaster(isin="INTEST0310", name="Urban Company Limited", sector="Consumer Services", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol="URBANCO"))
    db_session.add(StockMaster(isin="INTEST0311", name="Cipla Limited", sector="Healthcare", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol="CIPLA"))
    db_session.commit()
    return load_dictionaries(db_session)


@pytest.mark.parametrize("title", [
    "Delhi vs Bihar: Delhi workers spend nearly three times more than urban Bihar commuters",
    "Urban planners call for more cycling lanes in the city centre",
])
def test_company_stripped_one_word_alias_needs_context(urban_dictionaries, title):
    assert _stock_keys(title, urban_dictionaries) == []


@pytest.mark.parametrize("title", [
    "Urban Company shares rise 5% as Morgan Stanley sees up to 40% upside",
    "Urban Company launches a new home services category",
    "Urban stock jumps after strong Q2 results",
])
def test_company_stripped_alias_tags_with_context_or_full_name(urban_dictionaries, title):
    assert _stock_keys(title, urban_dictionaries) == ["INTEST0310"]


def test_legal_suffix_only_names_are_unaffected(urban_dictionaries):
    assert _stock_keys("Cipla launches a new inhaler in the US market", urban_dictionaries) == ["INTEST0311"]


# ---------------------------------------------------------------------------
# (13) symbol-only aliases, three-way case test on the token as written:
# ALL-CAPS always tags, Capitalised tags only with stock/market context,
# lower case never tags
# ---------------------------------------------------------------------------

@pytest.fixture()
def brand_dictionaries(db_session) -> Dictionaries:
    db_session.add(StockMaster(isin="INTEST0320", name="FSN E-Commerce Ventures Limited", sector="Consumer Services", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol="NYKAA"))
    db_session.add(StockMaster(isin="INTEST0321", name="Take Solutions Limited", sector="Information Technology", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol="TAKE"))
    db_session.add(StockMaster(isin="INTEST0322", name="Tata Consultancy Services Limited", sector="Information Technology", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol="TCSX"))
    db_session.commit()
    return load_dictionaries(db_session)


@pytest.mark.parametrize("title", [
    "Nykaa shares jump 5% after Q2 results",
    "NYKAA stock rallies on festive demand",
    "Nykaa's stock hits a record high",
])
def test_capitalised_brand_symbol_tags_with_context_and_caps_always(brand_dictionaries, title):
    assert _stock_keys(title, brand_dictionaries) == ["INTEST0320"]


@pytest.mark.parametrize("title", [
    "Nykaa opens a new store in Pune",  # Capitalised, no stock context
    "I bought a nykaa lipstick",  # lower case, never
    "Experts take a view on the stock rally after shares surge",  # lower case, even with context
])
def test_capitalised_without_context_or_lowercase_never_tags(brand_dictionaries, title):
    assert _stock_keys(title, brand_dictionaries) == []


@pytest.mark.parametrize("title", [
    "TCSX's order book swells",
    "TCSX-led rally lifts the Nifty",
])
def test_all_caps_symbol_survives_possessive_and_hyphen(brand_dictionaries, title):
    assert _stock_keys(title, brand_dictionaries) == ["INTEST0322"]


def test_capitalised_symbol_after_a_proper_name_word_with_context_still_tags_for_brands(db_session):
    # Brand (symbol-only) class keeps no proper-name guard; only ticker-style
    # names get it (see section 14).
    db_session.add(StockMaster(isin="INTEST0330", name="Stanley Lifestyles Limited", sector="Consumer Durables", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol="STANLEY"))
    db_session.commit()
    dicts = load_dictionaries(db_session)
    assert _stock_keys("Morgan Stanley sees upside in Urban shares", dicts) == ["INTEST0330"]


# ---------------------------------------------------------------------------
# (14) ticker-style names: on staging many stock_master rows carry the ticker
# itself as the NAME ('TAKE', 'STAR', 'YATRA'), so name == symbol and it is
# an ordinary name alias. A one-word ALL-CAPS name follows the same three-way
# case rule as a symbol-only alias, plus a proper-name guard: a Capitalised
# match right after another Capitalised word ("Morgan Stanley", "Digi
# Yatra") is part of a larger name and is skipped.
# ---------------------------------------------------------------------------

TICKER_ROWS = [
    ("TAKE", "INTEST0401"),
    ("STAR", "INTEST0402"),
    ("STANLEY", "INTEST0403"),
    ("YATRA", "INTEST0404"),
    ("BAJEL", "INTEST0405"),
]


@pytest.fixture()
def ticker_dictionaries(db_session) -> Dictionaries:
    for name, isin in TICKER_ROWS:
        db_session.add(StockMaster(isin=isin, name=name, sector="Services", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol=name))
    db_session.add(StockMaster(isin="INTEST0410", name="Urban Company Ltd.", sector="Consumer Services", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol="URBANCO"))
    db_session.add(StockMaster(isin="INTEST0411", name="FSN E-Commerce Ventures Limited", sector="Consumer Services", as_of_date=date(2026, 10, 1), source="NSE", nse_symbol="NYKAA"))
    db_session.commit()
    return load_dictionaries(db_session)


@pytest.mark.parametrize("title", [
    "Microsoft techie who topped performance ratings says he'll take VEP, but won't work till his exit",
    "Egypt parliament backs Sisi to take 'all necessary measures' to support Saudi Arabia against Houthis",
    "Shaan pays tribute to Michael Jackson in Dubai, fans call him 'pop star'",
    "Digi Yatra international passenger trials to go live at seven airports from Nov 1",
    "Sensex Today | Stock Market LIVE Updates: Morgan Stanley sees Nifty at 28,000 by December",
    "Experts take a view on the stock rally after shares surge",
])
def test_ticker_style_names_do_not_tag_everyday_or_proper_name_words(ticker_dictionaries, title):
    assert _stock_keys(title, ticker_dictionaries) == []


def test_ticker_style_name_headline_with_bajel_and_trailing_take(ticker_dictionaries):
    title = "Bajel Projects shares surge over 12% - What's behind the stock rally? Can it rise further? Experts take"
    assert _stock_keys(title, ticker_dictionaries) == ["INTEST0405"]


def test_morgan_stanley_with_stock_context_no_longer_tags_stanley(ticker_dictionaries):
    # Was an accepted limitation for symbol-only aliases; the proper-name guard closes it.
    title = "Urban Company shares rise 5% as Morgan Stanley sees up to 40% upside"
    assert _stock_keys(title, ticker_dictionaries) == ["INTEST0410"]


@pytest.mark.parametrize("title, expected", [
    ("YATRA shares rally on strong bookings", ["INTEST0404"]),  # ALL-CAPS always tags
    ("Yatra shares rally on strong bookings", ["INTEST0404"]),  # starts the headline
    ("Brokerages like Yatra stock after Q2 results", ["INTEST0404"]),  # after a lowercase word
    ("Analysts upbeat: Stanley shares gain", ["INTEST0403"]),  # after punctuation, not a name
    ("Nykaa shares jump 5% after Q2 results", ["INTEST0411"]),  # brand symbol-only: no guard
    ("Brokerages Add Nykaa on strong earnings", ["INTEST0411"]),  # guard not applied to brands
])
def test_ticker_style_names_still_tag_when_written_as_a_ticker(ticker_dictionaries, title, expected):
    assert _stock_keys(title, ticker_dictionaries) == expected
