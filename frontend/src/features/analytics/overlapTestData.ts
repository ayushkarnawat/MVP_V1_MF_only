import { sampleStockHoldings } from "./stockHoldingsTestData";
import type { OverlapSummary } from "./types";
const funds = ["A", "B", "C"].map((name, i) => ({ scheme_id: name, scheme_name: `Fund ${name}`, current_value: String(300-i*100) }));
const pair = (a: number, b: number, overlap: string) => ({ fund_a: funds[a], fund_b: funds[b], overlap_pct: overlap, common_total: 25,
  common_stocks: [{ isin: "INE002A01018", instrument_name: "Reliance Industries", weight_a: "8", weight_b: "6" }] });
const matrix = [pair(0, 1, "42"), pair(0, 2, "20"), pair(1, 2, "10")];
export const sampleOverlap = {
  matrix_funds: funds, matrix, pairs_above_low: [matrix[0]], matrix_truncated: false, total_fund_count: 3, common_stock_limit: 20,
  bands: { low: "20", high: "40" }, concentration: [{ stock_count: 5, exposure_pct: "25" }, { stock_count: 10, exposure_pct: "38" }, { stock_count: 20, exposure_pct: "55" }, { stock_count: 50, exposure_pct: "75" }],
  total_stock_count: 70, nav_as_of: "2026-10-13", holdings_as_of: "2026-09-30", total_portfolio_value: "600",
  coverage: sampleStockHoldings.coverage, hide_headlines: false, excluded_share: "-38",
} satisfies OverlapSummary;
