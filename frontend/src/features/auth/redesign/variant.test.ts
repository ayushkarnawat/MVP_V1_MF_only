import { describe, expect, it } from "vitest";
import { variantFor } from "./variant";

describe("variantFor", () => {
  it("is split on desktop and legacy on mobile", () => {
    expect(variantFor(false)).toBe("split");
    expect(variantFor(true)).toBe("legacy");
  });
});
