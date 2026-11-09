import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { readRefusal } from "./refusal";

const MEMBER_BODY = {
  code: "member_in_recent_head_change",
  message: "This person was part of a recent Head of Family change, so they cannot be removed yet. You can remove them on 12 Nov 2026.",
  available_after: "2026-11-11T19:00:00+00:00",
};
const ACCOUNT_BODY = {
  code: "head_change_undo_window",
  message: "The Head of Family was changed in the last 24 hours. You can delete this account after the undo window closes on 6 Nov 2026, 3:33 PM IST.",
  available_after: "2026-11-06T10:03:00+00:00",
};

describe("readRefusal (QA fixes, C4)", () => {
  it("reads a member-removal refusal: the code, the server's own sentence and the date it ends", () => {
    expect(readRefusal(new ApiError(409, MEMBER_BODY))).toEqual({
      code: "member_in_recent_head_change",
      message: MEMBER_BODY.message,
      availableAfter: "2026-11-11T19:00:00+00:00",
    });
  });
  it("reads an account-deletion refusal", () => {
    expect(readRefusal(new ApiError(409, ACCOUNT_BODY))).toEqual({
      code: "head_change_undo_window",
      message: ACCOUNT_BODY.message,
      availableAfter: "2026-11-06T10:03:00+00:00",
    });
  });
  it("has no date when the server sent none", () => {
    const { available_after: _ignored, ...withoutDate } = MEMBER_BODY;
    expect(readRefusal(new ApiError(409, withoutDate))?.availableAfter).toBeNull();
  });
  it("reads an error that only looks like an ApiError (the status and payload are what count)", () => {
    expect(readRefusal({ status: 409, payload: MEMBER_BODY })?.code).toBe("member_in_recent_head_change");
  });
  it("is null for any status other than 409, even with the same body", () => {
    for (const status of [400, 401, 403, 404, 422, 500, 503]) expect(readRefusal(new ApiError(status, MEMBER_BODY))).toBeNull();
  });
  it("is null for a 409 that is not one of the two refusals, so the generic message stays", () => {
    expect(readRefusal(new ApiError(409, { code: "something_else", message: "No." }))).toBeNull();
    expect(readRefusal(new ApiError(409, "Account deletion is already scheduled."))).toBeNull();
    expect(readRefusal(new ApiError(409, { message: "No code here." }))).toBeNull();
    expect(readRefusal(new ApiError(409, null))).toBeNull();
  });
  it("is null when the message is missing or empty", () => {
    expect(readRefusal(new ApiError(409, { code: "head_change_undo_window" }))).toBeNull();
    expect(readRefusal(new ApiError(409, { code: "head_change_undo_window", message: "" }))).toBeNull();
    expect(readRefusal(new ApiError(409, { code: "head_change_undo_window", message: 5 }))).toBeNull();
  });
  it("is null for a network failure, a plain Error and things that are not errors", () => {
    expect(readRefusal(new TypeError("Failed to fetch"))).toBeNull();
    expect(readRefusal(new Error("down"))).toBeNull();
    for (const value of [null, undefined, "text", 409, {}]) expect(readRefusal(value)).toBeNull();
  });
});
