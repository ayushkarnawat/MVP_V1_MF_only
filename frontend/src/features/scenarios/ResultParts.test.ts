import { describe, expect, it } from "vitest";
import { rupees } from "./ResultParts";

describe("rupees", () => {
  it("rounds the backend value to the rupee once, half-up", () => {
    // Rounding to paise first turned 1234.496 into 1234.50 and then ₹1,235.
    expect(rupees("1234.496")).toBe("₹1,234");
    expect(rupees("1234.5")).toBe("₹1,235");
    expect(rupees("-22000.00")).toBe("₹-22,000");
    expect(rupees("-0.4")).toBe("₹0");
    expect(rupees(null)).toBe("Not enough historical data to estimate");
  });
});
