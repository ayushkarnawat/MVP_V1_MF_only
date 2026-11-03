"""Exact aliases of registered names, never fuzzy index matching.

Real spellings come from tests/fixtures/factsheets (ABSL, HDFC, NJ, Quantum,
Franklin, Groww and the other house excerpts). Unknown printed names remain
unmapped; the registry is intentionally smaller than the printed-name list.
"""
from dataclasses import dataclass
from decimal import Decimal
import re
import unicodedata

from app.services.analytics.benchmark_registry import INDICES


@dataclass(frozen=True)
class BenchmarkMatch:
    key: str | None
    quality: str
    blend: list[tuple[str, Decimal]] | None = None
    declared_name: str = ""
    price_only_as_tri: bool = False


def _canonical(raw: str) -> str:
    text = unicodedata.normalize("NFKC", raw).casefold().replace("&", "and")
    text = re.sub(r"\btotal returns? index\b|\btri\b|\bindex\b", "", text)
    text = text.replace("large midcap", "largemidcap").replace("large mid cap", "largemidcap")
    text = text.replace("small cap", "smallcap").replace("mid cap", "midcap")
    text = re.sub(r"\bs\s*and\s*p\s+(?=bse)", "", text)
    return re.sub(r"[^a-z0-9]", "", text)


canonical_index_name = _canonical  # public spelling for the closest-index table (benchmark_selection)

_ALIASES = {_canonical(spec.nse_name): spec.key for spec in INDICES}
_ALIASES[_canonical("Nifty LargeMidcap 250")] = "nifty_largemidcap_250"
# Printed spellings the normaliser cannot derive from the registered NSE name. Spacing, case, hyphens,
# brackets, "Index", "TRI" and "&" versus "and" are already ignored by _canonical, so "Nifty 200 Quality 30
# Index (TRI)", "NIFTY200 QUALITY 30" and "Nifty Mid Small Healthcare" need no row here. Only a different
# word needs one: factsheets also say "Equal Weighted" for the same equal-weight indices.
_PRINTED_ALIASES = {
    "Nifty 50 Equal Weighted": "nifty50_equal_weight",
    "Nifty 100 Equal Weighted": "nifty100_equal_weight",
    "Nifty 500 Equal Weighted": "nifty500_equal_weight",
    "Nifty Top 20 Equal Weighted": "nifty_top_20_equal_weight",
}
for _printed, _key in _PRINTED_ALIASES.items():
    _ALIASES.setdefault(_canonical(_printed), _key)
# Similar broad-market universes, always marked as a different index. Other
# BSE families (sector/style/size rules differ) stay unmapped, not guessed.
_BSE = {"bse500": "nifty_500", "bse100": "nifty_100", "bse200": "nifty_200", "bsesensex": "nifty_50"}


def _blend(raw: str) -> list[tuple[str, Decimal]] | None:
    if "%" not in raw:
        return None
    parts = re.split(r"\s*\+\s*", raw)
    result = []
    for part in parts:
        before = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*%\s*(.+?)\s*", part)
        after = re.fullmatch(r"\s*(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\)\s*", part)
        if before:
            weight, name = before[1], before[2]
        elif after:
            name, weight = after[1], after[2]
        else:
            return None
        result.append((name, Decimal(weight)))
    return result if len(result) > 1 and sum((w for _, w in result), Decimal("0")) == Decimal("100") else None


def normalise_benchmark_name(raw: str) -> BenchmarkMatch:
    declared = " ".join(raw.split())
    blend = _blend(declared)
    if "%" in declared:
        return BenchmarkMatch(None, "none", blend, declared)
    key = _canonical(declared)
    if key in _ALIASES:
        marked = not bool(re.search(r"\bTRI\b|Total Returns? Index", declared, re.I))
        return BenchmarkMatch(_ALIASES[key], "exact", None, declared, marked)
    if key in _BSE:
        return BenchmarkMatch(_BSE[key], "proxy", None, declared, not bool(re.search(r"\bTRI\b|Total Returns? Index", declared, re.I)))
    return BenchmarkMatch(None, "none", None, declared)
