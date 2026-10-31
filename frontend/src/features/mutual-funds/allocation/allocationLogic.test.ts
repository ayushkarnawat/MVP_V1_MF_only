import { describe, expect, it } from "vitest";
import * as fx from "../fixtures";
import * as fb from "../fixtures/mfB";
import {
  assetSlices,
  bucketSlices,
  capSlices,
  chartPct,
  colorAt,
  fundsInSlice,
  hasNegative,
  largestSlice,
  managerKey,
  managerSlices,
  outerArcs,
} from "./allocationLogic";

describe("colours and chart percentages", () => {
  it("takes the palette in order and wraps after eight", () => {
    expect([colorAt(0), colorAt(7), colorAt(8)]).toEqual(["var(--c1)", "var(--c8)", "var(--c1)"]);
  });
  it("gives the chart zero for a negative net position and leaves a positive one alone", () => {
    expect(chartPct("-1.00")).toBe("0");
    expect(chartPct("5.00")).toBe("5.00");
    expect(chartPct("0.00")).toBe("0.00");
  });
});

describe("asset class slices", () => {
  const variant = fb.assetAllocation().as_disclosed;
  it("labels the five classes and keeps the backend's values and percentages", () => {
    expect(assetSlices(variant).map(slice => [slice.key, slice.label, slice.value, slice.pct, slice.color])).toEqual([
      ["equity", "Equity", "3315000.00", "78.00", "var(--c1)"],
      ["debt", "Debt", "722500.00", "17.00", "var(--c2)"],
      ["gold", "Gold", "212500.00", "5.00", "var(--c3)"],
      ["real_estate", "Real Estate (REITs and InvITs)", "0.00", "0.00", "var(--c4)"],
      ["others", "Others", "0.00", "0.00", "var(--c5)"],
    ]);
  });
  it("builds the outer ring with equity replaced by its four cap arcs, each remembering its class", () => {
    const arcs = outerArcs(variant);
    expect(arcs.map(arc => [arc.key, arc.classKey, arc.label, arc.pct, arc.color])).toEqual([
      ["large", "equity", "Large Cap", "42.00", "var(--c4)"],
      ["mid", "equity", "Mid Cap", "20.00", "var(--c5)"],
      ["small", "equity", "Small Cap", "6.00", "var(--c6)"],
      ["other", "equity", "Other / Unclassified", "10.00", "var(--c7)"],
      ["debt", "debt", "Debt", "17.00", "var(--c2)"],
      ["gold", "gold", "Gold", "5.00", "var(--c3)"],
      ["real_estate", "real_estate", "Real Estate (REITs and InvITs)", "0.00", "var(--c4)"],
      ["others", "others", "Others", "0.00", "var(--c5)"],
    ]);
  });
  it("follows the arbitrage variant", () => {
    const asCash = fb.assetAllocation().arbitrage_as_cash;
    expect(assetSlices(asCash).map(slice => slice.pct)).toEqual(["70.00", "25.00", "5.00", "0.00", "0.00"]);
    expect(outerArcs(asCash).find(arc => arc.key === "other")?.pct).toBe("2.00");
  });
});

describe("market-cap slices", () => {
  const summary = fb.capAllocation();
  it("uses the share of the total portfolio or of equity only, with lower-case keys", () => {
    expect(capSlices(summary, false).map(slice => [slice.key, slice.label, slice.pct])).toEqual([
      ["large", "Large Cap", "38.39"], ["mid", "Mid Cap", "18.28"], ["small", "Small Cap", "5.48"], ["other", "Other / Unclassified", "37.84"],
    ]);
    expect(capSlices(summary, true).map(slice => slice.pct)).toEqual(["53.85", "25.64", "7.69", "12.82"]);
    expect(capSlices(summary, false)[0].value).toBe("1785000.00");
  });
});

describe("largestSlice and hasNegative", () => {
  const slice = (key: string, pct: string) => ({ key, label: key, value: "1", pct, color: "x" });
  it("finds the highest percentage by exact comparison, the first on a tie, null for none", () => {
    expect(largestSlice([slice("a", "9.99"), slice("b", "10.00"), slice("c", "10.00")])?.key).toBe("b");
    expect(largestSlice([slice("a", "-1.00"), slice("b", "-2.00")])?.key).toBe("a");
    expect(largestSlice([])).toBeNull();
  });
  it("spots a negative percentage", () => {
    expect(hasNegative([slice("a", "5.00"), slice("b", "-0.50")])).toBe(true);
    expect(hasNegative([slice("a", "0.00")])).toBe(false);
  });
});

describe("bucketSlices", () => {
  const items = fb.analyticsAllocation().by_category;
  it("sorts by percentage, largest first or smallest first, with a stable colour per label", () => {
    const desc = bucketSlices(items, "desc");
    expect(desc.map(slice => [slice.key, slice.pct, slice.color])).toEqual([
      ["flexi-cap-fund", "54.20", "var(--c1)"], ["mid-cap-fund", "28.18", "var(--c2)"], ["large-cap-fund", "17.62", "var(--c3)"],
    ]);
    const asc = bucketSlices(items, "asc");
    expect(asc.map(slice => slice.label)).toEqual(["Large Cap Fund", "Mid Cap Fund", "Flexi Cap Fund"]);
    expect(asc[0].color).toBe("var(--c3)");
  });
  it("breaks a tie by label", () => {
    const tied = bucketSlices([{ label: "B Fund", current_value: "1.00", percentage: "10.00" }, { label: "A Fund", current_value: "1.00", percentage: "10.00" }], "desc");
    expect(tied.map(slice => slice.label)).toEqual(["A Fund", "B Fund"]);
  });
});

describe("manager slices", () => {
  const groups = fb.fundManager().manager_groups;
  it("keys a manager by name and fund house so two houses never collide", () => {
    expect(managerKey(groups[0])).toBe("harsha-upadhyaya-kotak-mahindra-mf");
    expect(managerKey({ manager_name: "A B", amc_name: "X MF" })).not.toBe(managerKey({ manager_name: "A B", amc_name: "Y MF" }));
  });
  it("turns the groups into slices in payload order", () => {
    expect(managerSlices(groups).map(slice => [slice.label, slice.value, slice.pct, slice.color])).toEqual([
      ["Harsha Upadhyaya", "1540000.00", "33.12", "var(--c1)"],
      ["Chirag Setalvad", "1310000.00", "28.18", "var(--c2)"],
      ["Satish Ramanathan", "980000.00", "21.08", "var(--c3)"],
    ]);
  });
});

describe("fundsInSlice", () => {
  it("lists the priced funds of a category, largest first, with their exact share of the slice and the largest marked", () => {
    const result = fundsInSlice("category", "Flexi Cap Fund", fx.holdings(), "2520000.00");
    expect(result.count).toBe(2);
    expect(result.funds.map(fund => [fund.schemeId, fund.value, fund.share, fund.largest])).toEqual([
      ["S-KOTAK", "1540000.00", "61.1111", true],
      ["S-JM", "980000.00", "38.8889", false],
    ]);
  });
  it("groups a fund held by two members into one row", () => {
    const rows = fx.holdings();
    rows.push({ ...rows[0], household_member_id: "m2", household_member_name: "Aarohi", current_value: "100000.00" });
    const result = fundsInSlice("category", "Flexi Cap Fund", rows, "2620000.00");
    expect(result.count).toBe(2);
    expect(result.funds[0]).toMatchObject({ schemeId: "S-KOTAK", value: "1640000.00" });
  });
  it("matches an AMC by its name and leaves out funds with no price", () => {
    expect(fundsInSlice("amc", "HDFC Mutual Fund", fx.holdings(), "1310000.00").funds.map(fund => fund.schemeId)).toEqual(["S-HDFC"]);
    expect(fundsInSlice("amc", "Axis Mutual Fund", fx.holdings(), "400000.00")).toEqual({ funds: [], count: 0 });
  });
  it("leaves out a fund flagged as having no NAV even if a stale value is present", () => {
    const rows = fx.holdings().map(row => (row.scheme_id === "S-JM" ? { ...row, nav_unavailable: true } : row));
    expect(fundsInSlice("category", "Flexi Cap Fund", rows, "1540000.00").funds.map(fund => fund.schemeId)).toEqual(["S-KOTAK"]);
  });
  it("reads the category from the older `category` field when sebi_category is missing", () => {
    const rows = fx.holdings().map(row => ({ ...row, category: row.sebi_category ?? undefined, sebi_category: undefined }));
    expect(fundsInSlice("category", "Mid Cap Fund", rows, "1310000.00").count).toBe(1);
  });
  it("gives a null share when the slice value is zero", () => {
    expect(fundsInSlice("category", "Mid Cap Fund", fx.holdings(), "0.00").funds[0].share).toBeNull();
  });
});
