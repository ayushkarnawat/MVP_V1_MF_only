import { describe, expect, it } from "vitest";
import { initialsOf } from "./initialsOf";

describe("initialsOf", () => {
  it.each([
    ["Siddharth Surve", "SS"],
    ["Aditi", "A"],
    ["aditi rao", "AR"],
    ["Dev Kumar Rao", "DR"],
    ["  Siddharth   Surve  ", "SS"],
    ["élodie dupont", "ÉD"],
  ])("%j gives %j (first letter of the first and the last word, upper-case)", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  it("ignores the '(Me)' suffix the household list puts on the self member", () => {
    expect(initialsOf("Alice Rao (Me)")).toBe("AR");
    expect(initialsOf("Alice (Me)")).toBe("A");
    expect(initialsOf("Alice (me)")).toBe("A");
  });

  it.each([["", "?"], ["   ", "?"], [null, "?"], [undefined, "?"], ["(Me)", "?"]] as const)("%j gives the placeholder %j", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});
