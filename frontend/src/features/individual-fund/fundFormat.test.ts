import { describe, expect, it } from "vitest";
import {
  axisLabel, changeDirection, formatDate, formatNav, formatRiskValue, formatSignedPercent, formatSignedRupees, formatWhole, formatXirr,
  lastPct, planPill, riskBarPercent, seriesValues, shareLine, shortCategory, toneChipClass,
  barLabel, fillGaps, initialsOf,
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

describe("formatRiskValue", () => {
  it.each([
    ["volatility", "14.2000", "14.2%"], ["volatility", "9", "9.0%"], ["max_drawdown", "-18.4000", "-18.4%"],
    ["sharpe", "0.8200", "0.82"], ["sharpe", "-0.1250", "-0.13"], ["beta", "0.9800", "0.98"], ["beta", "1.0", "1.00"],
    ["volatility", null, "—"], ["beta", undefined, "—"], ["sharpe", "n/a", "—"], ["max_drawdown", "", "—"],
  ] as const)("%s %s reads %s", (key, value, expected) => {
    expect(formatRiskValue(key, value)).toBe(expected);
  });
});

describe("riskBarPercent", () => {
  it.each([
    ["volatility", "14.2000", 47.3], ["volatility", "0", 0], ["volatility", "45", 100],
    ["max_drawdown", "-18.4000", 40.9], ["max_drawdown", "-60", 100], ["max_drawdown", "-0.0", 0],
    ["sharpe", "0.8200", 41], ["sharpe", "1.15", 57.5], ["sharpe", "-0.5", 4], ["sharpe", "0.01", 4], ["sharpe", "3", 100],
    ["beta", "0.9800", 65.3], ["beta", "2", 100],
    ["beta", null, 0], ["volatility", "abc", 0], ["sharpe", undefined, 0],
  ] as const)("%s %s sits at %s", (key, value, expected) => {
    expect(riskBarPercent(key, value)).toBe(expected);
  });
});

describe("toneChipClass", () => {
  it("gives each tone its own tint and text colour from the palette variables", () => {
    expect(toneChipClass("pos")).toContain("bg-[var(--pos-bg)] text-[var(--pos-text)]");
    expect(toneChipClass("warn")).toContain("bg-[var(--warn-bg)] text-[var(--warn-text)]");
    expect(toneChipClass("neg")).toContain("bg-[var(--neg-bg)] text-[var(--neg-text)]");
    expect(toneChipClass("info")).toContain("text-[var(--c4)]");
    expect(toneChipClass("neu")).toContain("text-[var(--ui-text-muted)]");
  });

  it("is a pill, and an unknown or missing tone is the neutral one", () => {
    for (const tone of ["pos", "warn", "neg", "info", "neu", null, undefined] as const) expect(toneChipClass(tone)).toContain("rounded-full");
    expect(toneChipClass(null)).toBe(toneChipClass("neu"));
    expect(toneChipClass(undefined)).toBe(toneChipClass("neu"));
    expect(toneChipClass("bogus" as never)).toBe(toneChipClass("neu"));
  });
});

describe("initialsOf", () => {
  it.each([
    ["A. Kumar", "AK"], ["R. Menon", "RM"], ["Anil", "A"], ["Rajiv Kumar Singh", "RS"], ["mary-ann lee", "ML"],
    ["  Neha   Rao  ", "NR"], ["", "?"], ["   ", "?"], [null, "?"], [undefined, "?"], ["... ---", "?"],
  ] as const)("%j gives %s", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe("fillGaps", () => {
  it("turns percent strings into chart numbers", () => {
    expect(fillGaps(["14.2000", "14.0000", "-1.5000"])).toEqual([14.2, 14, -1.5]);
  });

  it("a missing point repeats the one before it, and leading gaps take the first known value", () => {
    expect(fillGaps(["12.9000", null, "12.5000", null, null])).toEqual([12.9, 12.9, 12.5, 12.5, 12.5]);
    expect(fillGaps([null, null, "3.0000", "4.0000"])).toEqual([3, 3, 3, 4]);
  });

  it("a series with no value at all is null, so the chart leaves the line out", () => {
    expect(fillGaps([null, null])).toBeNull();
    expect(fillGaps([])).toBeNull();
  });

  it("does not change the list it is given", () => {
    const input = ["1.0000", null];
    fillGaps(input);
    expect(input).toEqual(["1.0000", null]);
  });
});

describe("barLabel", () => {
  it.each([
    ["month", "Nov 2025", "Nov"], ["month", "November 2025", "Nov"], ["month", "Jan 2026", "Jan"], ["month", "odd label", "odd label"],
    ["year", "2022", "2022"], ["year", "2026 YTD", "2026 YTD"], ["quarter", "Q1 2026", "Q1 2026"], ["week", "W3", "W3"],
  ] as const)("%s bucket %j is drawn as %j", (bucket, label, expected) => {
    expect(barLabel(bucket, label)).toBe(expected);
  });
});
