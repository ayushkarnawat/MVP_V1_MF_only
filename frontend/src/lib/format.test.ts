import { describe, expect, it } from "vitest";
import { formatCompactRupees, formatDate, formatPercent, formatRupees, scoreBand } from "./format";

describe("formatRupees", () => {
  it("groups in the Indian style with a rupee sign", () => {
    expect(formatRupees("1833250")).toBe("₹18,33,250");
    expect(formatRupees("999")).toBe("₹999");
    expect(formatRupees("1000")).toBe("₹1,000");
    expect(formatRupees("100000")).toBe("₹1,00,000");
    expect(formatRupees("12345678")).toBe("₹1,23,45,678");
    expect(formatRupees("0")).toBe("₹0");
  });

  it("rounds half up to whole rupees using the digits, never a float", () => {
    expect(formatRupees("1233.5")).toBe("₹1,234");
    expect(formatRupees("1233.4")).toBe("₹1,233");
    expect(formatRupees("1233.4999999999999999")).toBe("₹1,233");
    expect(formatRupees("0.5")).toBe("₹1");
    expect(formatRupees("999.5")).toBe("₹1,000");
  });

  it("puts the minus sign before the rupee sign and never prints negative zero", () => {
    expect(formatRupees("-1500")).toBe("-₹1,500");
    expect(formatRupees("-0.4")).toBe("₹0");
    expect(formatRupees("-0")).toBe("₹0");
  });

  it("reads a dash for a missing or unreadable value", () => {
    expect(formatRupees(null)).toBe("—");
    expect(formatRupees(undefined)).toBe("—");
    expect(formatRupees("")).toBe("—");
    expect(formatRupees("abc")).toBe("—");
  });
});

describe("formatCompactRupees", () => {
  it("shows whole rupees below one lakh", () => {
    expect(formatCompactRupees("99999")).toBe("₹99,999");
    expect(formatCompactRupees("0")).toBe("₹0");
  });

  it("shows lakh from 1,00,000 with two decimals", () => {
    expect(formatCompactRupees("100000")).toBe("₹1.00 L");
    expect(formatCompactRupees("1833250")).toBe("₹18.33 L");
    expect(formatCompactRupees("1833500")).toBe("₹18.34 L");
    expect(formatCompactRupees("9950000")).toBe("₹99.50 L");
  });

  it("shows crore from 1,00,00,000 with two decimals", () => {
    expect(formatCompactRupees("10000000")).toBe("₹1.00 Cr");
    expect(formatCompactRupees("12000000")).toBe("₹1.20 Cr");
    expect(formatCompactRupees("123456789")).toBe("₹12.35 Cr");
  });

  it("moves to crore when lakh would round up to 100.00", () => {
    expect(formatCompactRupees("9999999")).toBe("₹1.00 Cr");
  });

  it("keeps the sign in front and reads a dash for a missing value", () => {
    expect(formatCompactRupees("-1833250")).toBe("-₹18.33 L");
    expect(formatCompactRupees("-500")).toBe("-₹500");
    expect(formatCompactRupees(null)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("takes a percent number and defaults to one decimal", () => {
    expect(formatPercent("46.7")).toBe("46.7%");
    expect(formatPercent("46.74")).toBe("46.7%");
    expect(formatPercent("46.75")).toBe("46.8%");
    expect(formatPercent("12")).toBe("12.0%");
  });

  it("honours digits", () => {
    expect(formatPercent("12.3456", { digits: 2 })).toBe("12.35%");
    expect(formatPercent("12.5", { digits: 0 })).toBe("13%");
    expect(formatPercent("0.04", { digits: 1 })).toBe("0.0%");
  });

  it("adds a plus sign only to positive values when signed", () => {
    expect(formatPercent("46.7", { signed: true })).toBe("+46.7%");
    expect(formatPercent("-3.25", { signed: true })).toBe("-3.3%");
    expect(formatPercent("0", { signed: true })).toBe("0.0%");
    expect(formatPercent("-0.04", { signed: true })).toBe("0.0%");
    expect(formatPercent("46.7")).toBe("46.7%");
  });

  it("reads a dash for a missing value", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent("")).toBe("—");
    expect(formatPercent("n/a")).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as DD Mon YYYY", () => {
    expect(formatDate("2026-10-23")).toBe("23 Oct 2026");
    expect(formatDate("2026-01-05")).toBe("05 Jan 2026");
    expect(formatDate("2026-12-31")).toBe("31 Dec 2026");
  });

  it("accepts a full timestamp and reads a dash for anything else", () => {
    expect(formatDate("2026-10-23T08:15:00Z")).toBe("23 Oct 2026");
    expect(formatDate("23/10/2026")).toBe("—");
    expect(formatDate("2026-13-01")).toBe("—");
    expect(formatDate(null)).toBe("—");
  });
});

describe("scoreBand", () => {
  it.each([
    [100, "Excellent", "#15803D"],
    [85, "Excellent", "#15803D"],
    [84.99, "Strong", "#22C55E"],
    [82, "Strong", "#22C55E"],
    [70, "Strong", "#22C55E"],
    [69.99, "Good", "#65A30D"],
    [55, "Good", "#65A30D"],
    [54.99, "Average", "#CA8A04"],
    [40, "Average", "#CA8A04"],
    [39.99, "Weak", "#EA580C"],
    [25, "Weak", "#EA580C"],
    [24.99, "Poor", "#C1272D"],
    [0, "Poor", "#C1272D"],
  ])("score %s is %s", (score, word, color) => {
    expect(scoreBand(score)).toEqual({ word, color });
  });

  it("treats a non-finite score as Poor rather than throwing", () => {
    expect(scoreBand(Number.NaN)).toEqual({ word: "Poor", color: "#C1272D" });
  });
});
