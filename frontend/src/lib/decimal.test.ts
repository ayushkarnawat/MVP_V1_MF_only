import { describe, expect, it } from "vitest";
import { sumDecimalStrings, toPercentString } from "./decimal";

describe("sumDecimalStrings", () => {
  it("sums simple two-decimal money strings exactly", () => {
    expect(sumDecimalStrings(["5000.00", "3000.00"])).toBe("8000.00");
  });

  it("returns 0 for an empty list", () => {
    expect(sumDecimalStrings([])).toBe("0");
  });

  it("treats missing/empty entries as zero", () => {
    expect(sumDecimalStrings(["100.00", "", "50.00"])).toBe("150.00");
  });

  it("sums values with different decimal-place counts, padding to the widest", () => {
    // The backend doesn't quantize current_value/amount_invested before
    // serializing (units * nav can carry more than 2 decimal places) — this
    // must not silently truncate the extra precision the way a fixed
    // 2-decimal-place assumption would.
    expect(sumDecimalStrings(["100.5", "50.25"])).toBe("150.75");
    expect(sumDecimalStrings(["1.123456", "2.1"])).toBe("3.223456");
  });

  it("handles negative values correctly", () => {
    expect(sumDecimalStrings(["100.00", "-40.00"])).toBe("60.00");
    expect(sumDecimalStrings(["-100.00", "40.00"])).toBe("-60.00");
  });

  it("handles whole numbers with no decimal point", () => {
    expect(sumDecimalStrings(["100", "50"])).toBe("150");
  });

  it("produces an exact result where float accumulation would drift", () => {
    // Classic float-accumulation trap: 0.1 + 0.2 !== 0.3 in IEEE-754. Sum
    // enough of these that a naive `+=` on parseFloat would visibly drift.
    const values = Array(10).fill("0.1");
    expect(sumDecimalStrings(values)).toBe("1.0");
  });
});

describe("toPercentString", () => {
  it("shifts a raw decimal fraction to a percentage", () => {
    expect(toPercentString("0.1645")).toBe("16.45");
    expect(toPercentString("0.12")).toBe("12.00");
    expect(toPercentString("-0.1645")).toBe("-16.45");
  });

  it("rounds half-up beyond 2 fractional digits instead of truncating", () => {
    // xirr()'s Newton-Raphson output rarely lands on a round number — the
    // backend never quantizes it, so this is the common case, not an edge case.
    expect(toPercentString("0.164549")).toBe("16.45");
    expect(toPercentString("0.164550")).toBe("16.46");
    expect(toPercentString("0.1234499999999999999999999978")).toBe("12.34");
    // carry propagates through the shifted whole part, not just the cents.
    expect(toPercentString("0.999999")).toBe("100.00");
    expect(toPercentString("-0.164550")).toBe("-16.46");
  });

  it("normalizes signed zero to unsigned", () => {
    expect(toPercentString("-0")).toBe("0.00");
    expect(toPercentString("-0.0000001")).toBe("0.00");
  });
});
