import { describe, expect, it } from "vitest";
import { soldFundsScope } from "./legacyLogic";

describe("soldFundsScope", () => {
  it("is the selected member in a member view", () => {
    expect(soldFundsScope("member", "m2")).toBe("m2");
  });
  it("is undefined in the family view, with or without a stale member id", () => {
    expect(soldFundsScope("aggregate", null)).toBeUndefined();
    expect(soldFundsScope("aggregate", "m2")).toBeUndefined();
  });
  it("is undefined in a member view that has no member yet", () => {
    expect(soldFundsScope("member", null)).toBeUndefined();
  });
});
