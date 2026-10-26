"""Static configuration for the Home News backend.

T3 (this file's first content): site allow-lists and source display names
(D9/L18). Later tasks extend this module: T4 adds the tagging dictionaries,
alias/category tables and `ICON_FOR`; T5 adds the watch-list thresholds
(`MIN_SIZE_PCT`, `TOP_N`), starting values only, not locked until the
owner's calibration reply (section 9 of the handoff).
"""

from __future__ import annotations

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
