import { describe, expect, it } from "vitest";
import type { InvestmentWithdrawalResult } from "./types";
import { tilesFor, toBarData } from "./investmentWithdrawalMath";

const saved: InvestmentWithdrawalResult = {
  total_invested: "500000.10", total_withdrawn: "10000.20", net_invested: "489999.90",
  current_value: "600000.00", absolute_gain: "110000.10", gifts_net: "0.00",
  monthly: [{ period: "2024-03", invested: "10000.10", withdrawn: "100.20", entries: [] }],
  yearly: [], sip_summary: { active_count: 0, total_monthly_amount: "0.00", missed_count: 0 },
};

describe("tilesFor", () => {
  it("adds switches to Invested and Withdrawn and preserves Net invested", () => {
    const data = { ...saved, total_switched_in: "400000.25", total_switched_out: "400000.75" };
    expect(tilesFor(data, false)).toEqual({ invested: "500000.10", withdrawn: "10000.20", net: "489999.90" });
    expect(tilesFor(data, true)).toEqual({ invested: "900000.35", withdrawn: "410000.95", net: "489999.90" });
    expect(data.absolute_gain).toBe("110000.10");
  });

  it("treats missing switch fields on a saved payload as zero", () => {
    expect(tilesFor(saved, true)).toEqual(tilesFor(saved, false));
  });

  it("keeps amounts above the safe integer limit exact", () => {
    expect(tilesFor({ ...saved, total_invested: "9007199254740993.01", total_switched_in: "0.02" }, true).invested)
      .toBe("9007199254740993.03");
  });
});

describe("toBarData", () => {
  it("keeps switches as separate geometry values controlled by the toggle", () => {
    const buckets = [{ ...saved.monthly[0], invested: "-5000.00", switched_in: "20.25", switched_out: "30.75" }];
    expect(toBarData(buckets, false)).toEqual([{ period: "2024-03", invested: -5000, withdrawn: 100.2, switchedIn: 0, switchedOut: 0 }]);
    expect(toBarData(buckets, true)).toEqual([{ period: "2024-03", invested: -5000, withdrawn: 100.2, switchedIn: 20.25, switchedOut: 30.75 }]);
    expect(buckets[0].switched_in).toBe("20.25");
  });

  it("supports saved buckets without switch fields and an empty timeline", () => {
    expect(toBarData(saved.monthly, true)).toEqual(toBarData(saved.monthly, false));
    expect(toBarData([], true)).toEqual([]);
  });
});
