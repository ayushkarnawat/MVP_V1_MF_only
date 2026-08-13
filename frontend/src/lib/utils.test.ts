import { describe, expect, it } from "vitest";
import { toTitleCase } from "./utils";

describe("toTitleCase", () => {
  it("converts an all-caps source to title case", () => {
    expect(toTitleCase("DIRECT")).toBe("Direct");
  });

  it("converts an already-lowercase source to title case", () => {
    expect(toTitleCase("direct")).toBe("Direct");
  });

  it("returns an empty string unchanged", () => {
    expect(toTitleCase("")).toBe("");
  });
});
