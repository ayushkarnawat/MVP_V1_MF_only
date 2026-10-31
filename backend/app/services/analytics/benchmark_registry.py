"""Exact endpoint names; adding a verified index is one row, not a migration.

Evidence: Docs/orchestration/step0-data/vm2-out/bench_verify_2026-10-31.log.
The nine sector/theme names have total-return rows in that log. The eight
legacy names retain the existing client's mapping. The plan-only names below
are UNVERIFIED against that log (including the corrected multicap spelling).
Arbitrage passed the owner's printed-return check (7.33, 7.42, 6.69 percent,
within 0.01 points). 1D Rate has an endpoint but no printed-return check yet.

Pending, UNVERIFIED (not registered): Nifty 200 Quality 30, Nifty 500 Value 50,
Nifty 100 ESG, Nifty Healthcare Index; other factor/theme, G-Sec and SDL names
need exact-name and printed-return evidence before registration.
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


INDICES = (
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
