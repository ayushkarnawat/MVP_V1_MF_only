import { describe, expect, it } from "vitest";
import {
  axisLabel, changeDirection, formatDate, formatNav, formatSignedPercent, formatSignedRupees, formatWhole, formatXirr,
  lastPct, planPill, seriesValues, shareLine, shortCategory,
} from "./fundFormat";

describe("changeDirection", () => {
  it.each([
    ["12.00", "up"], ["+5", "up"], ["-0.40", "down"], ["0", "flat"], ["0.00", "flat"], ["-0.00", "flat"],
    [null, "flat"], [undefined, "flat"], ["", "flat"], ["abc", "flat"],
  ])("%s is %s", (value, expected) => {
    expect(changeDirection(value as string | null | undefined)).toBe(expected);
  });
});

describe("formatSignedRupees", () => {
  it.each([
    ["650.00", "+₹650"], ["1234567.00", "+₹12,34,567"], ["-120.40", "-₹120"], ["0.00", "₹0"], ["-0.40", "₹0"], [null, "—"], ["x", "—"],
  ])("%s is %s", (value, expected) => {
    expect(formatSignedRupees(value)).toBe(expected);
  });
});

describe("formatSignedPercent", () => {
  it.each([
    ["40.6250", undefined, "+40.6%"], ["-7.5000", undefined, "-7.5%"], ["0.0000", undefined, "0.0%"], ["10.0000", 2, "+10.00%"], [null, undefined, "—"],
  ])("%s with %s digits is %s", (value, digits, expected) => {
    expect(formatSignedPercent(value, digits)).toBe(expected);
  });
});

describe("formatXirr (the backend sends a fraction: never multiply)", () => {
  it.each([
    ["0.185300", "18.5%"], ["0.18", "18.0%"], ["-0.0525", "-5.3%"], ["0", "0.0%"], ["1.5", "150.0%"], [null, "—"], ["abc", "—"],
  ])("%s is %s", (value, expected) => {
    expect(formatXirr(value)).toBe(expected);
  });
});

describe("formatNav", () => {
  it.each([
    ["15.0000", "₹15.00"], ["10.6667", "₹10.67"], ["1234.5678", "₹1,234.57"], ["123456.7", "₹1,23,456.70"], ["0.005", "₹0.01"],
    ["-12.345", "-₹12.35"], [null, "—"], ["x", "—"],
  ])("%s is %s", (value, expected) => {
    expect(formatNav(value)).toBe(expected);
  });
});

describe("formatWhole", () => {
  it.each([["71.00", "71"], ["71.50", "72"], ["71.49", "71"], ["0", "0"], ["99.9", "100"], [null, "—"], ["x", "—"]])("%s is %s", (value, expected) => {
    expect(formatWhole(value)).toBe(expected);
  });
});

describe("shortCategory", () => {
  it.each([
    ["Equity Scheme - Flexi Cap Fund", "Flexi Cap"], ["Equity Scheme - Large Cap Fund", "Large Cap"], ["Debt Scheme - Liquid Fund", "Liquid"],
    ["Other Scheme - Index Funds", "Index"], ["Hybrid Scheme - Aggressive Hybrid Fund", "Aggressive Hybrid"], ["Gold ETF", "Gold ETF"], ["", ""], [null, ""],
  ])("%s is %s", (value, expected) => {
    expect(shortCategory(value as string | null)).toBe(expected);
  });
});

describe("planPill", () => {
  it.each([["Direct", "Direct Plan"], ["Regular", "Regular Plan"], ["Direct Plan", "Direct Plan"], ["", ""], [null, ""]])("%s is %s", (value, expected) => {
    expect(planPill(value as string | null)).toBe(expected);
  });
});

describe("shareLine", () => {
  it.each([["45.0000", "45.0% of portfolio"], ["0.04", "0.0% of portfolio"], [null, ""], ["x", ""]])("%s is %s", (value, expected) => {
    expect(shareLine(value)).toBe(expected);
  });
});

describe("axisLabel", () => {
  it.each([
    ["2025-08-05", "1M", "5 Aug"], ["2025-08-05", "3M", "5 Aug"], ["2025-08-05", "6M", "5 Aug"],
    ["2025-08-05", "1Y", "Aug 25"], ["2026-01-23", "3Y", "Jan 26"], ["2021-12-31", "5Y", "Dec 21"], ["2021-12-31", "All", "Dec 21"],
    ["bad", "1Y", "—"], ["", "1M", "—"], ["2025-13-01", "1Y", "—"],
  ] as const)("%s for %s is %s", (iso, period, expected) => {
    expect(axisLabel(iso, period)).toBe(expected);
  });
});

describe("series helpers", () => {
  it("seriesValues turns percent strings into chart numbers and tolerates null", () => {
    expect(seriesValues([{ date: "2025-10-23", pct: "0.0000" }, { date: "2025-11-24", pct: "-2.5000" }])).toEqual([0, -2.5]);
    expect(seriesValues(null)).toEqual([]);
  });

  it("lastPct is the last point's string, or null for an empty or missing series", () => {
    expect(lastPct([{ date: "a", pct: "1.0000" }, { date: "b", pct: "13.1000" }])).toBe("13.1000");
    expect(lastPct([])).toBeNull();
    expect(lastPct(undefined)).toBeNull();
  });

  it("formatDate is the kit's DD Mon YYYY", () => {
    expect(formatDate("2026-10-23")).toBe("23 Oct 2026");
    expect(formatDate(null)).toBe("—");
  });
});
