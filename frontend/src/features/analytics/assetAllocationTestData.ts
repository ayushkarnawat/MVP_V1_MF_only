import type { AssetAllocationSummary } from "./types";
import { sampleCapAllocation } from "./capAllocationTestData";
const cap = { ...sampleCapAllocation, buckets: sampleCapAllocation.buckets.map(b => b.key === "OTHER" ? { ...b, value: "100", percentage_total: "10" } : b), other: { ...sampleCapAllocation.other, non_equity_value: "0", non_equity_rows: [] } };
const variant = {
  classes: [{ key: "equity", value: "800", percentage: "80" }, { key: "debt", value: "150", percentage: "15" }, { key: "gold", value: "0", percentage: "0" }, { key: "cash_like", value: "50", percentage: "5" }],
  equity_outer: cap.buckets.map(b => ({ key: b.key, value: b.value, percentage: b.percentage_total })), cap_allocation: cap,
} as const;
export const sampleAssetAllocation = {
  as_disclosed: { ...variant, classes: [...variant.classes] },
  arbitrage_as_cash: { ...variant, classes: [{ key: "equity", value: "0", percentage: "0" }, { key: "debt", value: "0", percentage: "0" }, { key: "gold", value: "0", percentage: "0" }, { key: "cash_like", value: "1000", percentage: "100" }], equity_outer: variant.equity_outer.map(b => ({ ...b, value: "0", percentage: "0" })), cap_allocation: { ...cap, total_equity_value: "0", buckets: cap.buckets.map(b => ({ ...b, value: "0", percentage_total: "0", percentage_equity: "0", rows: [] })), other: { ...cap.other, unclassified_equity_value: "0", unclassified_equity_rows: [] } } },
  total_portfolio_value: "1000", covered_value: "1000", nav_as_of: cap.nav_as_of, holdings_as_of: cap.holdings_as_of,
  coverage: cap.coverage, hide_headlines: false, excluded_share: "-38", arbitrage_funds: [{ scheme_id: "arb", scheme_name: "Arbitrage A" }],
} satisfies AssetAllocationSummary;
