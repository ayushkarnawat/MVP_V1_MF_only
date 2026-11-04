import { describe, expect, it } from "vitest";
import { formatPhoneSpaced } from "./signupCopy";

describe("formatPhoneSpaced (sign-up code screen shows the number in full)", () => {
  it("groups a normalised +91 number as 5 and 5", () => {
    expect(formatPhoneSpaced("+919876543210")).toBe("+91 98765 43210");
  });
  it("accepts ten bare digits and a number that already has spaces", () => {
    expect(formatPhoneSpaced("9876543210")).toBe("+91 98765 43210");
    expect(formatPhoneSpaced("+91 98765 43210")).toBe("+91 98765 43210");
  });
  it("returns anything that is not a ten-digit Indian number unchanged", () => {
    expect(formatPhoneSpaced("12345")).toBe("12345");
    expect(formatPhoneSpaced("")).toBe("");
  });
});
