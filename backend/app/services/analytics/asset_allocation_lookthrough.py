"""Attribute 13: raw disclosure classes, normalized to covered value."""
import uuid
from dataclasses import replace
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import AssetType
from app.services.analytics.cap_allocation import build_cap_allocation
from app.services.analytics.lookthrough import get_disclosure_scope, get_lookthrough_table, build_lookthrough_table
from app.services.analytics.schemas import (
    AssetAllocationClass, AssetAllocationClassFund, AssetAllocationOuter, AssetAllocationVariant,
    AssetAllocationSummary, CoverageFund,
)

# Listed REIT/InvIT units belong to equity risk; absent an AMFI stock bucket,
# they remain in the equity Other slice. Derivatives/unknown lines stay excluded.
ASSET_CLASS_MAP = {
    AssetType.EQUITY_DOMESTIC: "equity", AssetType.EQUITY_INTERNATIONAL: "equity",
    AssetType.REIT_INVIT: "equity", AssetType.DEBT: "debt",
    AssetType.GOLD_SILVER: "gold", AssetType.CASH_EQUIVALENT: "cash_like",
    AssetType.DERIVATIVE: None, AssetType.OTHER: None,
}
ZERO = Decimal(0)


async def compute_asset_allocation(
    db: Session, household_member_ids: list[uuid.UUID],
) -> AssetAllocationSummary:
    scope = await get_disclosure_scope(db, household_member_ids)
    table = await get_lookthrough_table(db, household_member_ids)
    by_batch = {b.id: sid for sid, b in scope.selected.items()}
    arbitrage = {sid for sid in scope.selected if scope.schemes[sid].sebi_category == "Arbitrage Fund"}
    equity_types = {kind for kind, cls in ASSET_CLASS_MAP.items() if cls == "equity"}

    def variant(as_cash):
        amounts = {key: ZERO for key in ("equity", "debt", "gold", "cash_like")}
        equity_rows = []
        by_fund = {key: {} for key in amounts}
        for row in scope.raw_rows:
            sid = by_batch[row.batch_id]
            if as_cash and sid in arbitrage:
                continue
            key = ASSET_CLASS_MAP[row.asset_type]
            if key:
                part = scope.values[sid] * row.pct_to_nav / 100
                amounts[key] += part
                by_fund[key][sid] = by_fund[key].get(sid, ZERO) + part
            if key == "equity":
                equity_rows.append(row)
        if as_cash:
            amounts["cash_like"] += sum((scope.values[sid] for sid in arbitrage), ZERO)
            for sid in arbitrage:
                by_fund["cash_like"][sid] = by_fund["cash_like"].get(sid, ZERO) + scope.values[sid]
        equity_table = build_lookthrough_table(replace(scope, raw_rows=equity_rows))
        cap = build_cap_allocation(db, equity_table, equity_types)
        def pct(value):
            return value / scope.covered * 100 if scope.covered else ZERO
        def class_funds(key):
            # Only funds with a positive part are listed, and shares are over the sum of those
            # positive parts: a negative line (e.g. a short/derivative-like row) would otherwise
            # push a share above 100, below 0, or make it 0% when the class total nets to 0.
            parts = sorted(((sid, part) for sid, part in by_fund[key].items() if part > 0),
                           key=lambda item: (-item[1], str(item[0])))
            positive_total = sum((part for _, part in parts), ZERO)
            return [AssetAllocationClassFund(scheme_id=sid, scheme_name=scope.schemes[sid].name, value=part,
                                             percentage=part / positive_total * 100)
                    for sid, part in parts]
        return AssetAllocationVariant(
            classes=[AssetAllocationClass(key=key, value=value, percentage=pct(value), funds=class_funds(key))
                     for key, value in amounts.items()],
            equity_outer=[AssetAllocationOuter(key=b.key, value=b.value, percentage=pct(b.value)) for b in cap.buckets],
            cap_allocation=cap,
        )
    disclosed = variant(False)
    return AssetAllocationSummary(
        as_disclosed=disclosed, arbitrage_as_cash=variant(True) if arbitrage else disclosed,
        total_portfolio_value=scope.total, covered_value=scope.covered,
        nav_as_of=table.nav_as_of, holdings_as_of=table.holdings_as_of,
        coverage=scope.coverage, hide_headlines=table.hide_headlines,
        excluded_share=sum((scope.values[by_batch[r.batch_id]] * r.pct_to_nav / 100
                            for r in scope.raw_rows if ASSET_CLASS_MAP[r.asset_type] is None), ZERO) / scope.total * 100 if scope.total else ZERO,  # same denominator (total portfolio value) as every other section's banner
        arbitrage_funds=[CoverageFund(scheme_id=sid, scheme_name=scope.schemes[sid].name) for sid in scope.selected if sid in arbitrage],
    )
