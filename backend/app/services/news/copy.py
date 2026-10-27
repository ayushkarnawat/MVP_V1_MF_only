"""T8: every user-facing news string lives here, and only here (D10).
Reason templates are neutral descriptions of *why* an item was picked, never
calls to action -- see test_copy.py's forbidden-word check.
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from app.services.news.normalise import Kind

TITLE = "News affecting top holdings"
SUBTEXT = "Headlines about companies your funds hold"
DISCLAIMER = (
    "Headlines are from third-party sources and shown for information. "
    "They are not investment advice or research."
)
ABOUT_CREDIT_TEXT = "News index: GDELT Project"
ABOUT_CREDIT_URL = "https://www.gdeltproject.org/"

REASON_TEMPLATES: dict[Kind, str] = {
    "stock": "Mentions {entity}, which your funds invest in",
    "fund_category": "About {entity} funds, a category you invest in",
    "fund_house": "About {entity}, a fund house you invest with",
    "asset_class": "About gold and silver, which your funds invest in",
    "sector": "About the {entity} sector, where your funds invest",
    "rates_macro": "Interest rates and the economy can affect debt funds like yours",
    "general": "General market and economy news",
}

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_ONE_DECIMAL = Decimal("0.1")


def reason_for(kind: Kind, entity_label: str | None) -> str:
    template = REASON_TEMPLATES[kind]
    return template.format(entity=entity_label) if "{entity}" in template else template


def _format_pct(pct: Decimal) -> str:
    text = format(pct.quantize(_ONE_DECIMAL, rounding=ROUND_HALF_UP), "f")
    return text[:-2] if text.endswith(".0") else text


def exposure_text(
    pct: Decimal,
    *,
    chip: Literal["holdings", "lookthrough"],
    coverage_pct: Decimal | None,
    holdings_as_of: date | None,
) -> str:
    text = f"About {_format_pct(pct)}% of your portfolio"
    if chip == "lookthrough":
        if coverage_pct is not None and coverage_pct < Decimal("100"):
            text += ", from the holdings we can see"
        if holdings_as_of is not None:
            text += f" (holdings as of {_MONTHS[holdings_as_of.month - 1]} {holdings_as_of.year})"
    return text
