import { describe, expect, it } from "vitest";
import * as fb from "../fixtures/mfB";
import type { InvestmentWithdrawalEntry } from "../types";
import { barHeights, cashFlowTiles, filterFor, kindOf, LEDGER_FILTERS, LEDGER_PAGE, ledgerRows, outflow, periodTitle, shortPeriod } from "./transactionsLogic";

const entry = (direction: InvestmentWithdrawalEntry["direction"], over: Partial<InvestmentWithdrawalEntry> = {}): InvestmentWithdrawalEntry => ({
  transaction_id: "t", date: "2026-01-01", type: "purchase", amount: "1.00", direction, scheme_name: "F", household_member_id: "m1", household_member_name: "A", ...over,
});

describe("period labels", () => {
  it("writes a month in full and a year as it is", () => {
    expect(periodTitle("2026-10")).toBe("October 2026");
    expect(periodTitle("2025-01")).toBe("January 2025");
    expect(periodTitle("2026")).toBe("2026");
  });
  it("shortens a month for the axis with a curly apostrophe", () => {
    expect(shortPeriod("2026-10")).toBe("Oct ’26");
    expect(shortPeriod("2025-12")).toBe("Dec ’25");
    expect(shortPeriod("2026")).toBe("2026");
  });
});

describe("kinds and filters", () => {
  it("maps each direction to a kind, and the opening balance to none", () => {
    expect((["invested", "reversal", "withdrawn", "switched_in", "switched_out", "opening"] as const).map(direction => kindOf(entry(direction)))).toEqual([
      "purchase", "reversal", "redemption", "switch", "switch", null,
    ]);
  });
  it("puts a bounced SIP under Purchases", () => {
    expect((["purchase", "reversal", "redemption", "switch"] as const).map(filterFor)).toEqual(["purchases", "purchases", "redemptions", "switches"]);
  });
  it("lists the four filters with All first", () => {
    expect(LEDGER_FILTERS.map(filter => [filter.id, filter.label])).toEqual([["all", "All"], ["purchases", "Purchases"], ["redemptions", "Redemptions"], ["switches", "Switches"]]);
    expect(LEDGER_PAGE).toBe(50);
  });
});

describe("ledgerRows", () => {
  const buckets = () => fb.investmentWithdrawal().monthly;
  it("lists every dated transaction newest first, the opening balance left out, ties by transaction id descending", () => {
    const rows = ledgerRows(buckets(), "all");
    expect(rows).toHaveLength(66);
    expect(rows.slice(0, 5).map(row => row.entry.transaction_id)).toEqual(["t-0067", "t-0066", "t-0065", "t-0064", "t-0063"]);
    expect(rows.some(row => row.entry.direction === "opening")).toBe(false);
    expect(rows[rows.length - 1].entry.transaction_id).toBe("t-0002");
  });
  it("filters by type", () => {
    expect(ledgerRows(buckets(), "purchases")).toHaveLength(62);
    expect(ledgerRows(buckets(), "redemptions").map(row => row.entry.transaction_id)).toEqual(["t-0029", "t-0028"]);
    expect(ledgerRows(buckets(), "switches").map(row => [row.entry.transaction_id, row.kind])).toEqual([["t-0046", "switch"], ["t-0045", "switch"]]);
  });
  it("counts the bounced SIP as a purchase row of its own kind", () => {
    const reversal = ledgerRows(buckets(), "purchases").find(row => row.entry.direction === "reversal");
    expect(reversal?.kind).toBe("reversal");
  });
  it("is empty for no buckets", () => {
    expect(ledgerRows([], "all")).toEqual([]);
  });
});

describe("cashFlowTiles", () => {
  it("takes the totals, nets the switches exactly and leaves net invested as the backend sent it", () => {
    expect(cashFlowTiles(fb.investmentWithdrawal())).toEqual({ invested: "941895.00", withdrawn: "23500.00", netSwitched: "0.00", netInvested: "918395.00" });
  });
  it("shows a negative net switch and copes with a payload without switch totals", () => {
    const data = fb.investmentWithdrawal();
    data.total_switched_in = "10.50";
    data.total_switched_out = "70.25";
    expect(cashFlowTiles(data).netSwitched).toBe("-59.75");
    delete data.total_switched_in;
    delete data.total_switched_out;
    expect(cashFlowTiles(data).netSwitched).toBe("0");
  });
});

describe("outflow and barHeights", () => {
  const monthly = () => fb.investmentWithdrawal().monthly;
  it("adds withdrawn and switched out", () => {
    const june = monthly().find(bucket => bucket.period === "2026-06")!;
    expect(outflow(june)).toBe("50000.00");
    const march = monthly().find(bucket => bucket.period === "2026-03")!;
    expect(outflow(march)).toBe("23500.00");
  });
  it("scales every bar to the tallest one on the chart", () => {
    const heights = new Map(barHeights(monthly()).map(item => [item.period, item]));
    expect(heights.get("2025-12")).toEqual({ period: "2025-12", invested: 100, outflow: 0 });
    expect(heights.get("2026-01")?.invested).toBe(33.59);
    expect(heights.get("2026-08")?.invested).toBe(30.26);
    expect(heights.get("2026-03")?.outflow).toBe(15.61);
    expect(heights.get("2026-06")?.outflow).toBe(33.21);
  });
  it("gives no bar to an empty chart", () => {
    expect(barHeights([{ period: "2026-01", invested: "0.00", withdrawn: "0.00", entries: [] }])).toEqual([{ period: "2026-01", invested: 0, outflow: 0 }]);
    expect(barHeights([])).toEqual([]);
  });
});
