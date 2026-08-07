import { describe, expect, it } from "vitest";
import { sumDecimalStrings } from "./decimal";

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
