import { describe, expect, it } from "vitest";
import type { OverlapTopFund } from "@/features/individual-fund/types";
import { filterOverlapFunds } from "@/features/individual-fund/overlap/fundListSearch";

const funds: OverlapTopFund[] = [
  { scheme_id: "growth", scheme_name: "Example Growth Fund", overlap_pct: "30.0", common_stock_count: 3 },
  { scheme_id: "bond", scheme_name: "Horizon Bond Fund", overlap_pct: "20.0", common_stock_count: 2 },
  { scheme_id: "equity", scheme_name: "Example Equity Growth Fund", overlap_pct: "10.0", common_stock_count: 1 },
];

describe("overlap fund list search", () => {
  it("empty text returns funds untouched", () => {
    expect(filterOverlapFunds(funds, "")).toBe(funds);
  });
  it("matches the fund name", () => {
    expect(filterOverlapFunds(funds, "GROWTH")).toEqual([funds[0], funds[2]]);
    expect(filterOverlapFunds(funds, "horizon")).toEqual([funds[1]]);
  });
  it("every word must match", () => {
    expect(filterOverlapFunds(funds, "equity example")).toEqual([funds[2]]);
    expect(filterOverlapFunds(funds, "example equity")).toEqual([funds[2]]);
    expect(filterOverlapFunds(funds, "growth bond")).toEqual([]);
  });
});
