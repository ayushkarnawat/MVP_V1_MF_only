import { describe, expect, it } from "vitest";
import { accessLevel } from "./accessLevel";

describe("accessLevel (L6: a display label, no stored role)", () => {
  it("is Admin only for the self member", () => {
    expect(accessLevel("self")).toBe("Admin");
  });

  it.each(["spouse", "parent", "child", "sibling", "other", "", "Self", "SELF", " self"])("is Member for %j", relationship => {
    expect(accessLevel(relationship)).toBe("Member");
  });

  it("is Member when the relationship is not chosen yet (null or undefined)", () => {
    expect(accessLevel(null)).toBe("Member");
    expect(accessLevel(undefined)).toBe("Member");
  });
});
