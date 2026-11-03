"""Exact endpoint names; adding a verified index is one row, not a migration.

Evidence: Docs/orchestration/step0-data/vm2-out/bench_verify_2026-10-31.log.
The nine sector/theme names have total-return rows in that log. The eight
legacy names retain the existing client's mapping. The plan-only names below
are UNVERIFIED against that log (including the corrected multicap spelling).
Arbitrage passed the owner's printed-return check (7.33, 7.42, 6.69 percent,
within 0.01 points). 1D Rate has an endpoint but no printed-return check yet.

The 56 names added 3 Nov 2026 are listed in `_VERIFIED_3_NOV` (existence and freshness verified, printed
returns not yet checked). Still unregistered: "Nifty Healthcare Index" (no total-return series under that
name), the G-Sec, SDL, CRISIL and other debt or hybrid composites (no total-return source found).
"""
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from scripts.benchmark_series_check import SeriesCheck
from datetime import date

from sqlalchemy.orm import Session

from app.models.enums import BenchmarkReturnType


@dataclass(frozen=True)
class IndexSpec:
    key: str
    nse_name: str
    family: str = "equity"
    source: str = "tri_endpoint"
    return_type: str = "tri"
    active: bool = True


_LEGACY_ROWS = (
    IndexSpec("nifty_50", "Nifty 50"),
    IndexSpec("nifty_500", "Nifty 500"),
    IndexSpec("nifty_largemidcap_250", "NIFTY LARGEMID250"),
    IndexSpec("nifty_midcap_150", "Nifty Midcap 150"),
    IndexSpec("nifty_next_50", "Nifty Next 50"),
    IndexSpec("nifty_smallcap_250", "Nifty Smallcap 250"),
    IndexSpec("nifty_100", "Nifty 100"),
    IndexSpec("nifty_200", "Nifty 200"),
    # Verified total-return names, exactly as echoed in the log.
    IndexSpec("nifty_bank", "Nifty Bank"),
    IndexSpec("nifty_it", "Nifty IT"),
    IndexSpec("nifty_financial_services", "Nifty Financial Services"),
    IndexSpec("nifty_india_consumption", "Nifty India Consumption"),
    IndexSpec("nifty_india_manufacturing", "Nifty India Manufacturing"),
    IndexSpec("nifty_energy", "Nifty Energy"),
    IndexSpec("nifty_total_market", "Nifty Total Market"),
    IndexSpec("nifty_private_bank", "Nifty Private Bank"),
    IndexSpec("nifty_infrastructure", "Nifty Infrastructure"),
    # UNVERIFIED in the log: plan's exact spellings; empty fetches must alert.
    IndexSpec("nifty_midcap_100", "Nifty Midcap 100"),
    IndexSpec("nifty_smallcap_100", "Nifty Smallcap 100"),
    IndexSpec("nifty_smallcap_50", "Nifty Smallcap 50"),
    IndexSpec("nifty500_multicap_50_25_25", "Nifty500 Multicap 50:25:25"),
    IndexSpec("nifty_50_arbitrage", "Nifty 50 Arbitrage", "arbitrage", "price_endpoint_verified"),
    IndexSpec("nifty_1d_rate", "Nifty 1D Rate Index", "money_market", "price_endpoint_verified", active=False),
)

# Verified 3 Nov 2026 (Docs/orchestration/2026-11-03-benchmark-index-verification.md): each name below was
# sent to the same total-return endpoint and returned about 270 rows ending 2 Nov 2026. nse_name is NSE's own
# spelling, exactly as sent; the client compares the echoed name case-insensitively. The printed-return check
# (benchmark_series_check.py, ledger L7) has NOT been run for these names; it is run on a sample at S.1.
_VERIFIED_3_NOV = (
    # Thematic and sector.
    ("nifty_auto", "NIFTY AUTO"),
    ("nifty_fmcg", "NIFTY FMCG"),
    ("nifty_metal", "NIFTY METAL"),
    ("nifty_realty", "NIFTY REALTY"),
    ("nifty_media", "NIFTY MEDIA"),
    ("nifty_psu_bank", "NIFTY PSU BANK"),
    ("nifty_mnc", "NIFTY MNC"),
    ("nifty_pharma", "NIFTY PHARMA"),
    ("nifty_commodities", "NIFTY COMMODITIES"),
    ("nifty_india_defence", "NIFTY INDIA DEFENCE"),
    ("nifty_capital_markets", "NIFTY CAPITAL MARKETS"),
    ("nifty_housing", "NIFTY HOUSING"),
    ("nifty_core_housing", "NIFTY CORE HOUSING"),
    ("nifty_transportation_logistics", "NIFTY TRANSPORTATION & LOGISTICS"),
    ("nifty_midsmall_india_consumption", "NIFTY MIDSMALL INDIA CONSUMPTION"),
    ("nifty_india_new_age_consumption", "NIFTY INDIA NEW AGE CONSUMPTION"),
    ("nifty_ev_new_age_automotive", "NIFTY EV & NEW AGE AUTOMOTIVE"),
    ("nifty_reits_realty", "NIFTY REITS & REALTY"),
    ("nifty_india_railways_psu", "NIFTY INDIA RAILWAYS PSU"),
    ("nifty500_healthcare", "NIFTY500 HEALTHCARE"),
    ("nifty_midsmall_healthcare", "NIFTY MIDSMALL HEALTHCARE"),
    # Factor and strategy.
    ("nifty200_quality_30", "NIFTY200 QUALITY 30"),
    ("nifty100_quality_30", "NIFTY100 QUALITY 30"),
    ("nifty500_quality_50", "NIFTY500 QUALITY 50"),
    ("nifty_midcap150_quality_50", "NIFTY MIDCAP150 QUALITY 50"),
    ("nifty_smallcap250_quality_50", "NIFTY SMALLCAP250 QUALITY 50"),
    ("nifty500_value_50", "NIFTY500 VALUE 50"),
    ("nifty200_value_30", "NIFTY200 VALUE 30"),
    ("nifty50_value_20", "NIFTY50 VALUE 20"),
    ("nifty200_momentum_30", "NIFTY200 MOMENTUM 30"),
    ("nifty500_momentum_50", "NIFTY500 MOMENTUM 50"),
    ("nifty_midcap150_momentum_50", "NIFTY MIDCAP150 MOMENTUM 50"),
    ("nifty_alpha_50", "NIFTY ALPHA 50"),
    ("nifty100_alpha_30", "NIFTY100 ALPHA 30"),
    ("nifty200_alpha_30", "NIFTY200 ALPHA 30"),
    ("nifty_low_volatility_50", "NIFTY LOW VOLATILITY 50"),
    ("nifty100_low_volatility_30", "NIFTY100 LOW VOLATILITY 30"),
    ("nifty500_low_volatility_50", "NIFTY500 LOW VOLATILITY 50"),
    ("nifty_dividend_opportunities_50", "NIFTY DIVIDEND OPPORTUNITIES 50"),
    ("nifty500_flexicap_quality_30", "NIFTY500 FLEXICAP QUALITY 30"),
    ("nifty500_multifactor_mqvlv_50", "NIFTY500 MULTIFACTOR MQVLV 50"),
    ("nifty500_multicap_momentum_quality_50", "NIFTY500 MULTICAP MOMENTUM QUALITY 50"),
    ("nifty_total_market_momentum_quality_50", "NIFTY TOTAL MARKET MOMENTUM QUALITY 50"),
    ("nifty_midsmallcap400_momentum_quality_100", "NIFTY MIDSMALLCAP400 MOMENTUM QUALITY 100"),
    # Equal weight and multicap/size.
    ("nifty50_equal_weight", "NIFTY50 EQUAL WEIGHT"),
    ("nifty100_equal_weight", "NIFTY100 EQUAL WEIGHT"),
    ("nifty500_equal_weight", "NIFTY500 EQUAL WEIGHT"),
    ("nifty_top_20_equal_weight", "NIFTY TOP 20 EQUAL WEIGHT"),
    ("nifty500_largemidsmall_equal_cap_weighted", "NIFTY500 LARGEMIDSMALL EQUAL-CAP WEIGHTED"),
    ("nifty_smallcap_500", "NIFTY SMALLCAP 500"),
    ("nifty500_multicap_india_manufacturing_50_30_20", "NIFTY500 MULTICAP INDIA MANUFACTURING 50:30:20"),
    ("nifty500_multicap_infrastructure_50_30_20", "NIFTY500 MULTICAP INFRASTRUCTURE 50:30:20"),
    # ESG and other.
    ("nifty100_esg", "NIFTY100 ESG"),
    ("nifty100_enhanced_esg", "NIFTY100 ENHANCED ESG"),
    ("nifty100_esg_sector_leaders", "NIFTY100 ESG SECTOR LEADERS"),
    ("nifty500_shariah", "NIFTY500 SHARIAH"),
)

INDICES = _LEGACY_ROWS + tuple(IndexSpec(key, name) for key, name in _VERIFIED_3_NOV)


def get_index(key: str) -> IndexSpec:
    return {spec.key: spec for spec in INDICES}[key]


def index_label(key: str) -> str:
    # Preserve the existing fund-page spelling, not the endpoint's abbreviation.
    return "Nifty LargeMidcap 250" if key == "nifty_largemidcap_250" else get_index(key).nse_name


def registered_index(db: Session, key: str) -> IndexSpec:
    from app.models.reference import BenchmarkIndexMaster

    saved = db.get(BenchmarkIndexMaster, key)
    if saved is not None:
        return IndexSpec(saved.key, saved.nse_name, saved.family, saved.source, saved.return_type, saved.active)
    return get_index(key)


async def ensure_index_history(db: Session, key: str) -> int:
    """Fetch the registered history; return inserted rows, never mask failure as 0."""
    from app.models.reference import BenchmarkIndexHistory
    from app.services.analytics.nse_indices_client import ensure_index_history_fresh

    registered_index(db, key)
    query = db.query(BenchmarkIndexHistory).filter_by(index_name=key, return_type=BenchmarkReturnType.TRI)
    before = query.count()
    if not await ensure_index_history_fresh(db, key, date(1990, 1, 1), date.today(), return_type=BenchmarkReturnType.TRI):
        raise ValueError(f"Benchmark history not available for {key}")
    return query.count() - before


def checked_index(spec: IndexSpec, checks: list["SeriesCheck"]) -> IndexSpec:
    """Pure activation decision; never writes. All three same-date checks matter.

    The read-only report is reviewed before the owner applies an active flag.
    A failed or incomplete check also deactivates an already-active candidate
    in this returned decision; it does not silently keep the old active=True.
    """
    passed = (len(checks) == 3 and {c.period for c in checks} == {"1Y", "3Y", "5Y"}
              and len({c.as_of for c in checks}) == 1
              and all(c.key == spec.key and c.passed for c in checks))
    return replace(spec, active=passed)


def select_index(key: str, category_key: str, *, db: Session | None = None) -> IndexSpec:
    """New selection path only; the stored legacy benchmark mapping is untouched."""
    def active(candidate: str) -> IndexSpec | None:
        try:
            return registered_index(db, candidate) if db is not None else get_index(candidate)
        except KeyError:
            return None

    selected = active(key)
    if selected is not None and selected.active:
        return selected
    category = active(category_key)
    if category is None or not category.active:
        raise ValueError("No active category index is available")
    return category
