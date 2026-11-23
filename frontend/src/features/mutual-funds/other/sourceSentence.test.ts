import { describe, expect, it } from "vitest";
import type { ValuationValue } from "../types";
import { KNOWN_VALUE_SOURCES, sourceSentence } from "./otherLogic";

const value = { source: "factsheet", basis: "trailing", method: "harmonic", coverage_pct: "92.4", as_of: "2026-10-12" };
const fallback = "We could not tell where this figure comes from.";

describe("sourceSentence", () => {
  it("factsheet forward names the month and forward earnings", () => {
    for (const kind of ["pe", "pb"] as const) {
      expect(sourceSentence({ ...value, basis: "forward" }, kind)).toBe("Printed on the fund's factsheet for October 2026, based on forward earnings.");
    }
  });

  it("factsheet trailing says earnings for P/E and book value for P/B", () => {
    expect(sourceSentence(value, "pe")).toBe("Printed on the fund's factsheet for October 2026, based on trailing earnings.");
    expect(sourceSentence(value, "pb")).toBe("Printed on the fund's factsheet for October 2026, based on trailing book value.");
  });

  it("factsheet with an unstated basis has no basis clause", () => {
    for (const basis of [null, "not_stated"]) {
      expect(sourceSentence({ ...value, basis }, "pe")).toBe("Printed on the fund's factsheet for October 2026.");
    }
  });

  it("computed names NSE and BSE, the method, the coverage and the ratios date", () => {
    expect(sourceSentence({ ...value, source: "computed" }, "pe")).toBe("Worked out from the fund's published holdings. Stock ratios come from NSE and BSE daily data, combined as a harmonic mean. Covers 92% of the fund's equity. Ratios as on 12 Oct 2026.");
    expect(sourceSentence({ ...value, source: "computed", method: "weighted_average", coverage_pct: "100", as_of: "2026-10-10" }, "pb")).toBe("Worked out from the fund's published holdings. Stock ratios come from NSE and BSE daily data, combined as a weighted average. Covers 100% of the fund's equity. Ratios as on 10 Oct 2026.");
  });

  it("computed with an unstated method reads combined into one figure", () => {
    for (const method of [null, "not_stated"]) {
      expect(sourceSentence({ ...value, source: "computed", method }, "pe")).toBe("Worked out from the fund's published holdings. Stock ratios come from NSE and BSE daily data, combined into one figure. Covers 92% of the fund's equity. Ratios as on 12 Oct 2026.");
    }
  });

  it("computed without coverage leaves the coverage sentence out", () => {
    expect(sourceSentence({ ...value, source: "computed", coverage_pct: null }, "pe")).toBe("Worked out from the fund's published holdings. Stock ratios come from NSE and BSE daily data, combined as a harmonic mean. Ratios as on 12 Oct 2026.");
    expect(sourceSentence({ ...value, source: "computed", coverage_pct: null, as_of: null }, "pb")).toBe("Worked out from the fund's published holdings. Stock ratios come from NSE and BSE daily data, combined as a harmonic mean.");
  });

  it("coverage rounds a decimal string to a whole percent without float", () => {
    for (const [coverage_pct, rounded] of [["92.4", "92"], ["92.5", "93"], ["92.499999999999999999", "92"], ["100", "100"]]) {
      expect(sourceSentence({ ...value, source: "computed", coverage_pct }, "pe")).toBe(`Worked out from the fund's published holdings. Stock ratios come from NSE and BSE daily data, combined as a harmonic mean. Covers ${rounded}% of the fund's equity. Ratios as on 12 Oct 2026.`);
    }
  });

  it("a withheld figure repeats the reason the cell shows (unavailable reason first, then Not enough data plus reason, then Not enough data)", () => {
    const reason = "Less than 60% of this fund's equity has a usable P/E value.";
    const unavailable_reason = "Not enough data: P/E is available for 52% of this fund's shares, and we need at least 60%.";
    expect(sourceSentence({ ...value, source: "none", reason, unavailable_reason }, "pe")).toBe(unavailable_reason);
    expect(sourceSentence({ ...value, source: "none", reason, unavailable_reason: null }, "pe")).toBe(`Not enough data. ${reason}`);
    expect(sourceSentence({ ...value, source: "none" }, "pb")).toBe("Not enough data.");
  });

  it("an unknown source falls back to the default sentence", () => {
    expect(sourceSentence({ ...value, source: "unrecognised" }, "pe")).toBe(fallback);
  });

  it("every known source has a sentence (KNOWN_VALUE_SOURCES covers the ValuationValue source union)", () => {
    const sources: Record<ValuationValue["source"], true> = { factsheet: true, computed: true, none: true };
    expect(KNOWN_VALUE_SOURCES).toEqual(["factsheet", "computed", "none"]);
    expect(KNOWN_VALUE_SOURCES).toEqual(Object.keys(sources));
    for (const source of KNOWN_VALUE_SOURCES) {
      const sentence = sourceSentence({ ...value, source }, "pe");
      expect(sentence).not.toBe(fallback);
      expect(sentence.length).toBeGreaterThan(0);
    }
  });
});
