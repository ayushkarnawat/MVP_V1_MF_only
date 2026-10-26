import { describe, expect, it } from "vitest";
import {
  barScale, benchmarkLabel, outperformedBy, resolveShape, signedPct, signedRupees, slugify, titleName, toneOf,
} from "./scenarioFormat";
import { makeSummary } from "./testData";

describe("signedPct", () => {
  it.each([
    ["-1.2", undefined, "−1.2%"],
    ["0", undefined, "0.0%"],
    ["12.34", 2, "+12.34%"],
    ["0.43", undefined, "+0.4%"],
    ["-30.20", undefined, "−30.2%"],
    ["-12.55", undefined, "−12.6%"],
    ["-0.04", undefined, "0.0%"],
    ["-0.00", 2, "0.00%"],
    ["100", 0, "+100%"],
  ])("signedPct(%s, %s) is %s", (value, digits, expected) => {
    expect(signedPct(value, digits)).toBe(expected);
  });

  it("uses the real minus sign, never a hyphen", () => {
    expect(signedPct("-5")).toContain("−");
    expect(signedPct("-5")).not.toContain("-");
  });

  it("gives a dash for a missing or unreadable value, never null or NaN", () => {
    expect(signedPct(null)).toBe("—");
    expect(signedPct("abc")).toBe("—");
  });
});

describe("signedRupees", () => {
  it.each([
    ["-459.80", "−₹460"],
    ["100.82", "+₹101"],
    ["20.02", "+₹20"],
    ["0.00", "₹0"],
    ["-0.40", "₹0"],
    ["-1266600", "−₹12,66,600"],
    ["1234567.5", "+₹12,34,568"],
    ["-656", "−₹656"],
  ])("signedRupees(%s) is %s", (value, expected) => {
    expect(signedRupees(value)).toBe(expected);
  });

  it("gives a dash for a missing value", () => {
    expect(signedRupees(null)).toBe("—");
  });
});

describe("outperformedBy", () => {
  it("is the exact signed gap in percentage points", () => {
    expect(outperformedBy("-17.09", "-30.20")).toBe("13.11");
    expect(outperformedBy("-30.20", "-17.09")).toBe("-13.11");
    expect(outperformedBy("-5.00", "-5.00")).toBe("0.00");
  });

  it("has no float drift", () => {
    expect(outperformedBy("0.10", "0.20")).toBe("-0.10");
    expect(outperformedBy("0.3", "0.1")).toBe("0.20");
    expect(outperformedBy("-0.00", "0.00")).toBe("0.00");
  });

  it("is null when either side is missing", () => {
    expect(outperformedBy(null, "1.00")).toBeNull();
    expect(outperformedBy("1.00", null)).toBeNull();
    expect(outperformedBy(null, null)).toBeNull();
  });
});

describe("barScale", () => {
  it("puts the zero line where a mixed chart crosses zero", () => {
    const scale = barScale(["-10", "5"]);
    expect(scale.zero).toBeCloseTo(66.667, 2);
    expect(scale.widths[0]).toBeCloseTo(66.667, 2);
    expect(scale.widths[1]).toBeCloseTo(33.333, 2);
    expect(scale.sides).toEqual(["left", "right"]);
  });

  it("puts the zero line at the right edge when everything is negative", () => {
    const scale = barScale(["-10", "-5"]);
    expect(scale.zero).toBe(100);
    expect(scale.widths).toEqual([100, 50]);
    expect(scale.sides).toEqual(["left", "left"]);
  });

  it("puts the zero line at the left edge when everything is positive", () => {
    const scale = barScale(["10", "5"]);
    expect(scale.zero).toBe(0);
    expect(scale.widths).toEqual([100, 50]);
    expect(scale.sides).toEqual(["right", "right"]);
  });

  it("scales a real asset-class chart against its range", () => {
    const scale = barScale(["-1161000", "-165000", "39000", "48000", "-27600"]);
    expect(scale.zero).toBeCloseTo(96.03, 1);
    expect(scale.widths[0]).toBeCloseTo(96.03, 1);
    expect(scale.widths[3]).toBeCloseTo(3.97, 1);
  });

  it("gives an all-zero chart zero width everywhere and survives an empty list", () => {
    expect(barScale(["0", "0.00"]).widths).toEqual([0, 0]);
    expect(barScale([])).toMatchObject({ widths: [], sides: [] });
  });

  it("draws a zero value on the right with no width", () => {
    const scale = barScale(["-4", "0", "4"]);
    expect(scale.sides).toEqual(["left", "right", "right"]);
    expect(scale.widths[1]).toBe(0);
  });
});

describe("toneOf", () => {
  it("reads the sign of a decimal string", () => {
    expect(toneOf("-0.01")).toBe("loss");
    expect(toneOf("0.01")).toBe("gain");
    expect(toneOf("0.00")).toBe("neutral");
    expect(toneOf("-0.00")).toBe("neutral");
    expect(toneOf(null)).toBe("neutral");
  });
});

describe("resolveShape", () => {
  it("classifies a scenario the way the classic screen does", () => {
    expect(resolveShape(makeSummary())).toBe("standard");
    expect(resolveShape(makeSummary({ has_phases: true }))).toBe("multi_phase");
    expect(resolveShape(makeSummary({ has_phases: true, parent_scenario_id: "p" }))).toBe("standard");
    expect(resolveShape(makeSummary({ had_redemption_freeze_schemes: ["X Fund"] }))).toBe("redemption_freeze");
    expect(resolveShape(makeSummary({ had_redemption_freeze_schemes: [] }))).toBe("standard");
    expect(resolveShape(makeSummary({ scenario_type: "HYPOTHETICAL" }))).toBe("hypothetical");
    expect(resolveShape(makeSummary({ scenario_type: "HYPOTHETICAL", had_redemption_freeze_schemes: ["X"] }))).toBe("hypothetical");
  });
});

describe("labels", () => {
  it("names the five indices and falls back to words for an unknown one", () => {
    expect(benchmarkLabel("nifty_50")).toBe("Nifty 50");
    expect(benchmarkLabel("nifty_largemidcap_250")).toBe("Nifty LargeMidcap 250");
    expect(benchmarkLabel("nifty_smallcap_250")).toBe("Nifty Smallcap 250");
    expect(benchmarkLabel("some_new_index")).toBe("Some New Index");
    expect(benchmarkLabel("S&P 500")).toBe("S&P 500");
  });

  it("title-cases an all-capitals member name and leaves others alone", () => {
    expect(titleName("ASHA RAO")).toBe("Asha Rao");
    expect(titleName("Dev Rao")).toBe("Dev Rao");
    expect(titleName("McDonald")).toBe("McDonald");
    expect(titleName("")).toBe("");
  });

  it("makes a stable key from a label", () => {
    expect(slugify("Gold and Silver")).toBe("gold-and-silver");
    expect(slugify("Nifty 50")).toBe("nifty-50");
    expect(slugify("  Debt  ")).toBe("debt");
  });
});
