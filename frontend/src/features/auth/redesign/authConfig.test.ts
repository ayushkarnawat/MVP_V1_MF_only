import { describe, expect, it } from "vitest";
import { AUTH_SHOW_GOOGLE } from "./authConfig";

describe("authConfig", () => {
  it("hides the Google button on login (design Q1); the code path stays in the repo", () => {
    expect(AUTH_SHOW_GOOGLE).toBe(false);
  });
});
