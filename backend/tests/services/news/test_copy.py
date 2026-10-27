"""T8: copy.py is the only place a user-facing news string may live (D10),
and no reason template may read as investment advice."""

from __future__ import annotations

import re
from decimal import Decimal
from pathlib import Path

from app.services.news import copy
from app.services.news.normalise import Kind

FORBIDDEN_WORDS = (
    "buy", "sell", "hold", "accumulate", "recommend", "target",
    "bullish", "bearish", "outperform", "opportunity",
)

ALL_KINDS: tuple[Kind, ...] = (
    "stock", "fund_category", "fund_house", "asset_class", "sector", "rates_macro", "general",
)


def test_reason_templates_cover_every_kind():
    assert set(copy.REASON_TEMPLATES) == set(ALL_KINDS)


def test_reason_templates_contain_no_forbidden_words_subtext_is_exempt():
    # SUBTEXT ("...your funds hold") is a description of ownership, not a call
    # to action, and is exempted by name rather than silently excluded.
    strings = dict(copy.REASON_TEMPLATES)
    strings["TITLE"] = copy.TITLE
    strings["DISCLAIMER"] = copy.DISCLAIMER
    strings["ABOUT_CREDIT_TEXT"] = copy.ABOUT_CREDIT_TEXT
    for name, text in strings.items():
        words = {w.lower() for w in re.findall(r"[A-Za-z']+", text)}
        hit = words & set(FORBIDDEN_WORDS)
        assert not hit, (name, hit)
    assert copy.SUBTEXT == "Headlines about companies your funds hold"


def test_reason_for_substitutes_entity_label_only_where_templated():
    assert copy.reason_for("stock", "HDFC Bank") == "Mentions HDFC Bank, which your funds invest in"
    assert copy.reason_for("fund_category", "Large Cap") == "About Large Cap funds, a category you invest in"
    assert copy.reason_for("fund_house", "HDFC") == "About HDFC, a fund house you invest with"
    assert copy.reason_for("sector", "Banking") == "About the Banking sector, where your funds invest"
    # Fixed templates ignore entity_label entirely -- None is the real call shape for general.
    assert copy.reason_for("asset_class", None) == "About gold and silver, which your funds invest in"
    assert copy.reason_for("rates_macro", None) == (
        "Interest rates and the economy can affect debt funds like yours"
    )
    assert copy.reason_for("general", None) == "General market and economy news"


def test_exposure_text_formats_percentage_and_strips_trailing_point_zero():
    text = copy.exposure_text(
        Decimal("30.00"), chip="holdings", coverage_pct=None, holdings_as_of=None,
    )
    assert text == "About 30% of your portfolio"


def test_exposure_text_rounds_half_up_to_one_decimal():
    text = copy.exposure_text(
        Decimal("19.38"), chip="holdings", coverage_pct=None, holdings_as_of=None,
    )
    assert text == "About 19.4% of your portfolio"


def test_exposure_text_holdings_chip_never_adds_coverage_or_as_of_suffix():
    # Only the lookthrough chip is caveated (D8) -- a directly-disclosed
    # holdings-chip figure is exact regardless of stock-coverage%.
    text = copy.exposure_text(
        Decimal("66.47"), chip="holdings", coverage_pct=Decimal("40.00"),
        holdings_as_of=__import__("datetime").date(2026, 9, 30),
    )
    assert text == "About 66.5% of your portfolio"


def test_exposure_text_lookthrough_adds_coverage_caveat_only_below_full_coverage():
    from datetime import date

    partial = copy.exposure_text(
        Decimal("5.00"), chip="lookthrough", coverage_pct=Decimal("40.00"), holdings_as_of=None,
    )
    assert partial == "About 5% of your portfolio, from the holdings we can see"

    full = copy.exposure_text(
        Decimal("5.00"), chip="lookthrough", coverage_pct=Decimal("100.00"), holdings_as_of=None,
    )
    assert full == "About 5% of your portfolio"

    with_date = copy.exposure_text(
        Decimal("5.00"), chip="lookthrough", coverage_pct=Decimal("100.00"),
        holdings_as_of=date(2026, 9, 30),
    )
    assert with_date == "About 5% of your portfolio (holdings as of Sep 2026)"


def test_every_news_string_lives_only_in_copy_py():
    news_root = Path(__file__).resolve().parents[3] / "app" / "services" / "news"
    home_news_route = Path(__file__).resolve().parents[3] / "app" / "api" / "home_news.py"
    literals = [
        copy.TITLE, copy.SUBTEXT, copy.DISCLAIMER, copy.ABOUT_CREDIT_TEXT,
        *copy.REASON_TEMPLATES.values(),
    ]
    other_files = [p for p in news_root.glob("*.py") if p.name != "copy.py"] + [home_news_route]
    for literal in literals:
        for path in other_files:
            assert literal not in path.read_text(encoding="utf-8"), (literal, path)
