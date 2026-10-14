import type { StockHoldingsSummary } from "./types";

export const sampleStockHoldings = {
  rows: [{ isin: "INE002A01018", instrument_name: "Reliance Industries", sector_raw: "Petroleum Products",
    asset_type: "equity_domestic", exposure_pct: "6.55", exposure_value: "65500",
    contributing_funds: [
      { scheme_id: "a", scheme_name: "Fund A", fund_weight_pct: "40", stock_weight_pct: "8", holdings_as_of: "2026-09-30", cadence: "monthly", age_tag: null },
      { scheme_id: "b", scheme_name: "Fund B", fund_weight_pct: "35", stock_weight_pct: "6", holdings_as_of: "2026-07-31", cadence: "monthly", age_tag: "older_than_60_days" },
      { scheme_id: "c", scheme_name: "Fund C", fund_weight_pct: "25", stock_weight_pct: "5", holdings_as_of: "2026-03-31", cadence: "half_yearly", age_tag: "on_cycle" },
    ] }],
  nav_as_of: "2026-10-13", holdings_as_of: "2026-03-31", total_portfolio_value: "1000000",
  coverage: { covered_value_pct: "100", not_published_yet: [], not_available_from_amc: [], missing_value_schemes: [],
    funds: [
      { scheme_id: "a", scheme_name: "Fund A", holdings_as_of: "2026-09-30", cadence: "monthly", age_tag: null },
      { scheme_id: "b", scheme_name: "Fund B", holdings_as_of: "2026-07-31", cadence: "monthly", age_tag: "older_than_60_days" },
      { scheme_id: "c", scheme_name: "Fund C", holdings_as_of: "2026-03-31", cadence: "half_yearly", age_tag: "on_cycle" },
    ] },
  truncated: false, total_stock_count: 1, hide_headlines: false, excluded_share: "-18", non_equity_share: "12",
} satisfies StockHoldingsSummary;
