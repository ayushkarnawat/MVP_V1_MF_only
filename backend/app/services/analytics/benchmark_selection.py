"""The one ordered benchmark choice for a fund, and the data tables behind it.

Owner decision (2 Nov 2026): "No benchmark" is the very last fallback. Order:

  1. factsheet  the index the fund's factsheet names, if we hold it.
  2. closest    the named index is not held, but a clearly closest one we hold
                exists (CLOSEST_INDEX: a published sub- or super-index of the
                same family; never another asset class).
  3. category   the standard index of the fund's category (CATEGORY_INDEX).
  4. none       nothing defensible. When the factsheet still names a benchmark
                and prints its returns, the screen says "As printed in the
                fund house's factsheet" (see `final_label`).

Everything that decides the source code and its plain label lives here, in one
pure function (`choose_benchmark`); the database reader only gathers inputs.
Adding a close sibling or a category is one table row, not another if-branch.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

from app.services.analytics.benchmark_names import canonical_index_name, normalise_benchmark_name
from app.services.analytics.benchmark_notes import benchmark_note
from app.services.analytics.scenario_asset_class import underlying_asset_class
from app.services.dashboard.allocation_labels import asset_class_bucket

# Same words as frontend/src/lib/benchmarkDisplay.ts (a test compares the two files).
SOURCE_LABELS: dict[str, str] = {
    "factsheet": "From the fund's factsheet",
    "closest": "Closest index we hold",
    "category": "Chosen by the fund's category",
    "none": "No benchmark",
}
PRINTED_LABEL = "As printed in the fund house's factsheet"


@dataclass(frozen=True)
class BenchmarkChoice:
    index_key: str | None
    source: str
    declared_name: str | None = None
    window_start_note: str | None = None
    mapping_age_days: int | None = None

    @property
    def label(self) -> str:
        return final_label(self.source, self.declared_name)


def final_label(source: str, declared_name: str | None) -> str:
    """The plain words shown for a choice. Mirrors the screen: a fund with no index
    series but a named benchmark is shown as printed in the factsheet."""
    if source == "none" and declared_name:
        return PRINTED_LABEL
    return SOURCE_LABELS.get(source, SOURCE_LABELS["none"])


# ---- step 2: closest index we hold --------------------------------------------------------

@dataclass(frozen=True)
class ClosestRow:
    declared: str   # the printed name; matched after the same normalising as registered names
    target: str     # registered index key we hold
    why: str


# Only Indian-equity names from the same provider family whose parent or sibling we hold:
# a strategy or factor index is drawn from the parent's own universe, and a "50" or "100"
# index is a slice of the larger one. Other providers' names (BSE) are handled where the
# factsheet is read, and sector or theme names we do not hold are NOT here: a different
# sector is not "close". No gold, silver, debt, hybrid or overseas names, ever.
CLOSEST_INDEX: tuple[ClosestRow, ...] = (
    ClosestRow("Nifty Midcap 50", "nifty_midcap_150", "The top 50 names of the Midcap 150: same family and size band."),
    ClosestRow("Nifty Midcap 150 Quality 50", "nifty_midcap_150", "Strategy slice drawn from the Midcap 150 universe."),
    ClosestRow("Nifty Midcap150 Momentum 50", "nifty_midcap_150", "Strategy slice drawn from the Midcap 150 universe."),
    ClosestRow("Nifty Smallcap 250 Quality 50", "nifty_smallcap_250", "Strategy slice drawn from the Smallcap 250 universe."),
    ClosestRow("Nifty Smallcap250 Momentum Quality 100", "nifty_smallcap_250", "Strategy slice drawn from the Smallcap 250 universe."),
    ClosestRow("Nifty 500 Quality 50", "nifty_500", "Strategy slice drawn from the Nifty 500 universe."),
    ClosestRow("Nifty 500 Value 50", "nifty_500", "Strategy slice drawn from the Nifty 500 universe."),
    ClosestRow("Nifty 500 Shariah", "nifty_500", "Rule-screened subset of the Nifty 500 universe."),
    ClosestRow("Nifty 200 Momentum 30", "nifty_200", "Strategy slice drawn from the Nifty 200 universe."),
    ClosestRow("Nifty 200 Alpha 30", "nifty_200", "Strategy slice drawn from the Nifty 200 universe."),
    ClosestRow("Nifty 200 Quality 30", "nifty_200", "Strategy slice drawn from the Nifty 200 universe."),
    ClosestRow("Nifty 100 Quality 30", "nifty_100", "Strategy slice drawn from the Nifty 100 universe."),
    ClosestRow("Nifty 100 ESG", "nifty_100", "Rule-screened subset of the Nifty 100 universe."),
    ClosestRow("Nifty 100 Equal Weight", "nifty_100", "Same 100 names as the Nifty 100, weighted differently."),
    ClosestRow("Nifty 100 Low Volatility 30", "nifty_100", "Strategy slice drawn from the Nifty 100 universe."),
    ClosestRow("Nifty 50 Value 20", "nifty_50", "Strategy slice drawn from the Nifty 50 universe."),
    ClosestRow("Nifty 50 Equal Weight", "nifty_50", "Same 50 names as the Nifty 50, weighted differently."),
    ClosestRow("Nifty Financial Services 25/50", "nifty_financial_services", "Capped variant of the same financial services sector index."),
)
_CLOSEST = {canonical_index_name(row.declared): row for row in CLOSEST_INDEX}
# Wrapper categories (index funds, ETFs, funds of funds) are never equity "by category", but a
# passive Indian-equity fund naming one of the equity names above can still get its close sibling.
_CLOSEST_ASSET_CLASSES = frozenset({"Equity", "Index/ETF"})


# ---- step 3: the category's standard index ------------------------------------------------

@dataclass(frozen=True)
class CategoryRow:
    bucket: str                 # asset_class_bucket() of the category: "Equity" or "Hybrid" here
    tokens: tuple[str, ...]     # every token must appear in the lower-cased category
    target: str                 # registered index key
    why: str
    not_tokens: tuple[str, ...] = ()   # none of these may appear


# First match wins, so the order below is the old if-chain's order (small, large and mid,
# large without mid, mid) followed by one explicit row per remaining category.
# Categories with no row (debt, liquid, hybrid other than arbitrage, gold, silver, overseas,
# international, funds of funds, index funds and ETFs, retirement and children's funds, and
# anything unrecognised) have no defensible standard index and end on "none".
CATEGORY_INDEX: tuple[CategoryRow, ...] = (
    CategoryRow("Equity", ("small",), "nifty_smallcap_250", "SEBI's small caps are rank 251 onward; the Smallcap 250 is that band."),
    CategoryRow("Equity", ("large", "mid"), "nifty_largemidcap_250", "Large and mid caps together: the LargeMidcap 250 spans exactly that."),
    CategoryRow("Equity", ("large",), "nifty_100", "SEBI's large caps are the top 100; the Nifty 100 is that band.", ("mid",)),
    CategoryRow("Equity", ("mid",), "nifty_midcap_150", "SEBI's mid caps are rank 101 to 250; the Midcap 150 is the matching band."),
    CategoryRow("Equity", ("multi",), "nifty_500",
                "Spans all sizes. The Nifty 500 Multicap 50:25:25 would fit better but its series is not yet checked, so the broad Nifty 500 stays."),
    CategoryRow("Equity", ("flexi",), "nifty_500", "May hold any size; the broad market is the standard comparison."),
    CategoryRow("Equity", ("elss",), "nifty_500", "Tax-saver funds are flexible across sizes; the broad market is the standard comparison."),
    CategoryRow("Equity", ("focus",), "nifty_500", "Concentrated but unrestricted by size; the broad market is the standard comparison."),
    CategoryRow("Equity", ("value",), "nifty_500", "A style, not a size; the broad market is the standard comparison."),
    CategoryRow("Equity", ("contra",), "nifty_500", "A style, not a size; the broad market is the standard comparison."),
    CategoryRow("Equity", ("dividend",), "nifty_500", "A style, not a size; the broad market is the standard comparison."),
    CategoryRow("Equity", ("sectoral",), "nifty_500",
                "No single sector index fits every sector fund; as before this change, the broad market is shown (owner may prefer none)."),
    CategoryRow("Equity", ("thematic",), "nifty_500",
                "No single theme index fits every theme fund; as before this change, the broad market is shown (owner may prefer none)."),
    # Equity Savings funds (a large debt and arbitrage share) are NOT compared with the Nifty 500: the word
    # "equity" puts them in the equity bucket, which used to give them an equity index. Owner rule, 3 Nov
    # 2026: never show a wrong index. They end on "none" (the screen then shows the factsheet's printed
    # returns); the Nifty Equity Savings index has no data on the endpoint we use.
    # Any other equity-bucket category, including a statement's bare "EQUITY".
    CategoryRow("Equity", (), "nifty_500", "Any other equity category: the broad market, as before this change.",
                ("savings",)),
    CategoryRow("Hybrid", ("arbitrage",), "nifty_50_arbitrage",
                "The Nifty 50 Arbitrage Index is the standard one for arbitrage funds and passed the owner's printed-return check."),
)


def category_row(category: str) -> CategoryRow | None:
    lower = category.lower()
    bucket = asset_class_bucket(category)
    for row in CATEGORY_INDEX:
        if row.bucket == bucket and all(t in lower for t in row.tokens) and not any(t in lower for t in row.not_tokens):
            return row
    return None


# ---- the one function ---------------------------------------------------------------------

def choose_benchmark(
    *,
    category: str,
    scheme_name: str,
    declared: str | None,
    mapped_key: str | None,
    mapped_quality: str | None,
    tracked_key: str | None,
    tracked_quality: str | None,
    age: int | None,
    is_active: Callable[[str], bool],
    label_of: Callable[[str], str],
) -> BenchmarkChoice:
    # 1. The named index, if we hold it. A tracked index (index funds) wins over the named one;
    #    a different-provider stand-in (quality "proxy") is shown as closest, never as the real one.
    key = tracked_key or mapped_key
    if key and is_active(key):
        quality = (tracked_quality or mapped_quality) if tracked_key else mapped_quality
        if quality == "proxy":
            return BenchmarkChoice(key, "closest", declared, benchmark_note("benchmark_note_closest", index=label_of(key)), age)
        return BenchmarkChoice(key, "factsheet", declared, None, age)

    # 2. A clearly closest index we hold for the name the factsheet gives (never across asset classes).
    if declared and "%" not in declared and underlying_asset_class(category, scheme_name) in _CLOSEST_ASSET_CLASSES:
        row = _CLOSEST.get(canonical_index_name(declared))
        if row is not None and is_active(row.target):
            return BenchmarkChoice(row.target, "closest", declared, benchmark_note("benchmark_note_closest", index=label_of(row.target)), age)

    # 3. The category's standard index. A fund that names a benchmark we cannot match keeps the
    #    existing "closest" label (its own index is not held), shown with the name beside it.
    row = category_row(category)
    if row is not None and is_active(row.target):
        note = benchmark_note("benchmark_note_closest", index=label_of(row.target))
        match = normalise_benchmark_name(declared) if declared else None
        if match and match.blend:
            weights = ", ".join(
                f"{weight}% {re.sub(r'(?i)total returns? index|\bTRI\b', '', name).strip()}" for name, weight in match.blend)
            note = benchmark_note("benchmark_note_mix", weights=weights)
        return BenchmarkChoice(row.target, "closest" if declared else "category", declared, note, age)

    # 4. Last: no benchmark. The screen shows the printed-returns words when a name is declared.
    return BenchmarkChoice(None, "none", declared, None, age)
