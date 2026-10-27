import { describe, expect, it } from "vitest";
import {
  formatUnits, buildOverviewInsights, buildSynopsis, changeDirection, coverageHeadline, dayMonth, excludedFundCount, formatSignedPercent,
  formatSignedRupees, formatXirr, holdingTotals, monthlySipTotal, nextSort, parseSortParams, percentOf, sortHoldings,
  sparkPoints, sparkTrend, splitByPlan, todayChangePct,
} from "./mfCopy";
import * as fx from "./fixtures";
import type { HistoryPoint, HoldingRow } from "./types";

const rows = () => fx.holdings();
const alloc = () => fx.allocation().allocation;
const key = (row: HoldingRow) => row.scheme_id;

describe("changeDirection and signed formats", () => {
  it.each([[null, "flat"], [undefined, "flat"], ["", "flat"], ["abc", "flat"], ["0", "flat"], ["-0.00", "flat"], ["12.5", "up"], ["+3", "up"], ["-0.01", "down"]] as const)("changeDirection(%s) is %s", (input, out) => {
    expect(changeDirection(input)).toBe(out);
  });
  it("signs rupees and percentages", () => {
    expect(formatSignedRupees("12.00")).toBe("+₹12");
    expect(formatSignedRupees("-1960.00")).toBe("-₹1,960");
    expect(formatSignedRupees("0.00")).toBe("₹0");
    expect(formatSignedRupees(null)).toBe("—");
    expect(formatSignedPercent("29.9424")).toBe("+29.9%");
    expect(formatSignedPercent("-0.1996", 2)).toBe("-0.20%");
  });
  it("shows an XIRR fraction as a percentage without float maths", () => {
    expect(formatXirr("0.1612")).toBe("16.1%");
    expect(formatXirr("0.3488967977667153354496159637")).toBe("34.9%");
    expect(formatXirr("-0.052")).toBe("-5.2%");
    expect(formatXirr(null)).toBe("—");
    expect(formatXirr(undefined)).toBe("—");
  });
  it("formats units with Indian grouping and keeps the fraction as it is", () => {
    expect(formatUnits("4218.332")).toBe("4,218.332");
    expect(formatUnits("123456789.5")).toBe("12,34,56,789.5");
    expect(formatUnits("12")).toBe("12");
    expect(formatUnits(null)).toBe("—");
  });
  it("formats a due date as day and month", () => {
    expect(dayMonth("2026-10-24")).toBe("24 Oct");
    expect(dayMonth("2026-11-05")).toBe("05 Nov");
  });
});

describe("percentOf", () => {
  it("is an exact four-place percentage, half up", () => {
    expect(percentOf("1071340.00", "3578000.00")).toBe("29.9424");
    expect(percentOf("1.00", "3.00")).toBe("33.3333");
    expect(percentOf("2.00", "3.00")).toBe("66.6667");
    expect(percentOf("0", "10")).toBe("0.0000");
    expect(percentOf("-1960", "981960")).toBe("-0.1996");
  });
  it("is null for a zero, negative or unreadable whole", () => {
    expect(percentOf("5", "0")).toBeNull();
    expect(percentOf("5", "-3")).toBeNull();
    expect(percentOf("x", "10")).toBeNull();
  });
});

describe("today's change", () => {
  const byId = (id: string) => rows().find(row => row.scheme_id === id)!;
  it("is today's gain over yesterday's value, to four places", () => {
    expect(todayChangePct(byId("S-KOTAK"))).toBe("0.3009");
    expect(todayChangePct(byId("S-JM"))).toBe("-0.1996");
    expect(todayChangePct(byId("S-HDFC"))).toBe("0.5025");
  });
  it("is null for a fund with no price, with no gain figure or with a stale NAV", () => {
    expect(todayChangePct(byId("S-AXIS"))).toBeNull();
    expect(todayChangePct(byId("S-SBI"))).toBeNull();
    expect(todayChangePct({ ...byId("S-KOTAK"), today_gain: null })).toBeNull();
  });
  it("is zero for a fund priced from its statement", () => {
    expect(todayChangePct({ ...byId("S-KOTAK"), today_gain: "0.00", price_from_statement: true })).toBe("0.0000");
  });
});

describe("holdingTotals", () => {
  it("sums only the valued funds, today's gain only the non-stale ones", () => {
    const totals = holdingTotals(rows());
    expect(totals).toMatchObject({ value: "4649340.00", invested: "3578000.00", unrealised: "1071340.00", unrealisedPct: "29.9424", todayGain: "9210.00", staleCount: 1, unpricedCount: 1 });
    expect(totals.todayPct).toBe("0.2410");
  });
  it("has null percentages and zero counts for no rows", () => {
    expect(holdingTotals([])).toMatchObject({ value: "0", invested: "0", unrealisedPct: null, todayPct: null, staleCount: 0, unpricedCount: 0 });
  });
});

describe("plan split, SIP total, synopsis and insights", () => {
  it("splits valued funds by plan into whole percentages that sum to 100", () => {
    expect(splitByPlan(rows())).toEqual({ direct: 82, regular: 18 });
    const only = rows().filter(row => row.plan_type === "direct");
    expect(splitByPlan(only)).toEqual({ direct: 100, regular: 0 });
    expect(splitByPlan(rows().map(row => ({ ...row, plan_type: "unclassified" as const })))).toBeNull();
    const split = splitByPlan(rows())!;
    expect(split.direct + split.regular).toBe(100);
  });
  it("counts twin SIPs and ignores stopped ones", () => {
    expect(monthlySipTotal(fx.sips().sips)).toBe("50575.00");
    expect(monthlySipTotal([])).toBe("0");
    expect(monthlySipTotal(fx.sips().sips.filter(row => row.status === "stopped"))).toBe("0");
  });
  it("writes the one-sentence synopsis", () => {
    expect(buildSynopsis(alloc(), rows(), "50575.00")).toBe("Spread across 4 AMCs and 5 funds — 82% in Direct plans, with ₹50,575 in active SIPs this month.");
    expect(buildSynopsis(alloc(), rows(), null)).toBe("Spread across 4 AMCs and 5 funds — 82% in Direct plans.");
    expect(buildSynopsis(alloc(), rows(), "0")).toBe("Spread across 4 AMCs and 5 funds — 82% in Direct plans.");
    expect(buildSynopsis({ ...alloc(), by_amc: alloc().by_amc.slice(0, 1) }, rows().slice(0, 1), null)).toBe("Spread across 1 AMC and 1 fund — 100% in Direct plans.");
  });
  it("writes exactly four insight lines in the mockup's order", () => {
    expect(buildOverviewInsights(alloc(), rows(), "50575.00")).toEqual([
      "Your largest holding is Kotak Multi Cap Fund — 33.1% of your MF portfolio",
      "Spread across 4 AMCs and 5 funds",
      "82% Direct, 18% Regular",
      "₹50,575 in active SIPs scheduled this month",
    ]);
  });
  it("omits the SIP line when there are no active SIPs and the split when nothing is classified", () => {
    expect(buildOverviewInsights(alloc(), rows(), "0")).toHaveLength(3);
    expect(buildOverviewInsights(alloc(), rows(), null)).toHaveLength(3);
    expect(buildOverviewInsights(alloc(), rows().map(row => ({ ...row, plan_type: "unclassified" as const })), "50575.00")).toHaveLength(3);
  });
  it("adds a fund held by two members into one largest holding", () => {
    const two = [...rows().slice(1, 3), { ...rows()[1], household_member_id: "m3", current_value: "900000.00" }];
    expect(buildOverviewInsights(alloc(), two, null)[0]).toMatch(/^Your largest holding is JM Flexi Cap Fund — /);
  });
});

describe("coverage", () => {
  it("lists each excluded fund once with its reason and gives the headline percentage", () => {
    const head = coverageHeadline(fx.coverage());
    expect(head.pct).toBe("92.5%");
    expect(head.excluded).toEqual([
      { scheme_id: "S-A", scheme_name: "Fund A", reason: "Holdings not published yet" },
      { scheme_id: "S-B", scheme_name: "Fund B", reason: "Not available from the AMC" },
      { scheme_id: "S-C", scheme_name: "Fund C", reason: "No current value" },
    ]);
    expect(excludedFundCount(fx.coverage())).toBe(3);
  });
  it("counts zero when every fund is covered", () => {
    const cov = { ...fx.coverage(), not_published_yet: [], not_available_from_amc: [], missing_value_schemes: [] };
    expect(excludedFundCount(cov)).toBe(0);
    expect(coverageHeadline(cov).excluded).toEqual([]);
  });
});

describe("sorting", () => {
  it("reads sort and direction from the query string and ignores bad values", () => {
    expect(parseSortParams("?sort=today_change&dir=desc")).toEqual({ key: "today_change", dir: "desc" });
    expect(parseSortParams("sort=value&dir=asc")).toEqual({ key: "value", dir: "asc" });
    expect(parseSortParams("?sort=xirr")).toEqual({ key: "xirr", dir: "desc" });
    expect(parseSortParams("?sort=value&dir=sideways")).toEqual({ key: "value", dir: "desc" });
    expect(parseSortParams("?sort=bogus&dir=asc")).toBeNull();
    expect(parseSortParams("")).toBeNull();
  });
  it("first click descending, then flips, and a new column starts descending", () => {
    expect(nextSort(null, "value")).toEqual({ key: "value", dir: "desc" });
    expect(nextSort({ key: "value", dir: "desc" }, "value")).toEqual({ key: "value", dir: "asc" });
    expect(nextSort({ key: "value", dir: "asc" }, "value")).toEqual({ key: "value", dir: "desc" });
    expect(nextSort({ key: "value", dir: "asc" }, "invested")).toEqual({ key: "invested", dir: "desc" });
  });
  it("leaves the order alone without a sort and returns a new array", () => {
    const input = rows();
    const out = sortHoldings(input, null, {});
    expect(out.map(key)).toEqual(input.map(key));
    expect(out).not.toBe(input);
  });
  it("sorts by value, invested and gain with unpriced funds last in both directions", () => {
    expect(sortHoldings(rows(), { key: "value", dir: "desc" }, {}).map(key)).toEqual(["S-KOTAK", "S-HDFC", "S-JM", "S-SBI", "S-AXIS"]);
    expect(sortHoldings(rows(), { key: "value", dir: "asc" }, {}).map(key)).toEqual(["S-SBI", "S-JM", "S-HDFC", "S-KOTAK", "S-AXIS"]);
    expect(sortHoldings(rows(), { key: "invested", dir: "desc" }, {}).map(key)).toEqual(["S-KOTAK", "S-HDFC", "S-JM", "S-SBI", "S-AXIS"]);
    expect(sortHoldings(rows(), { key: "gain", dir: "asc" }, {}).map(key)).toEqual(["S-JM", "S-SBI", "S-KOTAK", "S-HDFC", "S-AXIS"]);
  });
  it("sorts by today's change with dashes last", () => {
    expect(sortHoldings(rows(), { key: "today_change", dir: "desc" }, {}).map(key)).toEqual(["S-HDFC", "S-KOTAK", "S-JM", "S-SBI", "S-AXIS"]);
    expect(sortHoldings(rows(), { key: "today_change", dir: "asc" }, {}).map(key)).toEqual(["S-JM", "S-KOTAK", "S-HDFC", "S-SBI", "S-AXIS"]);
  });
  it("sorts by XIRR from the per-fund map, funds without one last", () => {
    const xirr = { "S-KOTAK": "0.1420", "S-JM": "0.1860", "S-HDFC": "0.2130", "S-SBI": null };
    expect(sortHoldings(rows(), { key: "xirr", dir: "desc" }, xirr).map(key)).toEqual(["S-HDFC", "S-JM", "S-KOTAK", "S-SBI", "S-AXIS"]);
    expect(sortHoldings(rows(), { key: "xirr", dir: "asc" }, xirr).map(key)).toEqual(["S-KOTAK", "S-JM", "S-HDFC", "S-SBI", "S-AXIS"]);
  });
});

describe("sparkline", () => {
  const pt = (value: number): HistoryPoint => ({ month: "m", value, invested: null, valueText: String(value), investedText: null, partial: false, missing: [] });
  it("maps month-end values onto a 72 by 26 box", () => {
    expect(sparkPoints([pt(100), pt(150), pt(200)])).toBe("0,24 36,13 72,2");
    expect(sparkPoints([pt(5), pt(5)])).toBe("0,13 72,13");
    expect(sparkPoints([pt(5)])).toBe("");
    expect(sparkPoints([])).toBe("");
  });
  it("reads the trend from the first and last point", () => {
    expect(sparkTrend([pt(1), pt(9), pt(2)])).toBe("up");
    expect(sparkTrend([pt(5), pt(1)])).toBe("down");
    expect(sparkTrend([pt(3), pt(3)])).toBe("flat");
    expect(sparkTrend([pt(3)])).toBe("flat");
  });
});
