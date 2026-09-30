import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { getImportPrompt } from "./importPrompt";

const CODES = [
  "member_details_required",
  "member_pan_mismatch",
  "member_not_in_file",
  "locked_member_only",
  "cross_account_pan_blocked",
  "statement_pan_on_other_account",
  "self_name_mismatch",
  "which_is_self",
  "pan_belongs_to_other_member",
  "pan_mismatch_for_member",
];

describe("getImportPrompt", () => {
  it.each(CODES)("maps a 409 %s with session id and details", (code) => {
    const err = new ApiError(409, { code, message: "m", session_id: "s1", details: { a: 1 } });
    expect(getImportPrompt(err)).toEqual({ code, message: "m", sessionId: "s1", details: { a: 1 } });
  });

  it("defaults sessionId to null and details to {} (member_details_required drops the session)", () => {
    const err = new ApiError(409, { code: "member_details_required", message: "m", session_id: null });
    expect(getImportPrompt(err)).toEqual({
      code: "member_details_required",
      message: "m",
      sessionId: null,
      details: {},
    });
  });

  it("maps a 410 session_expired", () => {
    const err = new ApiError(410, { code: "session_expired", message: "gone" });
    expect(getImportPrompt(err)).toEqual({ code: "session_expired", message: "gone", sessionId: null, details: {} });
  });

  it("ignores unknown codes, other statuses, string payloads and non-API errors", () => {
    expect(getImportPrompt(new ApiError(409, { code: "something_else", message: "m" }))).toBeNull();
    expect(getImportPrompt(new ApiError(409, "Scheme needs an AMFI code."))).toBeNull();
    expect(getImportPrompt(new ApiError(422, { code: "self_name_mismatch", message: "m" }))).toBeNull();
    expect(getImportPrompt(new ApiError(410, { code: "self_name_mismatch", message: "m" }))).toBeNull();
    expect(getImportPrompt(new TypeError("Failed to fetch"))).toBeNull();
    expect(getImportPrompt(null)).toBeNull();
  });
});
