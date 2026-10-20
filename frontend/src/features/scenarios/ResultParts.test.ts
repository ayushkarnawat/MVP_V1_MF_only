import { describe, expect, it } from "vitest";
import { benchmarkLabel, rupees } from "./ResultParts";

describe("benchmarkLabel", () => {
  it.each([
    ["nifty_50", "Nifty 50"],
    ["nifty_500", "Nifty 500"],
    ["nifty_largemidcap_250", "Nifty LargeMidcap 250"],
    ["nifty_midcap_150", "Nifty Midcap 150"],
    ["nifty_smallcap_250", "Nifty Smallcap 250"],
    ["nifty_next_50", "Nifty Next 50"],
    ["Your portfolio", "Your portfolio"],
  ])("labels %s as %s", (name, expected) => {
    expect(benchmarkLabel(name)).toBe(expected);
  });
});

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
