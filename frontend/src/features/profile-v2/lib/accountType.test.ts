import { describe, expect, it } from "vitest";
import { accountType } from "./accountType";

describe("accountType (derived, never stored, L19)", () => {
  it.each([[0, "Individual"], [1, "Individual"], [2, "Family"], [3, "Family"], [12, "Family"]] as const)("%i member(s) is %s", (count, expected) => {
    expect(accountType(count)).toBe(expected);
  });
});
