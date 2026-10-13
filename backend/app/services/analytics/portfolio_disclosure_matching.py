# backend/app/services/analytics/portfolio_disclosure_matching.py
"""Normalize stage: match a disclosure sheet's raw scheme/fund name to a locally known
scheme family. Reuses the hybrid layered pattern already established for fund-manager
attribution (amfi_factsheet_client.match_scheme_page): exact-first, scoped fuzzy
fallback, an ambiguity guard, and a persisted confidence -- not a new one-off matcher
(feedback_matching_design_philosophy). A separate, locally-owned canonicalizer (not an
import of attribute 04's private `_canonical_fund_name`) keeps this module independent
of sub-project 1's closed, intern-owned code while applying the identical rule set."""
from __future__ import annotations

import re
from decimal import Decimal
from difflib import SequenceMatcher

from app.services.analytics.amfi_factsheet_client import FundFamily

MATCH_METHOD_EXACT = "EXACT"
MATCH_METHOD_FUZZY = "FUZZY"

MIN_MATCH_CONFIDENCE = Decimal("0.80")
AMBIGUITY_MARGIN = Decimal("0.05")

_BOILERPLATE_RE = re.compile(
    r"\b(FUND|SCHEME|PLAN|DIRECT|REGULAR|GROWTH|IDCW|DIVIDEND|REINVESTMENT|PAYOUT)\b", re.IGNORECASE,
)
_NAME_NOTE_RE = re.compile(r"[\[(][^\])]*(?:ERSTWHILE|SEGREGATED)[^\])]*[\])]+", re.I)


def _canonical_name(name: str) -> str:
    s = _BOILERPLATE_RE.sub("", _NAME_NOTE_RE.sub(" ", name).upper())
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _identity_tokens(name: str) -> tuple[frozenset[str], frozenset[str]]:
    identity_name = _NAME_NOTE_RE.sub(" ", name).upper()
    identity_name = re.sub(r"\bFUNDS?\s+OF\s+FUNDS?\b", "FOF", identity_name)
    identity_name = re.sub(r"\bEXCHANGE\s+TRADED\s+FUNDS?\b", "ETF", identity_name)
    canonical = _canonical_name(identity_name)
    tokens = set(canonical.split())
    numbers = frozenset(re.findall(r"\d+", canonical))
    identity = frozenset(tokens & {"GOLD", "SILVER", "ETF", "INDEX", "FOF", "NEXT"})
    return numbers, identity


def match_scheme_name(raw_name: str, families: list[FundFamily]) -> tuple[FundFamily, str, Decimal] | None:
    """`families` must already be scoped to one AMC -- never search across AMCs.
    Returns None when no confident, unambiguous match exists (Review Focus #2)."""
    wanted = _canonical_name(raw_name)
    if not wanted:
        return None
    # A shortened sheet label cannot distinguish a base fund from its series.
    if not re.search(r"\b(fund|scheme)\b", raw_name, re.I):
        prefixed = [f for f in families if f.canonical == wanted or f.canonical.startswith(wanted + " ")]
        if len(prefixed) > 1:
            return None
    exact = [f for f in families if f.canonical == wanted]
    if len(exact) == 1:
        return exact[0], MATCH_METHOD_EXACT, Decimal("1.0")
    if len(exact) > 1:
        return None

    eligible = [f for f in families if _identity_tokens(raw_name) == _identity_tokens(f.base_name)]
    scored = sorted(
        ((f, Decimal(str(round(SequenceMatcher(None, wanted, f.canonical).ratio(), 3)))) for f in eligible),
        key=lambda pair: pair[1], reverse=True,
    )
    if not scored or scored[0][1] < MIN_MATCH_CONFIDENCE:
        return None
    if len(scored) > 1 and scored[0][1] - scored[1][1] < AMBIGUITY_MARGIN:
        return None
    return scored[0][0], MATCH_METHOD_FUZZY, scored[0][1]
