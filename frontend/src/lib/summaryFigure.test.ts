import { describe, expect, it } from "vitest";
import { splitCurrency } from "@/lib/summaryFigure";

describe("splitCurrency", () => {
  it.each([
    ["positive", "+₹1,01,73,830", { sign: "+", currency: "₹", digits: "1,01,73,830" }],
    ["negative", "-₹3,79,885", { sign: "-", currency: "₹", digits: "3,79,885" }],
    ["zero", "₹0", { sign: "", currency: "₹", digits: "0" }],
    ["unavailable", "\u2014", { sign: "", currency: "", digits: "\u2014" }],
    ["without_currency", "-14.8%", { sign: "", currency: "", digits: "-14.8%" }],
  ] as const)("splitCurrency_%s", (_, text, expected) => {
    expect(splitCurrency(text)).toEqual(expected);
  });
});
