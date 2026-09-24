import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { getPanConflict } from "./panConflict";

describe("getPanConflict", () => {
  it.each(["cross_account_pan_blocked", "pan_belongs_to_other_member", "pan_mismatch_for_member"])(
    "recognises a 409 %s",
    (code) => {
      expect(getPanConflict(new ApiError(409, { code, message: "m" }))).toEqual({ code, message: "m" });
    },
  );

  it("ignores other 409s, other statuses and non-API errors", () => {
    expect(getPanConflict(new ApiError(409, "Scheme needs an AMFI code."))).toBeNull();
    expect(getPanConflict(new ApiError(422, { code: "pan_mismatch_for_member", message: "m" }))).toBeNull();
    expect(getPanConflict(new TypeError("Failed to fetch"))).toBeNull();
  });
});
