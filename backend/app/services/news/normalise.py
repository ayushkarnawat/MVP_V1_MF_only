"""T4: normalise GDELT titles and tag them against our own data (stocks,
AMCs, SEBI categories, sectors) plus a handful of static market-topic
dictionaries (gold/silver, rates, Sensex/Nifty/SEBI/AMFI/GDP/budget).

`fund_house_key`/`category_key`/`sector_key` are shared with T5's watch-list
builder (`match.py`) so a headline's tag and a holding's own classification
always land on the same key.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import distinct
from sqlalchemy.orm import Session

from app.models.enums import AssetType
from app.models.news import NewsItem
from app.models.reference import Scheme, SchemeHolding, StockMaster
from app.services.news.ingest import RawArticle
from app.services.news.config import (
    AMBIGUITY_CONTEXT_WORDS,
    PLAIN_WORD_SYMBOLS,
    AMBIGUOUS_ALIASES,
    CATEGORY_ALIASES,
    CATEGORY_LABELS,
    FUND_CONTEXT_WORDS,
    GENERAL_ICON_BY_KEY,
    GENERAL_PHRASES_BY_KEY,
    GOLD_SILVER_NEGATIVE_PHRASES,
    GOLD_SILVER_POSITIVE_PHRASES,
    GROUP_NAMES_NOT_STOCKS,
    ICON_FOR,
    RATES_POSITIVE_PHRASES,
    SECTOR_KEY_BY_RAW,
    SECTOR_LABELS,
    SECTOR_PHRASES,
    SEBI_CATEGORY_KEYS,
    SHORT_ALIAS_ALLOW,
)

Kind = Literal["stock", "fund_house", "fund_category", "asset_class", "sector", "rates_macro", "general"]

_FOREIGN_FETCH_LIMIT = 5000
_FOREIGN_DISTINCT_LIMIT = 300

# Only these two filler words are stripped from a company's registered name
# beyond the legal suffix itself -- "Titan Company Limited" -> "Titan",
# "Reliance Industries Limited" stays "Reliance Industries" (the business
# word is what disambiguates sibling group companies, so it is kept).
_STOCK_FILLER_RE = re.compile(r"\b(limited|ltd\.?|company|corporation)\b", re.I)
_COMPANY_WORD_RE = re.compile(r"\b(company|corporation)\b", re.I)
_LEGAL_ONLY_RE = re.compile(r"\b(limited|ltd\.?)\b", re.I)
_AMC_GENERIC_RE = re.compile(
    r"\b(asset management company|asset management|mutual fund|trustee company|investment managers?|amc)\b",
    re.I,
)
_LEGAL_SUFFIX_RE = re.compile(r"\b(private\s+)?(limited|ltd\.?|pvt\.?)\b\.?", re.I)


@dataclass(frozen=True)
class EntityTag:
    kind: Kind
    key: str
    label: str | None
    tier: int
    foreign: bool = False

    def as_json(self) -> dict:
        return {"kind": self.kind, "key": self.key, "label": self.label, "tier": self.tier, "foreign": self.foreign}


def _index_by_first_word(aliases: Iterable[str]) -> dict[str, tuple[str, ...]]:
    """Speeds up tag_title against a large stock/fund-house/foreign alias
    table: instead of scanning every alias for every title (slow at
    thousands of aliases x thousands of titles), only the aliases sharing a
    first word with a word actually in the title are checked."""
    buckets: dict[str, list[str]] = {}
    for alias in aliases:
        buckets.setdefault(alias.split(" ", 1)[0], []).append(alias)
    return {word: tuple(group) for word, group in buckets.items()}


@dataclass(frozen=True)
class Dictionaries:
    stocks: Mapping[str, tuple[str, str]]  # alias -> (isin, display name)
    fund_houses: Mapping[str, str]  # alias -> fund_house_key
    foreign: Mapping[str, str]  # alias -> display name (equity_international holdings)
    # Stock aliases that exist only because of an NSE symbol (not the company
    # name); they match an ALL-CAPS token only -- see tag_title.
    symbol_only: frozenset[str] = frozenset()
    # One-word aliases left after dropping "Company"/"Corporation" from the
    # name ("Urban Company" -> "urban"); a common word, so it needs
    # stock/market context (the full name is indexed as its own alias).
    company_stripped: frozenset[str] = frozenset()

    def __post_init__(self) -> None:
        object.__setattr__(self, "_stock_index", _index_by_first_word(self.stocks))
        object.__setattr__(self, "_fund_house_index", _index_by_first_word(self.fund_houses))
        object.__setattr__(self, "_foreign_index", _index_by_first_word(self.foreign))


def normalise_title(text: str) -> str:
    """NFKC, lower case, '&' to 'and', all other punctuation to spaces,
    whitespace collapsed -- the single normal form every alias/phrase table
    and every title is compared in, so an apostrophe or ampersand in a
    static phrase (e.g. "children's fund", "banking & psu fund") can never
    silently fail to match an already-normalised title."""
    import unicodedata

    text = unicodedata.normalize("NFKC", text).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _contains_word(text: str, phrase: str) -> bool:
    """Word-boundary substring check without regex -- the speed test runs
    this millions of times, and re's internal compiled-pattern cache
    (512 entries) would thrash well before a few thousand aliases."""
    start = 0
    plen = len(phrase)
    tlen = len(text)
    if plen == 0:
        return False
    while True:
        idx = text.find(phrase, start)
        if idx == -1:
            return False
        before_ok = idx == 0 or not text[idx - 1].isalnum()
        end = idx + plen
        after_ok = end == tlen or not text[end].isalnum()
        if before_ok and after_ok:
            return True
        start = idx + 1


def _all_caps_text(title: str) -> str:
    """The title's ALL-CAPS words only, normalised, so a symbol alias can be
    checked against how the headline actually spelt it."""
    return normalise_title(" ".join(w for w in title.split() if w.isupper()))


def _candidates(index: Mapping[str, tuple[str, ...]], words: Sequence[str]) -> set[str]:
    result: set[str] = set()
    for word in words:
        result.update(index.get(word, ()))
    return result


# Static tables are normalised once at import time (not per call/title) --
# see normalise_title's docstring for why this matters correctness-wise,
# and _contains_word's for why it matters perf-wise.
_CATEGORY_ALIASES_NORM: dict[str, tuple[str, bool]] = {
    normalise_title(alias): value for alias, value in CATEGORY_ALIASES.items()
}
_SECTOR_PHRASES_NORM: dict[str, tuple[str, ...]] = {
    key: tuple(normalise_title(p) for p in phrases) for key, phrases in SECTOR_PHRASES.items()
}
_GOLD_SILVER_POSITIVE_NORM = tuple(normalise_title(p) for p in GOLD_SILVER_POSITIVE_PHRASES)
_GOLD_SILVER_NEGATIVE_NORM = tuple(normalise_title(p) for p in GOLD_SILVER_NEGATIVE_PHRASES)
_RATES_POSITIVE_NORM = tuple(normalise_title(p) for p in RATES_POSITIVE_PHRASES)
_GENERAL_PHRASES_NORM: dict[str, tuple[str, ...]] = {
    key: tuple(normalise_title(p) for p in phrases) for key, phrases in GENERAL_PHRASES_BY_KEY.items()
}
_FUND_CONTEXT_WORDS_NORM = tuple(normalise_title(w) for w in FUND_CONTEXT_WORDS)
_AMBIGUOUS_ALIASES_NORM: dict[str, tuple[str, ...]] = {
    normalise_title(k): tuple(normalise_title(w) for w in v) for k, v in AMBIGUOUS_ALIASES.items()
}
_PLAIN_WORD_SYMBOLS_NORM = frozenset(normalise_title(w) for w in PLAIN_WORD_SYMBOLS)
_AMBIGUITY_CONTEXT_NORM = frozenset(normalise_title(w) for w in AMBIGUITY_CONTEXT_WORDS)


def fund_house_key(amc_name: str) -> str:
    alias = _fund_house_alias(amc_name) or normalise_title(amc_name)
    return re.sub(r"\s+", "_", alias).strip("_")


def _fund_house_alias(amc_name: str) -> str | None:
    text = _AMC_GENERIC_RE.sub(" ", amc_name)
    text = _LEGAL_SUFFIX_RE.sub(" ", text)
    text = normalise_title(text)
    return text or None


def _stock_alias(name: str) -> str | None:
    text = _STOCK_FILLER_RE.sub(" ", name)
    text = normalise_title(text)
    if not text:
        return None
    if text in GROUP_NAMES_NOT_STOCKS:
        return None
    if len(text) < 4 and text not in SHORT_ALIAS_ALLOW:
        return None
    return text


def _category_fold(text: str) -> str:
    """Fold a category name so the bare SEBI name used in headlines ("Large
    Cap Fund") and the stored, AMFI-canonicalised `Scheme.sebi_category`
    ("Equity Scheme - Large Cap Fund", via `canonical_category`) land on the
    same string: both are schemes the user actually holds, so T5's watch
    list must resolve a held fund's category to the exact key a headline
    about that category would also tag. `canonical_category` already
    collapses ~80 raw AMFI headings to ~40; the remaining differences from
    the bare SEBI name are the "<Type> Scheme - " prefix and, for a few
    categories, a dropped trailing "Fund" or "/ " vs "/" spacing."""
    text = re.sub(r"\s+", " ", text.strip().lower())
    text = text.removesuffix(" fund")
    return text.replace("/ ", "/")


def _category_fold_variants(text: str) -> set[str]:
    """C137: some AMCs' `sebi_category` strings don't match any bare SEBI
    name even after `_category_fold` -- an AMC-specific descriptor is glued
    on with a bare "-" (no surrounding spaces, so the "<Type> Scheme - "
    prefix split above doesn't catch it), e.g. "ELSS- Tax Saver Fund"; or
    the plural "Funds" is used where the bare name says singular "Fund", or
    vice versa, e.g. "Index Funds" vs. the bare name "Index Funds/ETFs".
    Generate every plausible fold instead of a single one, so both sides
    (this function is used to build `_CATEGORY_KEYS_FOLDED` too) can be
    compared by set membership. No bare SEBI name contains a literal "-",
    so the dash-split variant is only ever produced from AMC-supplied text."""
    base = _category_fold(text)
    variants = {base}
    if base.endswith(" funds"):
        variants.add(base[: -len(" funds")])
    elif base.endswith(" fund"):
        variants.add(base[: -len(" fund")])
    for variant in list(variants):
        if variant.endswith("/etfs"):
            variants.add(variant[: -len("/etfs")])
    left, sep, _ = base.partition("-")
    if sep and left.strip():
        variants.add(left.strip())
    return variants


_CATEGORY_KEYS_FOLDED: dict[str, str] = {
    variant: key
    for name, key in SEBI_CATEGORY_KEYS.items()
    if key is not None
    for variant in _category_fold_variants(name)
}


def category_key(sebi_name: str) -> str | None:
    if not sebi_name:
        return None
    if sebi_name in SEBI_CATEGORY_KEYS:
        return SEBI_CATEGORY_KEYS[sebi_name]
    _, _, rest = sebi_name.partition(" - ")
    for variant in _category_fold_variants(rest or sebi_name):
        key = _CATEGORY_KEYS_FOLDED.get(variant)
        if key is not None:
            return key
    return None


def sector_key(label: str | None) -> str | None:
    if not label:
        return None
    normalised = normalise_title(label)
    if not normalised or normalised == "other":
        return None
    return SECTOR_KEY_BY_RAW.get(normalised)


def load_dictionaries(db: Session) -> Dictionaries:
    stocks: dict[str, tuple[str, str]] = {}
    symbol_only: set[str] = set()
    company_stripped: set[str] = set()
    rows = db.query(StockMaster.isin, StockMaster.name, StockMaster.nse_symbol).all()
    displays = {isin: re.sub(r"\s+", " ", _STOCK_FILLER_RE.sub(" ", name)).strip() for isin, name, _ in rows}
    # Names first, so a symbol never shadows another company's name alias.
    for isin, name, _ in rows:
        alias = _stock_alias(name)
        if alias:
            stocks.setdefault(alias, (isin, displays[isin]))
            if " " not in alias and _COMPANY_WORD_RE.search(name):
                company_stripped.add(alias)
                full_name = normalise_title(_LEGAL_ONLY_RE.sub(" ", name))
                stocks.setdefault(full_name, (isin, displays[isin]))
    for isin, _name, nse_symbol in rows:
        display = displays[isin]
        if nse_symbol:
            symbol_alias = normalise_title(nse_symbol)
            if (
                symbol_alias
                and symbol_alias not in GROUP_NAMES_NOT_STOCKS
                # Same length rule as name aliases: a 3-letter plain-word
                # symbol (OIL, BSE, SUN) would tag any headline using the word.
                and (len(symbol_alias) >= 4 or symbol_alias in SHORT_ALIAS_ALLOW)
            ):
                if symbol_alias not in stocks:
                    stocks[symbol_alias] = (isin, display)
                    symbol_only.add(symbol_alias)

    fund_houses: dict[str, str] = {}
    for (amc_name,) in db.query(distinct(Scheme.amc_name)):
        alias = _fund_house_alias(amc_name)
        if alias:
            fund_houses.setdefault(alias, fund_house_key(amc_name))

    foreign: dict[str, str] = {}
    foreign_rows = (
        db.query(SchemeHolding.instrument_name)
        .filter(SchemeHolding.asset_type == AssetType.EQUITY_INTERNATIONAL)
        .order_by(SchemeHolding.market_value.desc())
        .limit(_FOREIGN_FETCH_LIMIT)
    )
    for (name,) in foreign_rows:
        alias = normalise_title(name)
        if not alias or alias in foreign:
            continue
        foreign[alias] = name.strip()
        if len(foreign) >= _FOREIGN_DISTINCT_LIMIT:
            break

    return Dictionaries(stocks=stocks, fund_houses=fund_houses, foreign=foreign, symbol_only=frozenset(symbol_only), company_stripped=frozenset(company_stripped),
    )


def tag_title(title: str, dictionaries: Dictionaries) -> list[EntityTag]:
    normalised = normalise_title(title)
    words = normalised.split(" ")
    tags: list[EntityTag] = []
    seen: set[tuple[str, str]] = set()

    def add(tag: EntityTag) -> None:
        dedup = (tag.kind, tag.key)
        if dedup not in seen:
            seen.add(dedup)
            tags.append(tag)

    stock_index = dictionaries._stock_index  # type: ignore[attr-defined]
    caps_text = _all_caps_text(title) if dictionaries.symbol_only else ""
    for alias in _candidates(stock_index, words):
        if not _contains_word(normalised, alias):
            continue
        # A symbol-only alias (TAKE, STAR, YATRA...) is usually an everyday
        # word, and stock/market context in the headline does not rescue it
        # ("Experts take ..." under a shares headline). Only the all-caps
        # spelling counts; the plain-word symbols (IDEA, SAIL...) may still
        # pass on context below, since headlines do write "Idea shares".
        if alias in dictionaries.symbol_only and alias not in _PLAIN_WORD_SYMBOLS_NORM and not _contains_word(caps_text, alias):
            continue
        if alias in _AMBIGUOUS_ALIASES_NORM or alias in _PLAIN_WORD_SYMBOLS_NORM or alias in dictionaries.company_stripped:
            context = _AMBIGUITY_CONTEXT_NORM | set(_AMBIGUOUS_ALIASES_NORM.get(alias, ()))
            if not any(_contains_word(normalised, word) for word in context):
                continue
        isin, label = dictionaries.stocks[alias]
        add(EntityTag(kind="stock", key=isin, label=label, tier=1))

    foreign_index = dictionaries._foreign_index  # type: ignore[attr-defined]
    for alias in _candidates(foreign_index, words):
        if _contains_word(normalised, alias):
            add(EntityTag(kind="stock", key=alias, label=dictionaries.foreign[alias], tier=1, foreign=True))

    has_fund_context = any(_contains_word(normalised, word) for word in _FUND_CONTEXT_WORDS_NORM)

    if has_fund_context:
        fund_house_index = dictionaries._fund_house_index  # type: ignore[attr-defined]
        for alias in _candidates(fund_house_index, words):
            if _contains_word(normalised, alias):
                add(EntityTag(kind="fund_house", key=dictionaries.fund_houses[alias], label=alias.title(), tier=3))

    for alias, (key, unambiguous) in _CATEGORY_ALIASES_NORM.items():
        if not _contains_word(normalised, alias):
            continue
        if not unambiguous and not has_fund_context:
            continue
        add(EntityTag(kind="fund_category", key=key, label=CATEGORY_LABELS[key], tier=2))

    has_negative_gold_silver = any(_contains_word(normalised, p) for p in _GOLD_SILVER_NEGATIVE_NORM)
    has_positive_gold_silver = any(_contains_word(normalised, p) for p in _GOLD_SILVER_POSITIVE_NORM)
    if has_positive_gold_silver and not has_negative_gold_silver:
        add(EntityTag(kind="asset_class", key="gold_silver", label="Gold and Silver", tier=4))

    for key, phrases in _SECTOR_PHRASES_NORM.items():
        if any(_contains_word(normalised, phrase) for phrase in phrases):
            add(EntityTag(kind="sector", key=key, label=SECTOR_LABELS[key], tier=5))

    if any(_contains_word(normalised, phrase) for phrase in _RATES_POSITIVE_NORM):
        add(EntityTag(kind="rates_macro", key="rates", label="Interest rates", tier=6))

    for key, phrases in _GENERAL_PHRASES_NORM.items():
        if any(_contains_word(normalised, phrase) for phrase in phrases):
            add(EntityTag(kind="general", key=key, label=None, tier=7))

    return tags


def icon_for(tag: EntityTag, *, stock_sector_key: str | None = None) -> str:
    if tag.kind == "sector":
        return tag.key
    if tag.kind == "stock":
        return stock_sector_key or "markets"
    if tag.kind == "general":
        return GENERAL_ICON_BY_KEY.get(tag.key, "general")
    return ICON_FOR.get(tag.kind, "general")


@dataclass(frozen=True)
class StoreResult:
    inserted: int
    skipped_untagged: int
    skipped_global_untagged: int
    skipped_existing: int


def store_items(
    db: Session,
    articles: Sequence[RawArticle],
    dictionaries: Dictionaries,
    now: datetime,
) -> StoreResult:
    inserted = 0
    skipped_untagged = 0
    skipped_global_untagged = 0
    skipped_existing = 0

    urls = [a.url for a in articles]
    existing: set[str] = set()
    for start in range(0, len(urls), 500):
        chunk = urls[start : start + 500]
        if not chunk:
            continue
        existing.update(url for (url,) in db.query(NewsItem.url).filter(NewsItem.url.in_(chunk)))

    for article in articles:
        if article.url in existing:
            skipped_existing += 1
            continue
        tags = tag_title(article.title, dictionaries)
        if article.origin == "global":
            if not any(tag.foreign for tag in tags):
                skipped_global_untagged += 1
                continue
        elif not tags:
            skipped_untagged += 1
            continue
        tier = min(tag.tier for tag in tags)
        db.add(
            NewsItem(
                id=uuid.uuid5(uuid.NAMESPACE_URL, article.url),
                source=article.source,
                title=article.title,
                url=article.url,
                published_at=article.published_at,
                ingested_at=now,
                language="en",
                entity_tags=[tag.as_json() for tag in tags],
                tier=tier,
            )
        )
        existing.add(article.url)
        inserted += 1

    return StoreResult(
        inserted=inserted,
        skipped_untagged=skipped_untagged,
        skipped_global_untagged=skipped_global_untagged,
        skipped_existing=skipped_existing,
    )
