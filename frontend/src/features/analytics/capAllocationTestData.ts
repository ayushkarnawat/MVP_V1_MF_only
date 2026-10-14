import type { CapAllocationSummary, StockHoldingRow } from "./types";
import { sampleStockHoldings } from "./stockHoldingsTestData";

const row = (name: string, pct: string, value: string, asset: StockHoldingRow["asset_type"] = "equity_domestic"): StockHoldingRow => ({
  isin: name === "Cash" ? null : name, instrument_name: name, sector_raw: "Source sector", asset_type: asset,
  exposure_pct: pct, exposure_value: value,
  contributing_funds: [{ ...sampleStockHoldings.rows[0].contributing_funds[0], fund_weight_pct: "100", stock_weight_pct: pct }],
});
export const sampleCapAllocation = {
  buckets: [
    { key: "LARGE", value: "400", percentage_total: "40", percentage_equity: "50", rows: [row("Large Stock", "40", "400")] },
    { key: "MID", value: "200", percentage_total: "20", percentage_equity: "25", rows: [row("Mid Stock", "20", "200")] },
    { key: "SMALL", value: "100", percentage_total: "10", percentage_equity: "12.5", rows: [row("Small Stock", "10", "100")] },
    { key: "OTHER", value: "300", percentage_total: "30", percentage_equity: "12.5", rows: [] },
  ],
  other: { non_equity_value: "200", unclassified_equity_value: "100",
    non_equity_rows: [row("Debt", "15", "150", "debt"), row("Cash", "5", "50", "cash_equivalent")],
    unclassified_equity_rows: [row("Foreign Stock", "10", "100", "equity_international")] },
  total_portfolio_value: "1000", total_equity_value: "800", nav_as_of: "2026-10-13", holdings_as_of: "2026-06-30",
  classification_as_of: "2026-01-01", coverage: sampleStockHoldings.coverage, hide_headlines: false, excluded_share: "-38",
} satisfies CapAllocationSummary;
