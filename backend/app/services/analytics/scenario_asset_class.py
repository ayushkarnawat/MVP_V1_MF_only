# backend/app/services/analytics/scenario_asset_class.py
"""Attribute-11-only asset-class bucketing, deliberately separate from
allocation_labels.py's 4-bucket asset_class_bucket(): that function is
already relied on elsewhere (allocation breakdowns) and widening it isn't
this attribute's problem to solve or risk regressing. This bucketing is
finer (9 buckets, not 4) because a hypothetical scenario's assumed % move
genuinely differs by sub-bucket -- e.g. an overseas FoF gains in INR terms
during a rupee-depreciation scenario while a domestic equity index falls,
which a single "Equity" bucket would get backwards."""
import re

# An ETF, index fund or fund-of-funds is a wrapper: what moves its value is what it
# holds. AMFI files ~1,200 of them under 18 headings, and the generic ones ("Other ETFs",
# "Other Scheme - Index Funds", "FoF Domestic") mix equity, bonds, gold, silver and foreign
# funds, so the scheme name decides there. Whole-word keywords only; bare "PSU" is not a
# debt keyword ("Nifty PSU Bank ETF" is equity).
_SILVER = re.compile(r"\bsilver\b")
_GOLD = re.compile(r"\bgold\b")
_OVERSEAS = re.compile(
    r"\b(nasdaq|s&p|hang seng|msci|nyse|fang\+?|global|world|international|overseas|china|japan|taiwan|us|asia|europe|developed markets?|emerging markets?)\b"
)
_DEBT_SHORT = re.compile(r"\b(liquid|overnight|1d rate|money market|arbitrage)\b")
_DEBT = re.compile(r"\b(gilt|g-sec|gsec|sdl|bonds?|crisil ibx|ibx|target maturity|t-bill|treasury|debt)\b")
_EQUITY_HINT = re.compile(r"\b(equity|nifty|bse|sensex|etf)\b")
_HYBRID = re.compile(r"\b(multi asset|multi-asset|balanced|hybrid|asset allocation)\b")
_WRAPPER = ("etf", "index fund", "fund of funds", "fof")
_SHORT_CATEGORY = ("liquid", "overnight", "money market", "ultra short")


def underlying_asset_class(sebi_category: str, scheme_name: str = "") -> str:
    category = sebi_category.lower()
    name = scheme_name.lower()
    if "arbitrage" in category:
        return "Debt-short"
    # "MSCI India" is a domestic index; Edelweiss's "MSCI India Domestic & World Healthcare"
    # tracks a domestic index with a world sleeve -- the whole phrase is domestic, not overseas.
    overseas_name = re.sub(r"\bmsci\s+india(?:\s+domestic\s*&\s*world)?\b", "", name)
    if _OVERSEAS.search(overseas_name):
        return "Overseas"
    if not any(marker in category for marker in _WRAPPER):
        if "gold" in category:
            return "Gold"
        if "equity" in category:
            return "Equity"
        if "hybrid" in category or "retirement" in category or "children" in category:
            return "Hybrid"
        if any(k in category for k in ("debt", "income", "liquid", "money market", "gilt", "overnight")):
            return "Debt-short" if any(k in category for k in _SHORT_CATEGORY) else "Debt-long"
        return "Other"

    # A wrapper whose category already says what it holds.
    if "silver" in category:
        return "Silver"
    if "gold" in category:
        return "Gold"
    if "overseas" in category:
        return "Overseas"
    if "debt" in category:
        return "Debt-short" if _DEBT_SHORT.search(name) else "Debt-long"
    if "hybrid" in category:
        return "Hybrid"
    if "equity" in category:
        return "Index/ETF"

    # A generic wrapper: the name says what it holds.
    if _SILVER.search(name):
        return "Silver"
    if _GOLD.search(name):
        return "Gold"
    if _OVERSEAS.search(overseas_name):
        return "Overseas"
    if _DEBT_SHORT.search(name):
        return "Debt-short"
    if _DEBT.search(name):
        return "Debt-long"
    if _HYBRID.search(name):
        return "Hybrid"
    # No asset keyword: generic ETFs/index funds track Indian equity indices, and so does a
    # domestic FoF whose name points at equity ("... Nifty PSE ETF FOF"); any other domestic
    # FoF could hold anything, so it stays in the residual bucket.
    is_fof = "fof" in category or "fund of funds" in category
    return "Other" if is_fof and not _EQUITY_HINT.search(name) else "Index/ETF"
