import { sampleStockHoldings } from "./stockHoldingsTestData";
import type { ValuationSummary } from "./types";
export const sampleValuation = {
  pe: { ratio: "25", coverage_pct: "90", enough_data: true, as_of_date: "2026-10-12", missing: [{ isin: "LOSS", instrument_name: "Loss Stock", exposure_value: "60", percentage_equity: "10", reason: "Loss-making stock: negative earnings" }] },
  pb: { ratio: "3.35", coverage_pct: "100", enough_data: true, as_of_date: "2026-10-12", missing: [] },
  indices: [{ index_name: "nifty_50", pe_ratio: "22.8", pb_ratio: "3.10", pe_as_of: "2026-10-12", pb_as_of: "2026-10-12", pe_delta_pct: "9.649123", pb_delta_pct: "8.064516" },
    { index_name: "nifty_500", pe_ratio: "24", pb_ratio: "3.2", pe_as_of: "2026-10-12", pb_as_of: "2026-10-12", pe_delta_pct: "4.166667", pb_delta_pct: "4.6875" }],
  total_equity_value: "600", total_portfolio_value: "1000", nav_as_of: "2026-10-13", holdings_as_of: "2026-09-30",
  coverage: sampleStockHoldings.coverage, hide_headlines: false, excluded_share: "-38", footnotes: ["Some P/B values use screener.in fallback (current price / book value)."],
} satisfies ValuationSummary;
