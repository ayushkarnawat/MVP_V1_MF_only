"""Static configuration for the Home News backend.

T3 (this file's first content): site allow-lists and source display names
(D9/L18). T4 (this pass): tagging dictionaries -- SEBI category table,
sector buckets, gold/silver and rates/macro phrase lists, the group-name
and ambiguous-alias guards, and the icon lookup. T5 adds the watch-list
thresholds (`MIN_SIZE_PCT`, `TOP_N`), starting values only, not locked
until the owner's calibration reply (section 9 of the handoff).
"""

from __future__ import annotations

from dataclasses import dataclass

# D9: Indian business sites, unrestricted except economictimes.indiatimes.com
# (see ETIMES_ALLOWED_PATH_PREFIXES below -- that domain is only in scope for
# its /markets and /mf sections, not general news).
INDIAN_SITES: tuple[str, ...] = (
    "moneycontrol.com",
    "livemint.com",
    "business-standard.com",
    "thehindubusinessline.com",
    "economictimes.indiatimes.com",
)

# L18: foreign-name sources only, for the "global" origin (tagged against
# SchemeHolding equity_international names in T4, not against Indian stocks).
GLOBAL_SITES: tuple[str, ...] = (
    "reuters.com",
    "bloomberg.com",
    "cnbc.com",
    "marketwatch.com",
)

ETIMES_DOMAIN = "economictimes.indiatimes.com"
ETIMES_ALLOWED_PATH_PREFIXES: tuple[str, ...] = ("/markets", "/mf")

# Shown as NewsItemOut.source / stored as news_items.source -- a reader-
# facing name, not the raw domain.
SOURCE_DISPLAY_NAMES: dict[str, str] = {
    "moneycontrol.com": "Moneycontrol",
    "livemint.com": "Mint",
    "business-standard.com": "Business Standard",
    "thehindubusinessline.com": "The Hindu BusinessLine",
    "economictimes.indiatimes.com": "The Economic Times",
    "reuters.com": "Reuters",
    "bloomberg.com": "Bloomberg",
    "cnbc.com": "CNBC",
    "marketwatch.com": "MarketWatch",
}

# ---------------------------------------------------------------------------
# T4: fund-category table
# ---------------------------------------------------------------------------
# One CategoryDef per SEBI/AMFI category (the canonical ~40 names are in
# tests/fixtures/news/sebi_categories.json). `aliases` are the phrases a
# headline is scanned for; `unambiguous` means the alias alone (without a
# nearby FUND_CONTEXT_WORDS hit) is specific enough to tag -- e.g. "ELSS" is
# never used to mean anything else, but "value fund" needs "fund"/"nfo"/etc.
# nearby since "value" alone is everyday English.


@dataclass(frozen=True)
class CategoryDef:
    key: str
    label: str
    sebi_names: tuple[str, ...]
    aliases: tuple[str, ...]
    unambiguous: bool = False


CATEGORY_TABLE: tuple[CategoryDef, ...] = (
    CategoryDef("large_cap", "Large Cap Fund", ("Large Cap Fund",), ("large cap fund", "large cap funds")),
    CategoryDef("large_mid_cap", "Large & Mid Cap Fund", ("Large & Mid Cap Fund",), ("large & mid cap fund", "large and mid cap fund")),
    CategoryDef("mid_cap", "Mid Cap Fund", ("Mid Cap Fund",), ("mid cap fund", "mid cap funds")),
    CategoryDef("small_cap", "Small Cap Fund", ("Small Cap Fund",), ("small cap fund", "small cap funds")),
    CategoryDef("multi_cap", "Multi Cap Fund", ("Multi Cap Fund",), ("multi cap fund", "multi cap funds")),
    CategoryDef("flexi_cap", "Flexi Cap Fund", ("Flexi Cap Fund",), ("flexi cap fund", "flexi cap funds")),
    CategoryDef("focused", "Focused Fund", ("Focused Fund",), ("focused fund",)),
    CategoryDef("dividend_yield", "Dividend Yield Fund", ("Dividend Yield Fund",), ("dividend yield fund",)),
    CategoryDef("value", "Value Fund", ("Value Fund",), ("value fund",)),
    CategoryDef("contra", "Contra Fund", ("Contra Fund",), ("contra fund",), unambiguous=True),
    CategoryDef("sectoral_thematic", "Sectoral/Thematic Fund", ("Sectoral/Thematic Fund",), ("sectoral fund", "thematic fund")),
    CategoryDef("elss", "ELSS", ("ELSS",), ("elss", "tax saving fund", "tax saver fund"), unambiguous=True),
    CategoryDef("overnight", "Overnight Fund", ("Overnight Fund",), ("overnight fund",)),
    CategoryDef("liquid", "Liquid Fund", ("Liquid Fund",), ("liquid fund", "liquid funds")),
    CategoryDef("ultra_short_duration", "Ultra Short Duration Fund", ("Ultra Short Duration Fund",), ("ultra short duration fund",)),
    CategoryDef("low_duration", "Low Duration Fund", ("Low Duration Fund",), ("low duration fund",)),
    CategoryDef("money_market", "Money Market Fund", ("Money Market Fund",), ("money market fund",)),
    CategoryDef("short_duration", "Short Duration Fund", ("Short Duration Fund",), ("short duration fund",)),
    CategoryDef("medium_duration", "Medium Duration Fund", ("Medium Duration Fund",), ("medium duration fund",)),
    CategoryDef("medium_to_long_duration", "Medium to Long Duration Fund", ("Medium to Long Duration Fund",), ("medium to long duration fund",)),
    CategoryDef("long_duration", "Long Duration Fund", ("Long Duration Fund",), ("long duration fund",)),
    CategoryDef("dynamic_bond", "Dynamic Bond Fund", ("Dynamic Bond Fund",), ("dynamic bond fund",)),
    CategoryDef("corporate_bond", "Corporate Bond Fund", ("Corporate Bond Fund",), ("corporate bond fund",)),
    CategoryDef("credit_risk", "Credit Risk Fund", ("Credit Risk Fund",), ("credit risk fund",)),
    CategoryDef("banking_psu", "Banking and PSU Fund", ("Banking and PSU Fund",), ("banking and psu fund", "banking & psu fund")),
    CategoryDef("gilt", "Gilt Fund", ("Gilt Fund",), ("gilt fund",), unambiguous=True),
    CategoryDef("gilt_constant_duration", "Gilt Fund with 10 year constant duration", ("Gilt Fund with 10 year constant duration",), ("gilt fund with 10 year constant duration",), unambiguous=True),
    CategoryDef("floater", "Floater Fund", ("Floater Fund",), ("floater fund",)),
    CategoryDef("conservative_hybrid", "Conservative Hybrid Fund", ("Conservative Hybrid Fund",), ("conservative hybrid fund",)),
    CategoryDef("balanced_hybrid", "Balanced Hybrid Fund", ("Balanced Hybrid Fund",), ("balanced hybrid fund",)),
    CategoryDef("aggressive_hybrid", "Aggressive Hybrid Fund", ("Aggressive Hybrid Fund",), ("aggressive hybrid fund",)),
    CategoryDef("balanced_advantage", "Dynamic Asset Allocation or Balanced Advantage Fund", ("Dynamic Asset Allocation or Balanced Advantage Fund",), ("balanced advantage fund", "dynamic asset allocation fund"), unambiguous=True),
    CategoryDef("multi_asset_allocation", "Multi Asset Allocation Fund", ("Multi Asset Allocation Fund",), ("multi asset allocation fund",)),
    CategoryDef("arbitrage", "Arbitrage Fund", ("Arbitrage Fund",), ("arbitrage fund",), unambiguous=True),
    CategoryDef("equity_savings", "Equity Savings Fund", ("Equity Savings Fund",), ("equity savings fund",)),
    CategoryDef("retirement", "Retirement Fund", ("Retirement Fund",), ("retirement fund",)),
    CategoryDef("childrens", "Children's Fund", ("Children's Fund",), ("children's fund", "childrens fund")),
    CategoryDef("index_etf", "Index Funds/ETFs", ("Index Funds/ETFs",), ("index fund", "index etf"), unambiguous=True),
    CategoryDef("fof_overseas", "Fund of Funds (Overseas)", ("Fund of Funds (Overseas)",), ("overseas fund of funds",)),
    CategoryDef("fof_domestic", "Fund of Funds (Domestic)", ("Fund of Funds (Domestic)",), ("domestic fund of funds",)),
    # Gold ETF / Silver ETF are deliberately absent -- they map to the
    # gold_silver asset class (GOLD_SILVER_POSITIVE_PHRASES below), not to a
    # fund_category tag. sector_key()/category_key() must still accept their
    # SEBI names and return None rather than raising (test requirement 4).
)

SEBI_CATEGORY_KEYS: dict[str, str | None] = {
    name: cat.key for cat in CATEGORY_TABLE for name in cat.sebi_names
}
SEBI_CATEGORY_KEYS["Gold ETF"] = None  # explicit non-category, see note above
SEBI_CATEGORY_KEYS["Silver ETF"] = None

CATEGORY_LABELS: dict[str, str] = {cat.key: cat.label for cat in CATEGORY_TABLE}

# alias -> (category key, unambiguous)
CATEGORY_ALIASES: dict[str, tuple[str, bool]] = {
    alias: (cat.key, cat.unambiguous) for cat in CATEGORY_TABLE for alias in cat.aliases
}

# A headline needs one of these nearby before an ambiguous category/fund
# house alias counts (e.g. "HDFC" alone is a bank, a group, a colour of
# nothing in particular -- "HDFC Mutual Fund" or "HDFC NFO" is specific).
FUND_CONTEXT_WORDS: tuple[str, ...] = (
    "mutual fund", "amc", "asset management", "fund house", "nfo", "mf",
    "scheme", "fund", "funds",
)

# ---------------------------------------------------------------------------
# T4: sector buckets
# ---------------------------------------------------------------------------
# sector_key() maps a StockMaster.sector / load_sector_weights raw label
# (an NSE "Industry" string, free text) to one of these 8 icon-aligned
# buckets, or None if the raw label doesn't fit one (e.g. "Other", or a
# niche industry we don't carry a Home icon for). SECTOR_PHRASES is the
# separate, headline-side trigger list used by tag_title -- real NSE
# labels ("Financial Services") rarely appear verbatim in headlines, which
# say "bank shares" or "IT stocks" instead.
SECTOR_LABELS: dict[str, str] = {
    "banks_financials": "Banking and Financial Services",
    "it_tech": "IT",
    "pharma_health": "Pharma and Healthcare",
    "auto_ev": "Auto",
    "consumer_fmcg": "FMCG",
    "energy": "Energy",
    "metals_mining": "Metals and Mining",
    "realty_infra": "Realty and Infrastructure",
}

SECTOR_KEY_BY_RAW: dict[str, str] = {
    "financial services": "banks_financials",
    "banking": "banks_financials",
    "banks": "banks_financials",
    "information technology": "it_tech",
    "it": "it_tech",
    "healthcare": "pharma_health",
    "health care": "pharma_health",
    "pharmaceuticals": "pharma_health",
    "automobile and auto components": "auto_ev",
    "automobile": "auto_ev",
    "auto components": "auto_ev",
    "fast moving consumer goods": "consumer_fmcg",
    "fmcg": "consumer_fmcg",
    "oil gas and consumable fuels": "energy",
    "oil and gas": "energy",
    "power": "energy",
    "metals and mining": "metals_mining",
    "realty": "realty_infra",
    "construction": "realty_infra",
    "infrastructure": "realty_infra",
}

SECTOR_PHRASES: dict[str, tuple[str, ...]] = {
    "banks_financials": ("bank shares", "banking stocks", "bank stocks", "financial services sector", "nbfc", "psu banks", "private banks", "banking sector"),
    "it_tech": ("it stocks", "it sector", "tech stocks", "software stocks", "it shares", "software exporters"),
    "pharma_health": ("pharma stocks", "pharma sector", "healthcare stocks", "drug makers", "pharmaceutical companies", "hospital stocks"),
    "auto_ev": ("auto stocks", "auto sector", "car makers", "two wheeler sales", "ev makers", "auto shares"),
    "consumer_fmcg": ("fmcg stocks", "fmcg sector", "consumer goods companies", "fmcg shares"),
    "energy": ("oil and gas stocks", "energy stocks", "power stocks", "oil marketing companies", "energy sector"),
    "metals_mining": ("metal stocks", "mining stocks", "steel stocks", "metals sector", "metal shares"),
    "realty_infra": ("realty stocks", "realty sector", "infrastructure stocks", "construction stocks", "realty shares"),
}

# ---------------------------------------------------------------------------
# T4: gold/silver asset class
# ---------------------------------------------------------------------------
# Bare "gold"/"silver" would false-positive on "golden jubilee", "silver
# lining" etc. -- require a specific market phrase. The negative phrases
# are common non-market idioms that happen to contain "gold"/"silver" but
# never co-occur with a real positive phrase in practice, so a headline
# matching only a negative phrase is skipped outright.
GOLD_SILVER_POSITIVE_PHRASES: tuple[str, ...] = (
    "gold price", "gold prices", "gold rate", "gold rates", "gold etf",
    "gold etfs", "sovereign gold bond", "gold bond", "gold demand",
    "gold imports", "gold reserves", "silver price", "silver prices",
    "silver rate", "silver rates", "silver etf", "silver etfs",
    "silver demand", "silver imports", "bullion",
)
GOLD_SILVER_NEGATIVE_PHRASES: tuple[str, ...] = (
    "gold medal", "silver medal", "gold standard",
)

# ---------------------------------------------------------------------------
# T4: rates/macro
# ---------------------------------------------------------------------------
# Deliberately no bare "rate" entry -- "run rate", "strike rate", "growth
# rate" would all false-positive. Every phrase below names the specific
# rate-setting/macro event, so no negative-phrase list is needed here
# (unlike gold/silver).
RATES_POSITIVE_PHRASES: tuple[str, ...] = (
    "repo rate", "rbi policy", "monetary policy committee", "mpc meeting",
    "interest rate", "interest rates", "inflation data", "cpi inflation",
    "wpi inflation", "rbi governor", "bond yields", "yield curve",
    "rate cut", "rate hike", "policy rate",
)

# ---------------------------------------------------------------------------
# T4: general (tier 7) -- Sensex/Nifty, SEBI/AMFI, GDP/budget
# ---------------------------------------------------------------------------
# key -> trigger phrases; the key also drives the icon (markets for the
# index names, regulation for the regulator names, general for the two
# broad macro words that don't fit either).
GENERAL_PHRASES_BY_KEY: dict[str, tuple[str, ...]] = {
    "sensex": ("sensex",),
    "nifty": ("nifty",),
    "sebi": ("sebi",),
    "amfi": ("amfi",),
    "gdp": ("gdp",),
    "budget": ("union budget", "budget 2027", "budget session", "budget day"),
}
GENERAL_ICON_BY_KEY: dict[str, str] = {
    "sensex": "markets", "nifty": "markets",
    "sebi": "regulation", "amfi": "regulation",
    "gdp": "general", "budget": "general",
}

# Icon for every tag kind that doesn't need a per-key lookup (general uses
# GENERAL_ICON_BY_KEY above, sector tags use their own key as the icon, and
# stock tags use the held stock's sector icon, falling back to "markets").
ICON_FOR: dict[str, str] = {
    "fund_house": "funds_amc",
    "fund_category": "funds_amc",
    "asset_class": "gold_silver",
    "rates_macro": "rates_rbi",
}

# ---------------------------------------------------------------------------
# T4: stock-alias guards
# ---------------------------------------------------------------------------
# These bare group/conglomerate words never tag a stock by themselves --
# too ambiguous (Tata Group alone is 100+ listed and unlisted companies).
# Multi-word aliases built from the same companies ("Tata Motors", "HDFC
# Bank", "Bajaj Finance") are unaffected; this only filters an alias that,
# after stripping legal/corporate filler, reduces to exactly one bare word.
GROUP_NAMES_NOT_STOCKS: frozenset[str] = frozenset({
    "tata", "adani", "birla", "hdfc", "bajaj", "reliance",
})

# Below this length a stock alias is too short to trust from the company
# name alone (collides with everyday words); these are the known-safe
# exceptions actually used this way in Indian financial press. "sbi" is
# deliberately NOT here: it is a fund-house alias only (SBI Mutual Fund),
# gated on FUND_CONTEXT_WORDS -- the bank's own stock alias is the
# two-word "State Bank Of India" name or its "SBIN" symbol, never bare
# "sbi", so a bare "SBI Mutual Fund" headline can't double-tag the stock.
SHORT_ALIAS_ALLOW: frozenset[str] = frozenset({"itc", "ongc", "dlf"})

# A handful of single-word stock aliases that also mean something else in
# everyday headlines -- require one of the generic ambiguity-context words
# below, or one of the alias's own product words, before tagging.
AMBIGUOUS_ALIASES: dict[str, tuple[str, ...]] = {
    "titan": ("watches", "jewellery", "jewelry"),
    "trent": ("retail", "westside", "zudio"),
    "eternal": ("zomato", "food delivery", "blinkit"),
    "jio": ("telecom", "reliance jio", "5g", "jiomart"),
}
AMBIGUITY_CONTEXT_WORDS: frozenset[str] = frozenset({
    "shares", "share", "stock", "stocks", "q1", "q2", "q3", "q4", "results",
    "sensex", "nifty", "nse", "bse", "earnings", "profit", "revenue",
})
