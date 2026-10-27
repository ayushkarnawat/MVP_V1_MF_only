import { describe, expect, it } from "vitest";
import * as fx from "../fixtures";
import type { HoldingRow } from "../types";
import { findHolding, soldFundsScope } from "./legacyLogic";

describe("findHolding", () => {
  it("finds the row of one fund held by one member", () => {
    const row = findHolding(fx.holdings(), "S-HDFC", "m3");
    expect(row?.scheme_name).toBe("HDFC Mid-Cap Opportunities Fund");
    expect(row?.household_member_id).toBe("m3");
  });
  it("keeps two members who hold the same fund apart", () => {
    const second: HoldingRow = { ...fx.holdings()[0], household_member_id: "m2", household_member_name: "Aarohi", current_value: "1.00" };
    const rows = [fx.holdings()[0], second];
    expect(findHolding(rows, "S-KOTAK", "m1")?.household_member_name).toBe("Siddharth");
    expect(findHolding(rows, "S-KOTAK", "m2")?.household_member_name).toBe("Aarohi");
    expect(findHolding(rows, "S-KOTAK", "m2")?.current_value).toBe("1.00");
  });
  it("returns null for an unknown fund, a fund held by another member or no rows", () => {
    expect(findHolding(fx.holdings(), "S-NOPE", "m1")).toBeNull();
    expect(findHolding(fx.holdings(), "S-HDFC", "m1")).toBeNull();
    expect(findHolding(null, "S-HDFC", "m3")).toBeNull();
    expect(findHolding([], "S-HDFC", "m3")).toBeNull();
  });
  it("returns the row itself, not a copy", () => {
    const rows = fx.holdings();
    expect(findHolding(rows, "S-JM", "m2")).toBe(rows[1]);
  });
});

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
